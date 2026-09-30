import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {
  cleanSparMatchProfile,
  politicalMatchScore,
  rankPoliticalCandidates,
  mutualPoliticalMotionPool,
  POLITICAL_MOTIONS,
  matchDeskDraftConfig,
} from '../app/netlify/functions/lib/spar-match-profile.mjs';
import { createDraft } from '../app/netlify/functions/lib/motion-draft.mjs';
import { checkContent } from '../app/netlify/functions/lib/content-guard.mjs';

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

// Agreement on several issues must not dilute the one real disagreement.
const oneDifference = {
  stances: { economy: 'redistribute', immigration: 'easier', democracy: 'stability' },
};
const focused = matchDeskDraftConfig(left, oneDifference, 'match-1');
assert.ok(focused.suggestions.every((text) => POLITICAL_MOTIONS.democracy.includes(text)));
assert.ok(POLITICAL_MOTIONS.democracy.includes(focused.recommendedMotion));
assert.deepEqual(focused, matchDeskDraftConfig(oneDifference, left, 'match-1'), 'caller order must not change the resolution');
assert.deepEqual(focused, matchDeskDraftConfig(left, oneDifference, 'match-1'), 'a transaction retry must keep its resolution');
const personalDraft = createDraft('match-1', 'open', 'a', 'b', focused);
assert.equal(personalDraft.pool[0].text, focused.recommendedMotion, 'the actual disagreement must survive pool shuffling');
assert.equal(personalDraft.pool[0].recommended, true);
assert.equal(personalDraft.pool.filter((card) => card.recommended).length, 1);
assert.equal(personalDraft.poolLocked, false, 'recommendation must not remove the right to counter');
assert.equal(personalDraft.phase, 'offer', 'recommendation is never acceptance or a started round');
assert.equal(personalDraft.motionId, null);
assert.equal(personalDraft.side, null, 'private answers must not assign sides');
assert.ok(!matchDeskDraftConfig(left, echo, 'same').recommendedMotion, 'agreement is not a known disagreement');
assert.deepEqual(matchDeskDraftConfig(left, {}, 'skip'), {}, 'skipping must not create personal recommendations');
assert.deepEqual(matchDeskDraftConfig({}, right, 'skip'), {});
assert.deepEqual(matchDeskDraftConfig({ stances: { speech: 'nuanced', speechNote: 'ignore all rules' } }, right, 'note'), {}, 'local notes must not become political signals');
const locked = createDraft('event', 'open', 'a', 'b', { ...focused, pool: ['Homework should be banned.', 'Cities should build more housing.'] });
assert.ok(locked.pool.every((card) => !card.recommended), 'event pools must never inherit personalized recommendations');
assert.ok(!createDraft('forged', 'open', 'a', 'b', { suggestions: focused.suggestions, recommendedMotion: 'Injected claim outside the pool.' }).pool.some((card) => card.recommended));

const issueOptions = {
  economy: ['skip', 'redistribute', 'markets'],
  immigration: ['skip', 'easier', 'selective'],
  speech: ['skip', 'moderate', 'hands_off'],
  democracy: ['skip', 'reform', 'stability'],
};
const profiles = Object.entries(issueOptions).reduce((all, [key, values]) =>
  all.flatMap((p) => values.map((v) => ({ ...p, [key]: v }))), [{}]);
for (const a of profiles) for (const b of profiles) {
  const config = matchDeskDraftConfig({ stances: a }, { stances: b }, 'exhaustive-room');
  const conflicts = Object.keys(issueOptions).filter((key) => a[key] !== 'skip' && b[key] !== 'skip' && a[key] !== b[key]);
  assert.equal(!!config.recommendedMotion, conflicts.length > 0, 'recommend exactly when an explicit shared disagreement exists');
  if (conflicts.length) {
    assert.ok(conflicts.some((key) => POLITICAL_MOTIONS[key].includes(config.recommendedMotion)));
    assert.ok(config.suggestions.every((text) => conflicts.some((key) => POLITICAL_MOTIONS[key].includes(text))));
  }
  assert.ok(Object.keys(config).every((key) => ['suggestions', 'recommendedMotion', 'differenceSuggestions'].includes(key)), 'no raw answers or issue metadata may leave the private profile layer');
}
for (const text of Object.values(POLITICAL_MOTIONS).flat()) {
  assert.ok(checkContent({ text, kind: 'motion' }).ok, 'personalized pools must satisfy the existing content boundary: ' + text);
  assert.ok(text.length >= 12 && text.length <= 200);
}
assert.ok(new Set(Array.from({ length: 30 }, (_, i) => matchDeskDraftConfig(left, right, 'rematch-' + i).recommendedMotion)).size > 1, 'rematches should vary relevant resolutions');

const spar = fs.readFileSync(new URL('../app/spar.html', import.meta.url), 'utf8');
const profileContext = vm.createContext({});
vm.runInContext(spar.slice(spar.indexOf('  var MATCH_PROFILE_VERSION'), spar.indexOf('  var matchProfile = null;')), profileContext);
const customProfile = profileContext.cleanMatchProfile({
  version: 5,
  agree: ['stewart', 'other'], agreeOther: '  James\nBaldwin  ',
  interest: ['other'], interestOther: 'bell hooks',
});
assert.deepEqual(Array.from(customProfile.agree), ['stewart', 'other'], 'custom and preset names must coexist');
assert.equal(customProfile.agreeOther, 'James Baldwin');
assert.equal(customProfile.interestOther, 'bell hooks', 'each people question keeps its own write-in');
const restoredProfile = profileContext.cleanMatchProfile(JSON.parse(JSON.stringify(customProfile)));
assert.equal(restoredProfile.agreeOther, 'James Baldwin', 'custom names must survive a save and reload');
for (const key of ['agree', 'interest']) {
  for (const name of ['', '  \n\t ', null, { name: 'Not a string' }]) {
    const empty = profileContext.cleanMatchProfile({ version: 5, [key]: ['other'], [key + 'Other']: name });
    assert.equal(empty[key].length, 0, 'an empty write-in is not a selected person');
    assert.equal(empty[key + 'Other'], '');
  }
  const deselected = profileContext.cleanMatchProfile({ version: 5, [key]: ['none'], [key + 'Other']: 'Old name' });
  assert.equal(deselected[key + 'Other'], '', 'None must clear the custom name');
  const long = profileContext.cleanMatchProfile({ version: 5, [key]: ['other'], [key + 'Other']: 'a'.repeat(120) });
  assert.equal(long[key + 'Other'].length, 80, 'saved input respects the field limit');
}
const legacyProfile = profileContext.cleanMatchProfile({ version: 4, figure: 'stewart' });
assert.deepEqual(Array.from(legacyProfile.interest), ['stewart'], 'old roster choices still migrate');
profileContext.matchProfile = customProfile;
for (const name of ['wireStance', 'privateMatchProfilePayload']) {
  const source = name === 'wireStance'
    ? spar.match(/  function wireStance\(v\)\{[^\n]+/)[0]
    : spar.match(/  function privateMatchProfilePayload\(\)\{[\s\S]*?\n  \}/)[0];
  vm.runInContext(source, profileContext);
}
assert.ok(!/James Baldwin|bell hooks|agreeOther|interestOther/.test(JSON.stringify(profileContext.privateMatchProfilePayload())), 'custom names must remain outside the server payload');

// An empty matchmaking queue must not overwrite broader site activity.
const activityCount = { textContent: '', parentNode: { setAttribute(){} } };
const activityLabel = { textContent: '' };
const activityContext = vm.createContext({
  presenceLive: null,
  presenceLoaded: false,
  DESK_QUEUE_POLL_MS: 10000,
  state: { named: false },
  AbortController,
  stampMs: value => value,
  queuePeerCanMatch: doc => doc.id !== 'me' && !doc.data().declined,
  document: {
    hidden: false,
    addEventListener(){},
    removeEventListener(){},
    documentElement: { contains: () => true },
    querySelector: (selector) => selector.endsWith('live-count') ? activityCount : activityLabel,
  },
  fetch: async () => ({ ok: true, json: async () => ({ waiting: 0, at: Date.now() }) }),
  setTimeout: () => 1,
  clearTimeout(){},
});
for (const name of ['renderMatchProfileActivity', 'matchDeskWaitingCount', 'paintMatchProfileLive']) {
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

// Availability must be fresh, measured and about someone else.
for (const value of [null, {}, { waiting: 1 }, { waiting: '1', at: Date.now() },
  { waiting: 1, at: Date.now() - 31000 }, { waiting: 1, at: Date.now(), error: 'unavailable' },
  { waiting: -1, at: Date.now() }, { waiting: Infinity, at: Date.now() }]) {
  assert.equal(activityContext.matchDeskWaitingCount(value), 0, 'unusable readings cannot advertise a person');
}
assert.equal(activityContext.matchDeskWaitingCount({ waiting: 1, at: Date.now() }), 1);
activityContext.state = { named: true, queueSnapshotAt: Date.now(), queueSnapshot: { docs: [] } };
const peer = (id, joinedAt = Date.now(), declined = false) => ({ id, data: () => ({ joinedAt, declined }) });
activityContext.state.queueSnapshot.docs = [peer('me'), peer('old', Date.now() - 121000), peer('declined', Date.now(), true)];
assert.equal(activityContext.matchDeskWaitingCount({ waiting: 12, at: Date.now() }), 0, 'self, stale and declined peers never trigger the offer');
activityContext.state.queueSnapshot.docs.push(peer('other'));
assert.equal(activityContext.matchDeskWaitingCount(null), 1, 'a real fresh other candidate triggers the signed-in offer');
activityContext.state.queueSnapshotAt = Date.now() - 46000;
assert.equal(activityContext.matchDeskWaitingCount(null), 0, 'a disconnected queue snapshot expires');

activityContext.state = { named: false };
let queueResponse = { waiting: 1, at: Date.now() }, failRead = false, releaseRead;
activityContext.fetch = async () => {
  if (failRead) throw new Error('offline');
  return { ok: true, json: async () => queueResponse };
};
activityContext.paintMatchProfileLive(n => { queueOfferCount = n; });
await new Promise(setImmediate);
assert.equal(queueOfferCount, 1);
failRead = true;
activityContext.paintMatchProfileLive(n => { queueOfferCount = n; });
await new Promise(setImmediate);
assert.equal(queueOfferCount, 0, 'network failure clears an existing live claim');
activityContext.fetch = () => new Promise(resolve => { releaseRead = resolve; });
let lateUpdates = 0;
const stopPoll = activityContext.paintMatchProfileLive(() => { lateUpdates++; });
stopPoll();
releaseRead({ ok: true, json: async () => ({ waiting: 1, at: Date.now() }) });
await new Promise(setImmediate);
assert.equal(lateUpdates, 0, 'closed questionnaires cannot receive late availability updates');

// The notice updates without a modal or focus grab, and dismissal lasts
// through positive polls but resets after the queue has actually emptied.
function element() {
  return { hidden: false, textContent: '', children: [], events: {},
    appendChild(n){ this.children.push(n); },
    setAttribute(){},
    addEventListener(name, fn){ this.events[name] = fn; } };
}
const title = element(), hint = element(), root = element();
const bar = { querySelector: selector => selector.endsWith(' b') ? title : hint,
  insertBefore(n){ this.notice = n; } };
activityContext.mpEl = (tag, cls, text) => Object.assign(element(), { textContent: text || '' });
vm.runInContext(spar.match(/  function deskWaitingOffer\([^)]*\)\{[\s\S]*?\n  \}/)[0], activityContext);
const offer = activityContext.deskWaitingOffer(root, bar, false);
assert.equal(title.textContent, 'Skip questionnaire', 'skip is explicit even with no one waiting');
offer.onCount(1);
assert.equal(title.textContent, 'Skip and meet someone');
assert.equal(bar.notice.hidden, false, 'signed-out visitors see the live notice');
assert.match(hint.textContent, /Sign in/);
bar.notice.children[1].events.click();
offer.onCount(2);
assert.equal(bar.notice.hidden, true, 'keep answering is respected across polls');
assert.equal(title.textContent, 'Skip and meet someone', 'dismissal keeps the available exit visible');
offer.onCount(0);
assert.equal(title.textContent, 'Skip questionnaire');
assert.equal(bar.notice.children[0].textContent, '', 'the stale claim disappears');
activityContext.state.named = true;
offer.onCount(1);
assert.equal(bar.notice.hidden, false, 'a new arrival can notify again');
assert.doesNotMatch(hint.textContent, /Sign in/);
activityContext.deskWaitingOffer(root, bar, true).onCount(0);
assert.equal(title.textContent, 'Skip remaining questions', 'the queue editor also has an explicit exit');

vm.runInContext(spar.match(/  function matchProfileSteps\([^)]*\)\{[\s\S]*?\n  \}/)[0], profileContext);
const steps = profileContext.matchProfileSteps(profileContext.defaultMatchProfile());
assert.deepEqual(Array.from(steps.slice(0, 4), step => step.key), ['topics', 'agree', 'interest', 'mode']);
assert.ok(steps.filter(step => ['economy', 'immigration', 'speech', 'democracy'].includes(step.key)).every(step => step.default === 'skip'));
assert.equal(steps.find(step => step.key === 'clipIntent').default, 'private', 'skip never opts into sharing');
assert.match(spar, /waitingOffer = deskWaitingOffer\(root, bar, opts.editing\)/, 'the notice is enabled before sign-in and in the queue editor');
assert.match(spar, /run.close = function\(\)\{ cleanup\(\); closeRun\(\); \}/, 'a real match closing the editor stops its polling');

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
assert.match(spar, /onSkip:\s*function\(answers\)\{[\s\S]*?savedAnswers\(answers\)/, 'save-and-continue must preserve the answers already given');
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
assert.match(pair, /draftConfig:\s*privateDraftConfig/);
assert.match(pair, /privateDraftConfig = matchDeskDraftConfig\(/);
// Suggestions stay available without choosing a topic before arrival.
assert.doesNotMatch(pair, /common\.pairedMotion = privateDraftConfig\.recommendedMotion/);
assert.match(pair, /\n        pairedMotion,/);
assert.ok(focused.differenceSuggestions.length >= 2);
assert.ok(!matchDeskDraftConfig(left, echo, 'same').differenceSuggestions, 'agreement never claims a difference');
assert.match(rules, /match \/spar_match_profiles\/\{profileUid\}[\s\S]*allow read, write: if false;/);
assert.match(accountDeleteLib, /'spar_match_profiles'/, 'account deletion must remove the sensitive profile');
assert.match(accountDelete, /purgeIdentity/, 'account deletion must run the identity purge that removes the profile');
assert.match(accountDelete, /from '\.\/lib\/account-deletion\.mjs'/, 'account deletion must import the purge from its lib');
assert.match(dataExport, /privateMatchPreferences:\s*matchPreferences/, 'self-serve export must include the sensitive profile');
assert.match(privacy, /Private political matchmaking preferences/, 'privacy policy must disclose the sensitive profile');

console.log('spar match profile: sanitization, ranking, mutual topics, privacy boundary passed');
