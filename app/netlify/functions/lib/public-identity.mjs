// One alias bank for browsers and servers. Only an explicit nickname overrides it.
import identity from '../../../js/public-identity.js';
import { withDeadline } from './firestore.mjs';

export function publicIdentity(uid, profile = {}) {
  const generated = identity.forId(uid || 'anonymous');
  return {
    name: identity.cleanName(profile.displayNameOverride) || generated.name,
    username: identity.cleanUsername(profile.usernameOverride) || generated.username,
  };
}

export async function publicNames(db, uids) {
  const ids = [...new Set(uids.filter(Boolean))];
  const names = new Map(ids.map(uid => [uid, publicIdentity(uid).name]));
  for (let i = 0; i < ids.length; i += 100) {
    try {
      const docs = await withDeadline(db.getAll(...ids.slice(i, i + 100).map(uid => db.collection('user_profiles').doc(uid))), 2500);
      docs.forEach(doc => { if (doc.exists) names.set(doc.id, publicIdentity(doc.id, doc.data()).name); });
    } catch { /* Profile outages still return aliases, never account names. */ }
  }
  return names;
}

export async function publicName(db, uid) {
  return (await publicNames(db, [uid])).get(uid) || 'Anonymous';
}
