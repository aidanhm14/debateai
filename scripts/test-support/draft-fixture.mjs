// In-memory transaction store for the real draft endpoint. No accounts,
// credentials, network, or live rounds are used by these regressions.
import { runDraftAction } from '../../app/netlify/functions/round-draft.mjs';
import { FieldValue } from '../../app/netlify/functions/lib/firestore.mjs';

export function draftFixture() {
  const rows = new Map([
    ['round_drafts/room', { eligible: true, seed: 'sync-regression', format: 'quick', uids: ['a', 'b'], names: { a: 'Otto', b: 'Jonas' } }],
    ['live_rounds/room', { motion: 'The original topic.', proUid: 'a', conUid: 'b', proName: 'Otto', conName: 'Jonas', speechIdx: 0 }],
  ]);
  let lock = Promise.resolve(), writes = 0;
  const materialize = value => value instanceof FieldValue ? Date.now()
    : Array.isArray(value) ? value.map(materialize)
    : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([k, v]) => [k, materialize(v)])) : value;
  const db = {
    collection: name => ({ doc: id => ({ path: name + '/' + id }) }),
    runTransaction(fn) {
      const job = lock.then(async () => {
        const pending = [];
        const result = await fn({
          get: async ref => ({ exists: rows.has(ref.path), data: () => structuredClone(rows.get(ref.path)) }),
          set: (ref, patch, opts) => pending.push(() => {
            rows.set(ref.path, { ...(opts?.merge ? rows.get(ref.path) : {}), ...materialize(patch) }); writes++;
          }),
        });
        pending.forEach(write => write()); return result;
      });
      lock = job.catch(() => {}); return job;
    },
  };
  return {
    rows, writes: () => writes,
    round: () => structuredClone(rows.get('live_rounds/room')),
    action: (uid, action, extra = {}) => runDraftAction(db, uid, { room: 'room', action, ...extra }),
  };
}
