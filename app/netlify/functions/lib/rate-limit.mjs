// Layered rate limiting, shared. Upstash-backed when configured, with an
// in-memory fallback so a missing env var degrades instead of failing open.
//
// WHY THIS EXISTS AS A LIB: realtime-session.mjs kept its own limiter in a
// module-scope Map. Netlify runs each concurrent invocation in its own
// isolate, so that Map was per-instance: the same caller counted against a
// different counter depending on which instance answered, and a cold start
// wiped the count entirely. Under light traffic that reads as a working
// limit. Under tournament load it reads as a lottery — some callers blocked
// at their 3rd mint, others sailing past 20. A shared Redis counter is the
// only way a layered limit means the same thing on every instance.
//
// Env (same vars claude.mjs already uses, so configuring one configures both):
//   UPSTASH_REDIS_REST_URL
//   UPSTASH_REDIS_REST_TOKEN

const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
export const HAS_UPSTASH = !!(UPSTASH_URL && UPSTASH_TOKEN);

async function upstashPipeline(commands) {
  const res = await fetch(`${UPSTASH_URL}/pipeline`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${UPSTASH_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(commands),
  });
  if (!res.ok) throw new Error(`Upstash HTTP ${res.status}`);
  return res.json();
}

// In-memory fallback store, keyed by namespace so two limiters in the same
// isolate can't clobber each other.
const memory = new Map(); // `${ns}:${key}` → number[] (timestamps)

function checkInMemory(ns, key, layers) {
  const now = Date.now();
  const mapKey = `${ns}:${key}`;
  const maxWindow = Math.max(...layers.map(l => l.window));
  const history = (memory.get(mapKey) || []).filter(t => now - t < maxWindow);
  for (const layer of layers) {
    const count = history.filter(t => now - t < layer.window).length;
    if (count >= layer.max) {
      memory.set(mapKey, history);
      return { ok: false, layer: layer.label };
    }
  }
  history.push(now);
  memory.set(mapKey, history);
  if (memory.size > 5000) {
    const entries = Array.from(memory.entries());
    memory.clear();
    entries.slice(-2500).forEach(([k, v]) => memory.set(k, v));
  }
  return { ok: true };
}

/**
 * Check every layer for one caller, incrementing all of them.
 *
 * A request that trips the hour cap still counts toward the day cap, which
 * is deliberate: otherwise a caller parked against the tighter limit never
 * accrues toward the looser one and can drip forever.
 *
 * @param {string} ns      namespace, e.g. 'voice' (keeps keys from colliding)
 * @param {string} key     caller identity, e.g. 'uid_abc' or 'ip_1.2.3.4'
 * @param {Array<{window:number,max:number,label:string}>} layers window in ms
 * @returns {Promise<{ok:boolean, layer?:string}>}
 */
export async function checkLayers(ns, key, layers) {
  if (HAS_UPSTASH) {
    try {
      const commands = [];
      for (const layer of layers) {
        const k = `rl:${ns}:${layer.label}:${key}`;
        commands.push(['INCR', k]);
        commands.push(['EXPIRE', k, Math.ceil(layer.window / 1000), 'NX']);
      }
      const results = await upstashPipeline(commands);
      for (let i = 0; i < layers.length; i++) {
        const count = Number(results?.[i * 2]?.result ?? 0);
        if (count > layers[i].max) {
          noteTrip(ns, layers[i].label, key);
          return { ok: false, layer: layers[i].label };
        }
      }
      return { ok: true };
    } catch (err) {
      console.warn('[rate-limit] Upstash failed, using in-memory:', err.message);
      // fall through
    }
  }
  const res = checkInMemory(ns, key, layers);
  if (!res.ok) noteTrip(ns, res.layer, key);
  return res;
}

// ── Abuse visibility (2026-08-22) ────────────────────────────────────────
// A rate limit that fires and tells nobody is a limit whose sizing can
// never be judged: a trip is either a bot being correctly refused or a
// real person being wrongly refused, and until now neither left a record
// anywhere an admin looks. Every DENY increments a per-day counter doc,
// abuse_daily/{YYYY-MM-DD}, read by /api/admin/abuse for the Cost guard
// card on /admin.
//
// The logging itself is built not to become a drain: counts buffer in the
// isolate and flush AT MOST once per 60s per isolate, as one merged
// increment write. Under attack the write volume is bounded by instance
// count, not request count. Firestore is imported lazily and every
// failure is swallowed — visibility must never take the request path
// down with it.
const tripBuffer = new Map(); // field name → count
let tripFlushAt = 0;
let tripFlushing = false;

function laneOf(key) {
  if (key.startsWith('uid_')) return 'named';
  if (key.startsWith('anon_')) return 'anon';
  return 'ip';
}

// Public entry for endpoints that keep their own limiter (claude.mjs) or
// want to count a refusal that is not a rate limit (the SIGN_IN_REQUIRED
// wall). lane is 'named' | 'anon' | 'ip'.
export function recordTrip(ns, label, lane) {
  noteTrip(ns, label, lane === 'named' ? 'uid_x' : lane === 'anon' ? 'anon_x' : 'ip_x');
}

function noteTrip(ns, label, key) {
  try {
    // Flat field names (no dots) so the merge write needs no nested maps.
    const field = `${ns}__${label}__${laneOf(key)}`.replace(/[.~/\[\]*]/g, '_').slice(0, 120);
    tripBuffer.set(field, (tripBuffer.get(field) || 0) + 1);
    const now = Date.now();
    if (tripFlushing || now - tripFlushAt < 60_000) return;
    tripFlushing = true;
    flushTrips().finally(() => { tripFlushing = false; tripFlushAt = Date.now(); });
  } catch (e) { /* never let visibility break the limiter */ }
}

async function flushTrips() {
  if (!tripBuffer.size) return;
  const batch = {};
  for (const [f, n] of tripBuffer) batch[f] = n;
  tripBuffer.clear();
  try {
    const { getDb, FieldValue } = await import('./firestore.mjs');
    const db = getDb();
    const day = new Date().toISOString().slice(0, 10);
    const update = { updatedAt: FieldValue.serverTimestamp() };
    for (const [f, n] of Object.entries(batch)) update[f] = FieldValue.increment(n);
    await db.collection('abuse_daily').doc(day).set(update, { merge: true });
  } catch (e) {
    console.warn('[rate-limit] trip flush failed:', e?.message || e);
  }
}

/**
 * Client IP for anonymous callers.
 *
 * x-nf-client-connection-ip is set by Netlify's edge and a caller cannot
 * forge it, so it wins. x-forwarded-for is only a fallback and only its
 * first entry: the header is a client-supplied list, so using the whole
 * string lets one caller mint unlimited distinct rate-limit keys just by
 * varying it.
 */
export function callerIp(request) {
  const nf = request.headers.get('x-nf-client-connection-ip');
  if (nf) return nf.trim();
  const fwd = request.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return 'anon';
}
