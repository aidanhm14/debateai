#!/usr/bin/env node
// Registers the slash commands with Discord. Run by hand, not in CI.
//
// Discord stores the command LIST on their side, separately from the
// endpoint that answers them, so shipping a new command in
// discord-interactions.mjs does nothing until this runs. That split is the
// easy thing to forget: the handler exists, the command never appears.
//
//   DISCORD_APP_ID=... DISCORD_BOT_TOKEN=... node scripts/register-discord-commands.mjs
//
// Add --guild <id> to register against ONE server. Guild commands appear
// instantly; global commands can take up to an hour to propagate, so use a
// guild while iterating and go global once the shape is settled.
//
// This is a PUT, so the array below is the complete desired state:
// removing an entry here removes the command from Discord on the next run.

const APP_ID = process.env.DISCORD_APP_ID;
const TOKEN = process.env.DISCORD_BOT_TOKEN;

const args = process.argv.slice(2);
const guildIndex = args.indexOf('--guild');
const GUILD = guildIndex >= 0 ? args[guildIndex + 1] : null;
const DRY = args.includes('--dry-run');

// Mirrors the COMMANDS map in app/netlify/functions/discord-interactions.mjs.
// Keep the names identical; the handler looks up by name.
const COMMANDS = [
  {
    name: 'motion',
    description: 'Get a real debate motion, with the clash and a link to argue it',
    options: [{
      name: 'format',
      description: 'Which format to pull from',
      type: 3, // STRING
      required: false,
      choices: [
        { name: 'Parliamentary / APDA', value: 'apda' },
        { name: 'British Parliamentary', value: 'bp' },
        { name: 'Asian Parliamentary', value: 'asian' },
        { name: 'World Schools', value: 'worlds' },
        { name: 'Lincoln-Douglas', value: 'ld' },
        { name: 'Public Forum', value: 'pf' },
        { name: 'Policy', value: 'policy' },
      ],
    }],
  },
  {
    name: 'daily',
    description: "Today's motion",
  },
  {
    name: 'blocks',
    description: 'Build blocks against a case you are about to hit',
    options: [{
      name: 'motion',
      description: 'The motion, if you know it',
      type: 3,
      required: false,
    }],
  },
  {
    name: 'round',
    description: 'Get matched with a real person for a judged round',
  },
];

async function main() {
  if (!APP_ID || !TOKEN) {
    console.error('Set DISCORD_APP_ID and DISCORD_BOT_TOKEN in the environment.');
    console.error('Both are on the app page at discord.com/developers/applications.');
    process.exit(1);
  }

  const url = GUILD
    ? `https://discord.com/api/v10/applications/${APP_ID}/guilds/${GUILD}/commands`
    : `https://discord.com/api/v10/applications/${APP_ID}/commands`;

  console.log(`${DRY ? '[dry run] would PUT' : 'PUT'} ${COMMANDS.length} commands to ${GUILD ? 'guild ' + GUILD : 'GLOBAL'}`);
  for (const c of COMMANDS) console.log(`  /${c.name} - ${c.description}`);
  if (DRY) return;

  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `Bot ${TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(COMMANDS),
  });

  const text = await res.text();
  if (!res.ok) {
    console.error(`Discord rejected the registration (${res.status}):`);
    console.error(text.slice(0, 900));
    process.exit(1);
  }

  let parsed = [];
  try { parsed = JSON.parse(text); } catch (e) { /* ignore, we only count */ }
  console.log(`Registered ${Array.isArray(parsed) ? parsed.length : COMMANDS.length} commands.`);
  if (!GUILD) console.log('Global commands can take up to an hour to appear. Use --guild <id> while iterating.');
}

main().catch((err) => {
  console.error('Registration failed:', err?.message);
  process.exit(1);
});
