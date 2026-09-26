import outlook from '../../../js/public-outlook.js';
import { withDeadline } from './firestore.mjs';

export function outlookWrite(body) {
  if (!body || typeof body !== 'object') throw new Error('Invalid outlook.');
  if (body.label && !outlook.label(body.label)) throw new Error('Choose a viewpoint from the list.');
  if (body.belief != null && (typeof body.belief !== 'string' || body.belief.length > 240)) throw new Error('Keep your belief statement to 240 characters.');
  const label = outlook.label(body.label), belief = outlook.text(body.belief);
  if ((label || belief) && body.publish !== true) throw new Error('Choose to share this publicly before saving.');
  return { publicIdeology: label || null, publicBelief: belief, publicBeliefPublished: !!belief && body.publish === true };
}

export async function readPublicOutlooks(db, ids, ownerUid = '') {
  const uids = [...new Set(ids)].slice(0, 40);
  const result = {};
  if (!uids.length) return result;
  const [profiles, visibility] = await Promise.all([
    withDeadline(db.getAll(...uids.map(uid => db.collection('user_profiles').doc(uid))), 3500),
    withDeadline(db.getAll(...uids.map(uid => db.collection('public_profiles').doc(uid))), 3500),
  ]);
  const privateIds = new Set(visibility.filter(d => d.exists && d.data().visibility === 'private').map(d => d.id));
  profiles.forEach(d => {
    if (d.exists && (!privateIds.has(d.id) || d.id === ownerUid)) result[d.id] = outlook.read(d.data());
  });
  return result;
}
