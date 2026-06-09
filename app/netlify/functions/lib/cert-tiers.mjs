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

// ── Communication-score translation layer ──────────────────────────
//
// The front end (verify page, profile, marketing) leads with a 0-100
// Communication Score, a worldwide percentile, and a communicator
// level. These are a deterministic, CALIBRATED transform of the
// academic 25-30 speaker-points score, which stays the stored, judged
// truth on the doc. Nothing here changes what gets stored or which
// credential is issued. It is a rescaling for readability, the way a
// chess rating or a Duolingo English Test score reads to a normal
// reader who has never heard of speaker points.
//
// Percentile bands are the level's calibrated band (27.0 = median =
// Top 50% by construction; 29.0+ = genuinely rare = Top 1%). They are
// descriptive guidance, not a live ranking against other users.

// Speaker points -> 0-100, piecewise-linear over these anchors. Chosen
// so the band edges line up with the published level bands: Effective
// 75-81, Advanced 82-87, Elite 88-93, Exceptional 94+. A 28.6 lands at
// 91, the canonical sample on /credentials.
const COMM_ANCHORS = [
  [25.0, 50], [26.0, 62], [27.0, 75], [27.5, 82],
  [28.3, 88], [29.0, 94], [30.0, 100],
];

export function commScoreForSpeaks(score) {
  const n = Number(score);
  if (!Number.isFinite(n)) return null;
  if (n <= COMM_ANCHORS[0][0]) return COMM_ANCHORS[0][1];
  const last = COMM_ANCHORS[COMM_ANCHORS.length - 1];
  if (n >= last[0]) return last[1];
  for (let i = 1; i < COMM_ANCHORS.length; i++) {
    const [x1, y1] = COMM_ANCHORS[i - 1];
    const [x2, y2] = COMM_ANCHORS[i];
    if (n <= x2) {
      const t = (n - x1) / (x2 - x1);
      return Math.round(y1 + t * (y2 - y1));
    }
  }
  return last[1];
}

// Communicator levels, keyed one-to-one to the academic credential
// tiers. "emerging" is the pre-credential entry band (below
// MIN_CERT_SCORE) and is never issued, so it has no tier here.
export const LEVELS_BY_TIER = {
  novice:   { level: 'Effective Communicator',   levelKey: 'effective',   pct: 'Top 50%' },
  varsity:  { level: 'Advanced Communicator',    levelKey: 'advanced',    pct: 'Top 20%' },
  circuit:  { level: 'Elite Communicator',       levelKey: 'elite',       pct: 'Top 5%'  },
  champion: { level: 'Exceptional Communicator', levelKey: 'exceptional', pct: 'Top 1%'  },
};

// Full readable profile for a stored speaker-points score. Returns null
// for a score below the credential bar (which is never issued anyway).
export function commProfileForScore(score) {
  const tier = tierForScore(score);
  if (!tier) return null;
  const lv = LEVELS_BY_TIER[tier.key] || LEVELS_BY_TIER.novice;
  return {
    commScore: commScoreForSpeaks(score),
    level: lv.level,
    levelKey: lv.levelKey,
    pct: lv.pct,
    tierKey: tier.key,
    tierName: tier.name,
    blurb: tier.blurb,
  };
}
