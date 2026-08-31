// /api/live-chats → GET. Public, keyless: the most recently active
// community chats, for the landing first screen's "Live chats" panel
// (the column between the example round board and the leaderboard
// rail, founder sketch 2026-08-29). Answers one question for a cold
// visitor: is anyone actually talking here right now?
//
// Sources, all public by design:
//   - community_chat        The Commons, the open room /community mounts
//                           (server-mediated writes via /api/chat-feed).
//   - community_channels    The named signed-in rooms (#general etc.);
//                           rules allow public read so lurkers can see
//                           a live room before signing in.
//   - Discord (2026-08-31, the founder: "connect the live discord chat
//     to the chat that shows on the site ... i just want it to feel
//     busy"). Recent messages from the community server's public chat
//     channels, read with the existing Discord app's bot token and
//     mixed in by real timestamp. Dormant until DISCORD_BOT_TOKEN and
//     DISCORD_CHAT_CHANNELS exist; the payload's `discord` field says
//     which state it is in so a dead integration is visible from one
//     curl rather than presenting as a quiet room. NOTE the bot must
//     be a guild MEMBER with View Channel + Read Message History; the
//     slash-command install used only `applications.commands`, which
//     does not add one.
//
// Honesty: nothing HERE is seeded or padded. Messages are returned
// with their real timestamps; never add invented rows to this payload.
// The landing panel does layer a client-side ambient conversation
// between the confirmed-fictional personas on top of these rows
// (founder's call, 2026-08-29, recorded in soul.md); that layer lives
// entirely in landing.html and must never move server-side, because a
// fake row in this payload would be indistinguishable from a real one
// to every consumer.
//
// Privacy: handles and channel display names only. uid and photo are
// NEVER returned — this endpoint is keyless, and chat-feed.mjs already
// establishes that an ungated uid would publish a handle-to-account
// map to anyone who curls it. Discord rows carry the author's public
// display name from a public channel of our own server, never their
// discriminator, id, or avatar. Text is truncated server-side so the
// landing never carries a full transcript of any room, and Discord
// rows drop link-bearing messages outright: this surface must never
// relay a stranger's URL onto the landing page.
//
// Cost: ~19 doc reads per cache miss (12 Commons tail + 7 channel
// limit(1) probes), shared-cached 45s, so the landing's traffic costs
// ~24 reads a minute worst case. Same posture as spar-queue.mjs /
// watch-live.mjs. Do NOT wire the landing to Firestore or to
// /api/chat-feed directly: chat-feed has no shared cache and reads 80
// docs per call (the 2026-08-18 rule — the landing opens no Firestore
// connection of its own).
import { getDb, withDeadline } from './lib/firestore.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';
import { getCachedShared, setCachedShared, setCached } from './lib/admin-cache.mjs';

const CACHE_KEY = 'live-chats-v1';
const CACHE_TTL_MS = 45 * 1000;

// Discord mix-in. Channel ids are snowflakes; anything else is dropped
// at parse so a typo cannot aim the bot token at an arbitrary URL path.
const DISCORD_TOKEN = process.env.DISCORD_BOT_TOKEN || '';
const DISCORD_CHANNELS = String(process.env.DISCORD_CHAT_CHANNELS || '')
  .split(',').map((v) => v.trim()).filter((v) => /^\d{10,25}$/.test(v));
const DISCORD_PER_CHANNEL = 12;

// The Commons rides community_chat; the named rooms mirror the
// CHANNELS list in js/community-channels.js. A channel probed but not
// offered on /community would report life in a room nobody can open,
// so keep this list matched to that file.
const CHANNELS = ['tournament', 'general', 'find-a-round', 'motions', 'round-reviews', 'clips', 'help'];

const MAX_MESSAGES = 10;
const TEXT_MAX = 110;
const HANDLE_MAX = 32;

function tsMillis(ts) {
  if (!ts) return 0;
  if (typeof ts.toMillis === 'function') return ts.toMillis();
  if (typeof ts.seconds === 'number') return ts.seconds * 1000;
  return 0;
}

function clean(s, max) {
  return String(s || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

// Recent human messages from the configured Discord channels, shaped
// like every other row. Fails to an empty list on ANY error: the site
// rooms must never wait on, or die with, a third-party API.
async function discordRows() {
  if (!DISCORD_TOKEN || !DISCORD_CHANNELS.length) return { state: 'off', rows: [] };
  const rows = [];
  let state = 'on';
  await Promise.all(DISCORD_CHANNELS.map(async (ch) => {
    try {
      const r = await fetch(
        `https://discord.com/api/v10/channels/${ch}/messages?limit=${DISCORD_PER_CHANNEL}`,
        { headers: { Authorization: `Bot ${DISCORD_TOKEN}` } },
      );
      if (!r.ok) {
        // 403 = not a guild member or no channel access; 401 = bad
        // token. Coarse on purpose: this is a public payload.
        state = r.status === 401 || r.status === 403 ? 'unauthorized' : `error`;
        return;
      }
      const msgs = await r.json();
      if (!Array.isArray(msgs)) return;
      for (const m of msgs) {
        if (!m || (m.author && m.author.bot)) continue;
        let text = String(m.content || '')
          .replace(/<a?:\w+:\d+>/g, '')       // custom emoji tokens
          .replace(/<@[!&]?\d+>/g, '')         // user and role mentions
          .replace(/<#\d+>/g, '')              // channel mentions
          .replace(/(\*\*|__|~~|`{1,3})/g, ''); // markdown pairs
        text = clean(text, TEXT_MAX);
        if (!text || /https?:\/\//i.test(text)) continue;
        const at = Date.parse(m.timestamp || '');
        if (!at) continue;
        rows.push({
          room: 'discord',
          label: 'Discord',
          handle: clean((m.author && (m.author.global_name || m.author.username)) || '', HANDLE_MAX) || 'someone',
          text,
          at,
        });
      }
    } catch { state = 'error'; }
  }));
  // A silent configured integration is worth telling apart from a
  // silent room: empty-but-on usually means the MESSAGE CONTENT intent
  // is off in the dev portal, so content comes back blank.
  if (state === 'on' && !rows.length) state = 'on-empty';
  return { state, rows };
}

export default async (request) => {
  if (request.method === 'OPTIONS') return corsResponse(request);
  if (request.method !== 'GET') return errorResponse('Method not allowed', 405, request);

  const cached = await getCachedShared(CACHE_KEY);
  if (cached) return jsonResponse(cached, 200, request);

  let db;
  try { db = getDb(); }
  catch (err) { return jsonResponse({ messages: [], at: Date.now(), error: 'getDb' }, 200, request); }

  try {
    const commonsQ = db.collection('community_chat')
      .orderBy('createdAt', 'desc').limit(12).get();
    const channelQs = CHANNELS.map((ch) =>
      db.collection('community_channels').doc(ch).collection('messages')
        .orderBy('createdAt', 'desc').limit(1).get());

    const discordQ = discordRows();
    const [commonsSnap, ...channelSnaps] = await withDeadline(
      Promise.all([commonsQ, ...channelQs]), 4000);
    const discord = await withDeadline(discordQ, 4000)
      .catch(() => ({ state: 'error', rows: [] }));

    const rows = [];
    commonsSnap.forEach((doc) => {
      const d = doc.data() || {};
      if (d.kind === 'join') return;  // history-only rows, never rendered
      const text = clean(d.text, TEXT_MAX);
      if (!text) return;
      rows.push({
        room: 'commons',
        label: 'The Commons',
        handle: clean(d.handle, HANDLE_MAX) || 'someone',
        text,
        at: tsMillis(d.createdAt),
      });
    });

    channelSnaps.forEach((snap, i) => {
      snap.forEach((doc) => {
        const d = doc.data() || {};
        const text = clean(d.text, TEXT_MAX);
        if (!text) return;
        rows.push({
          room: CHANNELS[i],
          label: '#' + CHANNELS[i],
          handle: clean(d.name, HANDLE_MAX) || 'member',
          text,
          at: tsMillis(d.createdAt),
        });
      });
    });

    rows.push(...discord.rows);
    rows.sort((a, b) => b.at - a.at);
    const out = { messages: rows.slice(0, MAX_MESSAGES), discord: discord.state, at: Date.now() };
    await setCachedShared(CACHE_KEY, out, CACHE_TTL_MS);
    return jsonResponse(out, 200, request);
  } catch (err) {
    console.warn('[live-chats] query failed', err && err.message);
    const out = { messages: [], at: Date.now(), error: String(err && err.message).slice(0, 200) };
    // Negative-cache 30s so a broken read is not re-paid per visitor.
    setCached(CACHE_KEY, out, 30_000);
    return jsonResponse(out, 200, request);
  }
};

export const config = { path: '/api/live-chats' };
