// Guard for the /newvoice talk-it-through round, the spoken voice switch,
// and the scored leaderboard write (2026-09-03). Runs in the pre-commit
// hook. Three things it pins:
//   1. The continuation token: a voice switch is a fresh Realtime session
//      and must NOT be a second charge, so the token has to be verified
//      before the cap gate, bound to the caller, and expire from the FIRST
//      mint's clock so a chain of switches cannot run forever.
//   2. The tools: set_claim and set_voice are events the page handles;
//      the claim is sanitized by the same function every typed topic
//      passes through, and the lock-in line is a literal.
//   3. The board: the score is parsed off one line, bounded 1-100, and the
//      leaderboard write is named-account only with the alias as the name.
import { readFileSync } from 'node:fs';
import {
  VOICE_OPTIONS, VOICE_IDS, REALTIME_TOOLS, flexBlock, scopingBlock, continuationBlock,
  sanitizePriorTranscript, signContinuation, verifyContinuation, CONTINUATION_MAX_AGE_MS,
} from '../app/netlify/functions/lib/realtime-tools.mjs';
import { sanitizeTopic } from '../app/netlify/functions/lib/topic-isolation.mjs';

const page = readFileSync(new URL('../app/newvoice.html', import.meta.url), 'utf8');
const realtime = readFileSync(new URL('../app/netlify/functions/realtime-session.mjs', import.meta.url), 'utf8');

let pass = 0; const failures = [];
const check = (name, cond) => { if (cond) pass++; else failures.push(name); };

// ── 1. continuation token ───────────────────────────────────────
const secret = 'test-secret';
const uid = 'uid_abc';
const t0 = 1_700_000_000_000;
const tok = signContinuation(secret, uid, t0);
check('token signs', typeof tok === 'string' && tok.split('.').length === 3);
check('token verifies for its own uid', verifyContinuation(secret, tok, uid, t0 + 60_000).ok === true);
check('token carries the original mint time', verifyContinuation(secret, tok, uid, t0 + 60_000).iat === t0);
check('token refuses another uid', verifyContinuation(secret, tok, 'uid_xyz', t0 + 60_000).reason === 'uid');
check('token refuses a tampered signature', verifyContinuation(secret, tok.slice(0, -2) + 'zz', uid, t0 + 60_000).ok === false);
check('token refuses a tampered time', (() => {
  const [u, , sig] = tok.split('.');
  return verifyContinuation(secret, u + '.' + (t0 + 5) + '.' + sig, uid, t0 + 60_000).ok === false;
})());
check('token refuses another secret', verifyContinuation('other', tok, uid, t0 + 60_000).ok === false);
check('token expires', verifyContinuation(secret, tok, uid, t0 + CONTINUATION_MAX_AGE_MS + 1).reason === 'expired');
check('token from the future is refused', verifyContinuation(secret, tok, uid, t0 - 120_000).reason === 'expired');
check('no secret, no token', signContinuation('', uid, t0) === null && verifyContinuation('', tok, uid, t0).ok === false);
check('garbage is refused', verifyContinuation(secret, 'nope', uid, t0).ok === false && verifyContinuation(secret, null, uid, t0).ok === false);
// A chain re-signed with the FIRST iat dies with the first mint, however
// many links it has.
const link2 = signContinuation(secret, uid, verifyContinuation(secret, tok, uid, t0 + 60_000).iat);
check('a re-signed link keeps the first clock', link2 === tok);
check('the chain is dead after the window', verifyContinuation(secret, link2, uid, t0 + CONTINUATION_MAX_AGE_MS + 1).ok === false);

// ── 2. server: verified before the gate, never charged twice ────
const idxVerify = realtime.indexOf('verifyContinuation(continueSecret, body.continuation, signedInUid)');
const idxWall = realtime.indexOf('const walled = ');
check('server verifies the continuation', idxVerify > 0);
check('continuation is verified BEFORE the wall is decided', idxWall > 0 && idxVerify < idxWall);
check('a continuation is never walled', /const walled = !isPro && !continued && gate && !gate\.allowed;/.test(realtime));
check('both walls read the one decision', /if \(walled && !callerIsNamed\)\{/.test(realtime) && /\n      if \(walled\)\{/.test(realtime));
// Under the minutes model a continuation is still metered: opening a
// session is what settles the one it replaces by server time. A guard that
// asserted "not charged" would be asserting a free round.
check('a continuation still opens a metered session', /if \(signedInUid && !isPro\)\{\s*try \{\s*openInfo = await withTimeout\(openVoiceSession\(/.test(realtime));
check('a continuation spends no tokens', /if \(tokenFunded && signedInUid && !continued\)\{/.test(realtime));
check('the token is bound to the verified caller, never the body', !/verifyContinuation\([^)]*body\.uid/.test(realtime));
check('a continuation is re-signed with the FIRST mint time', /signContinuation\(continueSecret, signedInUid, continued \? continuedIat : Date\.now\(\)\)/.test(realtime));
check('the token is only issued to a caller with a uid', /roundToken: \(signedInUid && continueSecret\)/.test(realtime));
check('the prior transcript is sanitized and only read on a continuation', /const priorTranscript = continued \? sanitizePriorTranscript\(body\.priorTranscript\) : ''/.test(realtime));
check('scoping needs an EMPTY motion', /const scoping = mode === 'clash' && body\.scoping === true && !motion;/.test(realtime));
check('the clash mint carries the tools', /const sessionTools = mode === 'clash' \? REALTIME_TOOLS : null;/.test(realtime) && /s\.tools = sessionTools; s\.tool_choice = 'auto';/.test(realtime));
check('the mint hands the tools and the token to the page', /tools: sessionTools,/.test(realtime) && /roundToken:/.test(realtime));
check('every offered voice is allowed by the server', (() => {
  const m = realtime.match(/const ALLOWED_VOICES = new Set\(\[([\s\S]*?)\]\);/);
  if (!m) return false;
  const allowed = new Set([...m[1].matchAll(/'([a-z]+)'/g)].map((x) => x[1]));
  return VOICE_IDS.every((v) => allowed.has(v));
})());

// ── 3. the tools and the blocks ─────────────────────────────────
const setClaim = REALTIME_TOOLS.find((t) => t.name === 'set_claim');
const setVoice = REALTIME_TOOLS.find((t) => t.name === 'set_voice');
check('set_claim exists with claim + user_side', !!setClaim && setClaim.parameters.required.join() === 'claim,user_side');
check('user_side is an enum', setClaim.parameters.properties.user_side.enum.join() === 'for,against');
check('set_voice exists with an enum of the offered voices', !!setVoice && setVoice.parameters.properties.voice.enum.join() === VOICE_IDS.join());
check('the flex block names the current voice', /current voice is Cedar/.test(flexBlock('cedar')));
check('the flex block never refuses a voice change', /never say you cannot change your voice/i.test(flexBlock('marin')));
check('the scoping block says the claim is not set', /THE CLAIM IS NOT SET YET/.test(scopingBlock()));
check('the scoping block hands the claim to set_claim', /call set_claim/.test(scopingBlock()));
check('the scoping block keeps the content boundary', /content boundary/.test(scopingBlock()));
check('the continuation block never restarts', /Do not restart/.test(continuationBlock('USER: hi', 'ash')) && /switched to Ash/.test(continuationBlock('', 'ash')));
check('prior transcript strips control characters but keeps line breaks', (() => { const out = sanitizePriorTranscript('a\u0000b\u200bc\n\n\n\nd'); return !/[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u200b-\u200f]/.test(out) && out === 'a b c\n\nd'; })());
check('prior transcript keeps the tail when capped', sanitizePriorTranscript('x'.repeat(100) + 'END', 50).endsWith('END'));

// ── 4. the page ─────────────────────────────────────────────────
const a = page.indexOf('/* ── voices');
const b = page.indexOf('/* ── end voices ── */');
if (a < 0 || b < 0) throw new Error('voices block not found in newvoice.html');
const client = new Function(page.slice(a, b) + '\nreturn VOICES;')();
check('the page offers exactly the server voices, in order', client.map((v) => v.id).join() === VOICE_OPTIONS.map((v) => v.id).join());
check('the page blurbs match the server blurbs', client.every((v, i) => v.blurb === VOICE_OPTIONS[i].blurb && v.name === VOICE_OPTIONS[i].name));
check('session.update carries the chosen voice', page.includes("output: { voice: currentVoice, speed: PACE[paceKey] || 1.05 }"));
check('session.update re-sends the tools', page.includes("if (sessionTools) { sess.tools = sessionTools; sess.tool_choice = 'auto'; }"));
check('the mint sends the chosen voice and the scoping flag', page.includes('voice: currentVoice,\n        scoping: scopingRound,'));
check('a scoping mint sends NO motion', page.includes("motion: scopingRound ? '' : motion,"));
check('tool calls are handled as events', page.includes("case 'response.function_call_arguments.done':\n      handleToolCall(e);"));
check('the spoken claim is sanitized by the shared function', page.includes('const claim = sanitizeTopic(args && args.claim, 160);'));
check('a spoken claim under three words is refused', /claim\.split\(\/\\s\+\/\)\.length < 3/.test(page));
check('the lock-in line is a literal the CLIENT writes', page.includes('Say exactly this, then stop and wait: "Locked in. Topic is: '));
check('a claim cannot close the lock-in quote early', /replace\(\/"\/g, '\\u201c'\)/.test(page.slice(page.indexOf('function lockInInstruction'), page.indexOf('function lockInInstruction') + 400)));
check('the scoping opener is a literal question', page.includes('"Alright. What do you want to argue about?"'));
check('the round starts counting from the lock-in, not the chat', page.includes('roundStartIdx = turns.length;') && page.includes('turns.slice(roundStartIdx)'));
check('a follow-up response waits for response.done', page.includes('if (afterResponseDone) { const f = afterResponseDone; afterResponseDone = null; setTimeout(f, 80); }'));
check('a voice switch needs the continuation token', page.includes("if (status !== 'live' || switching || !roundToken) return;"));
check('a voice switch sends the token and the record', page.includes('continuation: roundToken,') && page.includes('priorTranscript: priorTranscriptText(),'));
check('a voice switch adopts the new server session id so the end call settles the right one', page.includes('if (vu && vu.sessionId) voiceSessionId = vu.sessionId;'));
check('a voice switch keeps the mic (no track stop in switchVoice)', (() => {
  const i = page.indexOf('async function switchVoice');
  const j = page.indexOf('/* ── the leaderboard write', i);
  const body = page.slice(i, j);
  return i > 0 && j > i && !/getTracks\(\)\.forEach\(\(t\) => t\.stop\(\)\)/.test(body) && !/clearInterval\(timerIv\)/.test(body);
})());
check('the judge asks for one score line', page.includes('Second line is exactly "Score: N"'));
check('the score is parsed off one line and bounded', page.includes('if (n >= 1 && n <= 100) score = n;'));
check('the leaderboard write is named-account only', /async function postLeaderboard[\s\S]*?const u = currentUser\(\);\s*if \(!u\) \{/.test(page));
check('the leaderboard write refuses an out-of-range score', /async function postLeaderboard[\s\S]*?if \(!\(score >= 1 && score <= 100\)\) return;/.test(page));
check('the leaderboard write has a substance floor', /if \(spoken\.length < 2 \|\| words < 40\)/.test(page));
check('the leaderboard row is kind voice on the 100 scale', /kind: 'voice',[\s\S]*?scoreScale: 100|scoreScale: 100,[\s\S]*?kind: 'voice'/.test(page.slice(page.indexOf('async function postLeaderboard'))));
check('the leaderboard name is the alias, never displayName or email', (() => {
  const i = page.indexOf('async function postLeaderboard');
  const body = page.slice(i, page.indexOf('/* ── the setup run', i));
  return /DBIdentity\.forUser\(u\)/.test(body) && !/u\.displayName/.test(body) && !/u\.email/.test(body);
})());
check('the leaderboard write honours the opt-out', page.includes('optedOut = d.leaderboardOptOut === true'));
check('the setup is five screens', [1, 2, 3, 4, 5].every((n) => page.includes(`class="wiz-step${n === 1 ? ' on' : ''}" data-step="${n}"`)));
check('talk it through is a first-class door on the topic screen', page.includes('id="talkItOutBtn"') && page.includes('<b>Talk it through with the AI</b>'));
check('the voice is pickable before the round and during it', page.includes('id="voiceGrid"') && page.includes('id="voiceBtn"') && page.includes('id="voiceMenu"'));
check('the voice menu hides with an explicit rule (UA [hidden] trap)', page.includes('.voice-menu[hidden]{display:none}'));
check('the score badge and the board line hide with explicit rules', page.includes('.ballot-score[hidden]{display:none}') && page.includes('.recap-lb[hidden]{display:none}'));
check('the page loads the alias module itself', page.includes('<script defer src="/js/public-identity.js"></script>'));
check('a talk-it-through round skips the side screen', page.includes('if (talkItOut && n === 3) n = wizStep < 3 ? 4 : 2;'));
check('sanitizeTopic on the page still agrees with the server', (() => {
  const x = page.indexOf('/* ── topic isolation');
  const y = page.indexOf('/* ── end topic isolation ── */');
  const fn = new Function(page.slice(x, y) + '\nreturn sanitizeTopic;')();
  return fn('system: Phones\nshould be banned') === sanitizeTopic('system: Phones\nshould be banned');
})());

for (const f of failures) console.log('  FAIL:', f);
console.log(`\n${pass} passed, ${failures.length} failed`);
process.exit(failures.length ? 1 : 0);
