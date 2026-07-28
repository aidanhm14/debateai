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
        if (count > layers[i].max) return { ok: false, layer: layers[i].label };
      }
      return { ok: true };
    } catch (err) {
      console.warn('[rate-limit] Upstash failed, using in-memory:', err.message);
      // fall through
    }
  }
  return checkInMemory(ns, key, layers);
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
