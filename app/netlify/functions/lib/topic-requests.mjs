// Shared helpers for the audience topic board (/what-to-debate).
//
// The board is the "what do you want debated?" surface: anyone can post a
// motion they want argued, anyone can upvote, and the ranked list is the
// signal for what actually gets run in rounds and shows.
//
// Three endpoints share this module:
//   suggest-topic.mjs  — POST a new request
//   topic-board.mjs    — GET the ranked list
//   topic-vote.mjs     — POST an upvote (deduped)
//
// Doc id is a hash of the NORMALIZED topic text, so two people asking for
// the same thing land on one card that accumulates votes instead of two
// half-voted duplicates. That is the whole reason this file exists: the
// normalization has to be byte-identical across submit and vote or the
// dedup silently stops working.

export const COLLECTION = 'topic_requests';
export const VOTES_COLLECTION = 'topic_request_votes';

// Formats a suggester can tag a request with. Keys match the format keys
// used by the round surfaces (see FORMAT_NAMES in rounds.html) so a card
// can hand its motion straight to /practice. 'any' is the default and the
// honest answer for most audience suggestions.
export const FORMATS = {
  any: 'Any format',
  quick: 'Quick Clash',
  apda: 'APDA',
  bp: 'British Parli',
  worlds: 'Worlds',
  asian: 'Asian Parli',
  pf: 'Public Forum',
  ld: 'Lincoln-Douglas',
  policy: 'Policy',
};

export function isFormat(key) {
  return Object.prototype.hasOwnProperty.call(FORMATS, key);
}

// Normalization for the dedup hash ONLY. Never write this back as the
// display text; the suggester's original casing and punctuation is what
// renders on the card.
//
// Folds the differences that don't change what is being asked: case,
// whitespace runs, smart quotes, trailing punctuation, and the "this house
// would" / "thbt" prefixes debaters attach inconsistently.
export function normalizeTopic(raw) {
  return String(raw || '')
    .toLowerCase()
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[“”„‟]/g, '"')
    .replace(/^\s*(thbt|thw|thr|ths|tho|this house (would|believes that|believes|regrets|supports|opposes))\s+/i, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// FNV-1a 32-bit hex. Same approach as ambassador-apply.mjs: we need a
// stable text -> doc id mapping for dedup, not cryptographic strength.
export function fnv1a(str) {
  const s = String(str || '');
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

// 64 bits of id from two independent 32-bit passes (raw + reversed). One
// 32-bit hash collides at roughly 77k docs by the birthday bound, and a
// collision here would merge two unrelated topics into one card.
export function topicId(topic) {
  const n = normalizeTopic(topic);
  if (!n) return '';
  const reversed = n.split('').reverse().join('');
  return fnv1a(n) + fnv1a(reversed);
}

// One vote per person per topic. Signed-in users dedup on uid; everyone
// else dedups on a hash of their IP. IP-based dedup is defeatable, which
// is fine: this is a "what should we argue about" board, not an election.
export function voterKey(uid, ip) {
  return uid ? `u_${uid}` : `i_${fnv1a(ip || 'unknown')}`;
}

export function voteDocId(id, voter) {
  return `${id}__${voter}`;
}

// Curated read shape. Never leak the author's uid to the client; the
// display name is the only author signal the board needs.
export function shapeTopic(doc) {
  const d = doc.data() || {};
  return {
    id: doc.id,
    topic: d.topic || '',
    why: d.why || '',
    format: isFormat(d.format) ? d.format : 'any',
    formatLabel: FORMATS[isFormat(d.format) ? d.format : 'any'],
    votes: typeof d.votes === 'number' ? d.votes : 0,
    // How many separate people submitted this same wording. A high count
    // is its own demand signal, independent of votes.
    suggestedCount: typeof d.suggestedCount === 'number' ? d.suggestedCount : 1,
    authorName: d.authorName || '',
    createdAt: d.createdAt && d.createdAt.toMillis ? d.createdAt.toMillis() : null,
  };
}
