// The live round must never strand setup on "Could not write a brief."
// Transient failures retry once; every terminal failure gets neutral local
// context, and both setup surfaces use the same helper.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const helperSource = readFileSync(join(root, 'app/js/motion-brief.js'), 'utf8');
const liveRoundSource = readFileSync(join(root, 'app/live-round.html'), 'utf8');
const browser = {};
new Function('window', 'globalThis', helperSource)(browser, browser);

let failures = 0;
function assert(ok, message) {
  if (ok) return;
  failures++;
  console.error('FAIL: ' + message);
}

function response(status, payload) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(payload),
  };
}

assert(browser.MotionBrief, 'helper loads');
assert(browser.MotionBrief.extract({ content: [{ text: '  Claude brief  ' }] }) === 'Claude brief', 'extracts Claude response');
assert(browser.MotionBrief.extract({ choices: [{ message: { content: 'GPT brief' } }] }) === 'GPT brief', 'extracts OpenAI-shaped response defensively');

const policyFallback = browser.MotionBrief.fallback('This House would break up major technology companies');
const regretFallback = browser.MotionBrief.fallback('This House regrets the rise of social media');
assert(/proposed change/.test(policyFallback), 'policy motions get useful policy context');
assert(/choice named/.test(regretFallback), 'regret motions get retrospective context');
assert(!/Could not|failed|error/i.test(policyFallback + regretFallback), 'fallback is usable context, not an error state');
assert(!/—/.test(policyFallback + regretFallback), 'fallback copy has no em dash');

let calls = 0;
let result = await browser.MotionBrief.request('This House would test success', {
  retryDelay: 0,
  fetch: () => {
    calls++;
    return Promise.resolve(response(200, { content: [{ text: 'A generated brief.' }] }));
  },
});
assert(result === 'A generated brief.', 'successful provider brief passes through');
assert(calls === 1, 'successful request is not repeated');

calls = 0;
result = await browser.MotionBrief.request('This House would test retry', {
  retryDelay: 0,
  fetch: () => {
    calls++;
    return Promise.resolve(calls === 1
      ? response(503, { error: 'temporary' })
      : response(200, { content: [{ text: 'Recovered brief.' }] }));
  },
});
assert(result === 'Recovered brief.', 'transient failure recovers on retry');
assert(calls === 2, 'transient failure retries exactly once');

calls = 0;
result = await browser.MotionBrief.request('This House would test an empty response', {
  retryDelay: 0,
  fetch: () => {
    calls++;
    return Promise.resolve(calls === 1
      ? response(200, { content: [] })
      : response(200, { content: [{ text: 'Recovered from empty.' }] }));
  },
});
assert(result === 'Recovered from empty.', 'empty successful response recovers on retry');
assert(calls === 2, 'empty response retries exactly once');

calls = 0;
result = await browser.MotionBrief.request('This House would test a limit', {
  retryDelay: 0,
  fetch: () => {
    calls++;
    return Promise.resolve(response(429, { error: 'limit', code: 'SIGNED_IN_BETA_LIMIT' }));
  },
});
assert(/proposed change/.test(result), 'non-transient provider failure gets local context');
assert(calls === 1, 'rate limit does not waste a retry');

calls = 0;
result = await browser.MotionBrief.request('This House believes testing matters', {
  retryDelay: 0,
  fetch: () => {
    calls++;
    return Promise.reject(new Error('offline'));
  },
});
assert(/values, consequences, and incentives/.test(result), 'network failure gets local context');
assert(calls === 2, 'network failure gets one retry before fallback');

assert(/<script src="\/js\/motion-brief\.js"><\/script>/.test(liveRoundSource), 'live round loads the shared helper');
assert((liveRoundSource.match(/window\.MotionBrief\.request\(motion\)/g) || []).length === 2, 'both brief surfaces use the shared helper');
assert(!/Could not write a brief/.test(liveRoundSource), 'dead-end brief error is removed');
assert(/_motion:\s*motion/.test(helperSource), 'brief request sends the motion through the server content guard');

if (failures) {
  console.error(`test-live-round-brief: ${failures} failure(s)`);
  process.exit(1);
}
console.log('test-live-round-brief: all assertions passed');
