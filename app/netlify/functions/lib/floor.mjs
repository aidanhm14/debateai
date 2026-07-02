// ─────────────────────────────────────────────────────────────
// The Floor — shared logic for the play-money prediction arena.
// Pure helpers + content banks used by floor-seed / floor-resolve /
// floor-state / floor-bet. No I/O here; keep it deterministic and
// importable. Money state is server-authoritative; these are the
// rules the server enforces.
// ─────────────────────────────────────────────────────────────

export const FLOOR = {
  START_CREDITS: 1000,
  SEED_LIQUIDITY: 40, // opening pari-mutuel liquidity per side (no empty books)
  MIN_STAKE: 5,
  MAX_STAKE: 500,
  AI_MARKETS: 5, // always-on AI-vs-AI inventory kept alive
  // real-product timeline (ms) — minutes, not the client demo's seconds
  W1_MS: 90000, // 1.5 min blind (motion hidden)
  W2_MS: 90000, // 1.5 min motion revealed
  LIVE_MS: 150000, // 2.5 min round running, bet until midpoint
  LOCK_MS: 60000, // 1 min locked back half
  // Sharp Score window multipliers (earlier read = harder = worth more)
  MULT: { w1: 1.5, w2: 1.0, w3: 0.7 },
};

export const PERSONAS = [
  { nm: 'The Firebrand', style: 'aggressive principle', r: 88 },
  { nm: 'The Surgeon', style: 'clean line-by-line', r: 91 },
  { nm: 'The Closer', style: 'crystallizes late', r: 86 },
  { nm: 'The Veteran', style: 'unflappable weighing', r: 89 },
  { nm: 'The Upstart', style: 'high-variance reframes', r: 80 },
  { nm: 'The Diplomat', style: 'comparative framing', r: 84 },
  { nm: 'The Prosecutor', style: 'burden pressure', r: 87 },
  { nm: 'The Tactician', style: 'strategic collapse', r: 85 },
  { nm: 'The Statesman', style: 'big-picture impact', r: 83 },
  { nm: 'The Heckler', style: 'relentless POIs', r: 79 },
];

export const FORMATS = ['BP', 'APDA', 'Worlds', 'PF', 'LD', 'Policy', 'Asian Parli', 'Quick Clash'];

export const MOTIONS = {
  BP: ['TH would abolish private schooling', 'THW prioritise economic growth over reducing inequality', 'THBT the feminist movement should oppose the institution of marriage'],
  APDA: ['TH regrets the cult of the founder in tech', 'THW let cities go bankrupt', 'TH prefers a world without intellectual property'],
  Worlds: ['THW abolish the UN Security Council veto', 'THBT developing nations should reject IMF conditionality', 'THR the rise of the gig economy'],
  PF: ['Resolved: The US should adopt a wealth tax', 'Resolved: AI does more harm than good to journalism', 'Resolved: NATO should admit Ukraine'],
  LD: ['Resolved: A just government ought to prioritise rehabilitation over retribution', 'Resolved: Predictive policing is unjust', 'Resolved: States ought to ban lethal autonomous weapons'],
  Policy: ['The USFG should substantially increase its Arctic infrastructure', 'The USFG should guarantee a federal jobs program', 'The USFG should phase out nuclear weapons'],
  'Asian Parli': ['THW ban political advertising on social media', 'THBT the Global South should form a debt cartel', 'THW make voting compulsory'],
  'Quick Clash': ['Pineapple belongs on pizza', 'Remote work beats the office', 'Tipping culture should end'],
};

export const RFD = {
  BP: ['Closing {W} extended new terrain on enforcement; opening was left to recap and got outweighed.', '{W} won the comparative: their whip wrote the ballot by issue while {L} narrated their partner.', 'POI engagement and a clean model carried {W}; {L} ducked the framing clash.'],
  APDA: ['{W} negotiated the burden cleanly; {L} leaned on a tight read that did not hold.', 'No fabricated cites, sharper general-knowledge mechanism — {W} on the substance.', '{L} went defensive in the MG and conceded the weighing to {W}.'],
  Worlds: ['{W} grounded the impacts internationally and ran both the principled and practical layer; {L} stayed narrow.', 'Reach and probability went to {W}; {L} asserted magnitude without the link chain.', '{W} on the canonical principled-vs-practical split.'],
  PF: ["{W}'s summary kept the weighing clean; {L} extended an argument the crowd dropped in the back half.", '{W} named the weighing mechanism and frontlined clean; {L} power-tagged the evidence.', '{W} won the second rebuttal exchange; {L} never collapsed.'],
  LD: ['Framework resolved to {W} before contention; {L} name-dropped without the warrant.', '{W} collapsed to two clean voters; {L} tried to extend everything and watered it down.', 'The criterion debate went {W}; offense flowed cleanly under it.'],
  Policy: ['{W} collapsed the 2NR to one position with a clear ballot story; {L} went for everything.', 'Tag accuracy and an extended impact — {W}. {L} left a dropped sub nobody pulled through.', '{W} won the flow on the line-by-line; {L} undercovered.'],
  'Asian Parli': ['{W} won the key exchanges on Method; {L} drifted the whip into summary.', 'Regional grounding and dense analysis from {W}; {L} reframed too late.', 'Matter and manner both edged to {W}.'],
  'Quick Clash': ['{W} punched first with named specifics; {L} opened with throat-clearing.', 'Direct clash from {W}; {L} stayed generic.', '{W} just engaged harder. Close, but clean.'],
};

const pick = (a) => a[Math.floor(Math.random() * a.length)];
const rnd = (a, b) => a + Math.random() * (b - a);
function shuffle(a) {
  a = a.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = a[i];
    a[i] = a[j];
    a[j] = t;
  }
  return a;
}

// Build a fresh market doc (plain JSON; timeline anchored to nowMs).
export function makeMarketData(kind, nowMs) {
  const fmt = pick(FORMATS);
  const ps = shuffle(PERSONAS);
  const A = { ...ps[0] };
  const B = { ...ps[1] };
  return {
    kind, // 'ai' | 'featured'
    fmt,
    motion: pick(MOTIONS[fmt] || MOTIONS['Quick Clash']),
    A,
    B,
    createdAt: nowMs,
    motionRevealAt: nowMs + FLOOR.W1_MS,
    roundStartAt: nowMs + FLOOR.W1_MS + FLOOR.W2_MS,
    midpointAt: nowMs + FLOOR.W1_MS + FLOOR.W2_MS + FLOOR.LIVE_MS,
    resolveAt: nowMs + FLOOR.W1_MS + FLOOR.W2_MS + FLOOR.LIVE_MS + FLOOR.LOCK_MS,
    pool: { A: Math.round(FLOOR.SEED_LIQUIDITY + rnd(0, 80)), B: Math.round(FLOOR.SEED_LIQUIDITY + rnd(0, 80)) },
    backers: { A: Math.floor(rnd(2, 9)), B: Math.floor(rnd(2, 9)) },
    status: 'open',
    settled: false,
    positionsSettled: false,
    result: null,
  };
}

export function windowOf(m, nowMs) {
  if (m.settled) return 'resolved';
  if (nowMs < m.motionRevealAt) return 'w1';
  if (nowMs < m.roundStartAt) return 'w2';
  if (nowMs < m.midpointAt) return 'w3';
  if (nowMs < m.resolveAt) return 'locked';
  return 'resolve';
}
export const bettable = (w) => w === 'w1' || w === 'w2' || w === 'w3';

// probability A wins, from ratings (logistic on rating gap)
export function skillProb(m) {
  const gap = (m.A.r - m.B.r) / 14;
  return Math.max(0.18, Math.min(0.82, 1 / (1 + Math.exp(-gap))));
}

export function poolMult(pool, side) {
  const tot = pool.A + pool.B;
  return pool[side] > 0 ? tot / pool[side] : 1;
}

// Compute a verdict for an unresolved market. If the market was bound to a
// real round (m.boundResult set by the resolution-binding step), use that;
// otherwise simulate from ratings. This is the seam where real AI-judge
// resolution plugs in later without changing settlement.
export function computeVerdict(m) {
  if (m.boundResult && (m.boundResult.judge === 'A' || m.boundResult.judge === 'B')) {
    const r = m.boundResult;
    return { judge: r.judge, crowd: r.crowd || r.judge, diverged: r.crowd ? r.judge !== r.crowd : false, rfd: r.rfd || '', source: 'round' };
  }
  const pA = skillProb(m);
  const judge = Math.random() < pA ? 'A' : 'B';
  const total = (m.backers?.A || 1) + (m.backers?.B || 1);
  const crowdLeanA = (m.backers?.A || 1) / total;
  const crowd = Math.random() < crowdLeanA * 0.6 + (judge === 'A' ? 0.4 : 0) ? 'A' : 'B';
  const L = judge === 'A' ? 'B' : 'A';
  const rfd = pick(RFD[m.fmt] || RFD['Quick Clash']).replace(/\{W\}/g, m[judge].nm).replace(/\{L\}/g, m[L].nm);
  return { judge, crowd, diverged: judge !== crowd, rfd, source: 'sim' };
}

// Blended, Bayesian-shrunk predictor rating. Recomputed on each settlement.
export function sharpScore(u) {
  const bets = u.bets || 0;
  const accShrunk = ((u.wins || 0) + 2) / (bets + 4);
  const staked = u.staked || 0;
  const roi = staked > 0 ? ((u.returned || 0) - staked) / staked : 0;
  const roiNorm = 1 / (1 + Math.exp(-roi * 2));
  const conviction = bets > 0 ? (u.convSum || 0) / bets : 1.0;
  const convNorm = Math.max(0, Math.min(1, (conviction - 0.7) / 0.8));
  const reliability = bets / (bets + 10);
  const base = 0.4 * accShrunk + 0.3 * roiNorm + 0.2 * convNorm + 0.1 * reliability;
  return Math.round(1000 * base * (1 + 0.04 * (u.streak || 0))) + 600;
}

export function defaultUser(uid) {
  return { uid, credits: FLOOR.START_CREDITS, staked: 0, returned: 0, bets: 0, wins: 0, convSum: 0, streak: 0, sharpScore: 600 };
}
