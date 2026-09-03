import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  cleanSparMatchProfile,
  politicalMatchScore,
  rankPoliticalCandidates,
  mutualPoliticalMotionPool,
  POLITICAL_MOTIONS,
} from '../app/netlify/functions/lib/spar-match-profile.mjs';
import { createDraft } from '../app/netlify/functions/lib/motion-draft.mjs';

const left = cleanSparMatchProfile({
  mode: 'viewpoint',
  stances: { economy: 'redistribute', immigration: 'easier', speech: 'skip', democracy: 'reform' },
});
const right = cleanSparMatchProfile({
  matchMode: 'viewpoint',
  stances: { economy: 'markets', immigration: 'selective', speech: 'hands_off', democracy: 'stability' },
});
const echo = cleanSparMatchProfile({
  matchMode: 'viewpoint',
  stances: { economy: 'redistribute', immigration: 'easier', speech: 'skip', democracy: 'reform' },
});

assert.equal(left.version, 4);
assert.equal(left.matchMode, 'viewpoint');
assert.deepEqual(
  cleanSparMatchProfile({ matchMode: 'forged', stances: { economy: 'communist', speech: '<script>' } }).stances,
  { economy: 'skip', immigration: 'skip', speech: 'skip', democracy: 'skip' },
  'unknown values must be dropped, never stored as political free text',
);

assert.ok(
  politicalMatchScore(left, right).score > politicalMatchScore(left, echo).score,
  'shared-interest disagreement should outrank an echo match',
);
assert.equal(
  rankPoliticalCandidates(left, [
    { uid: 'echo', profile: echo },
    { uid: 'clash', profile: right },
  ])[0].uid,
  'clash',
  'private candidate ranking should select the stronger disagreement',
);

const pool = mutualPoliticalMotionPool(left, right);
assert.ok(pool.length >= 8, 'a mutually interesting pair should receive a usable motion pool');
assert.ok(pool.every((motion) =>
  POLITICAL_MOTIONS.economy.includes(motion)
  || POLITICAL_MOTIONS.immigration.includes(motion)
  || POLITICAL_MOTIONS.democracy.includes(motion)),
  'only mutually selected issues may enter the personalized pool',
);
assert.deepEqual(
  mutualPoliticalMotionPool(left, { matchMode: 'viewpoint', stances: { speech: 'moderate' } }),
  [],
  'no shared issue must fall back to the broad default pool',
);

const draft = createDraft('private-suggestions', 'quick', 'a', 'b', { suggestions: pool });
assert.equal(draft.poolLocked, false, 'personalized suggestions must still allow a hand-written counter');
assert.ok(draft.pool.every((card) => pool.includes(card.text)), 'draft cards must come from the mutual pool');

const spar = fs.readFileSync(new URL('../app/spar.html', import.meta.url), 'utf8');
const pair = fs.readFileSync(new URL('../app/netlify/functions/spar-pair.mjs', import.meta.url), 'utf8');
const rules = fs.readFileSync(new URL('../app/firestore.rules', import.meta.url), 'utf8');
const accountDelete = fs.readFileSync(new URL('../app/netlify/functions/delete-account-data.mjs', import.meta.url), 'utf8');
// 2026-09-03: the purge list moved into lib/account-deletion.mjs when the
// deletion was rebuilt server-side; the function reaches it through
// purgeIdentity. Read both, and assert the function still calls the lib.
const accountDeleteLib = fs.readFileSync(new URL('../app/netlify/functions/lib/account-deletion.mjs', import.meta.url), 'utf8');
const dataExport = fs.readFileSync(new URL('../app/netlify/functions/my-data-export.mjs', import.meta.url), 'utf8');
const privacy = fs.readFileSync(new URL('../app/privacy.html', import.meta.url), 'utf8');
for (const sensitive of ['economy', 'immigration', 'speech', 'democracy']) {
  const queueWrite = spar.match(/ref\.set\(\{([\s\S]*?)joinedAt:/)?.[1] || '';
  assert.ok(!new RegExp('\\b' + sensitive + '\\s*:').test(queueWrite), `${sensitive} must not ride matchmaking_queue`);
}
assert.match(spar, /matchProfileReady:\s*state\.privateProfileReady === true/);
assert.match(spar, /onSkip:\s*function\(\)\{[\s\S]*?matchProfile = defaultMatchProfile\(\);/, 'flow skip must erase partial political answers');
assert.match(spar, /id="skipMatchProfileBtn"[\s\S]*?matchProfile = defaultMatchProfile\(\);/, 'gate skip must erase an older political profile');
assert.match(spar, /@media\(max-width:620px\)[\s\S]*?\.match-profile-flow \.afl-panel\{padding:22px 15px calc\(132px/, 'mobile flow must clear the fixed skip bar');
assert.match(pair, /collection\('spar_match_profiles'\)/);
assert.match(pair, /draftConfig:\s*\{ suggestions: privateSuggestions \}/);
assert.match(rules, /match \/spar_match_profiles\/\{profileUid\}[\s\S]*allow read, write: if false;/);
assert.match(accountDeleteLib, /'spar_match_profiles'/, 'account deletion must remove the sensitive profile');
assert.match(accountDelete, /purgeIdentity/, 'account deletion must run the identity purge that removes the profile');
assert.match(accountDelete, /from '\.\/lib\/account-deletion\.mjs'/, 'account deletion must import the purge from its lib');
assert.match(dataExport, /privateMatchPreferences:\s*matchPreferences/, 'self-serve export must include the sensitive profile');
assert.match(privacy, /Private political matchmaking preferences/, 'privacy policy must disclose the sensitive profile');

console.log('spar match profile: sanitization, ranking, mutual topics, privacy boundary passed');
