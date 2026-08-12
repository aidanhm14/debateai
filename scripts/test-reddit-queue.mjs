#!/usr/bin/env node
// Guards the Reddit answer queue.
//
// Two promises here are worth a hook. First, NOTHING auto-posts: the cost
// of getting that wrong is the domain banned from the exact subreddits
// this is meant to reach, and that is not reversible with a code change.
// Second, a draft that reads as an advert never reaches a human, because
// the human is tired at 1am and will post what they are shown.
//
// Runs in the pre-commit hook.

import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  scoreCandidate, isAnswerable, dedupeKey, validateDraft,
  buildQueueRow, MIN_SCORE, WATCHED_SUBREDDITS, normalize,
} from '../app/netlify/functions/lib/reddit-queue.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0;
function ok(name, fn) {
  try { fn(); pass += 1; }
  catch (err) {
    console.error(`FAIL: ${name}\n  ${err.message}`);
    process.exitCode = 1;
  }
}

const post = (o) => Object.assign({
  id: 'abc123', title: '', selftext: '', subreddit: 'Debate',
  num_comments: 1, is_self: true, permalink: '/r/Debate/comments/abc123/x/',
  author: 'someone', created_utc: 1723400000,
}, o);

// ── THE STRUCTURAL RULE ───────────────────────────────────────────────
// Not a behaviour test. A source scan, because the guarantee is that the
// capability does not exist rather than that it is switched off.
ok('no file in the Reddit path can post to Reddit', () => {
  const files = [
    'app/netlify/functions/lib/reddit-queue.mjs',
    'app/netlify/functions/scheduled-reddit-watch.mjs',
    'app/netlify/functions/admin-outreach-queue.mjs',
  ];
  // Reddit's write endpoints. Any of these appearing means someone added
  // a posting path, which is a product decision, not a refactor.
  const forbidden = [
    '/api/submit', '/api/comment', '/api/vote', '/api/compose',
    'api/v1/me/friends', 'submit?', 'identity submit',
  ];
  for (const f of files) {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    for (const needle of forbidden) {
      assert.ok(!src.includes(needle),
        `${f} references ${needle}; nothing here may post to Reddit`);
    }
    // The oauth scope requested must stay read-only.
    assert.ok(!/scope=[^'"&\s]*submit/.test(src), `${f} requests a submit scope`);
  }
});

ok('the admin endpoint cannot set a row back to pending', () => {
  const src = fs.readFileSync(path.join(ROOT, 'app/netlify/functions/admin-outreach-queue.mjs'), 'utf8');
  assert.ok(src.includes("status !== 'posted' && status !== 'dismissed'"),
    'the forward-only status guard is gone');
});

// ── Scoring ───────────────────────────────────────────────────────────
ok('a real help request clears the bar', () => {
  const p = post({
    title: 'How do I answer this framework argument?',
    selftext: 'I keep losing to a framework that says the judge should evaluate only the ' +
      'material impacts. My contention is about dignity and I cannot get it to weigh. ' +
      'What is the actual response here, the warrant or the impact level?',
    num_comments: 2,
  });
  assert.ok(scoreCandidate(p) >= MIN_SCORE, `scored ${scoreCandidate(p)}, needed ${MIN_SCORE}`);
  assert.strictEqual(isAnswerable(p), true);
});

// The regression. A plain substring reject check kills every post
// containing "warrant", because "warrant" ends in "rant" and "rant" is on
// the reject list. This zeroed a textbook-good candidate on the first run.
ok('reject words match on WORD BOUNDARIES, not substrings', () => {
  const warrant = post({
    title: 'How do I answer their warrant here?',
    selftext: 'Their warrant is that deterrence works, and my rebuttal keeps bouncing off. '
      + 'I need the actual response to the warrant, not just a claim that it is wrong. '
      + 'What is the internal link they are skipping when they say this?',
  });
  assert.ok(scoreCandidate(warrant) >= MIN_SCORE,
    `"warrant" was read as the reject word "rant" (scored ${scoreCandidate(warrant)})`);

  // Same class, different words.
  const turnout = post({
    title: 'How do I answer a turnout argument',
    selftext: 'They say the policy raises turnout and that is the whole case. I want the '
      + 'response to the internal link, because the impact seems to assume the turnout '
      + 'shift favours one side and they never prove that part at all.',
  });
  assert.ok(scoreCandidate(turnout) >= MIN_SCORE, 'a turnout post was mis-scored');

  // And the reject list still works when the word really is standalone.
  const real = post({
    title: 'Rant about my coach',
    selftext: 'This is a rant. My contention is nobody listens and the impact is I am done. '
      + 'Every argument I make gets ignored and the rebuttal advice is useless honestly.',
  });
  assert.strictEqual(scoreCandidate(real), 0, 'a genuine rant was not rejected');
});

ok('congratulation and results posts are rejected outright', () => {
  const p = post({
    title: 'Congrats to our team on the bid!',
    selftext: 'Huge argument-filled weekend, great rebuttal work from everyone. ' +
      'Tournament results are up and we could not be prouder of the impact these kids made.',
  });
  assert.strictEqual(scoreCandidate(p), 0, 'a hard-reject phrase did not zero the score');
});

ok('partner-search posts are rejected even when they use debate words', () => {
  const p = post({
    title: 'Looking for a partner for next season',
    selftext: 'I run a policy case with good warrants and impact framing, want someone ' +
      'who likes rebuttal work and can flow well under pressure at tournaments.',
  });
  assert.strictEqual(scoreCandidate(p), 0);
});

ok('a well-answered thread is skipped', () => {
  const p = post({
    title: 'How do I answer this framework argument?',
    selftext: 'x'.repeat(300),
    num_comments: 30,
  });
  assert.strictEqual(scoreCandidate(p), 0, 'arriving 31st is trawling, not helping');
});

ok('a one-line post does not qualify', () => {
  assert.strictEqual(isAnswerable(post({ title: 'help?', selftext: 'idk' })), false);
});

ok('a link post with no text is skipped', () => {
  const p = post({ title: 'How do I answer this argument', selftext: '', is_self: false });
  assert.strictEqual(scoreCandidate(p), 0);
});

ok('an empty title never scores', () => {
  assert.strictEqual(scoreCandidate(post({ title: '' })), 0);
  assert.strictEqual(scoreCandidate(null), 0);
  assert.strictEqual(scoreCandidate(undefined), 0);
});

ok('dedupeKey is stable and sanitised', () => {
  assert.strictEqual(dedupeKey(post({ id: 'abc123' })), 'reddit_abc123');
  assert.strictEqual(dedupeKey(post({ id: '../../etc/passwd' })), 'reddit_etcpasswd');
  assert.strictEqual(dedupeKey({}), '');
});

ok('normalize collapses whitespace and lowercases', () => {
  assert.strictEqual(normalize('  How   DO\nI  '), 'how do i');
  assert.strictEqual(normalize(null), '');
});

ok('the watch list is small and non-empty', () => {
  assert.ok(WATCHED_SUBREDDITS.length > 0, 'nothing is watched');
  assert.ok(WATCHED_SUBREDDITS.length <= 8, 'a wide net makes a queue nobody reads');
});

// ── Draft validation, the reputation guard ────────────────────────────
const GOOD = 'Their framework only excludes your impact if they win that material harms '
  + 'come first, and they usually assert that rather than warranting it. Ask in cross whether '
  + 'dignity violations count as harm at all. If they say yes, your impact is inside their '
  + 'own standard and the exclusion collapses. If they say no, make them defend that openly, '
  + 'because most judges will not buy it once it is stated plainly.';

ok('a genuinely helpful reply passes', () => {
  const r = validateDraft(GOOD);
  assert.ok(r.ok, 'rejected a good draft: ' + r.problems.join('; '));
});

ok('a reply that opens with the site is rejected', () => {
  const r = validateDraft('You should try itsdebatable.com for this. ' + GOOD);
  assert.ok(!r.ok);
  assert.ok(r.problems.some((p) => p.includes('opening')), 'the lead-with-the-answer rule did not fire');
});

ok('a reply linking the site twice is rejected', () => {
  const r = validateDraft(GOOD + ' More at itsdebatable.com and also itsdebatable.com/blocks');
  assert.ok(!r.ok);
  assert.ok(r.problems.some((p) => p.includes('more than once')));
});

ok('one trailing link is allowed', () => {
  const r = validateDraft(GOOD + ' There is a tool that drills this at itsdebatable.com/blocks if useful.');
  assert.ok(r.ok, 'rejected a legitimate single trailing link: ' + r.problems.join('; '));
});

ok('marketing register is rejected', () => {
  for (const phrase of ['check out', 'sign up', 'our platform', 'dm me']) {
    const r = validateDraft(GOOD + ' Also ' + phrase + ' if you want more.');
    assert.ok(!r.ok, `"${phrase}" was allowed through`);
  }
});

ok('banned site-voice phrases are rejected', () => {
  const r = validateDraft("Let's break it down. " + GOOD);
  assert.ok(!r.ok);
});

ok('an em-dash is rejected', () => {
  const r = validateDraft(GOOD.replace('collapses.', 'collapses — obviously.'));
  assert.ok(!r.ok);
  assert.ok(r.problems.some((p) => p.includes('em-dash')));
});

ok('a fabricated author-year citation is rejected', () => {
  const r = validateDraft(GOOD + ' Smith 2021 confirms this.');
  assert.ok(!r.ok);
  assert.ok(r.problems.some((p) => p.includes('citation')));
});

ok('too short and too long are both rejected', () => {
  assert.ok(!validateDraft('Nice question.').ok);
  assert.ok(!validateDraft('a'.repeat(2000)).ok);
  assert.ok(!validateDraft('').ok);
  assert.ok(!validateDraft(null).ok);
});

// ── Row shape ─────────────────────────────────────────────────────────
ok('a queued row is pending and carries the source link', () => {
  const row = buildQueueRow(post({ title: 'T', selftext: 'B' }), GOOD, 11);
  assert.strictEqual(row.status, 'pending', 'a machine wrote something other than pending');
  assert.strictEqual(row.key, 'reddit_abc123');
  assert.strictEqual(row.url, 'https://www.reddit.com/r/Debate/comments/abc123/x/');
  assert.strictEqual(row.score, 11);
  assert.strictEqual(row.draft, GOOD);
});

if (process.exitCode) {
  console.error(`\ntest-reddit-queue: ${pass} passed, failures above.`);
} else {
  console.log(`test-reddit-queue: ${pass}/${pass} checks passed.`);
}
