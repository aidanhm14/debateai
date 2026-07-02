// Shared "exclude my own usage from analytics" helper.
//
// The founder uses the app heavily (testing, demos, dogfooding), and
// that self-traffic skews every /admin panel that aggregates events
// per-user/session/page. This resolves the set of UIDs whose events
// should be dropped from those aggregations so the dashboard reflects
// real users, not the owner.
//
// Sources of excluded UIDs (union):
//   1. ADMIN_UID env  — the founder's signed-in Firebase UID. Their
//      signed-in events are tagged with this uid.
//   2. ANALYTICS_EXCLUDE_UIDS env — optional comma-separated extra uids
//      (e.g. a second device/account, a teammate doing QA).
//   3. FOUNDER_EMAILS env (defaults to the owner's email) resolved to
//      uid(s) via a user_profiles email lookup. Belt-and-suspenders so
//      this works even if ADMIN_UID env isn't set on the deploy.
//   4. ANALYTICS_EXCLUDE_TEAM_NAMES env (defaults to "contact team")
//      and ANALYTICS_EXCLUDE_TEAM_IDS env resolved through team_members.
//
// Anonymous (signed-out) founder sessions can't be attributed to an
// identity, so they can't be excluded — that's an accepted limitation.
//
// Result is cached for an hour: the founder→uid mapping never changes
// within a session, and this keeps the email lookup off the hot path
// of every admin poll.

const DEFAULT_FOUNDER_EMAILS = 'aidandavidhollinger@gmail.com';
const DEFAULT_EXCLUDE_TEAM_NAMES = 'contact team';
const TTL_MS = 60 * 60 * 1000; // 1 hour

let _cache = null; // { at: number, set: Set<string> }

function envUids() {
  const out = [];
  const admin = process.env.ADMIN_UID;
  if (admin && admin !== 'REPLACE_WITH_YOUR_FIREBASE_UID') out.push(admin);
  const extra = process.env.ANALYTICS_EXCLUDE_UIDS || '';
  extra.split(',').map(s => s.trim()).filter(Boolean).forEach(u => out.push(u));
  return out;
}

function founderEmails() {
  return (process.env.FOUNDER_EMAILS || DEFAULT_FOUNDER_EMAILS)
    .split(',')
    .map(s => s.trim().toLowerCase())
    .filter(Boolean);
}

function configuredTeamIds() {
  return (process.env.ANALYTICS_EXCLUDE_TEAM_IDS || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
}

function configuredTeamNames() {
  return (process.env.ANALYTICS_EXCLUDE_TEAM_NAMES || DEFAULT_EXCLUDE_TEAM_NAMES)
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
}

function teamNameVariants(name) {
  const raw = String(name || '').trim();
  if (!raw) return [];
  const lower = raw.toLowerCase();
  const title = lower.replace(/\b\w/g, c => c.toUpperCase());
  return [...new Set([raw, lower, title])];
}

// Returns a Set<string> of UIDs to drop from analytics aggregations.
// `db` is the Firestore instance (already resolved by requireAdmin).
export async function getExcludedUids(db) {
  if (_cache && Date.now() - _cache.at < TTL_MS) return _cache.set;

  const set = new Set(envUids());

  // Resolve founder emails → uids. user_profiles docs are keyed by uid
  // and carry an `email` field, so an equality query gives us the uid.
  const emails = founderEmails();
  if (db && emails.length) {
    await Promise.all(emails.map(async (email) => {
      try {
        const snap = await db.collection('user_profiles')
          .where('email', '==', email)
          .limit(5)
          .get();
        snap.docs.forEach(d => set.add(d.id));
      } catch (err) {
        // A missing composite index or transient read error shouldn't
        // break the dashboard — just fall back to the env-derived uids.
        console.warn('[founder-exclude] email lookup failed for', email, err.message);
      }
    }));

    const teamIds = new Set(configuredTeamIds());
    await Promise.all(configuredTeamNames().flatMap((teamName) =>
      teamNameVariants(teamName).map(async (variant) => {
        try {
          const snap = await db.collection('teams')
            .where('name', '==', variant)
            .limit(10)
            .get();
          snap.docs.forEach(d => teamIds.add(d.id));
        } catch (err) {
          console.warn('[founder-exclude] team lookup failed for', variant, err.message);
        }
      })
    ));

    await Promise.all([...teamIds].map(async (teamId) => {
      try {
        const snap = await db.collection('team_members')
          .where('teamId', '==', teamId)
          .limit(100)
          .get();
        snap.docs.forEach((d) => {
          const data = d.data();
          const uid = data.uid || data.userId;
          if (uid) set.add(uid);
        });
      } catch (err) {
        console.warn('[founder-exclude] team member lookup failed for', teamId, err.message);
      }
    }));
  }

  _cache = { at: Date.now(), set };
  return set;
}

// Test seam — lets a unit test or an admin tool force a refresh.
export function _clearExcludeCache() { _cache = null; }
