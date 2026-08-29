// Tournament motion pools and room admission shapes. PURE. No I/O.
//
// The public pool is event data with competitive consequences, so it lives
// in one server-side source rather than being copied between the announcement
// page and the pairing functions. The Debatable Open predates document-backed
// pools, so its published slate is the versioned fallback below. Future events
// can carry the same fields directly on their tournament document.

const OPEN_SLUG = 'the-debatable-open';
const MOTION_MAX = 280;
const POOL_MAX = 40;

export const THE_DEBATABLE_OPEN_MOTIONS = Object.freeze([
  'This House would end funding for US military action against Iran unless President Trump obtains explicit authorization from Congress.',
  'This House would condition US military aid to Israel on a halt to the expansion of Israeli settlements in the West Bank.',
  'This House would abolish the legislative filibuster in the US Senate.',
  'This House would tax the electricity used by large AI data centers and return the revenue to nearby households through lower utility bills.',
  'This House would require President Trump to obtain congressional approval before imposing or raising tariffs.',
  'This House would lift US sanctions on Iran in exchange for independently verified limits on its nuclear and ballistic missile programs.',
  'This House believes Arab states should offer Israel full diplomatic recognition only in exchange for a sovereign Palestinian state.',
  'This House would charge companies a displacement tax when they replace workers with AI, using the revenue to fund wage insurance.',
  'This House would prohibit presidents from deploying the National Guard inside a state without its governor\'s request or congressional approval.',
  'This House would prohibit local police departments from assisting federal civil immigration enforcement.',
  'This House would offer citizenship to undocumented immigrants who have lived in the United States for at least ten years and committed no serious crime.',
  'This House would impose 18-year term limits on US Supreme Court justices.',
  'This House would prohibit employers from letting AI make the final decision to hire or fire a worker.',
  'This House would deny tax incentives to new AI data centers unless their owners pay for the grid and water upgrades they require.',
  'This House would ban AI-generated impersonations of candidates in political advertising.',
  'This House would ban prediction markets from taking bets on elections and armed conflicts.',
  'This House would prohibit the same company from operating both a frontier AI model and the cloud platform on which it runs.',
  'This House would ban private equity firms from buying single-family homes.',
  'This House believes NATO\'s European members should take primary responsibility for Europe\'s conventional defense by 2030.',
  'This House believes the United States should formally commit to defend Taiwan if China uses force against it.',
]);

export function cleanMotionPool(raw) {
  const out = [];
  const seen = new Set();
  for (const value of Array.isArray(raw) ? raw : []) {
    const text = String(value || '')
      .replace(/[\u0000-\u001f\u007f]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, MOTION_MAX);
    const key = text.toLowerCase();
    if (text.length < 18 || seen.has(key)) continue;
    seen.add(key);
    out.push(text);
    if (out.length >= POOL_MAX) break;
  }
  return out;
}

function sourcePool(tournament) {
  const t = tournament || {};
  const stored = cleanMotionPool(t.motionPool);
  if (stored.length >= 3) return stored;
  return String(t.slug || '') === OPEN_SLUG ? THE_DEBATABLE_OPEN_MOTIONS.slice() : [];
}

export function tournamentDraftConfig(tournament) {
  const t = tournament || {};
  const pool = sourcePool(t);
  if (pool.length < 3) return null;

  const defaultSlate = String(t.slug || '') === OPEN_SLUG ? 3 : 5;
  const slateSize = Math.max(3, Math.min(pool.length, 7,
    Math.round(Number(t.motionSlateSize) || defaultSlate)));
  const maxStrikes = Math.max(1, Math.floor((slateSize - 1) / 2));
  const defaultStrikes = String(t.slug || '') === OPEN_SLUG ? 1 : 2;
  const strikesPerSide = Math.max(1, Math.min(maxStrikes,
    Math.round(Number(t.motionStrikesPerSide) || defaultStrikes)));

  return { pool, slateSize, strikesPerSide, blind: true };
}

export function publicTournamentMotionDraft(tournament) {
  const config = tournamentDraftConfig(tournament);
  if (!config) return null;
  return {
    motions: config.pool.slice(),
    slateSize: config.slateSize,
    strikesPerSide: config.strikesPerSide,
    blind: true,
  };
}

// Registration is a pre-event act. Once the director starts the day, the
// public page remains a spectator surface but the roster is fixed.
export function tournamentRegistrationOpen(tournament) {
  const t = tournament || {};
  return String(t.status || '') === 'registration' && t.registrationClosed !== true;
}

function membersOf(entry) {
  return (Array.isArray(entry && entry.members) ? entry.members : [])
    .filter(Boolean)
    .map(String);
}

function firstName(entry, fallback) {
  const names = Array.isArray(entry && entry.memberNames) ? entry.memberNames.filter(Boolean) : [];
  return String(names[0] || entry?.name || fallback).slice(0, 60);
}

export function tournamentRoomSetup(tid, tournament, pairing, entriesById, seed) {
  const p = pairing || {};
  const entries = entriesById instanceof Map ? entriesById : new Map();
  const gov = entries.get(String(p.govEntry || '')) || null;
  const opp = entries.get(String(p.oppEntry || '')) || null;
  const govMembers = membersOf(gov);
  const oppMembers = membersOf(opp);
  const uids = Array.from(new Set(govMembers.concat(oppMembers)));
  if (!p.room || !govMembers.length || !oppMembers.length
      || uids.length !== govMembers.length + oppMembers.length) return null;

  const draftConfig = tournamentDraftConfig(tournament);
  const oneOnOne = govMembers.length === 1 && oppMembers.length === 1;
  const names = oneOnOne ? {
    [govMembers[0]]: firstName(gov, p.govName || 'Gov'),
    [oppMembers[0]]: firstName(opp, p.oppName || 'Opp'),
  } : {};

  return {
    admission: {
      kind: 'tournament',
      tournamentId: String(tid || ''),
      room: String(p.room),
      entryIds: [String(p.govEntry || ''), String(p.oppEntry || '')],
      uids,
      spectatorAccess: 'public',
      // Tournament participation includes recording. Missing stays true
      // for events created before the field existed, so an older draw
      // cannot silently fall back to the optional casual-room policy.
      recordingRequired: true,
      // Existing prize-tournament rules already cover elimination-round
      // broadcast at entry. Preliminary capture is mandatory too, but it
      // stays out of public replay and the main stream by default.
      broadcastAllowed: /^e\d+(?:-|$)/.test(String(p.pairingId || '')),
    },
    draft: draftConfig && oneOnOne ? {
      eligible: true,
      source: 'tournament',
      tournamentId: String(tid || ''),
      uids,
      names,
      format: String(tournament?.format || ''),
      seed: String(seed || p.room),
      draftConfig,
    } : null,
  };
}
