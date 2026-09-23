import { createHash } from 'node:crypto';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DUPLICATE_WINDOW = 10 * MINUTE;
const COOLDOWN = 5 * MINUTE;

export function chatFingerprint(text) {
  const normalized = String(text).normalize('NFKC').toLowerCase()
    .replace(/[\p{Cf}\p{P}\p{Z}\s]/gu, '');
  return createHash('sha256').update(normalized).digest('hex');
}

export function blockedChatPromotion(text) {
  const compact = String(text).normalize('NFKC').toLowerCase().replace(/[^a-z0-9]/g, '');
  return compact.includes('trysetbuddycom') || compact.includes('trysetuddycom');
}

export function chatIdentityKeys({ uid, ip }) {
  const address = String(ip || 'unknown').trim().toLowerCase();
  return [...(uid ? ['uid:' + uid] : []),
    'ip:' + createHash('sha256').update(address).digest('hex')];
}

export function activeChatBan(ban, now) {
  return ban?.active === true && (!ban.until || ban.until > now);
}

export function chatRateDecision(states, fingerprint, now) {
  for (const state of states) {
    if (state.cooldownUntil > now) return { reason: 'cooldown', retryMs: state.cooldownUntil - now };
    const posts = (state.posts || []).filter(p => p.at > now - HOUR);
    const duplicate = posts.find(p => p.hash === fingerprint && p.at > now - DUPLICATE_WINDOW);
    if (duplicate) return { reason: 'duplicate', retryMs: duplicate.at + DUPLICATE_WINDOW - now };
    const last = posts.at(-1);
    if (last && now - last.at < 4000) return { reason: 'too-fast', retryMs: 4000 - (now - last.at) };
    const minute = posts.filter(p => p.at > now - MINUTE);
    if (minute.length >= 6) return { reason: 'minute-limit', retryMs: minute[0].at + MINUTE - now };
    if (posts.length >= 40) return { reason: 'hour-limit', retryMs: posts[0].at + HOUR - now };
  }
  return null;
}

// Read limits, bans and write the message in ONE transaction. A separate
// check/add lets simultaneous requests and different Lambda instances race.
export async function postChatMessage(db, doc, now = Date.now()) {
  const keys = chatIdentityKeys(doc);
  const limits = keys.map(k => db.collection('community_chat_limits').doc(k));
  const bans = keys.map(k => db.collection('community_chat_bans').doc(k));
  const message = db.collection('community_chat').doc();
  const fingerprint = chatFingerprint(doc.text);
  return db.runTransaction(async tx => {
    const snapshots = await tx.getAll(...limits, ...bans);
    const states = snapshots.slice(0, limits.length).map(s => s.exists ? s.data() : {});
    if (snapshots.slice(limits.length).some(s => s.exists && activeChatBan(s.data(), now))) {
      return { ok: false, reason: 'banned', status: 403, error: 'This account or connection cannot post in public chat.' };
    }
    const denied = chatRateDecision(states, fingerprint, now);
    if (denied) {
      if (denied.reason !== 'cooldown') {
        states.forEach((state, i) => {
          const rejected = (state.rejected || []).filter(t => t > now - MINUTE).concat(now).slice(-3);
          tx.set(limits[i], { rejected, ...(rejected.length >= 3 ? { cooldownUntil: now + COOLDOWN } : {}) }, { merge: true });
          if (rejected.length >= 3) { denied.reason = 'cooldown'; denied.retryMs = Math.max(denied.retryMs, COOLDOWN); }
        });
      }
      return { ok: false, status: 429, ...denied,
        error: denied.reason === 'duplicate' ? 'You already posted that message. Please avoid repeating it.'
          : 'Please wait ' + Math.ceil(denied.retryMs / 1000) + ' seconds before posting again.' };
    }
    states.forEach((state, i) => tx.set(limits[i], {
      posts: (state.posts || []).filter(p => p.at > now - HOUR).concat({ at: now, hash: fingerprint }).slice(-40),
      rejected: (state.rejected || []).filter(t => t > now - MINUTE),
      cooldownUntil: 0,
    }));
    tx.create(message, doc);
    return { ok: true, id: message.id };
  });
}
