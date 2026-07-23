// ─────────────────────────────────────────────────────────────
// The Challenge — the atomic unit of the arena.
//
// A challenge is a claim someone is willing to defend, plus everything
// needed to turn that into an event: who is on each side, when it
// happens, what the crowd thinks, and what is at stake.
//
// This file is pure: shape, status machine, validation, projection. No
// I/O, no Firestore, no auth. Import it from the endpoints and from the
// backfill script so there is exactly one definition of what a
// challenge is.
//
// Relationship to live_challenges: that collection was a two-field
// board (motion + accepter slot). It stays readable while the arena
// migrates. `fromLiveChallenge` below maps one into this shape.
// ─────────────────────────────────────────────────────────────
import { checkContent } from './content-guard.mjs';

// ── Status machine ──────────────────────────────────────────────────
// Status is server-owned. Clients never write it directly; they call an
// action (accept / apply / schedule) and the server decides whether the
// transition is legal. An illegal transition is a bug or an attack, and
// both should fail loudly rather than silently corrupt a board.
export const STATUSES = [
  'draft',
  'open',
  'applications_open',
  'accepted',
  'scheduled',
  'live',
  'judging',
  'completed',
  'cancelled',
  'disputed',
];

const TRANSITIONS = {
  draft:             ['open', 'applications_open', 'cancelled'],
  open:              ['applications_open', 'accepted', 'cancelled'],
  applications_open: ['accepted', 'open', 'cancelled'],
  accepted:          ['scheduled', 'live', 'open', 'cancelled'],
  scheduled:         ['live', 'accepted', 'cancelled'],
  live:              ['judging', 'cancelled'],
  judging:           ['completed', 'disputed'],
  completed:         ['disputed'],
  disputed:          ['completed', 'cancelled'],
  cancelled:         [],
};

export function canTransition(from, to) {
  if (!STATUSES.includes(to)) return false;
  return (TRANSITIONS[from] || []).includes(to);
}

// Statuses where the challenge still wants participants.
export const OPEN_STATUSES = new Set(['open', 'applications_open']);
// Statuses where the debate is over and the record is permanent.
export const TERMINAL_STATUSES = new Set(['completed', 'cancelled']);

export const MODES = ['live', 'async'];
export const APPLICATION_MODES = ['open', 'apply', 'invite'];
export const VISIBILITIES = ['public', 'unlisted', 'arena'];
export const PREDICTION_STATUSES = ['closed', 'open', 'locked', 'settled'];

// ── Slug + claim identity ───────────────────────────────────────────

// URL slug: readable prefix of the claim plus a short discriminator, so
// /c/algorithms-in-sentencing-7f3a is guessable-looking but not
// enumerable, and two identical claims never collide.
export function slugify(claim, discriminator) {
  const base = String(claim || '')
    .toLowerCase()
    .replace(/["'’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .split('-')
    .filter(Boolean)
    .slice(0, 8)
    .join('-')
    .slice(0, 60);
  const d = String(discriminator || '').replace(/[^a-z0-9]/gi, '').slice(0, 6).toLowerCase();
  if (!base) return d || 'claim';
  return d ? `${base}-${d}` : base;
}

// Dedupe key for the claims collection. Two challenges phrased "THW ban
// X" and "This house would ban X." should aggregate onto one claim, so
// the Conviction Graph can ask "what moves people on X" across every
// round that ever argued it.
const CLAIM_PREFIXES = /^(this house (would|believes that|believes|regrets|supports|opposes)|thbt|thw|thr|ths|tho|th|resolved:?|be it resolved that)\s+/i;
export function normalizeClaim(claim) {
  return String(claim || '')
    .toLowerCase()
    .replace(/[‘’“”]/g, "'")
    .replace(CLAIM_PREFIXES, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 300);
}

// ── Validation ──────────────────────────────────────────────────────

const MAX_DESCRIPTION = 2000;
const MAX_SIDE_LABEL = 40;
const MAX_EVIDENCE = 8;
const MAX_TOPIC = 40;

function cleanUrl(raw) {
  const s = String(raw || '').trim().slice(0, 500);
  if (!/^https?:\/\//i.test(s)) return '';
  return s;
}

// Returns { ok:true, value } or { ok:false, reason, field }.
export function validateChallengeInput(input = {}) {
  const claim = String(input.claim || '').trim();

  // Claim text is the most public string in the product: it lands on a
  // share card, a feed, and a permanent record. Guard it like a motion.
  const guard = checkContent({ text: claim, kind: 'motion' });
  if (!guard.ok) return { ok: false, reason: guard.reason, field: 'claim', category: guard.category };

  const mode = MODES.includes(input.mode) ? input.mode : 'async';
  const applicationMode = APPLICATION_MODES.includes(input.applicationMode)
    ? input.applicationMode : 'open';
  const visibility = VISIBILITIES.includes(input.visibility) ? input.visibility : 'public';

  const sideA = String(input.sideA || 'For').trim().slice(0, MAX_SIDE_LABEL) || 'For';
  const sideB = String(input.sideB || 'Against').trim().slice(0, MAX_SIDE_LABEL) || 'Against';
  if (sideA.toLowerCase() === sideB.toLowerCase()) {
    return { ok: false, reason: 'The two sides need different labels.', field: 'sides' };
  }

  const description = String(input.description || '').trim().slice(0, MAX_DESCRIPTION);
  if (description) {
    const dg = checkContent({ text: description, kind: 'message' });
    if (!dg.ok) return { ok: false, reason: dg.reason, field: 'description', category: dg.category };
  }

  const evidence = (Array.isArray(input.evidence) ? input.evidence : [])
    .slice(0, MAX_EVIDENCE)
    .map((e) => ({
      url: cleanUrl(e && e.url),
      title: String((e && e.title) || '').trim().slice(0, 140),
    }))
    .filter((e) => e.url);

  let scheduledAt = Number(input.scheduledAt) || 0;
  // A schedule in the past is a client clock problem, not an intent.
  if (scheduledAt && scheduledAt < Date.now() - 60_000) scheduledAt = 0;

  return {
    ok: true,
    value: {
      claim,
      topic: String(input.topic || '').trim().slice(0, MAX_TOPIC),
      category: String(input.category || '').trim().slice(0, MAX_TOPIC),
      format: String(input.format || 'quick').trim().slice(0, 24),
      mode,
      applicationMode,
      visibility,
      sides: { a: sideA, b: sideB },
      description,
      evidence,
      scheduledAt,
    },
  };
}

// ── Construction ────────────────────────────────────────────────────

// Build a fresh challenge doc. `now` is passed in so callers stay
// testable and the function stays deterministic.
export function makeChallengeData(valid, creator, opts = {}) {
  const now = opts.now || Date.now();
  const status = opts.status || (valid.applicationMode === 'apply' ? 'applications_open' : 'open');
  return {
    claim: valid.claim,
    claimNorm: normalizeClaim(valid.claim),
    claimId: opts.claimId || '',
    slug: opts.slug || '',
    topic: valid.topic,
    category: valid.category,
    creator: {
      uid: creator.uid,
      name: String(creator.name || '').slice(0, 60),
      photo: String(creator.photo || '').slice(0, 300),
      handle: String(creator.handle || '').slice(0, 40),
    },
    challengedUid: opts.challengedUid || '',
    sides: valid.sides,
    description: valid.description,
    evidence: valid.evidence,

    status,
    format: valid.format,
    mode: valid.mode,
    applicationMode: valid.applicationMode,

    applicants: [],
    accepted: [],

    scheduledAt: valid.scheduledAt,
    prediction: { status: 'closed', marketId: '', lockAt: 0 },
    crowd: { supportA: 0, supportB: 0, followers: 0 },

    sponsorId: '',
    prize: null,
    visibility: valid.visibility,
    moderation: { state: 'clean', reportCount: 0 },
    arenaId: opts.arenaId || '',
    eventId: '',
    feedKey: feedKeyFor(status, valid.visibility, 'clean'),

    createdAt: now,
    updatedAt: now,
  };
}

// ── Projection ──────────────────────────────────────────────────────

// What any visitor may see. No emails, no reporter identities, no raw
// applicant notes from other users. uids stay because the client needs
// them to decide which CTA to render (accept vs withdraw vs watch).
export function publicChallenge(id, d) {
  if (!d) return null;
  const crowd = d.crowd || {};
  const a = Number(crowd.supportA) || 0;
  const b = Number(crowd.supportB) || 0;
  const total = a + b;
  return {
    id,
    slug: d.slug || id,
    claim: d.claim || '',
    claimId: d.claimId || '',
    topic: d.topic || '',
    category: d.category || '',
    creator: d.creator || null,
    challengedUid: d.challengedUid || '',
    sides: d.sides || { a: 'For', b: 'Against' },
    description: d.description || '',
    evidence: d.evidence || [],
    status: d.status || 'open',
    format: d.format || 'quick',
    mode: d.mode || 'async',
    applicationMode: d.applicationMode || 'open',
    applicantCount: (d.applicants || []).length,
    accepted: (d.accepted || []).map((p) => ({
      uid: p.uid, name: p.name || '', photo: p.photo || '', side: p.side,
    })),
    scheduledAt: d.scheduledAt || 0,
    prediction: {
      status: (d.prediction && d.prediction.status) || 'closed',
      lockAt: (d.prediction && d.prediction.lockAt) || 0,
    },
    crowd: {
      supportA: a,
      supportB: b,
      // Percent is derived here rather than client-side so every
      // surface (arena card, challenge page, share image) shows the
      // same number and rounds it the same way.
      pctA: total ? Math.round((a / total) * 100) : 50,
      followers: Number(crowd.followers) || 0,
    },
    sponsorId: d.sponsorId || '',
    prize: d.prize || null,
    visibility: d.visibility || 'public',
    eventId: d.eventId || '',
    createdAt: d.createdAt || 0,
    updatedAt: d.updatedAt || 0,
  };
}

// Feed bucket, mirroring the async-rounds pattern: one cheap string the
// arena queries on instead of composing three where-clauses.
export function feedKeyFor(status, visibility, moderationState) {
  if (moderationState === 'hidden' || visibility !== 'public') return 'quiet';
  if (status === 'live') return 'live-public';
  if (OPEN_STATUSES.has(status)) return 'open-public';
  if (status === 'scheduled') return 'upcoming-public';
  if (status === 'completed') return 'done-public';
  return 'quiet';
}

// ── Migration ───────────────────────────────────────────────────────

// Map a legacy live_challenges doc into the new shape. Deliberately
// lossless on the fields that existed; everything new gets its default.
// Contact details are NOT carried: they live in live_challenge_contacts
// and are readable only by the matched parties.
export function fromLiveChallenge(id, d, now) {
  const claim = String(d.motion || '').trim();
  const accepted = [];
  if (d.posterUid) {
    accepted.push({ uid: d.posterUid, name: d.posterName || '', photo: '', side: 'a', at: d.createdAt || 0 });
  }
  if (d.accepterUid) {
    accepted.push({ uid: d.accepterUid, name: d.accepterName || '', photo: '', side: 'b', at: d.acceptedAt || 0 });
  }
  const status = d.accepterUid ? 'accepted' : 'open';
  return {
    claim,
    claimNorm: normalizeClaim(claim),
    claimId: '',
    slug: slugify(claim, id),
    topic: '',
    category: '',
    creator: { uid: d.posterUid || '', name: d.posterName || '', photo: '', handle: '' },
    challengedUid: '',
    sides: { a: 'For', b: 'Against' },
    description: '',
    evidence: [],
    status,
    format: String(d.format || 'quick'),
    mode: 'live',
    applicationMode: 'open',
    applicants: [],
    accepted,
    scheduledAt: 0,
    prediction: { status: 'closed', marketId: '', lockAt: 0 },
    crowd: { supportA: 0, supportB: 0, followers: 0 },
    sponsorId: '',
    prize: null,
    visibility: 'public',
    moderation: { state: 'clean', reportCount: 0 },
    arenaId: '',
    eventId: '',
    feedKey: feedKeyFor(status, 'public', 'clean'),
    createdAt: d.createdAt || now,
    updatedAt: now,
    migratedFrom: 'live_challenges/' + id,
  };
}
