// Unit test for lib/challenge.mjs — the status machine, slug/claim
// identity, validation, and the live_challenges migration.
// Run: node scripts/test-challenge.mjs
import {
  STATUSES, canTransition, slugify, normalizeClaim,
  validateChallengeInput, makeChallengeData, publicChallenge,
  feedKeyFor, fromLiveChallenge,
} from '../app/netlify/functions/lib/challenge.mjs';

let pass = 0, fail = 0;
const t = (name, cond) => { if (cond) { pass++; } else { fail++; console.error('  FAIL:', name); } };

// ── status machine ──
t('open -> accepted legal',            canTransition('open', 'accepted'));
t('open -> live illegal',             !canTransition('open', 'live'));
t('live -> judging legal',             canTransition('live', 'judging'));
t('judging -> completed legal',        canTransition('judging', 'completed'));
t('completed -> live illegal',        !canTransition('completed', 'live'));
t('cancelled is terminal',            !canTransition('cancelled', 'open'));
t('unknown target rejected',          !canTransition('open', 'banana'));
t('every status is reachable or draft',
  STATUSES.every((s) => s === 'draft' || STATUSES.some((f) => canTransition(f, s))));

// ── slug ──
t('slug caps at 8 words',
  slugify('this house would abolish the use of algorithms in criminal sentencing', 'a1b2c3')
    .split('-').length <= 9);
t('slug strips punctuation', !/[^a-z0-9-]/.test(slugify("Don't ban it!", 'zz')));
t('slug survives an emoji-only claim', slugify('🔥🔥🔥', 'x9') === 'x9');

// ── claim identity ──
t('THW prefix stripped',   normalizeClaim('THW ban private schooling') === 'ban private schooling');
t('This house would === THW',
  normalizeClaim('This house would ban private schooling') === normalizeClaim('THW ban private schooling'));
t('Resolved: prefix stripped', normalizeClaim('Resolved: The US should adopt a wealth tax')
  === 'the us should adopt a wealth tax');
t('trailing punctuation ignored',
  normalizeClaim('THW ban it.') === normalizeClaim('THW ban it'));

// ── validation ──
const good = validateChallengeInput({ claim: 'THW abolish private schooling', sideA: 'For', sideB: 'Against' });
t('valid claim accepted', good.ok);
t('defaults to async',    good.ok && good.value.mode === 'async');
t('short claim rejected', !validateChallengeInput({ claim: 'no' }).ok);
t('identical sides rejected',
  !validateChallengeInput({ claim: 'THW abolish private schooling', sideA: 'Yes', sideB: 'yes' }).ok);
t('non-http evidence dropped',
  validateChallengeInput({ claim: 'THW abolish private schooling',
    evidence: [{ url: 'javascript:alert(1)' }, { url: 'https://ok.example/x' }] }).value.evidence.length === 1);
t('past schedule zeroed',
  validateChallengeInput({ claim: 'THW abolish private schooling', scheduledAt: 1 }).value.scheduledAt === 0);

// ── construction + projection ──
const doc = makeChallengeData(good.value, { uid: 'u1', name: 'Ana' });
t('created open',        doc.status === 'open');
t('feedKey stored',      doc.feedKey === 'open-public');
t('prediction closed',   doc.prediction.status === 'closed');
const pub = publicChallenge('c1', doc);
t('pct defaults to 50 with no votes', pub.crowd.pctA === 50);
t('projection hides applicants array', pub.applicants === undefined);
const leaning = publicChallenge('c2', { ...doc, crowd: { supportA: 3, supportB: 1, followers: 0 } });
t('pct computed', leaning.crowd.pctA === 75);

// ── feed key ──
t('hidden is quiet',   feedKeyFor('open', 'public', 'hidden') === 'quiet');
t('unlisted is quiet', feedKeyFor('open', 'unlisted', 'clean') === 'quiet');
t('live is live',      feedKeyFor('live', 'public', 'clean') === 'live-public');

// ── migration ──
const legacy = fromLiveChallenge('L1', {
  motion: 'THW ban political advertising', posterUid: 'p1', posterName: 'Poster',
  accepterUid: 'a1', accepterName: 'Accepter', createdAt: 123, acceptedAt: 456,
}, 999);
t('legacy motion -> claim', legacy.claim === 'THW ban political advertising');
t('legacy accepted status', legacy.status === 'accepted');
t('legacy both parties kept', legacy.accepted.length === 2);
t('legacy createdAt preserved', legacy.createdAt === 123);
t('legacy provenance recorded', legacy.migratedFrom === 'live_challenges/L1');
t('legacy carries no contact fields',
  !JSON.stringify(legacy).toLowerCase().includes('email'));

console.log(`challenge lib: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
