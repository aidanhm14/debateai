// Certificate tier bands — the single source of truth for what
// "did well enough" means and which rank a given speaker-points
// number unlocks. Read by create-cert.mjs (server-side issuance)
// AND mirrored client-side for the award modal preview.
//
// Speaker points come from the voice-round judge RFD as a number
// in the standard APDA range 25.0-30.0. Real distribution clusters
// at 27-28, with 29+ genuinely rare. Bands here are calibrated so
// Champion is final-round-caliber, not participation chrome.
//
// Below 26.0 = no cert. The product rule is "we don't hand certs
// out like candy" — if you didn't clear a threshold a varsity
// debater would clear in their first round, you don't get one.

export const TIERS = [
  {
    key: 'champion',
    name: 'Champion',
    min: 29.0,
    blurb: 'Final-round caliber. Top of the room.',
  },
  {
    key: 'circuit',
    name: 'Circuit',
    min: 28.0,
    blurb: 'Strong elims-level speech. Clearing speed.',
  },
  {
    key: 'varsity',
    name: 'Varsity',
    min: 27.0,
    blurb: 'Solid varsity speech. Real arguments under pressure.',
  },
  {
    key: 'novice',
    name: 'Novice',
    min: 26.0,
    blurb: 'Cleared the bar. The fundamentals are there.',
  },
];

export const MIN_CERT_SCORE = 26.0;
export const MAX_CERT_SCORE = 30.0;

// Returns one of TIERS or null if the score doesn't qualify.
export function tierForScore(score) {
  const n = Number(score);
  if (!Number.isFinite(n) || n < MIN_CERT_SCORE || n > MAX_CERT_SCORE) return null;
  for (const t of TIERS) {
    if (n >= t.min) return t;
  }
  return null;
}
