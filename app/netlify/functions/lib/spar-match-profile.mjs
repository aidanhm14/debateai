// Private political signals for live matchmaking. PURE. No Firestore here.
//
// The public matchmaking_queue is readable by every signed-in client, so
// none of these values may ever ride a queue document. The API stores the
// cleaned profile in the server-only spar_match_profiles collection;
// spar-pair reads it only to order eligible candidates and build a motion
// suggestion pool. The opponent and the judge never receive either profile.

export const SPAR_MATCH_PROFILE_VERSION = 4;

export const MATCH_MODES = new Set(['viewpoint', 'rating', 'fast']);

export const STANCE_VALUES = Object.freeze({
  economy: new Set(['redistribute', 'markets', 'skip']),
  immigration: new Set(['easier', 'selective', 'skip']),
  speech: new Set(['moderate', 'hands_off', 'skip']),
  democracy: new Set(['reform', 'stability', 'skip']),
});

export const POLITICAL_MOTIONS = Object.freeze({
  economy: Object.freeze([
    'Billionaires are a policy failure.',
    'Economic growth matters more than economic equality.',
    'Wealth taxes are necessary to prevent oligarchy.',
    'Governments should guarantee a job to anyone who wants one.',
    'Inheritance matters more than hard work in deciding who becomes rich.',
    'Companies should be required to share productivity gains with workers.',
    'Housing should be built even when current homeowners oppose it.',
    'Universal basic income would weaken workers.',
  ]),
  immigration: Object.freeze([
    'Legal immigration should be much easier.',
    'Countries should prioritize skilled workers when choosing immigrants.',
    'Long-term residents should have a faster path to citizenship.',
    'Cities should be allowed to refuse cooperation with national immigration enforcement.',
    'Immigration strengthens national identity more than it weakens it.',
    'Rich countries have a duty to accept more refugees.',
    'Temporary work visas create an unfair class of workers.',
    'Countries should set immigration targets through public votes.',
  ]),
  speech: Object.freeze([
    'Platforms should leave lawful political speech alone.',
    'Social media platforms should moderate political misinformation more aggressively.',
    'Anonymous political speech does more harm than good online.',
    'Every social media account should be tied to a real identity.',
    'Political ads made with AI should be banned.',
    'Recommendation algorithms should be public.',
    'Universities should stay neutral on contested political questions.',
    'Free speech cannot survive algorithmic feeds.',
  ]),
  democracy: Object.freeze([
    'Voting should be mandatory.',
    'The voting age should be lowered to 16.',
    'Ranked-choice voting should replace winner-take-all elections.',
    'Citizens chosen by lottery would govern better than elected politicians.',
    'Political parties make democracy worse.',
    'Term limits would make legislatures less effective.',
    'Courts should be allowed to remove politicians who repeatedly lie.',
    'Major constitutional reform is worth the instability it creates.',
  ]),
});

const STANCE_KEYS = Object.freeze(Object.keys(STANCE_VALUES));

function cleanMode(value) {
  const mode = String(value || '').toLowerCase();
  return MATCH_MODES.has(mode) ? mode : 'fast';
}

export function cleanSparMatchProfile(raw) {
  const input = raw && typeof raw === 'object' ? raw : {};
  const nested = input.stances && typeof input.stances === 'object' ? input.stances : input;
  const stances = {};
  for (const key of STANCE_KEYS) {
    const value = String(nested[key] || '').toLowerCase();
    stances[key] = STANCE_VALUES[key].has(value) ? value : 'skip';
  }
  return {
    version: SPAR_MATCH_PROFILE_VERSION,
    matchMode: cleanMode(input.matchMode || input.mode),
    stances,
  };
}

export function politicalSignalCount(profile) {
  const clean = cleanSparMatchProfile(profile);
  return STANCE_KEYS.reduce((count, key) => count + (clean.stances[key] === 'skip' ? 0 : 1), 0);
}

export function hasPoliticalSignal(profile) {
  return politicalSignalCount(profile) > 0;
}

// Shared interest is the first requirement. An actual disagreement on that
// issue is then worth substantially more than agreement, but agreement is
// not treated as incompatibility because the room still assigns opposite
// sides and people often enjoy testing a view they hold.
export function politicalMatchScore(mine, theirs) {
  const a = cleanSparMatchProfile(mine);
  const b = cleanSparMatchProfile(theirs);
  let shared = 0;
  let opposed = 0;
  let agreed = 0;
  for (const key of STANCE_KEYS) {
    const av = a.stances[key];
    const bv = b.stances[key];
    if (av === 'skip' || bv === 'skip') continue;
    shared += 1;
    if (av === bv) agreed += 1;
    else opposed += 1;
  }
  const bothWantClash = a.matchMode === 'viewpoint' && b.matchMode === 'viewpoint';
  const score = opposed * 100 + shared * 20 + agreed * 5 + (bothWantClash ? 30 : 0);
  return { score, shared, opposed, agreed };
}

export function rankPoliticalCandidates(mine, candidates) {
  return (Array.isArray(candidates) ? candidates : [])
    .map((candidate, index) => ({
      candidate,
      index,
      result: politicalMatchScore(mine, candidate && candidate.profile),
    }))
    .sort((a, b) =>
      b.result.score - a.result.score
      || b.result.opposed - a.result.opposed
      || b.result.shared - a.result.shared
      || a.index - b.index)
    .map((entry) => entry.candidate);
}

// Personalized suggestions exist only when BOTH people explicitly answered
// at least one of the same issue questions. Otherwise the ordinary broad
// pool is more honest than pretending a one-sided interest is mutual.
export function mutualPoliticalMotionPool(mine, theirs) {
  const a = cleanSparMatchProfile(mine);
  const b = cleanSparMatchProfile(theirs);
  const shared = STANCE_KEYS.filter((key) =>
    a.stances[key] !== 'skip' && b.stances[key] !== 'skip');
  if (!shared.length) return [];

  // Interleave issue banks so a pair sharing two or more interests sees a
  // real mix after the seeded shuffle in motion-draft. Every source bank is
  // fixed and content-reviewed; no profile text becomes a motion.
  const out = [];
  const width = Math.max(...shared.map((key) => POLITICAL_MOTIONS[key].length));
  for (let i = 0; i < width; i++) {
    for (const key of shared) {
      const motion = POLITICAL_MOTIONS[key][i];
      if (motion) out.push(motion);
    }
  }
  return out;
}

