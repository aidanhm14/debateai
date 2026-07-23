// Admin-only: migrate Floor balances into the real credit economy.
//
// The Floor's ledger was sound; its markets were fiction (hardcoded
// personas, Math.random() verdicts). This carries every player's
// balance across as a single opening grant so nobody loses the credits
// they earned, and leaves the old floor_* collections untouched so the
// wind-down is reversible.
//
// Idempotent: the grant txn id is deterministic per uid, so re-running
// re-grants nobody.
//
// POST /api/admin/migrate-credits   body: { "dryRun": false }
import { verifyIdToken, extractBearerToken, isAdminEmail } from './lib/auth.mjs';
import { getDb } from './lib/firestore.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';
import { ledgerEntry, defaultAccount, sharpScore, CREDITS } from './lib/credits.mjs';

const ADMIN_UID = process.env.ADMIN_UID || 'REPLACE_WITH_YOUR_FIREBASE_UID';

export default async (request) => {
  if (request.method === 'OPTIONS') return corsResponse(request);
  if (request.method !== 'POST') return errorResponse('Method not allowed', 405, request);

  const token = extractBearerToken(request);
  if (!token) return errorResponse('Authentication required', 401, request);
  let decoded;
  try { decoded = await verifyIdToken(token); }
  catch { return errorResponse('Authentication failed', 401, request); }

  const db = getDb();
  const uid = decoded.sub;
  let isAdmin = uid === ADMIN_UID || isAdminEmail(decoded.email);
  if (!isAdmin) {
    try {
      const p = await db.collection('user_profiles').doc(uid).get();
      if (p.exists && p.data().isAdmin === true) isAdmin = true;
    } catch {}
  }
  if (!isAdmin) return errorResponse('Forbidden: admin access required', 403, request);

  let body = {};
  try { body = await request.json(); } catch {}
  const dryRun = body.dryRun !== false;

  const now = Date.now();
  const stats = { scanned: 0, migrated: 0, alreadyPresent: 0, creditsCarried: 0, errors: 0 };

  try {
    const snap = await db.collection('floor_users').get();
    for (const doc of snap.docs) {
      stats.scanned++;
      const f = doc.data();
      const who = f.uid || doc.id;
      const balance = Math.max(0, Math.round(Number(f.credits) || 0));

      const acctRef = db.collection('credit_accounts').doc(who);
      const entry = ledgerEntry({
        kind: 'grant', uid: who, amount: balance, balanceAfter: balance,
        refType: 'admin', refId: 'floor-migration',
        reason: 'Carried over from The Floor', actor: 'migration', now,
      });
      const txnRef = db.collection('credit_ledger').doc(who).collection('txns').doc(entry.txnId);

      if ((await txnRef.get()).exists) { stats.alreadyPresent++; continue; }
      stats.creditsCarried += balance;

      if (!dryRun) {
        try {
          const base = defaultAccount(who, now);
          const acct = {
            ...base,
            uid: who,
            name: f.name || '',
            photo: f.photo || '',
            // Carry the prediction record so Sharp Score does not reset
            // to zero for someone with a real history on the old board.
            credits: balance,
            staked: Math.round(Number(f.staked) || 0),
            returned: Math.round(Number(f.returned) || 0),
            bets: Math.round(Number(f.bets) || 0),
            wins: Math.round(Number(f.wins) || 0),
            convSum: Number(f.convSum) || 0,
            streak: Math.round(Number(f.streak) || 0),
            migratedFrom: 'floor_users/' + doc.id,
            createdAt: now, updatedAt: now,
          };
          acct.sharpScore = sharpScore(acct);
          await db.runTransaction(async (tx) => {
            tx.set(acctRef, acct, { merge: true });
            tx.set(txnRef, entry);
          });
          stats.migrated++;
        } catch (err) {
          stats.errors++;
          console.error('[migrate-credits]', who, err.message);
        }
      } else {
        stats.migrated++;
      }
    }
  } catch (err) {
    return jsonResponse({ ok: false, dryRun, stats, error: err.message }, 500, request);
  }

  return jsonResponse({
    ok: true, dryRun, stats,
    note: dryRun
      ? 'Dry run. Nothing written. POST { "dryRun": false } to carry balances over.'
      : 'Balances carried. floor_* collections left untouched.',
    openingGrant: CREDITS.START,
  }, 200, request);
};

export const config = { path: '/api/admin/migrate-credits' };
