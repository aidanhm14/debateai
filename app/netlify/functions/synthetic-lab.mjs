import { createHmac, randomUUID } from 'node:crypto';
import { getDb } from './lib/firestore.mjs';
import { callerIp } from './lib/rate-limit.mjs';
import { authConfig, verifyPassword, issueSession, readSession, sessionCookie, permittedOrigin } from './lib/synthetic-lab-auth.mjs';
import { assert, hash, RUBRIC, VERSION, validateExamples, reviewTemplate, exportData, scorePredictions } from './lib/synthetic-lab-core.mjs';
import { EXAMPLES, LAB_CONFIG, advance, publicJob } from './lib/synthetic-lab-engine.mjs';

const RUNS = 'synthetic_lab_runs', CONTROL = 'synthetic_lab_control';
const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const respond = (value, status = 200, extra = {}) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'private, no-store', 'Netlify-CDN-Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow, noarchive', 'X-Content-Type-Options': 'nosniff', ...extra } });
const docId = value => { if (typeof value !== 'string' || !/^[a-f0-9-]{36}$/.test(value)) throw fail('Invalid round.'); return value; };
async function consume(db, keys) {
  await db.runTransaction(async tx => {
    const refs = keys.map(k => db.collection(CONTROL).doc(k.id));
    const docs = await Promise.all(refs.map(r => tx.get(r)));
    docs.forEach((doc, i) => { if ((doc.data()?.count || 0) >= keys[i].max) throw fail('Too many attempts. Please try again later.', 429); });
    refs.forEach((ref, i) => tx.set(ref, { count: (docs[i].data()?.count || 0) + 1, expiresAt: Date.now() + keys[i].window }));
  });
}
function exampleFrom(body) {
  if (body.exampleId) {
    const example = EXAMPLES.find(e => e.id === body.exampleId);
    if (!example) throw fail('Choose an example.');
    return example;
  }
  const motion = String(body.motion || '').trim();
  const context = String(body.context || '').trim();
  const evidenceText = String(body.evidence || '').trim();
  assert(motion.length <= 500 && context.length <= 4000 && evidenceText.length <= 8000, 'Example is too long.');
  const normalized = motion.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
  const family = String(body.family || '').trim().toLowerCase();
  assert(/^[a-z0-9][a-z0-9-]{2,79}$/.test(family), 'Give related examples one topic family, using lowercase words and hyphens.');
  const example = { id: `custom-${hash(normalized).slice(0, 16)}`, family, motion, context, evidence: evidenceText ? [evidenceText] : [] };
  validateExamples([example]); return example;
}
export function createHandler({ database = getDb, advanceRound = advance } = {}) {
return async function handler(request) {
  try {
    const config = authConfig();
    if (!config) return respond({ error: 'The private lab is being configured. Try again shortly.' }, 503);
    const url = new URL(request.url);
    if (!['GET', 'POST'].includes(request.method)) return respond({ error: 'Method not allowed.' }, 405);
    const session = readSession(request.headers.get('cookie'), config);
    if (request.method === 'GET') {
      if (!session) return respond({ error: 'Enter the access code to open the lab.' }, 401);
      const db = database();
      if (url.searchParams.has('id')) {
        const snap = await db.collection(RUNS).doc(docId(url.searchParams.get('id'))).get();
        if (!snap.exists) return respond({ error: 'Round not found.' }, 404);
        const job = snap.data();
        return respond({ job: { ...publicJob(job), ...(url.searchParams.get('raw') === '1' ? { calls: job.calls, version: job.version, rubricHash: job.rubricHash, configurationNotes: job.configurationNotes || [] } : {}) } });
      }
      const snap = await db.collection(RUNS).orderBy('createdAt', 'desc').limit(60).get();
      return respond({ examples: EXAMPLES, models: LAB_CONFIG.roles, runs: snap.docs.map(d => { const j = d.data(); return { id: j.id, motion: j.example.motion, status: j.status, createdAt: j.createdAt, split: j.record?.split || null, reviewStatus: j.review?.status || 'pending', steps: j.calls.length }; }), limits: { roundsPerDay: 40 } });
    }
    if (!permittedOrigin(request)) return respond({ error: 'This request must come from the Debatable lab.' }, 403);
    if (!(request.headers.get('content-type') || '').startsWith('application/json')) return respond({ error: 'Expected JSON.' }, 415);
    const text = await request.text(); if (text.length > 80000) return respond({ error: 'Request is too large.' }, 413);
    let body; try { body = JSON.parse(text); } catch { return respond({ error: 'Invalid JSON.' }, 400); }
    if (!body || typeof body !== 'object' || Array.isArray(body)) return respond({ error: 'Invalid request.' }, 400);
    if (body.action === 'login') {
      const db = database(), window = 15 * 60 * 1000, bucket = Math.floor(Date.now() / window);
      const ip = createHmac('sha256', config.key).update(callerIp(request)).digest('hex').slice(0, 32);
      await consume(db, [{ id: `login-${bucket}-${ip}`, max: 8, window }, { id: `login-all-${bucket}`, max: 200, window }]);
      if (!await verifyPassword(body.password, config)) return respond({ error: 'That access code is not correct.' }, 401);
      return respond({ ok: true }, 200, { 'Set-Cookie': sessionCookie(issueSession(config)) });
    }
    if (!session) return respond({ error: 'Your session has expired. Enter the access code again.' }, 401);
    if (body.action === 'logout') return respond({ ok: true }, 200, { 'Set-Cookie': sessionCookie() });
    const db = database();
    if (body.action === 'create') {
      assert(process.env.OPENAI_API_KEY && process.env.ANTHROPIC_API_KEY, 'A model provider is unavailable.');
      const example = exampleFrom(body); validateExamples([example]);
      const id = randomUUID(), now = Date.now();
      const job = { id, version: VERSION, rubricHash: hash(RUBRIC), example, config: { ...LAB_CONFIG, recordId: id }, variant: body.swap === true ? 1 : 0, createdAt: now, updatedAt: now, status: 'paused', attempts: 0, calls: [], error: '', lease: null, review: null, record: null };
      const day = new Date().toISOString().slice(0, 10);
      const familyId = hash(example.motion.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, ''));
      const familyRef = db.collection(CONTROL).doc(`family-${familyId}`), countRef = db.collection(CONTROL).doc(`rounds-${day}`);
      await db.runTransaction(async tx => {
        const [family, count] = await Promise.all([tx.get(familyRef), tx.get(countRef)]);
        if (family.exists && family.data().family !== example.family) throw fail('This topic already belongs to family ' + family.data().family + '. Keep its existing family.');
        if ((count.data()?.count || 0) >= 40) throw fail('The lab has reached its 40-round daily cap. Continue tomorrow.', 429);
        tx.set(familyRef, { family: example.family }); tx.set(countRef, { count: (count.data()?.count || 0) + 1 });
        tx.create(db.collection(RUNS).doc(id), job);
      });
      return respond({ job: publicJob(job) }, 201);
    }
    if (body.action === 'export' || body.action === 'benchmark') {
      const snap = await db.collection(RUNS).where('reviewStatus', '==', 'approved').limit(201).get();
      assert(snap.docs.length <= 200, 'This export exceeds 200 reviewed rounds. Export a smaller collection before expanding the lab.');
      const jobs = snap.docs.map(d => d.data());
      const data = jobs.length ? exportData(jobs.map(j => j.record), jobs.map(j => j.review)) : {};
      if (body.action === 'benchmark') {
        assert(Array.isArray(body.predictions) && body.predictions.length <= 200, 'Supply at most 200 prediction rows.');
        const labels = data['judge-test-labels'] || [];
        return respond({ score: scorePredictions(labels, body.predictions) });
      }
      return respond({ datasets: data, reviewedRounds: jobs.length, version: VERSION, createdAt: new Date().toISOString() });
    }
    const ref = db.collection(RUNS).doc(docId(body.id));
    if (body.action === 'step') {
      assert(Number.isInteger(body.expectedStep) && body.expectedStep >= 0, 'Expected step is required.');
      const leaseId = randomUUID(), day = new Date().toISOString().slice(0, 10), budget = db.collection(CONTROL).doc(`calls-${day}`);
      const claimed = await db.runTransaction(async tx => {
        const [snap, usage] = await Promise.all([tx.get(ref), tx.get(budget)]);
        if (!snap.exists) throw fail('Round not found.', 404);
        const job = snap.data();
        if (job.status === 'complete' || job.calls.length !== body.expectedStep) return { job, claimed: false };
        if (job.lease?.until > Date.now()) throw fail('This round is already working on that step. Wait a moment, then resume.', 409);
        if (job.attempts >= 22) throw fail('This round reached its retry limit. Export its record and start another.', 429);
        if ((usage.data()?.count || 0) >= 800) throw fail('The lab has reached its daily model-call cap.', 429);
        job.lease = { id: leaseId, until: Date.now() + 90000 }; job.attempts++; job.status = 'running'; job.error = '';
        tx.set(ref, job); tx.set(budget, { count: (usage.data()?.count || 0) + 1 }); return { job, claimed: true };
      });
      if (!claimed.claimed) return respond({ job: publicJob(claimed.job) });
      try {
        const update = await advanceRound(claimed.job);
        const job = { ...claimed.job, ...update, updatedAt: Date.now(), lease: null, error: '' };
        if (job.status === 'complete') job.review = reviewTemplate(job.record);
        assert(Buffer.byteLength(JSON.stringify(job)) < 850000, 'This round exceeds the storage limit.');
        await db.runTransaction(async tx => { const fresh = await tx.get(ref); if (fresh.data()?.lease?.id !== leaseId) throw fail('This step was superseded. Reload the round.', 409); tx.set(ref, job); });
        return respond({ job: publicJob(job) });
      } catch (error) {
        await db.runTransaction(async tx => { const fresh = await tx.get(ref); if (fresh.data()?.lease?.id === leaseId) tx.update(ref, { status: 'paused', lease: null, error: String(error.message).slice(0, 250), updatedAt: Date.now() }); });
        throw fail(error.message || 'This step failed. Progress is saved; resume to retry.', 502);
      }
    }
    if (body.action === 'review') {
      const snap = await ref.get(); if (!snap.exists) throw fail('Round not found.', 404);
      const job = snap.data(); assert(job.status === 'complete', 'Finish the round before reviewing.');
      const review = { ...reviewTemplate(job.record), status: 'approved', reviewer: String(body.reviewer || '').trim().slice(0, 100), factualChecksResolved: body.factualChecksResolved === true, finalJudgment: body.finalJudgment ?? null, approvedRepairIds: body.approvedRepairIds || [], notes: String(body.notes || '').slice(0, 4000), reviewedAt: new Date().toISOString() };
      // Exercise the actual exporter before accepting a review.
      exportData([job.record], [review]);
      await ref.update({ review, reviewStatus: 'approved', updatedAt: Date.now() });
      return respond({ job: publicJob({ ...job, review, reviewStatus: 'approved' }) });
    }
    return respond({ error: 'Unknown action.' }, 400);
  } catch (error) {
    const status = error.status || 400;
    return respond({ error: String(error.message || 'The request failed.').slice(0, 300) }, status);
  }
}
}
export default createHandler();
export const config = { path: '/api/synthetic-lab' };
