// Certificate tier bands — the single source of truth for what
// "did well enough" means and which rank a given speaker-points
// number unlocks. Read by create-cert.mjs (server-side issuance)
// AND mirrored client-side for the award modal preview.
//
// Speaker points come from the voice-round judge RFD as a number
// in the standard APDA range 25.0-30.0. Real distribution clusters
// at 27-28, with 29+ genuinely rare. Bands here are calibrated so
// every issued credential signals genuinely-good varsity work or
// better — not "showed up and finished a round."
//
// Floor raised 26.0 -> 27.0 (2026-05-24, second pass). The original
// 26.0 floor handed Novice credentials to anyone who completed a
// round, which would collapse the brand fast. 27.0 is the median
// varsity speaker at a real tournament — below that is "participated
// but didn't really argue." We don't issue for that.

export const TIERS = [
  {
    key: 'champion',
    name: 'Champion',
    min: 29.0,
    blurb: 'Final-round caliber. The top of the room. Genuinely rare.',
    cefr: 'C2 (mastery)',
  },
  {
    key: 'circuit',
    name: 'Circuit',
    min: 28.3,
    blurb: 'Clearing speed. The elims-level speech that lands on a real ballot.',
    cefr: 'C1 (advanced)',
  },
  {
    key: 'varsity',
    name: 'Varsity',
    min: 27.5,
    blurb: 'Strong varsity work. Above the median speaker in the room.',
    cefr: 'C1 (advanced)',
  },
  {
    key: 'novice',
    name: 'Novice',
    min: 27.0,
    blurb: 'Solid varsity speech. Real arguments composed in real time under pressure.',
    cefr: 'B2 (upper-intermediate)',
  },
];

export const MIN_CERT_SCORE = 27.0;
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
