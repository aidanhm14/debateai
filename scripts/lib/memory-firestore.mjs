// A deterministic transaction/query fixture. It does not model Firestore
// transport, indexes, billing, latency or distributed transaction retries.
export function memoryFirestore(entries = []) {
  const data = new Map(entries.map(([key, value]) => [key, structuredClone(value)]));
  const metrics = { reads: 0, writes: 0, queries: 0, transactions: 0 };
  let tail = Promise.resolve();
  const snapshot = path => {
    metrics.reads++;
    const value = structuredClone(data.get(path));
    return { id: path.split('/').at(-1), exists: data.has(path), data: () => value };
  };
  const write = (path, value, merge) => {
    metrics.writes++;
    data.set(path, merge ? { ...data.get(path), ...structuredClone(value) } : structuredClone(value));
  };
  const doc = path => ({ path, get: async () => snapshot(path),
    set: async (value, options) => write(path, value, options?.merge),
    update: async value => write(path, value, true) });
  function query(collection, filters = [], count = Infinity, cursor = '') {
    return {
      doc: id => doc(collection + '/' + id),
      where: (key, op, value) => query(collection, [...filters, [key, op, value]], count, cursor),
      orderBy: () => query(collection, filters, count, cursor),
      limit: n => query(collection, filters, n, cursor),
      startAfter: id => query(collection, filters, count, id),
      get: async () => {
        metrics.queries++;
        const paths = [...data.keys()].filter(path => path.startsWith(collection + '/') && path.split('/').length === 2)
          .sort().filter(path => path.split('/')[1] > cursor).filter(path => filters.every(([key, op, value]) => {
            if (op !== '==') throw new Error('Unsupported fixture filter: ' + op);
            return data.get(path)[key] === value;
          })).slice(0, count);
        const docs = paths.map(snapshot);
        return { docs, empty: !docs.length, size: docs.length, forEach: fn => docs.forEach(fn) };
      },
    };
  }
  const db = { collection: name => query(name), getAll: async (...refs) => refs.map(r => snapshot(r.path)),
    runTransaction(fn) {
      metrics.transactions++;
      const next = tail.then(async () => {
        const writes = [];
        const result = await fn({
          get: async ref => { if (writes.length) throw new Error('Transaction read after write'); return snapshot(ref.path); },
          set: (ref, value, options) => writes.push([ref.path, value, options?.merge]),
          update: (ref, value) => writes.push([ref.path, value, true]),
        });
        writes.forEach(args => write(...args));
        return result;
      });
      tail = next.catch(() => {});
      return next;
    },
  };
  return { db, data, metrics };
}
