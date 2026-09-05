import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
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
// An empty matchmaking queue must not overwrite broader site activity.
const activityCount = { textContent: '', parentNode: { setAttribute(){} } };
const activityLabel = { textContent: '' };
const activityContext = vm.createContext({
  presenceLive: null,
  presenceLoaded: false,
  DESK_QUEUE_POLL_MS: 10000,
  document: {
    hidden: false,
    documentElement: { contains: () => true },
    querySelector: (selector) => selector.endsWith('live-count') ? activityCount : activityLabel,
  },
  fetch: async () => ({ ok: true, json: async () => ({ waiting: 0 }) }),
  setTimeout: () => 1,
  clearTimeout(){},
});
for (const name of ['renderMatchProfileActivity', 'paintMatchProfileLive']) {
  const source = spar.match(new RegExp('  function ' + name + '\\([^)]*\\)\\{[\\s\\S]*?\\n  \\}'))?.[0];
  assert.ok(source, `${name} must exist`);
  vm.runInContext(source, activityContext);
}
activityContext.renderMatchProfileActivity();
assert.equal(activityCount.textContent, 'Checking activity', 'loading is not a measured zero');
activityContext.presenceLoaded = true;
for (const value of [null, {}, { online30: -1 }, { online30: '12' }, { online30: NaN }]) {
  activityContext.presenceLive = value;
  activityContext.renderMatchProfileActivity();
  assert.equal(activityCount.textContent, 'Activity unavailable', 'missing or invalid readings must not become a count');
  assert.equal(activityLabel.textContent, '');
}
activityContext.presenceLive = { online30: 0 };
activityContext.renderMatchProfileActivity();
assert.equal(activityCount.textContent, '0', 'a valid zero stays zero');
activityContext.presenceLive = { online30: 3, online5: 1, online24: 143 };
let queueOfferCount = null;
activityContext.paintMatchProfileLive((n) => { queueOfferCount = n; });
await new Promise(setImmediate);
assert.equal(activityCount.textContent, '3', 'queue polling must preserve the sitewide 30-minute count');
assert.equal(activityLabel.textContent, ' active · last 30m');
assert.equal(queueOfferCount, 0, 'the immediate-match offer must still receive the real queue count');

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
// 2026-09-04: the SKIP bar is a footer ROW of the flow, never a fixed
// overlay, so the track shrinks around it and no panel padding has to
// clear it. A fixed bar over a vertically centred panel is what covered
// the last option on every step at laptop and landscape-phone heights.
assert.match(spar, /\.match-profile-flow \.mp-skip-bar\{flex:none;position:relative/, 'skip bar must be a flow footer, not a fixed overlay');
assert.ok(!/\.mp-skip-bar\{[^}]*position:fixed/.test(spar), 'skip bar must not be position:fixed');
assert.match(spar, /root\.appendChild\(bar\)/, 'skip bar must be appended to the flow root so the track shrinks around it');
assert.match(spar, /\.match-profile-flow \.afl-panel\{[^}]*justify-content:flex-start/, 'panels must anchor to the top so a tall panel never clips its own heading');
// The belief-versus-fun answer stays on the device like `figure`.
assert.match(spar, /key: 'conviction'/, 'the conviction step must exist');
assert.ok(!/\bconviction\s*:/.test(spar.match(/ref\.set\(\{([\s\S]*?)joinedAt:/)?.[1] || ''), 'conviction must not ride matchmaking_queue');
assert.match(pair, /collection\('spar_match_profiles'\)/);
assert.match(pair, /draftConfig:\s*\{ suggestions: privateSuggestions \}/);
assert.match(rules, /match \/spar_match_profiles\/\{profileUid\}[\s\S]*allow read, write: if false;/);
assert.match(accountDeleteLib, /'spar_match_profiles'/, 'account deletion must remove the sensitive profile');
assert.match(accountDelete, /purgeIdentity/, 'account deletion must run the identity purge that removes the profile');
assert.match(accountDelete, /from '\.\/lib\/account-deletion\.mjs'/, 'account deletion must import the purge from its lib');
assert.match(dataExport, /privateMatchPreferences:\s*matchPreferences/, 'self-serve export must include the sensitive profile');
assert.match(privacy, /Private political matchmaking preferences/, 'privacy policy must disclose the sensitive profile');

console.log('spar match profile: sanitization, ranking, mutual topics, privacy boundary passed');
