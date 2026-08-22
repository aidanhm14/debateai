// Discord slash commands. The site goes to the debaters instead of asking
// the debaters to come to the site.
//
// WHY A BOT AND NOT A LINK. Circuit Discords are where debaters already
// sit: motion threads, partner-hunting, tab announcements. Posting links
// into someone else's server is advertising and gets you muted. Answering
// a question inside it with a real motion, instantly, is a utility the
// server admin chooses to install. That is the difference between reaching
// people on a platform and being resented on one.
//
// ARCHITECTURE: HTTP interactions, not a gateway bot. A gateway bot needs a
// process holding a websocket open forever, which Netlify cannot do and
// which would need a host we do not otherwise pay for. Discord's
// interactions endpoint is a plain webhook, so the whole bot is this one
// stateless function. The cost of that choice is the 3 SECOND response
// deadline, which is why every command below answers from local data and
// none of them call a model. A command that needs an LLM has to defer
// (type 5) and follow up, and none here do, on purpose.
//
// SECURITY: Discord signs every request with Ed25519 and REQUIRES that an
// invalid signature gets a 401. They send deliberately bad signatures
// during endpoint verification and will refuse to save the URL if those
// come back 200. Verification uses node:crypto directly, so this ships no
// npm dependency (tweetnacl is the usual answer and is not worth a
// dependency for one verify call).
//
// SETUP, which is the founder's to do once:
//   1. discord.com/developers → New Application
//   2. copy the Public Key into Netlify env as DISCORD_PUBLIC_KEY
//   3. set Interactions Endpoint URL to
//      https://itsdebatable.com/api/discord/interactions
//   4. run `node scripts/register-discord-commands.mjs` with
//      DISCORD_APP_ID and DISCORD_BOT_TOKEN set
//   5. OAuth2 URL Generator → scopes `applications.commands` → install

import crypto from 'node:crypto';
import { motionsByFormat, listLibraryMotions, FORMAT_LABELS } from './lib/motion-library.mjs';
import { dailyMotionFor } from './lib/daily-motion-bank.mjs';

const SITE = process.env.SITE_ORIGIN || 'https://itsdebatable.com';
const PUBLIC_KEY = process.env.DISCORD_PUBLIC_KEY || '';

// Discord interaction + response type numbers, named so the branches read.
const T_PING = 1;
const T_COMMAND = 2;
const R_PONG = 1;
const R_MESSAGE = 4;
const EPHEMERAL = 64; // only the invoker sees it

// Ed25519 public keys arrive as 32 raw hex bytes. node:crypto wants SPKI
// DER, and the prefix for Ed25519 is fixed, so wrapping is a concat.
const SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');

export function verifyDiscordSignature(rawBody, signatureHex, timestamp, publicKeyHex) {
  if (!rawBody || !signatureHex || !timestamp || !publicKeyHex) return false;
  try {
    const key = crypto.createPublicKey({
      key: Buffer.concat([SPKI_PREFIX, Buffer.from(publicKeyHex, 'hex')]),
      format: 'der',
      type: 'spki',
    });
    return crypto.verify(
      null,
      Buffer.from(timestamp + rawBody),
      key,
      Buffer.from(signatureHex, 'hex'),
    );
  } catch (e) {
    // A malformed key or signature is a failed verification, never a 500.
    // Discord probes this endpoint with junk on purpose.
    return false;
  }
}

function message(content, opts) {
  return {
    type: R_MESSAGE,
    data: {
      content,
      flags: (opts && opts.ephemeral) ? EPHEMERAL : 0,
      // Suppress link previews. A bot that unfurls a card on every reply
      // is the thing servers mute.
      allowed_mentions: { parse: [] },
    },
  };
}

function optionValue(interaction, name) {
  const opts = (interaction && interaction.data && interaction.data.options) || [];
  const hit = opts.find((o) => o && o.name === name);
  return hit ? String(hit.value || '') : '';
}

// Deterministic-ish pick without Math.random, so the same invocation in the
// same minute is stable and a test can assert on it. Seeded off the
// interaction id, which Discord makes unique per call, so consecutive
// /motion calls still differ.
function pick(arr, seed) {
  if (!arr.length) return null;
  let h = 0;
  const s = String(seed || '');
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return arr[h % arr.length];
}

function debateLink(motion) {
  return `${SITE}/practice?motion=${encodeURIComponent(motion)}`;
}

// ── Commands ──────────────────────────────────────────────────────────
// Every one answers from local data inside the 3s budget. No model calls.

function cmdMotion(interaction) {
  const fmt = optionValue(interaction, 'format').toLowerCase();
  const pool = fmt ? motionsByFormat(fmt) : listLibraryMotions();
  const list = pool && pool.length ? pool : listLibraryMotions();
  const m = pick(list, interaction.id);
  if (!m) return message('No motion found for that format. Try /motion with no format.');

  const lines = [`**${m.motion}**`];
  const meta = [m.formats || m.format, m.difficulty].filter(Boolean).join(' · ');
  if (meta) lines.push(`_${meta}_`);
  if (m.summary) lines.push('', m.summary);
  if (m.clash) lines.push('', `**The clash:** ${m.clash}`);
  lines.push('', `Debate it: ${debateLink(m.motion)}`);
  return message(lines.join('\n'));
}

function cmdDaily(interaction) {
  // Timestamp comes from Discord on the interaction, so the bot does not
  // need a clock of its own and the answer is stable across retries.
  const ts = Number(interaction.id) ? new Date(Number(BigInt(interaction.id) >> 22n) + 1420070400000) : new Date();
  const m = dailyMotionFor(ts);
  if (!m) return message('No motion for today. Try /motion instead.');
  const lines = [`**Today's motion**`, '', `**${m.motion}**`];
  if (m.frame) lines.push('', m.frame);
  lines.push('', `Debate it: ${debateLink(m.motion)}`);
  return message(lines.join('\n'));
}

function cmdBlocks(interaction) {
  const motion = optionValue(interaction, 'motion');
  const lines = [
    'Paste the case you are about to hit and get the answers back ranked: frontlines and turns per contention, the cross-ex that sets them up, and what the case never proves.',
    '',
    // Ephemeral + a link rather than an inline result: a disclosed case is
    // thousands of characters, which blows both the 3s budget and
    // Discord's 2000 character message cap. The paste box is the right
    // surface; this command's job is to point at it, once.
    motion ? `${SITE}/blocks?motion=${encodeURIComponent(motion.slice(0, 200))}` : `${SITE}/blocks`,
  ];
  return message(lines.join('\n'), { ephemeral: true });
}

function cmdRound(interaction) {
  return message([
    'Get matched with a real person, argue it out, and get a written verdict.',
    '',
    `${SITE}/spar`,
  ].join('\n'), { ephemeral: true });
}

const COMMANDS = {
  motion: cmdMotion,
  daily: cmdDaily,
  blocks: cmdBlocks,
  round: cmdRound,
};

export default async (request) => {
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }
  if (!PUBLIC_KEY) {
    // Fail closed and say so in the log. An unconfigured signing key means
    // anyone who finds this URL can make the bot talk.
    console.warn('[discord] DISCORD_PUBLIC_KEY is not set; refusing every request');
    return new Response('Not configured', { status: 503 });
  }

  // Raw text, not request.json(): the signature covers the exact bytes, and
  // re-serialising parsed JSON will not reproduce them.
  const raw = await request.text();
  const sig = request.headers.get('x-signature-ed25519') || '';
  const ts = request.headers.get('x-signature-timestamp') || '';

  if (!verifyDiscordSignature(raw, sig, ts, PUBLIC_KEY)) {
    // 401 is REQUIRED. Discord sends bad signatures on purpose while
    // verifying the endpoint and will reject the URL if they get a 200.
    return new Response('invalid request signature', { status: 401 });
  }

  let interaction;
  try { interaction = JSON.parse(raw); } catch (e) {
    return new Response('bad json', { status: 400 });
  }

  if (interaction.type === T_PING) {
    return Response.json({ type: R_PONG });
  }

  if (interaction.type === T_COMMAND) {
    const name = String((interaction.data && interaction.data.name) || '').toLowerCase();
    const handler = COMMANDS[name];
    if (!handler) {
      return Response.json(message('Unknown command.', { ephemeral: true }));
    }
    try {
      return Response.json(handler(interaction));
    } catch (err) {
      console.error('[discord] handler error', name, err?.message);
      return Response.json(message('That failed. Try again in a moment.', { ephemeral: true }));
    }
  }

  // Any other interaction type (components, autocomplete, modals) is not
  // wired yet. Acknowledging with a PONG-shaped reply would be wrong, so
  // answer 204 and let Discord show its own timeout.
  return new Response(null, { status: 204 });
};

export const _internal = { COMMANDS, pick, optionValue, FORMAT_LABELS };

export const config = {
  path: '/api/discord/interactions',
};
