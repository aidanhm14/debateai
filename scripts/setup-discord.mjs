#!/usr/bin/env node
// One-shot Discord server setup for the Debatable community.
// Usage: node scripts/setup-discord.mjs <GUILD_ID>
// Reads bot token from ~/.discord-bot-token
// Idempotent: re-running skips anything already created.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const API = 'https://discord.com/api/v10';
const TOKEN_PATH = path.join(os.homedir(), '.discord-bot-token');

if (!fs.existsSync(TOKEN_PATH)) {
  console.error(`Missing token file at ${TOKEN_PATH}`);
  console.error('Save it with: echo "BOT_TOKEN" > ~/.discord-bot-token && chmod 600 ~/.discord-bot-token');
  process.exit(1);
}
const token = fs.readFileSync(TOKEN_PATH, 'utf8').trim();

const guildId = process.argv[2];
if (!guildId || !/^\d+$/.test(guildId)) {
  console.error('Usage: node scripts/setup-discord.mjs <GUILD_ID>');
  process.exit(1);
}

const H = { Authorization: `Bot ${token}`, 'Content-Type': 'application/json' };

async function api(method, p, body) {
  const r = await fetch(`${API}${p}`, {
    method,
    headers: H,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (r.status === 429) {
    const j = await r.json().catch(() => ({ retry_after: 1 }));
    const wait = (j.retry_after || 1) * 1000;
    console.log(`  rate-limited, waiting ${Math.ceil(wait / 1000)}s`);
    await new Promise(res => setTimeout(res, wait));
    return api(method, p, body);
  }
  if (!r.ok) {
    const text = await r.text();
    throw new Error(`${method} ${p} → ${r.status} ${text}`);
  }
  return r.status === 204 ? null : r.json();
}

const log = (...a) => console.log(...a);

// ─── color helpers (Discord wants ints, not hex) ───
const c = hex => parseInt(hex.replace('#', ''), 16);

// ─── permission flag bits ───
const PERM = {
  VIEW_CHANNEL: 1n << 10n,
  SEND_MESSAGES: 1n << 11n,
  MANAGE_MESSAGES: 1n << 13n,
  ADD_REACTIONS: 1n << 6n,
  CONNECT: 1n << 20n,
  SPEAK: 1n << 21n,
  ADMINISTRATOR: 1n << 3n,
};
const bit = (...flags) => flags.reduce((acc, f) => acc | f, 0n).toString();

// ─── channel types ───
const TYPE = { TEXT: 0, VOICE: 2, CATEGORY: 4, ANNOUNCEMENT: 5, FORUM: 15 };

// ────────────────────────────────────────────────────────────────────
//  ROLES
// ────────────────────────────────────────────────────────────────────
const ROLE_SPECS = [
  // Staff
  { name: 'Mod', color: c('#ef4444'), hoist: true, mentionable: true, perms: bit(PERM.ADMINISTRATOR) },
  { name: 'Debatable Team', color: c('#f97316'), hoist: true, mentionable: true },
  // Paid tiers (no special perms today; placeholder for future Stripe-webhook auto-assign)
  { name: 'Lifetime', color: c('#fbbf24'), hoist: true, mentionable: false },
  { name: 'Team', color: c('#a78bfa'), hoist: true, mentionable: false },
  { name: 'Individual', color: c('#22c55e'), hoist: true, mentionable: false },
  { name: 'BYOK', color: c('#06b6d4'), hoist: true, mentionable: false },
  // Format roles (self-assignable via onboarding)
  { name: 'Asian Parli', color: c('#fb923c'), mentionable: true, category: 'format' },
  { name: 'WSDC', color: c('#fb923c'), mentionable: true, category: 'format' },
  { name: 'BP', color: c('#fb923c'), mentionable: true, category: 'format' },
  { name: 'APDA', color: c('#fb923c'), mentionable: true, category: 'format' },
  { name: 'Policy', color: c('#fb923c'), mentionable: true, category: 'format' },
  { name: 'LD', color: c('#fb923c'), mentionable: true, category: 'format' },
  { name: 'PF', color: c('#fb923c'), mentionable: true, category: 'format' },
  { name: 'Worlds', color: c('#fb923c'), mentionable: true, category: 'format' },
  { name: 'Congress', color: c('#fb923c'), mentionable: true, category: 'format' },
  { name: 'MUN', color: c('#fb923c'), mentionable: true, category: 'format' },
  { name: 'Quick Clash', color: c('#fb923c'), mentionable: true, category: 'format' },
  { name: 'Viva', color: c('#fb923c'), mentionable: true, category: 'format' },
  // Region roles
  { name: 'India', color: c('#0ea5e9'), mentionable: false, category: 'region' },
  { name: 'US', color: c('#0ea5e9'), mentionable: false, category: 'region' },
  { name: 'UK', color: c('#0ea5e9'), mentionable: false, category: 'region' },
  { name: 'Other', color: c('#0ea5e9'), mentionable: false, category: 'region' },
];

async function ensureRoles() {
  log('\n→ Roles');
  const existing = await api('GET', `/guilds/${guildId}/roles`);
  const byName = new Map(existing.map(r => [r.name, r]));
  const created = new Map();

  for (const spec of ROLE_SPECS) {
    if (byName.has(spec.name)) {
      log(`  · ${spec.name} (exists)`);
      created.set(spec.name, byName.get(spec.name));
      continue;
    }
    const role = await api('POST', `/guilds/${guildId}/roles`, {
      name: spec.name,
      color: spec.color || 0,
      hoist: !!spec.hoist,
      mentionable: !!spec.mentionable,
      permissions: spec.perms || '0',
    });
    log(`  + ${spec.name}`);
    created.set(spec.name, role);
  }
  return created;
}

// ────────────────────────────────────────────────────────────────────
//  CHANNELS
// ────────────────────────────────────────────────────────────────────
function channelSpecs(roles) {
  const everyoneId = guildId;
  const modId = roles.get('Mod').id;
  const teamId = roles.get('Debatable Team').id;
  const lifetimeId = roles.get('Lifetime').id;
  const teamTierId = roles.get('Team').id;
  const individualId = roles.get('Individual').id;
  const byokId = roles.get('BYOK').id;

  const lockedToMods = [
    { id: everyoneId, type: 0, allow: bit(PERM.VIEW_CHANNEL, PERM.ADD_REACTIONS), deny: bit(PERM.SEND_MESSAGES) },
    { id: modId, type: 0, allow: bit(PERM.VIEW_CHANNEL, PERM.SEND_MESSAGES, PERM.MANAGE_MESSAGES) },
    { id: teamId, type: 0, allow: bit(PERM.VIEW_CHANNEL, PERM.SEND_MESSAGES, PERM.MANAGE_MESSAGES) },
  ];

  const premiumOnly = [
    { id: everyoneId, type: 0, deny: bit(PERM.VIEW_CHANNEL) },
    { id: lifetimeId, type: 0, allow: bit(PERM.VIEW_CHANNEL, PERM.SEND_MESSAGES) },
    { id: teamTierId, type: 0, allow: bit(PERM.VIEW_CHANNEL, PERM.SEND_MESSAGES) },
    { id: individualId, type: 0, allow: bit(PERM.VIEW_CHANNEL, PERM.SEND_MESSAGES) },
    { id: byokId, type: 0, allow: bit(PERM.VIEW_CHANNEL, PERM.SEND_MESSAGES) },
    { id: modId, type: 0, allow: bit(PERM.VIEW_CHANNEL, PERM.SEND_MESSAGES) },
    { id: teamId, type: 0, allow: bit(PERM.VIEW_CHANNEL, PERM.SEND_MESSAGES) },
  ];

  return [
    {
      category: '📌 START HERE',
      channels: [
        { name: 'welcome', type: TYPE.TEXT, overwrites: lockedToMods, topic: 'Read me first.' },
        { name: 'rules', type: TYPE.TEXT, overwrites: lockedToMods, topic: 'The five rules. Break them and you leave.' },
        { name: 'announcements', type: TYPE.TEXT, overwrites: lockedToMods, topic: 'Product updates, tournaments, big news.', upgradeTo: TYPE.ANNOUNCEMENT },
        { name: 'updates', type: TYPE.TEXT, overwrites: lockedToMods, topic: 'Changelog. What shipped this week.' },
      ],
    },
    {
      category: '💬 GENERAL',
      channels: [
        { name: 'general', type: TYPE.TEXT, topic: 'Open chat. Keep it civil.' },
        { name: 'introductions', type: TYPE.TEXT, topic: 'Drop a line. Where do you debate, what format, what motion are you working on?' },
        { name: 'share-your-rounds', type: TYPE.TEXT, topic: 'Paste transcripts, screenshots, judge feedback. Tag the format.' },
        { name: 'off-topic', type: TYPE.TEXT, topic: 'Not debate. Still no slurs.' },
      ],
    },
    {
      category: '🏆 FORMATS',
      channels: [
        { name: 'asian-parli', type: TYPE.TEXT, topic: 'Asian Parliamentary. 3-on-3. PMs, LOs, DPMs, DLOs, GW, OW.' },
        { name: 'wsdc', type: TYPE.TEXT, topic: 'World Schools. Three speakers per side, eight-minute speeches, no fabricated cites.' },
        { name: 'bp', type: TYPE.TEXT, topic: 'British Parliamentary. Four teams. Extensions, whips, comparison.' },
        { name: 'apda', type: TYPE.TEXT, topic: 'American Parliamentary. Impromptu, no rolling motion.' },
        { name: 'policy', type: TYPE.TEXT, topic: 'Policy debate. Plans, disads, counterplans, kritiks.' },
        { name: 'ld', type: TYPE.TEXT, topic: 'Lincoln-Douglas. Value/criterion, framework, contention-level clash.' },
        { name: 'pf', type: TYPE.TEXT, topic: 'Public Forum. Two-on-two, citations expected.' },
        { name: 'worlds', type: TYPE.TEXT, topic: 'WUDC. Like BP but with POIs that actually land.' },
        { name: 'congress', type: TYPE.TEXT, topic: 'Congressional Debate. Bills, resolutions, floor speeches.' },
        { name: 'mun', type: TYPE.TEXT, topic: 'Model UN. Position papers, mods/unmods, working papers.' },
        { name: 'quick-clash', type: TYPE.TEXT, topic: 'Fast 1-on-1 motion drills. Two minutes, go.' },
        { name: 'viva', type: TYPE.TEXT, topic: 'Oral exam / thesis defense / interview prep. Counter extension lives here too.' },
      ],
    },
    {
      category: '🎙️ VOICE PRACTICE',
      channels: [
        { name: 'Practice Room 1', type: TYPE.VOICE },
        { name: 'Practice Room 2', type: TYPE.VOICE },
        { name: 'Practice Room 3', type: TYPE.VOICE },
        { name: 'Tournament Prep', type: TYPE.VOICE },
        { name: 'Just Chatting', type: TYPE.VOICE },
      ],
    },
    {
      category: '🛠️ FEEDBACK',
      channels: [
        { name: 'feedback', type: TYPE.TEXT, topic: 'What works, what doesn\'t. Specific > vague.' },
        { name: 'bug-reports', type: TYPE.TEXT, topic: 'Step-by-step repro. Browser + format + what you saw vs expected.' },
        { name: 'feature-requests', type: TYPE.TEXT, topic: 'What should Debatable do that it doesn\'t? Upvote with reactions.' },
      ],
    },
    {
      category: '📅 TOURNAMENTS',
      channels: [
        { name: 'tournament-announcements', type: TYPE.TEXT, overwrites: lockedToMods, topic: 'Upcoming tournaments, registrations, results.', upgradeTo: TYPE.ANNOUNCEMENT },
        { name: 'scrim-finder', type: TYPE.TEXT, topic: 'Looking for a practice round? Post format, time zone, level.' },
        { name: 'judges-corner', type: TYPE.TEXT, topic: 'For judges. Paradigms, RFD discussion, hot takes.' },
      ],
    },
    {
      category: '⭐ PREMIUM',
      channels: [
        { name: 'premium-lounge', type: TYPE.TEXT, overwrites: premiumOnly, topic: 'Individual / Lifetime / Team / BYOK only. Direct line to the team.' },
        { name: 'early-access', type: TYPE.TEXT, overwrites: premiumOnly, topic: 'Pre-release feature drops. Break them, tell us.' },
      ],
    },
  ];
}

async function ensureChannels(roles) {
  log('\n→ Channels');
  const existing = await api('GET', `/guilds/${guildId}/channels`);
  const byName = new Map(existing.map(ch => [ch.name.toLowerCase(), ch]));
  const created = new Map();
  const upgrades = []; // channels that need type-conversion after COMMUNITY is on

  for (const group of channelSpecs(roles)) {
    let category = existing.find(ch => ch.type === TYPE.CATEGORY && ch.name === group.category);
    if (!category) {
      category = await api('POST', `/guilds/${guildId}/channels`, {
        name: group.category,
        type: TYPE.CATEGORY,
      });
      log(`  + [category] ${group.category}`);
    } else {
      log(`  · [category] ${group.category} (exists)`);
    }
    created.set(group.category, category);

    for (const ch of group.channels) {
      const key = ch.name.toLowerCase();
      let made;
      if (byName.has(key)) {
        log(`    · ${ch.name} (exists)`);
        made = byName.get(key);
      } else {
        const body = {
          name: ch.name,
          type: ch.type,
          parent_id: category.id,
          topic: ch.topic,
          permission_overwrites: ch.overwrites,
        };
        made = await api('POST', `/guilds/${guildId}/channels`, body);
        log(`    + ${ch.name}`);
      }
      created.set(ch.name, made);
      if (ch.upgradeTo && made.type !== ch.upgradeTo) {
        upgrades.push({ channel: made, targetType: ch.upgradeTo, name: ch.name });
      }
    }
  }
  return { channels: created, upgrades };
}

async function applyChannelUpgrades(upgrades) {
  if (!upgrades.length) return;
  log('\n→ Converting channels to announcement type');
  for (const u of upgrades) {
    try {
      await api('PATCH', `/channels/${u.channel.id}`, { type: u.targetType });
      log(`  + ${u.name} → announcement`);
    } catch (err) {
      log(`  ! ${u.name} skipped (${err.message.split('\n')[0]})`);
    }
  }
}

// ────────────────────────────────────────────────────────────────────
//  WELCOME / RULES MESSAGES
// ────────────────────────────────────────────────────────────────────
const WELCOME_MESSAGE = `# Welcome to Debatable.

You're in. Quick orientation.

**What this server is.** A community of competitive debaters and people who argue out loud for a living. Format-accurate, voice-first, run by debaters.

**Where to go:**
- **#rules** — five rules. Read them.
- **#introductions** — drop a line about your format and circuit.
- **#asian-parli #bp #wsdc #apda #policy #ld #pf #worlds #congress #mun #viva** — format-specific rooms.
- **🎙️ Voice Practice** — hop in any practice room to spar live.
- **#scrim-finder** — looking for a round? Post format, time zone, level.
- **#feedback / #bug-reports / #feature-requests** — make the product better.

**The product:** https://debateai.com — voice round, judge RFD, six brains, every format we just listed.

Argue like you mean it.`;

const RULES_MESSAGE = `# Rules

**1. Argue the case, not the person.** Engage warrants. Don't insult the speaker.

**2. No slurs, no harassment, no doxxing.** No exceptions, no "but I was joking."

**3. No spam, no DM ads, no off-topic self-promotion.** Share your work in #share-your-rounds and #feature-requests, not by pinging strangers.

**4. Keep format channels on format.** Policy talk in #policy. APDA talk in #apda. Everything else in #general or #off-topic.

**5. Use the voice rooms for debate practice.** Music, hangouts, and side chats go in #just-chatting (voice) or #off-topic (text), not Practice Room 1.

Break a rule, you get warned. Break it again, you leave.

Mods: @Mod`;

async function postIfEmpty(channelId, content) {
  const msgs = await api('GET', `/channels/${channelId}/messages?limit=1`);
  if (msgs && msgs.length > 0) {
    log(`  · channel ${channelId} already has messages, skipping`);
    return;
  }
  await api('POST', `/channels/${channelId}/messages`, { content });
  log(`  + posted to ${channelId}`);
}

async function postWelcomeMessages(channels) {
  log('\n→ Welcome + rules messages');
  await postIfEmpty(channels.get('welcome').id, WELCOME_MESSAGE);
  await postIfEmpty(channels.get('rules').id, RULES_MESSAGE);
}

// ────────────────────────────────────────────────────────────────────
//  COMMUNITY FEATURES (Welcome Screen + Onboarding)
// ────────────────────────────────────────────────────────────────────
async function enableCommunity(channels) {
  log('\n→ Enabling Community Server');
  const guild = await api('GET', `/guilds/${guildId}`);
  const features = new Set(guild.features || []);
  if (features.has('COMMUNITY')) {
    log('  · already enabled');
    return guild;
  }
  features.add('COMMUNITY');
  const patch = {
    features: [...features],
    rules_channel_id: channels.get('rules').id,
    public_updates_channel_id: channels.get('updates').id,
    system_channel_id: channels.get('welcome').id,
    verification_level: 1, // LOW (verified email)
    explicit_content_filter: 2, // ALL_MEMBERS
    default_message_notifications: 1, // ONLY_MENTIONS
  };
  const updated = await api('PATCH', `/guilds/${guildId}`, patch);
  log('  + enabled');
  return updated;
}

async function setWelcomeScreen(channels) {
  log('\n→ Welcome screen');
  const body = {
    enabled: true,
    description: 'Voice-first debate sparring. Pick your format, jump in a practice room, argue like you mean it.',
    welcome_channels: [
      { channel_id: channels.get('rules').id, description: 'The five rules. Start here.', emoji_name: '📌' },
      { channel_id: channels.get('introductions').id, description: 'Drop a line, get spotted by scrim partners.', emoji_name: '👋' },
      { channel_id: channels.get('scrim-finder').id, description: 'Find a round. Any format, any time zone.', emoji_name: '⚔️' },
      { channel_id: channels.get('feedback').id, description: 'Make Debatable better. The team reads everything.', emoji_name: '🛠️' },
    ],
  };
  await api('PATCH', `/guilds/${guildId}/welcome-screen`, body);
  log('  + set');
}

async function setOnboarding(channels, roles) {
  log('\n→ Onboarding prompts');
  const defaultChannels = [
    channels.get('welcome').id,
    channels.get('rules').id,
    channels.get('announcements').id,
    channels.get('general').id,
    channels.get('introductions').id,
    channels.get('scrim-finder').id,
  ];

  const formatRoleNames = ['Asian Parli', 'WSDC', 'BP', 'APDA', 'Policy', 'LD', 'PF', 'Worlds', 'Congress', 'MUN', 'Quick Clash', 'Viva'];
  const regionRoleNames = ['India', 'US', 'UK', 'Other'];

  const formatChannelMap = {
    'Asian Parli': 'asian-parli', WSDC: 'wsdc', BP: 'bp', APDA: 'apda',
    Policy: 'policy', LD: 'ld', PF: 'pf', Worlds: 'worlds',
    Congress: 'congress', MUN: 'mun', 'Quick Clash': 'quick-clash', Viva: 'viva',
  };

  let optionCounter = 100;
  const nextId = () => String(optionCounter++);

  const formatPrompt = {
    id: nextId(),
    type: 0, // MULTIPLE_CHOICE
    title: 'Which formats do you debate?',
    single_select: false,
    required: false,
    in_onboarding: true,
    options: formatRoleNames.map(name => ({
      id: nextId(),
      title: name,
      role_ids: [roles.get(name).id],
      channel_ids: [channels.get(formatChannelMap[name]).id],
      description: '',
    })),
  };

  const regionPrompt = {
    id: nextId(),
    type: 0,
    title: 'Where do you debate from?',
    single_select: true,
    required: false,
    in_onboarding: true,
    options: regionRoleNames.map(name => ({
      id: nextId(),
      title: name,
      role_ids: [roles.get(name).id],
      channel_ids: [],
      description: '',
    })),
  };

  const body = {
    prompts: [formatPrompt, regionPrompt],
    default_channel_ids: defaultChannels,
    enabled: true,
    mode: 0, // ONBOARDING_DEFAULT
  };

  await api('PUT', `/guilds/${guildId}/onboarding`, body);
  log('  + set');
}

// ────────────────────────────────────────────────────────────────────
//  MAIN
// ────────────────────────────────────────────────────────────────────
(async () => {
  try {
    log(`Setting up guild ${guildId}`);
    const me = await api('GET', '/users/@me');
    log(`Authenticated as bot: ${me.username}#${me.discriminator || '0'}`);

    const guild = await api('GET', `/guilds/${guildId}`);
    log(`Guild: ${guild.name}`);

    const roles = await ensureRoles();
    const { channels, upgrades } = await ensureChannels(roles);
    await postWelcomeMessages(channels);
    await enableCommunity(channels);
    await applyChannelUpgrades(upgrades);
    await setWelcomeScreen(channels);
    await setOnboarding(channels, roles);

    log('\n✓ Done. Open Discord and verify.');
    log('  - Server should now show "Community" features (Welcome Screen, Onboarding)');
    log('  - Members joining via the invite link will go through the onboarding flow');
    log('  - You can re-run this script anytime; it skips existing items.');
  } catch (err) {
    console.error('\n✗ Failed:', err.message);
    process.exit(1);
  }
})();
