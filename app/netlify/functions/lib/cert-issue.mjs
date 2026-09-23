// Shared certificate write: the cert doc plus the per-user summary that
// /profile reads. create-cert.mjs (AI voice rounds, client-submitted score
// re-validated) and live-judge.mjs (live rounds, score written by the
// server's own panel) both call this, so a credential looks the same on
// /verify whichever round earned it.

import { FieldValue } from './firestore.mjs';

const TIER_RANK = { novice: 1, varsity: 2, circuit: 3, champion: 4 };

// URL-safe base32 id, 12 chars. No l/i/o/0/1 so it reads back cleanly.
export function mintCertId() {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
  const bytes = new Uint8Array(12);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 12; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  let out = '';
  for (let i = 0; i < bytes.length; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

// certDoc must already carry certId, uid, displayName, tier, tierName,
// score. Returns the certId.
export async function writeCertificate(db, certDoc, tier) {
  const certId = certDoc.certId;
  await db.collection('certificates').doc(certId).set({
    ...certDoc,
    issuedAt: FieldValue.serverTimestamp(),
    issuedAtMs: certDoc.issuedAtMs || Date.now(),
  });

  const summaryRef = db.collection('user_certificates').doc(certDoc.uid);
  await summaryRef.set({
    uid: certDoc.uid,
    displayName: certDoc.displayName,
    latestCertId: certId,
    latestTier: tier.key,
    latestScore: certDoc.score,
    updatedAt: FieldValue.serverTimestamp(),
    [`counts.${tier.key}`]: FieldValue.increment(1),
    totalCount: FieldValue.increment(1),
  }, { merge: true });

  // Best-effort highest-tier tracking. A failure here must not cost the
  // person the credential that was just written.
  try {
    const snap = await summaryRef.get();
    const prior = snap.exists ? snap.data() : null;
    const priorRank = prior?.highestTier ? TIER_RANK[prior.highestTier] || 0 : 0;
    if (TIER_RANK[tier.key] > priorRank) {
      await summaryRef.set({
        highestTier: tier.key,
        highestTierName: tier.name,
        highestScore: certDoc.score,
      }, { merge: true });
    } else if (!prior?.highestScore || certDoc.score > prior.highestScore) {
      await summaryRef.set({ highestScore: Math.max(prior?.highestScore || 0, certDoc.score) }, { merge: true });
    }
  } catch (e) {
    console.warn('[cert-issue] summary highest-tier write skipped:', e.message);
  }
  return certId;
}
