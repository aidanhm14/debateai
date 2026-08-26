// Self-serve data export. GET /api/my-data-export
//
// The privacy policy s10 promises an export "by emailing us; we will send
// you a JSON dump within 30 days". That promise is kept by hand, which
// means it is kept slowly, kept inconsistently, and only kept at all for
// the people willing to email a stranger about their data. A right that
// costs a favour is not much of a right, and a licensing conversation
// asks how a subject exercises one.
//
// So the same dump the manual process would assemble is served here, to
// the account itself, in one call.
//
// SCOPE IS THE CALLER'S OWN DATA AND NOTHING ELSE. Every read is keyed
// on the verified uid off the token. There is no id parameter anywhere
// in this file on purpose: a parameter is a thing someone can change,
// and the one bug this endpoint must never have is handing one person
// another person's rounds.
//
// Named accounts only. An anonymous uid is not an account, it is a
// browser, and minting a fresh one is free, so an export lane open to
// them is an unauthenticated bulk read of whatever that uid touched.
//
// Deliberately NOT included:
//   - direct messages. A thread has two authors and the other person did
//     not ask for their words to be exported; the policy already says DMs
//     are visible to the two participants and deleted with the account.
//   - anything derived that names another user.

import { verifyIdToken, extractBearerToken, isNamedAccount } from './lib/auth.mjs';
import { getDb } from './lib/firestore.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';
import { checkLayers } from './lib/rate-limit.mjs';
import { CONSENT_POLICY_VERSION } from './lib/consent.mjs';

// A dump is a heavy read (hundreds of documents), so it is metered by
// account. Generous enough that nobody exercising a right hits it, tight
// enough that a loop cannot turn it into a read-quota event; this project
// has already had a day of site-wide 429s from a blown read cap.
const LAYERS = [
  { window: 60 * 60 * 1000, max: 6, label: 'hour' },
  { window: 24 * 60 * 60 * 1000, max: 20, label: 'day' },
];

const MAX_PER_COLLECTION = 1000;

function iso(v) {
  try { if (v && typeof v.toDate === 'function') return v.toDate().toISOString(); } catch (e) {}
  return v ?? null;
}

// Firestore values arrive with Timestamp objects buried in them; a raw
// JSON.stringify renders those as {_seconds,_nanoseconds}, which is not
// a date to anyone reading the file.
function plain(value, depth = 0) {
  if (value === null || value === undefined) return null;
  if (depth > 6) return null;
  if (typeof value.toDate === 'function') return iso(value);
  if (Array.isArray(value)) return value.map((v) => plain(v, depth + 1));
  if (typeof value === 'object') {
    const out = {};
    for (const k of Object.keys(value)) out[k] = plain(value[k], depth + 1);
    return out;
  }
  return value;
}

async function dumpQuery(query) {
  const snap = await query.limit(MAX_PER_COLLECTION).get();
  return snap.docs.map((d) => ({ id: d.id, ...plain(d.data()) }));
}

export default async (request) => {
  if (request.method === 'OPTIONS') return corsResponse(request);
  if (request.method !== 'GET') return errorResponse('Method not allowed', 405, request);

  const token = extractBearerToken(request);
  if (!token) return errorResponse('Sign in to export your data', 401, request);

  let decoded;
  try { decoded = await verifyIdToken(token); }
  catch (e) { return errorResponse('Invalid token', 401, request); }

  if (!isNamedAccount(decoded)) {
    return errorResponse('Export is available to accounts, not to guest sessions', 403, request);
  }

  const uid = decoded.sub;
  const gate = await checkLayers('export', 'uid_' + uid, LAYERS);
  if (!gate.ok) return errorResponse('Too many export requests, try again later', 429, request);

  try {
    const db = getDb();
    const [profile, generations, consents, leaderboard, voiceTranscripts, voiceRounds] = await Promise.all([
      db.collection('user_profiles').doc(uid).get().then((d) => (d.exists ? plain(d.data()) : null)),
      dumpQuery(db.collection('generations').where('uid', '==', uid)),
      dumpQuery(db.collection('consent_events').where('uid', '==', uid)),
      dumpQuery(db.collection('leaderboard_entries').where('uid', '==', uid)),
      dumpQuery(db.collection('voice_transcripts').where('uid', '==', uid)),
      dumpQuery(db.collection('voice_rounds').where('uid', '==', uid)),
    ]);

    // The count that matters most to the person reading this file, so it
    // is stated rather than left to be derived from a thousand rows.
    const contributed = generations.filter((g) => g.contributable === true);

    const payload = {
      _about: 'Everything Debatable holds that is keyed to your account. Direct messages are excluded because a thread has another author in it.',
      exportedAt: new Date().toISOString(),
      account: {
        uid,
        email: decoded.email || null,
        signInProvider: decoded.firebase?.sign_in_provider || null,
      },
      consent: {
        currentPolicyVersion: CONSENT_POLICY_VERSION,
        storeTranscripts: profile?.transcriptCapture === true,
        researchCorpusOptIn: profile?.contributeToCorpus === true,
        ageAttested18Plus: profile?.corpusAgeAttested === true,
        // The receipts. Every grant and withdrawal, with the surface it
        // happened on and the policy text in force at the time.
        history: consents,
      },
      corpus: {
        roundsInLicensableCorpus: contributed.length,
        roundIds: contributed.map((g) => g.id),
        withdrawAt: '/api/corpus-withdraw',
      },
      profile,
      rounds: generations,
      voiceTranscripts,
      voiceRounds,
      leaderboardEntries: leaderboard,
      _limits: {
        perCollectionCap: MAX_PER_COLLECTION,
        note: 'If any list is exactly at the cap, email for the remainder.',
      },
    };

    return new Response(JSON.stringify(payload, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="debatable-my-data-${new Date().toISOString().slice(0, 10)}.json"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    console.error('my-data-export error:', err.message);
    return errorResponse('Could not build your export', 500, request);
  }
};

export const config = {
  path: '/api/my-data-export',
};
