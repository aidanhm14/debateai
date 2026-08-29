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
  'This House would ban elected national lawmakers from trading individual stocks while in office.',
  'This House would require every eligible citizen to cast a ballot in national elections.',
  'This House would lower the voting age in national elections to 16.',
  'This House would require judges to be elected by the public rather than appointed by government officials.',
  'This House would release people accused of nonviolent crimes under supervision instead of requiring cash bail.',
  'This House would make public universities tuition-free for all students.',
  'This House would ban students from using smartphones during the school day in primary and secondary schools.',
  'This House would ban universities from favoring applicants because their relatives attended.',
  'This House would require every young adult to complete one year of national or community service after secondary school.',
  'This House would give employees the right to work remotely when their job can be done from home.',
  'This House would ban employment contracts that stop workers from joining a competing company.',
  'This House would require a four-day workweek with no reduction in pay.',
  'This House would charge drivers to enter busy city centers during peak hours.',
  'This House would ban private ownership of passenger jets.',
  'This House would ban online platforms from showing targeted ads to anyone under 18.',
  'This House would require social media platforms to use chronological feeds by default.',
  'This House would require publicly shared AI-generated images, video, and audio to carry a clear label.',
  'This House would ban law enforcement agencies from using facial recognition in public spaces.',
  'This House would ban children under 16 from having social media accounts.',
  'This House believes news organizations should not endorse candidates for public office.',
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
