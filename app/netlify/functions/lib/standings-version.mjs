// Updated in the same transaction as BOTH rating records. Retries do not
// advance this marker; appeals do. No scoring or eligibility decisions here.
export const STANDINGS_VERSION = 'standings-version-v1';
export function markStandingsChanged(tx, db, version, at) {
  tx.set(db.collection('admin_cache').doc(STANDINGS_VERSION), { version, at });
}
