// /api/topic-pulse — approved live-discourse motions, public read.
//
// Serves the admin-approved half of the X pulse to every client-side
// motion surface: RANDOM_MOTIONS on /practice, MOTION_BANK on /live, and
// WARMUP_MOTIONS on /spar. Those banks stay hardcoded and keep working;
// this adds a live tier on top, so a network failure here costs the
// freshness and nothing else.
//
// Only status:'approved' content is reachable from this endpoint. It
// reads topic_pulse/current, which admin-pulse.mjs rebuilds from
// approved candidates, so there is no path from a pending candidate to a
// public response even if the query were wrong.
//
// Query params:
//   ?format=apda   filter motions to one format slug
//   ?limit=20      cap motions returned (default 20, max 60)
//   ?full=1        include fault-line discourse fields (for /contested)
//
// Cached hard at the edge: this changes only when an admin approves
// something, and a 10-minute stale window on a debate motion is free.

import { getDb } from './lib/firestore.mjs';
import { corsResponse, errorResponse } from './lib/response.mjs';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 60;

// In-instance cache. A warm Lambda serving the motion pool should not
// re-read Firestore for every visitor.
let cache = { data: null, at: 0 };
const CACHE_MS = 10 * 60 * 1000;

async function readPulse() {
  if (cache.data && Date.now() - cache.at < CACHE_MS) return cache.data;

  const db = getDb();
  const doc = await db.collection('topic_pulse').doc('current').get();
  const data = doc.exists ? (doc.data() || {}) : {};
  const payload = {
    faultLines: Array.isArray(data.faultLines) ? data.faultLines : [],
    updatedAt: data.updatedAt && typeof data.updatedAt.toMillis === 'function'
      ? data.updatedAt.toMillis() : null,
  };
  cache = { data: payload, at: Date.now() };
  return payload;
}

export default async (request) => {
  if (request.method === 'OPTIONS') return corsResponse(request);
  if (request.method !== 'GET') return errorResponse('Method not allowed', 405, request);

  const url = new URL(request.url);
  const format = (url.searchParams.get('format') || '').toLowerCase().slice(0, 20);
  const full = url.searchParams.get('full') === '1';
  let limit = parseInt(url.searchParams.get('limit') || String(DEFAULT_LIMIT), 10);
  if (!Number.isFinite(limit) || limit < 1) limit = DEFAULT_LIMIT;
  limit = Math.min(limit, MAX_LIMIT);

  try {
    const pulse = await readPulse();

    // Flatten fault lines into a motion list, carrying enough parent
    // context that a client can show why a motion exists.
    const motions = [];
    for (const line of pulse.faultLines) {
      for (const m of (line.motions || [])) {
        if (format && m.format !== format) continue;
        motions.push({
          motion: m.text,
          bg: m.bg || '',
          format: m.format,
          domain: line.domain,
          domainLabel: line.domainLabel,
          headline: line.headline,
          heat: line.heat || 3,
          source: 'pulse',
        });
      }
    }

    // Interleave domains so a caller taking the first N does not get
    // eight motions about the same argument. Round-robin by domain,
    // preserving the heat ordering within each.
    const byDomain = new Map();
    for (const m of motions) {
      if (!byDomain.has(m.domain)) byDomain.set(m.domain, []);
      byDomain.get(m.domain).push(m);
    }
    const spread = [];
    let drained = false;
    for (let i = 0; !drained; i++) {
      drained = true;
      for (const list of byDomain.values()) {
        if (i < list.length) { spread.push(list[i]); drained = false; }
      }
    }

    const body = {
      motions: spread.slice(0, limit),
      total: spread.length,
      updatedAt: pulse.updatedAt,
    };

    if (full) {
      body.faultLines = pulse.faultLines.map(l => ({
        headline: l.headline,
        summary: l.summary,
        domain: l.domain,
        domainLabel: l.domainLabel,
        sideA: l.sideA,
        sideB: l.sideB,
        vocabulary: l.vocabulary,
        actors: l.actors,
        heat: l.heat,
        citations: (l.citations || []).slice(0, 6),
        motions: l.motions,
      }));
    }

    return new Response(JSON.stringify(body), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        // Public, non-personalized, changes only on approval.
        'Cache-Control': 'public, max-age=600, s-maxage=600',
      },
    });
  } catch (err) {
    console.error('topic-pulse error:', err);
    // Degrade to empty rather than erroring: every caller treats this as
    // an optional extra tier on top of a working hardcoded bank.
    return new Response(JSON.stringify({ motions: [], total: 0, updatedAt: null }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=60',
      },
    });
  }
};

export const config = {
  path: '/api/topic-pulse',
};
