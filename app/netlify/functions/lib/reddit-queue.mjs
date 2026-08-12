// Reddit answer queue. PURE module: scoring, filtering, and the rules a
// draft reply has to satisfy before a human is allowed to see it. No I/O,
// no Firestore, no fetch, so it is testable and so the rules below cannot
// quietly depend on network state.
//
// THE ONE STRUCTURAL RULE: there is no post function in this file, in the
// cron that uses it, or anywhere else in this repo. Drafts land in a queue
// and a human posts them by hand or not at all. That is deliberate in the
// same way the judge layer has no rake: the temptation later will be to
// "just auto-post the high-confidence ones", and an automated account
// replying to strangers with product links is spam, gets the domain banned
// from the subreddits we actually need, and cannot be walked back. If a
// future change adds posting, it is not an optimisation, it is a different
// product decision and belongs in the decision log.
//
// ACCESS NOTE, measured 2026-08-12, because it determines the whole shape:
// reddit.com/r/<sub>/new.json answers 403 and oauth.reddit.com answers 403
// without a token, and the .rss feed answered 200 once and then 429. So
// there is no reliable unauthenticated read path. The cron uses Reddit's
// official application-only OAuth and does nothing at all when the
// credentials are absent, rather than scraping something that will break
// silently and intermittently.

// Subreddits worth watching, and why each one. Kept small on purpose: a
// wide net produces a queue nobody reads, which is the same as no queue.
export const WATCHED_SUBREDDITS = [
  'Debate',          // the general one, mixed levels
  'policydebate',    // carded formats, high intent
  'LincolnDouglas',
  'PublicForum',
  'APDA',
];

// A post has to look like someone asking for help with an ARGUMENT. These
// are the signals that it does.
const INTENT_STRONG = [
  'how do i answer', 'how do you answer', 'how to answer', 'answers to',
  'how do i beat', 'how to beat', 'responses to', 'respond to this',
  'frontline', 'block against', 'blocks against', 'what do i say',
  'how do i respond', 'stuck on', 'struggling against', 'keep losing to',
];
const INTENT_MEDIUM = [
  'argument', 'contention', 'rebuttal', 'turn', 'warrant', 'impact',
  'framework', 'weighing', 'case', 'motion', 'resolution', 'cross ex',
  'crossex', 'cross-ex', 'flow', 'ballot', 'rfd', 'judge',
];

// Things that look like debate but are not a question a tool can answer.
// Each of these is a post we would embarrass ourselves replying to.
const REJECT = [
  'tournament results', 'congrats', 'congratulations', 'bid list',
  'looking for a partner', 'partner search', 'recruiting', 'hiring',
  'selling', 'for sale', 'discount code', 'my team won', 'we won',
  'venting', 'rant', 'drama', 'is my coach', 'quit debate', 'quitting',
  'meme', 'shitpost', 'circlejerk',
];

export function normalize(text) {
  return String(text || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

// Phrase matching is WORD-BOUNDED, and that is not a nicety. A plain
// substring check rejects every genuine post containing the word
// "warrant", because "warrant" contains "rant", which is on the reject
// list. Caught by the test suite, not by reading the list. The same trap
// waits in "turn" inside "turnout" and "case" inside "staircase".
const boundaryCache = new Map();
function phraseRe(phrase) {
  let re = boundaryCache.get(phrase);
  if (!re) {
    const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    re = new RegExp('\\b' + escaped + '\\b', 'i');
    boundaryCache.set(phrase, re);
  }
  return re;
}
export function hasPhrase(haystack, phrase) {
  return phraseRe(phrase).test(haystack);
}

// One stable key per post so a re-run does not re-queue the same thing.
// Reddit ids are already unique and stable; prefixing keeps the collection
// readable and leaves room for another source later.
export function dedupeKey(post) {
  const id = String((post && post.id) || '').replace(/[^a-z0-9_]/gi, '');
  return id ? `reddit_${id}` : '';
}

// Score how worth answering a post is. Returns 0 for anything rejected
// outright so the caller can filter on a single number.
export function scoreCandidate(post) {
  if (!post) return 0;
  const title = normalize(post.title);
  const body = normalize(post.selftext);
  const hay = title + ' ' + body;
  if (!title) return 0;

  // Hard rejects first, so a "congrats on the bid" post carrying the word
  // "argument" never scrapes through on keyword count.
  for (const bad of REJECT) if (hasPhrase(hay, bad)) return 0;

  // Already well answered by humans. Arriving eleventh helps nobody and
  // reads as trawling.
  if (Number(post.num_comments) >= 12) return 0;

  // Link posts with no text are usually an article drop, not a question.
  if (!body && post.is_self === false) return 0;

  let score = 0;
  for (const s of INTENT_STRONG) if (hasPhrase(hay, s)) score += 4;
  for (const m of INTENT_MEDIUM) if (hasPhrase(hay, m)) score += 1;

  // An actual question mark is weak evidence on its own and good
  // corroboration on top of intent words.
  if (/\?/.test(title)) score += 2;

  // Enough text to understand what they are asking. A ten word post
  // cannot be answered well and the reply would be generic.
  if (body.length >= 160) score += 2;
  else if (body.length < 40) score -= 3;

  return Math.max(0, score);
}

// The bar for entering the queue. Two strong signals, or one strong plus
// corroboration. Deliberately high: the failure mode that kills this is a
// queue of forty mediocre candidates that stops getting opened.
export const MIN_SCORE = 8;

export function isAnswerable(post) {
  return scoreCandidate(post) >= MIN_SCORE;
}

// ── Draft rules ────────────────────────────────────────────────────────
// A draft that breaks any of these is not shown to a human, because the
// cost of a bad reply on Reddit is not a bad reply, it is the subreddit
// deciding what this account is.

export const BANNED_IN_DRAFT = [
  // Site-wide voice rules (soul.md §5), which apply doubly here because
  // this text would be published under a real account.
  "let's dive in", "let's unpack", "let's break it down",
  'let me break this down', 'let me explain', 'hear me out',
  'stay with me', 'bear with me', 'in today\'s world',
  "it's important to note", 'at the end of the day',
  // Marketing register. This is a comment, not a landing page.
  'check out', 'sign up', 'free trial', 'our platform', 'our product',
  'dm me', 'shameless plug', 'full disclosure i built',
];

export const SITE_HOST = 'itsdebatable.com';

// Validate a drafted reply. Returns { ok, problems: [] }. Every rule here
// exists because the alternative is a comment that gets the domain
// shadowbanned from the exact places this is supposed to reach.
export function validateDraft(text) {
  const problems = [];
  const raw = String(text || '');
  const t = raw.trim();
  const lower = t.toLowerCase();

  if (t.length < 120) problems.push('too short to be a real answer');
  if (t.length > 1800) problems.push('too long; nobody reads a wall of text in a thread');

  if (t.includes('—')) problems.push('contains an em-dash');

  for (const phrase of BANNED_IN_DRAFT) {
    if (lower.includes(phrase)) problems.push(`banned phrase: "${phrase}"`);
  }

  const linkCount = (lower.match(new RegExp(SITE_HOST.replace('.', '\\.'), 'g')) || []).length;
  if (linkCount > 1) problems.push('links to the site more than once');

  // THE IMPORTANT ONE. The answer has to stand on its own, and the link is
  // a footnote or absent. If the site is named in the opening, the comment
  // is an advert with an answer attached rather than the other way round.
  if (linkCount > 0) {
    const firstThird = lower.slice(0, Math.max(120, Math.floor(lower.length / 3)));
    if (firstThird.includes(SITE_HOST)) {
      problems.push('names the site in the opening; the answer must come first');
    }
  }

  // No fabricated authority. Same rule as the block builder, same reason.
  if (/\b[A-Z][a-z]{2,}\s+(?:'\d{2}|(?:19|20)\d{2})\b/.test(t)) {
    problems.push('contains an author-year citation; do not invent evidence');
  }

  return { ok: problems.length === 0, problems };
}

// Bounded per run so a busy day cannot produce a queue nobody triages, and
// so the model spend has a ceiling. Same posture as the nightly
// fingerprint cap from the 2026-05-18 credit audit.
export const MAX_DRAFTS_PER_RUN = 6;
export const MAX_CANDIDATES_SCANNED = 60;

// The queue row a human triages. Kept flat and readable, because the whole
// point is that someone opens /admin and can decide in five seconds.
export function buildQueueRow(post, draft, score) {
  return {
    key: dedupeKey(post),
    source: 'reddit',
    subreddit: String(post.subreddit || ''),
    postId: String(post.id || ''),
    title: String(post.title || '').slice(0, 300),
    excerpt: String(post.selftext || '').slice(0, 900),
    url: post.permalink ? `https://www.reddit.com${post.permalink}` : '',
    author: String(post.author || ''),
    createdUtc: Number(post.created_utc) || 0,
    numComments: Number(post.num_comments) || 0,
    score,
    draft: String(draft || ''),
    status: 'pending', // pending | posted | dismissed. Never set by a machine to 'posted'.
    createdAt: null,   // stamped by the caller with a server timestamp
  };
}
