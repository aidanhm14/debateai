// ─────────────────────────────────────────────────────────────
// Record seed — turn an imported competitive record into a Glicko
// starting point.
//
// WHY A SEED AND NOT A RATING
// A Tabroom record is real evidence, but it is evidence about a
// different judge pool, a different meta, and (for teams) a partnership
// rather than a person. So the seed moves the MEAN off 1500 and leaves
// the DEVIATION wide: the floor here (SEED_MIN_RD) sits far above
// PROVISIONAL_RD in rating.mjs, which means a seeded-only account never
// publicly ranks. The number shows on their profile the moment they
// claim it; the leaderboard slot still costs MIN_RATED_GAMES real
// rounds. That is the whole integrity story in two constants.
//
// Pure module: no I/O, no Firestore, no clock reads (callers pass now).
// Imported by record-import.mjs and scripts/test-record-seed.mjs.
// ─────────────────────────────────────────────────────────────
import { DEFAULT_RATING, DEFAULT_VOL } from './rating.mjs';

export const SEED_MIN_RATING = 1200;
export const SEED_MAX_RATING = 1900;
export const SEED_MIN_RD = 240;   // never below: imported evidence caps our confidence
export const SEED_MAX_RD = 330;
export const STALE_MONTHS = 24;   // records older than this decay toward 1500

// Winrate is Laplace-smoothed toward 0.5 so a 3-0 weekend does not
// read as a 100% career. 600 points of spread means a true 75%
// debater with a real sample seeds around 1620-1700, which matches
// where a strong circuit competitor lands on this ladder after a
// month of rounds.
const SPREAD = 600;
const ELIM_BONUS_PER_WIN = 14;
const ELIM_BONUS_CAP = 80;

function monthsBetween(yyyymm, nowMs) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(yyyymm || ''));
  if (!m) return Infinity;
  const then = new Date(Number(m[1]), Number(m[2]) - 1, 15).getTime();
  return (nowMs - then) / (30.44 * 24 * 3600 * 1000);
}

// ── Revising a seed ──────────────────────────────────────────────
// A seed can be revised by ADDING records, never by dropping them. The
// rating is always recomputed over the union of every row the account
// has ever claimed, deduped by row id, so nobody can unselect the
// tournament that dragged their number down and re-seed on the good
// half. Adding evidence moves the number in whichever direction the
// evidence points, which is the property that makes revision safe at
// all; without it, "revise" is just "re-roll until you like it".
//
// Pure: the caller supplies both sides and decides what to persist.
export function mergeClaimedRows(prevRows, nextRows) {
  const byId = new Map();
  for (const r of prevRows || []) {
    const id = String((r && r.i) || '');
    if (id) byId.set(id, r);
  }
  const kept = byId.size;
  for (const r of nextRows || []) {
    const id = String((r && r.i) || '');
    if (!id || byId.has(id)) continue;
    byId.set(id, r);
  }
  const rows = [...byId.values()];
  return { rows, added: rows.length - kept, kept };
}

// Seeds written before revisions existed stored `rows` and `rowIds` as
// two parallel arrays. Zip them back together so an old claim can take
// part in a merge; rows that carry their own id are passed through.
export function normalizeClaimedRows(rows, rowIds) {
  const ids = Array.isArray(rowIds) ? rowIds : [];
  return (rows || []).map((r, k) => (
    r && r.i ? r : { ...r, i: String(ids[k] || '') }
  )).filter((r) => r.i);
}

// rows: [{ i, pw, pl, ew, el, d: 'YYYY-MM', t, f }]
export function aggregateRows(rows) {
  const agg = { pw: 0, pl: 0, ew: 0, el: 0, tournaments: 0, newest: '' };
  for (const r of rows || []) {
    const pw = Number(r.pw) || 0, pl = Number(r.pl) || 0;
    const ew = Number(r.ew) || 0, el = Number(r.el) || 0;
    if (pw + pl + ew + el === 0) continue;
    agg.pw += pw; agg.pl += pl; agg.ew += ew; agg.el += el;
    agg.tournaments += 1;
    if (String(r.d || '') > agg.newest) agg.newest = String(r.d || '');
  }
  agg.games = agg.pw + agg.pl + agg.ew + agg.el;
  agg.wins = agg.pw + agg.ew;
  agg.losses = agg.pl + agg.el;
  return agg;
}

export function seedFromRecord(rows, nowMs) {
  const agg = aggregateRows(rows);
  if (!agg.games) return null;

  const wr = (agg.wins + 3) / (agg.games + 6);
  let rating = DEFAULT_RATING + SPREAD * (wr - 0.5)
    + Math.min(ELIM_BONUS_CAP, ELIM_BONUS_PER_WIN * agg.ew);

  // Deviation narrows with sample size but never below the seed floor.
  let rd = SEED_MAX_RD - 3.5 * agg.games;

  const age = monthsBetween(agg.newest, nowMs);
  if (age > STALE_MONTHS) {
    rating = DEFAULT_RATING + (rating - DEFAULT_RATING) * 0.8;
    rd += 40;
  }

  // Provenance decides which band the seed may land in, and it is
  // applied LAST so it caps everything above it rather than being
  // traded against the win rate. See PROVENANCE_TERMS: a record we
  // cannot re-read ourselves seeds lower at the top end and always
  // keeps a wider deviation than one we can.
  const provenance = provenanceOf(rows);
  const terms = PROVENANCE_TERMS[provenance] || PROVENANCE_TERMS.tabroom;
  const confidence = meanConfidence(rows);
  rd += (1 - confidence) * LOW_CONFIDENCE_RD;

  rating = Math.round(Math.min(terms.maxRating, Math.max(SEED_MIN_RATING, rating)));
  rd = Math.round(Math.min(SEED_MAX_RD, Math.max(terms.minRd, rd)));
  return {
    rating, rd, vol: DEFAULT_VOL,
    evidence: { ...agg, provenance, confidence: Math.round(confidence * 100) / 100 },
  };
}

// The no-Tabroom path. Deliberately coarser and deliberately more
// conservative: nothing self-reported seeds above 1650 or below 1400,
// and the deviation stays at the wide end.
export const SELF_REPORT_LEVELS = {
  new:      { rating: 1450, rd: 330, label: 'New to competitive debate' },
  local:    { rating: 1500, rd: 320, label: 'Local or school circuit' },
  regional: { rating: 1550, rd: 310, label: 'Regional competitor, some elim rounds' },
  circuit:  { rating: 1600, rd: 300, label: 'National circuit, regular breaks' },
  national: { rating: 1650, rd: 300, label: 'Late elims at national tournaments' },
};

export function seedFromSelfReport(level) {
  const row = SELF_REPORT_LEVELS[String(level || '')];
  if (!row) return null;
  return { rating: row.rating, rd: row.rd, vol: DEFAULT_VOL, evidence: { level } };
}

// ─────────────────────────────────────────────────────────────────
// PROVENANCE — how checkable is the evidence behind a row?
//
// Rows now arrive from two very different places and they cannot seed
// on the same terms:
//
//   'tabroom'  A row the SERVER re-read from its own copy of a public
//              index. The client only named it. Forging one means
//              forging a published tournament result.
//   'upload'   A row a model read out of something the user handed us:
//              a screenshot of a Tabbycat break page, a Calico tab, an
//              MIT-TAB export, a PDF of results, a pasted table. Real
//              evidence for almost everyone, trivially forgeable by
//              anyone who wants to, and WE CANNOT TELL THE TWO APART.
//
// So the discount below is not a punishment, it is an accuracy
// statement: we are less certain, so the deviation is wider and the
// ceiling is lower. The wider deviation also means the first real
// rounds on this platform move an uploaded seed FASTER than a verified
// one, which is the behaviour you want — our own evidence should
// overwrite a claim quickly.
//
// A MIXED union takes the WEAKEST provenance present. A claim is only
// as checkable as its least checkable part, and the alternative
// (averaging, or per-row weighting) would let one verified weekend
// launder ten uploaded ones. One rule, statable in a sentence on the
// page, is worth more here than a cleverer one that nobody can audit.
//
// Rows written before provenance existed carry no `p` and are all
// Tabroom rows by construction, which is why 'tabroom' is the default.
export const PROVENANCE_TERMS = {
  tabroom: { maxRating: SEED_MAX_RATING, minRd: SEED_MIN_RD },
  upload: { maxRating: 1750, minRd: 290 },
};

// How much a shaky read widens the deviation. An extraction the model
// was unsure about is still worth using — the alternative is refusing
// a real record because a screenshot was blurry — but it should not
// buy the same confidence as a clean one.
const LOW_CONFIDENCE_RD = 40;

export function provenanceOf(rows) {
  return (rows || []).some((r) => r && r.p === 'upload') ? 'upload' : 'tabroom';
}

// Mean extraction confidence over the rows that carry one. Rows with no
// `c` are Tabroom rows, which are not an extraction at all, so they are
// not evidence of confidence in either direction.
export function meanConfidence(rows) {
  const cs = (rows || [])
    .map((r) => Number(r && r.c))
    .filter((c) => Number.isFinite(c) && c >= 0 && c <= 1);
  if (!cs.length) return 1;
  return cs.reduce((a, b) => a + b, 0) / cs.length;
}

// ── An edit may correct a read DOWN, never UP ────────────────────────
//
// The user has to be able to fix the model: OCR misreads a 3 as an 8,
// and a record they cannot correct is a record they will not trust.
// But a freely editable row would make the extraction decorative —
// anyone could post 50-0 and skip the evidence entirely.
//
// The resolution is the same shape as the additive-revision rule above:
// a correction that LOWERS your seed needs no evidence, and one that
// RAISES it needs new evidence. So wins may only fall, losses may only
// rise, and the date is taken from the attestation rather than the
// client (moving a 2019 season to 2026 would dodge the staleness decay,
// which is a raise wearing a typo's clothes).
//
// Pure: caller supplies both sides. Returns the reconciled rows plus a
// count of fields that were actually clamped, so the endpoint can tell
// an honest correction from an attempted inflation and the page can say
// which numbers it kept.
export function clampToAttested(editedRows, attestedRows) {
  const edits = new Map();
  for (const r of editedRows || []) {
    const id = String((r && r.i) || '');
    if (id) edits.set(id, r);
  }

  let clamped = 0;
  let corrected = 0;
  const rows = (attestedRows || []).map((base) => {
    const e = edits.get(String(base.i || ''));
    if (!e) return { ...base };

    const down = (key) => {
      const want = Number(e[key]);
      const had = Number(base[key]) || 0;
      if (!Number.isFinite(want) || want < 0) return had;
      if (want > had) { clamped++; return had; }
      if (want < had) corrected++;
      return Math.floor(want);
    };
    const up = (key) => {
      const want = Number(e[key]);
      const had = Number(base[key]) || 0;
      if (!Number.isFinite(want) || want < 0) return had;
      if (want < had) { clamped++; return had; }
      if (want > had) corrected++;
      return Math.floor(want);
    };

    // Wins fall freely, losses rise freely. Everything that decides the
    // number is pinned to the attestation in the flattering direction.
    return {
      ...base,
      pw: down('pw'), ew: down('ew'),
      pl: up('pl'), el: up('el'),
    };
  });

  return { rows, clamped, corrected };
}

// ── Normalizing what a model read into a row this module can seed ────
//
// Everything here is defensive on purpose: this is the one path where
// row fields originate in generated text rather than in our own index.
// Unknown keys are dropped rather than defaulted, counts are integers
// inside a sane bound, and a row that decides nothing is refused
// upstream by aggregateRows.
const MAX_ROUNDS_PER_ROW = 40;

const clampCount = (v) => {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(MAX_ROUNDS_PER_ROW, n);
};

// 'YYYY-MM' or nothing. A date we cannot read is better than a date we
// invent: monthsBetween() returns Infinity for an unparseable value,
// which routes an undated record through the staleness decay. That is
// the conservative direction, and it is why this does not fall back to
// today.
export function normalizeMonth(s) {
  const m = /(\d{4})[-/ ]?(\d{1,2})?/.exec(String(s || ''));
  if (!m) return '';
  const y = Number(m[1]);
  if (y < 1980 || y > 2100) return '';
  const mo = Math.min(12, Math.max(1, Number(m[2]) || 6));
  return `${y}-${String(mo).padStart(2, '0')}`;
}

export function normalizeExtractedRow(raw, id) {
  if (!raw || typeof raw !== 'object') return null;
  const conf = Number(raw.c);
  return {
    i: String(id || ''),
    n: String(raw.n || '').slice(0, 80),
    t: String(raw.t || '').slice(0, 120),
    d: normalizeMonth(raw.d),
    f: String(raw.f || '').slice(0, 40),
    pw: clampCount(raw.pw), pl: clampCount(raw.pl),
    ew: clampCount(raw.ew), el: clampCount(raw.el),
    c: Number.isFinite(conf) ? Math.min(1, Math.max(0, conf)) : 0.5,
    p: 'upload',
  };
}

// ── The name check, moved out of the endpoint so it can be tested ────
//
// One person's rows share a name token; a grab-bag of strangers' wins
// does not. Rows whose name the model could not read carry no token and
// therefore impose NO constraint: a personal results spreadsheet with
// no name on it is a real thing, and refusing it would be refusing the
// honest case to catch nobody. The check still does its actual job,
// which is stopping a stranger's NAMED row being bolted onto a claim.
export function commonNameToken(rows) {
  const named = (rows || [])
    .map((r) => new Set((String((r && r.n) || '').toLowerCase().match(/[a-z]+/g) || []).filter((t) => t.length >= 2)))
    .filter((set) => set.size);
  if (!named.length) return true;               // nothing named, nothing to contradict
  const common = named.reduce((acc, set) => new Set([...acc].filter((t) => set.has(t))));
  return common.size > 0;
}
