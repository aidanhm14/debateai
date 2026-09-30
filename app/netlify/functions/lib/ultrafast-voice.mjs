// Admission is server-owned; reconnecting must not buy a fresh trial clock.
export const ULTRAFAST_VOICE_MODEL = 'gpt-6-astra';
export const ULTRAFAST_VOICE_MS = 2 * 60_000;
export const ULTRAFAST_VOICE_STARTS = 2;

function refused(message, status, code) {
  return Object.assign(new Error(message), { status, code });
}

export function checkUltrafastAccess({ decoded, owner, live, byok, training, enabled = true }) {
  if (!enabled || !owner || !decoded?.sub || decoded.email_verified !== true || decoded.firebase?.sign_in_provider === 'anonymous') {
    throw refused('The Ultrafast voice trial is available to the signed-in owner only.', 403, 'ULTRAFAST_PRIVATE');
  }
  if (!live || byok || training) {
    throw refused('Use a regular voice debate with the platform key for this trial.', 400, 'ULTRAFAST_UNSUPPORTED');
  }
}

export async function reserveUltrafastVoice(db, uid, { continued = false, iat = 0, now = Date.now() } = {}) {
  const ref = db.collection('voice_ultrafast_trials').doc(uid);
  return db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    const data = snap.exists ? snap.data() : {};
    const day = new Date(now).toISOString().slice(0, 10);
    const rounds = Array.isArray(data.rounds) ? data.rounds : [];
    if (continued) {
      if (!rounds.includes(iat) || now >= iat + ULTRAFAST_VOICE_MS) {
        throw refused('This Ultrafast trial has ended. Start a standard voice round to continue.', 429, 'ULTRAFAST_EXPIRED');
      }
      return { iat, expiresAt: iat + ULTRAFAST_VOICE_MS };
    }
    const today = data.day === day ? rounds : [];
    if (today.length >= ULTRAFAST_VOICE_STARTS) {
      throw refused('Both Ultrafast trial starts have been used today. Standard voice is still available.', 429, 'ULTRAFAST_DAILY_LIMIT');
    }
    // Failed starts retain their reservation, bounding retries across instances.
    tx.set(ref, { day, rounds: [...today, now] });
    return { iat: now, expiresAt: now + ULTRAFAST_VOICE_MS };
  });
}
