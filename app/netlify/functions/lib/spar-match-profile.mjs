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
    'The US should not allow anyone to become a billionaire.',
    'Economic growth matters more than economic equality.',
    'The US should tax wealth to stop billionaires controlling politics.',
    'Governments should guarantee a job to anyone who wants one.',
    'Inheritance matters more than hard work in deciding who becomes rich.',
    'Workers should get a pay rise when their company becomes more productive.',
    'Housing should be built even when current homeowners oppose it.',
    'Paying everyone a basic income would make workers easier to replace.',
  ]),
  immigration: Object.freeze([
    'Legal immigration should be much easier.',
    'Countries should prioritize skilled workers when choosing immigrants.',
    'Long-term residents should have a faster path to citizenship.',
    'US cities should be allowed to refuse to help federal immigration officers.',
    'Immigration strengthens national identity more than it weakens it.',
    'Rich countries have a duty to accept more refugees.',
    'Temporary work visas create an unfair class of workers.',
    'Countries should set immigration targets through public votes.',
  ]),
  speech: Object.freeze([
    'Platforms should leave lawful political speech alone.',
    'Social media apps should remove more false political claims.',
    'Anonymous political speech does more harm than good online.',
    'Every social media account should be tied to a real identity.',
    'Political ads made with AI should be banned.',
    'Social media apps should explain why they show you each post.',
    'Universities should stay neutral on contested political questions.',
    'Social media companies have too much control over which opinions get heard.',
  ]),
  democracy: Object.freeze([
    'Voting should be mandatory.',
    'The voting age should be lowered to 16.',
    'US voters should be able to rank candidates in order of preference.',
    'Citizens chosen by lottery would govern better than elected politicians.',
    'Political parties make democracy worse.',
    'Limiting how long politicians can serve makes government worse.',
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

  const opposed = shared.filter((key) => a.stances[key] !== b.stances[key]);
  const issues = opposed.length ? opposed : shared;

  // Interleave issue banks so a pair sharing two or more interests sees a
  // real mix after the seeded shuffle in motion-draft. Every source bank is
  // fixed and content-reviewed; no profile text becomes a motion.
  const out = [];
  const width = Math.max(...issues.map((key) => POLITICAL_MOTIONS[key].length));
  for (let i = 0; i < width; i++) {
    for (const key of issues) {
      const motion = POLITICAL_MOTIONS[key][i];
      if (motion) out.push(motion);
    }
  }
  return out;
}

// These claims directly express the choice asked at the Match Desk. The
// wider banks supply alternatives, but a broad issue match alone should
// not recommend an unrelated subtopic as the pair's actual disagreement.
const DESK_RESOLUTIONS = Object.freeze({
  economy: [POLITICAL_MOTIONS.economy[2], POLITICAL_MOTIONS.economy[1]],
  immigration: [POLITICAL_MOTIONS.immigration[0], POLITICAL_MOTIONS.immigration[1]],
  speech: [POLITICAL_MOTIONS.speech[1], POLITICAL_MOTIONS.speech[0]],
  democracy: [POLITICAL_MOTIONS.democracy[7], POLITICAL_MOTIONS.democracy[2]],
});

export function matchDeskDraftConfig(mine, theirs, seed) {
  const suggestions = mutualPoliticalMotionPool(mine, theirs);
  if (suggestions.length < 2) return {};
  const a = cleanSparMatchProfile(mine);
  const b = cleanSparMatchProfile(theirs);
  const opposed = STANCE_KEYS.filter((key) =>
    a.stances[key] !== 'skip' && b.stances[key] !== 'skip'
      && a.stances[key] !== b.stances[key]);
  if (!opposed.length) return { suggestions };

  // The room seed changes on a rematch and is stable across transaction
  // retries. Neither caller order nor a real-time model call can reroll it.
  let hash = 0x811c9dc5;
  for (const ch of String(seed || '')) {
    hash = Math.imul(hash ^ ch.charCodeAt(0), 0x01000193) >>> 0;
  }
  const issue = opposed[hash % opposed.length];
  const claims = DESK_RESOLUTIONS[issue];
  const recommendedMotion = claims[Math.floor(hash / opposed.length) % claims.length];
  // Only motions leave this module, never issue ids, answers, inferred
  // positions, or instructions about which side either person should take.
  return { suggestions, recommendedMotion };
}
