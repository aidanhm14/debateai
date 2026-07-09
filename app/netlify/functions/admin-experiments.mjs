// /api/admin/experiments → live A/B test results for Mission Control.
//
// Reads the `poll_responses` collection (written by app/js/micro-poll.js)
// and rolls it up per poll → per question-framing variant (`qvariant`).
// This is where the landing "intent" poll's multi-variant framing test
// (identity / goal / brought_you / level / worth_it) and any other A/B
// polls surface as real, comparable numbers.
//
// One bounded scan, cached like the other heavy admin endpoints, with a
// deadline race so a slow/quota-pressured pull degrades to the last
// cached value instead of a platform 502.
//
// NOTE: poll_responses only records ANSWERS (there is no per-variant
// "shown" count in Firestore — that lives in GA4 as micro_poll_shown).
// So we compare response VOLUME and the answer MIX per variant, not a
// true show->answer conversion rate. The dashboard labels it as such.

import { requireAdmin } from './lib/admin-auth.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';
import { getCachedShared, setCachedShared, getStaleShared, TTL_HEAVY } from './lib/admin-cache.mjs';

const MAX_DOCS = 4000;
const DEFAULT_DAYS = 30;
const MAX_DAYS = 180;
const DEADLINE_MS = 8000;

export default async (request) => {
  if (request.method === 'OPTIONS') return corsResponse(request);
  if (request.method !== 'GET') return errorResponse('Method not allowed', 405, request);

  const auth = await requireAdmin(request);
  if (auth.error) return auth.error;
  const { db } = auth;

  const url = new URL(request.url);
  const days = Math.max(1, Math.min(MAX_DAYS, parseInt(url.searchParams.get('days') || String(DEFAULT_DAYS), 10)));
  const cacheKey = 'experiments:' + days;

  const cached = await getCachedShared(cacheKey);
  if (cached) return jsonResponse(cached, 200, request);

  const since = new Date(Date.now() - days * 86_400_000);
  try {
    const snap = await Promise.race([
      db.collection('poll_responses')
        .where('createdAt', '>=', since)
        .orderBy('createdAt', 'desc')
        .limit(MAX_DOCS)
        .get(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('DEADLINE_EXCEEDED_' + DEADLINE_MS + 'ms')), DEADLINE_MS)),
    ]);

    // poll -> { responses, variants: { qvariant -> { responses, choices{}, texts[], lastTs } } }
    const polls = {};
    let total = 0, withText = 0;
    snap.forEach((doc) => {
      const d = doc.data() || {};
      const poll = String(d.poll || 'unknown');
      const variant = String(d.qvariant || d.variant || '(single)');
      const choice = String(d.choice || (d.text ? '(text only)' : '(empty)'));
      const ts = d.createdAt && d.createdAt.toMillis ? d.createdAt.toMillis() : 0;
      total++;
      if (d.text) withText++;

      const P = polls[poll] || (polls[poll] = { poll, responses: 0, variants: {} });
      P.responses++;
      const V = P.variants[variant] || (P.variants[variant] = { variant, responses: 0, choices: {}, texts: [], lastTs: 0 });
      V.responses++;
      V.choices[choice] = (V.choices[choice] || 0) + 1;
      if (ts > V.lastTs) V.lastTs = ts;
      if (d.text && V.texts.length < 6) V.texts.push(String(d.text).slice(0, 160));
    });

    const shaped = Object.values(polls).map((P) => ({
      poll: P.poll,
      responses: P.responses,
      variantCount: Object.keys(P.variants).length,
      variants: Object.values(P.variants)
        .sort((a, b) => b.responses - a.responses)
        .map((V) => ({
          variant: V.variant,
          responses: V.responses,
          share: P.responses ? Math.round((V.responses / P.responses) * 100) : 0,
          lastTs: V.lastTs,
          choices: Object.entries(V.choices)
            .sort((a, b) => b[1] - a[1])
            .map(([label, count]) => ({ label, count, pct: V.responses ? Math.round((count / V.responses) * 100) : 0 })),
          texts: V.texts,
        })),
    })).sort((a, b) => b.responses - a.responses);

    const result = {
      windowDays: days,
      sinceISO: since.toISOString(),
      totalResponses: total,
      withText,
      sampled: snap.size >= MAX_DOCS,
      polls: shaped,
      timestamp: new Date().toISOString(),
    };
    await setCachedShared(cacheKey, result, TTL_HEAVY);
    return jsonResponse(result, 200, request);
  } catch (err) {
    console.error('admin-experiments error:', err);
    const stale = await getStaleShared(cacheKey).catch(() => null);
    if (stale && stale.value) {
      return jsonResponse({ ...stale.value, _stale: true, _staleAgeMs: stale.ageMs, _quota: /RESOURCE_EXHAUSTED|quota/i.test(err.message || '') }, 200, request);
    }
    return errorResponse('Failed to load experiments: ' + (err.message || 'unknown'), 500, request);
  }
};

export const config = { path: '/api/admin/experiments' };
