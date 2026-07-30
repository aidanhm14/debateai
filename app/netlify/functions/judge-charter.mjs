// Public judge charter. The rubric, the season model pin, the fee
// policy, the appeal route, and what gets logged.
//
// This endpoint is the "published before the round" half of fix 1. It is
// deliberately unauthenticated and cached: a debater has to be able to
// read the criteria before they speak, and a plaintiff's lawyer has to
// be able to fetch the exact document a ballot's hash refers to.
//
// `running` reports what this deployment is actually configured to do,
// next to the pin rather than in place of it. A disclosed deviation from
// the pin is acceptable and sometimes necessary; a quiet one is the
// entire problem this layer exists to solve, so an override or an
// unavailable juror shows up here rather than nowhere.
import { corsResponse, errorResponse } from './lib/response.mjs';
import { charterDoc, seasonFor } from './lib/judge-charter.mjs';
import { jurorAvailable } from './lib/judge-jurors.mjs';

const PANEL_ENABLED = process.env.JUDGE_PANEL_ENABLED !== '0';
const REQUIRE_PANEL = process.env.JUDGE_REQUIRE_PANEL === '1';
const ASYNC_JUDGE_MODEL = process.env.ASYNC_JUDGE_MODEL || 'claude-sonnet-5';

function runningState(nowMs) {
  const season = seasonFor(nowMs);
  const jurors = ((season.panel && season.panel.jurors) || []).map((j) => ({
    id: j.id,
    provider: j.provider,
    pinnedModel: j.model,
    available: jurorAvailable(j),
  }));
  const available = jurors.filter((j) => j.available).length;
  const quorum = (season.panel && season.panel.quorum) || 2;

  // The single-judge fallback model. If this is not the season's pinned
  // primary, that is an override and it is named here.
  const primary = ((season.panel && season.panel.jurors) || [])[0];
  const pinnedPrimary = primary ? primary.model : '';

  return {
    panelEnabled: PANEL_ENABLED,
    requirePanel: REQUIRE_PANEL,
    jurors,
    jurorsAvailable: available,
    // The honest headline. When this is false, ballots are being written
    // by a single judge and every audit record for them says so.
    panelConstitutable: PANEL_ENABLED && !!season.panel && available >= quorum,
    fallbackModel: ASYNC_JUDGE_MODEL,
    fallbackIsPinned: !pinnedPrimary || ASYNC_JUDGE_MODEL === pinnedPrimary,
    ...(pinnedPrimary && ASYNC_JUDGE_MODEL !== pinnedPrimary
      ? { override: { pinned: pinnedPrimary, running: ASYNC_JUDGE_MODEL, note: 'Single-judge fallback is running a model other than the season pin. Every ballot it writes is stamped as an override.' } }
      : {}),
  };
}

export default async (request) => {
  if (request.method === 'OPTIONS') return corsResponse(request);
  if (request.method !== 'GET') return errorResponse('GET only', 405, request);

  const now = Date.now();
  const doc = charterDoc(now, runningState(now));

  // Cacheable at the edge. The charter changes when a season changes,
  // which is a deploy, so an hour of staleness is fine and it keeps a
  // public unauthenticated endpoint from being a load surface.
  return new Response(JSON.stringify(doc), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=300, s-maxage=3600',
      'Access-Control-Allow-Origin': '*',
    },
  });
};

export const config = { path: '/api/judge/charter' };
