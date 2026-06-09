#!/usr/bin/env node
// Replaces #welcome content with the founder letter and pins it.
// Usage: node scripts/post-founder-letter.mjs <GUILD_ID>

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const API = 'https://discord.com/api/v10';
const token = fs.readFileSync(path.join(os.homedir(), '.discord-bot-token'), 'utf8').trim();
const guildId = process.argv[2];
if (!guildId) { console.error('Usage: node scripts/post-founder-letter.mjs <GUILD_ID>'); process.exit(1); }

const H = { Authorization: `Bot ${token}`, 'Content-Type': 'application/json' };

async function api(method, p, body) {
  const r = await fetch(`${API}${p}`, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
  if (r.status === 429) {
    const j = await r.json().catch(() => ({ retry_after: 1 }));
    await new Promise(res => setTimeout(res, (j.retry_after || 1) * 1000));
    return api(method, p, body);
  }
  if (!r.ok) throw new Error(`${method} ${p} → ${r.status} ${await r.text()}`);
  return r.status === 204 ? null : r.json();
}

(async () => {
  const channels = await api('GET', `/guilds/${guildId}/channels`);
  const byName = new Map(channels.map(c => [c.name, c]));
  const ref = name => `<#${byName.get(name).id}>`;
  const welcome = byName.get('welcome');
  if (!welcome) throw new Error('#welcome channel not found');

  const part1 = `# Welcome. I'm Aidan.

I founded DebateIt. Sophomore at UChicago, philosophy + business econ, national APDA champion. I built this product because I needed a sparring partner that actually knew the flow, pushed back like a real opponent, and graded me like a judge would. I built it for myself first, then realized other debaters wanted the same thing.

This Discord is where that community lives now.

## What DebateIt does

Voice-first sparring partner. Pick a format (Asian Parli, WSDC, BP, APDA, Policy, LD, PF, Worlds, Congress, MUN, Viva, Quick Clash) and a motion. Speak. The AI takes POIs, pushes back, writes a real judge ballot at the end with speaker points and weighing. Six brains under the hood: Claude, GPT, Gemini, Grok, DeepSeek, Open Lab. Each picks up different things in the round.

Try it: https://debateai.com`;

  const part2 = `## What I want this server to be

- **Honest peer practice.** Find a partner in ${ref('scrim-finder')}, run a round, trade feedback.
- **A direct line to me.** If something is broken or stupid, tell me in ${ref('feedback')} or ${ref('bug-reports')}. I read everything.
- **Format channels stay on format.** Policy talk in ${ref('policy')}. APDA talk in ${ref('apda')}. Asian Parli in ${ref('asian-parli')}.
- **A place to share rounds.** Wins, losses, lessons. Drop transcripts and screenshots in ${ref('share-your-rounds')}.

## Where this is going

About 7,000 people use DebateIt every month. About 80% are in India, mostly Asian Parli, WSDC, BP. We're investing hard in the India circuit. Beyond debate, the same engine drills oral exams, thesis defense, and interview prep, that's what the Viva format and the Counter Chrome extension are for.

Long-term goal: every debater in the world has a 24/7 sparring partner that doesn't agree with them. Every viva candidate has someone to grill them the night before. Every professional who argues out loud gets a coach who knows their format.

## Find us elsewhere

- Site: https://debateai.com
- X / Twitter: https://twitter.com/debateit
- Instagram: https://www.instagram.com/debateit
- TikTok: https://www.tiktok.com/@debateit
- YouTube: https://www.youtube.com/@debateit
- LinkedIn: https://www.linkedin.com/company/debateit
- My personal X: https://x.com/8idanhm

Argue like you mean it.

— Aidan`;

  // Delete any existing bot messages in #welcome so we don't stack duplicates.
  const existing = await api('GET', `/channels/${welcome.id}/messages?limit=50`);
  const me = await api('GET', '/users/@me');
  const mine = existing.filter(m => m.author.id === me.id);
  for (const m of mine) {
    await api('DELETE', `/channels/${welcome.id}/messages/${m.id}`);
    console.log(`  - deleted old message ${m.id}`);
  }

  const m1 = await api('POST', `/channels/${welcome.id}/messages`, { content: part1 });
  console.log(`  + posted part 1: ${m1.id} (${part1.length} chars)`);
  await api('PUT', `/channels/${welcome.id}/pins/${m1.id}`);
  console.log(`  + pinned part 1`);

  const m2 = await api('POST', `/channels/${welcome.id}/messages`, { content: part2 });
  console.log(`  + posted part 2: ${m2.id} (${part2.length} chars)`);
  await api('PUT', `/channels/${welcome.id}/pins/${m2.id}`);
  console.log(`  + pinned part 2`);

  console.log(`\n✓ Done.`);
})().catch(err => { console.error('✗', err.message); process.exit(1); });
