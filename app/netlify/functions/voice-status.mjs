// Voice availability flag. Read by /js/voice-status.js to decide
// whether to show the voice CTAs or swap them out for typed mode.
//
// Two layers:
//   1. Manual override via VOICE_AI_ENABLED env var. Set to "false" in
//      Netlify dashboard to instantly hide voice everywhere (next
//      visitor pull picks it up — no rebuild needed; env vars are read
//      per-invoke). The intended use is "OpenAI is quota'd, hide voice
//      until billing is restored." Set to "true" or omit to keep voice
//      enabled. Optional VOICE_AI_REASON env var (string) surfaces a
//      reason in the client UI ("Voice AI is at capacity. Try in an
//      hour.").
//   2. Auto-detection (TODO): poll OpenAI billing API and flip the
//      flag when projected usage exceeds budget. Out of scope for v1
//      because it needs a separate billing-tier API key. The structure
//      below leaves room: extend the response shape, don't break it.
//
// Response is cached at the edge for 60s (Cache-Control). Bumping the
// env var takes up to a minute to propagate to all visitors.

export default async (request) => {
  if (request.method === 'OPTIONS'){
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  const raw = String(process.env.VOICE_AI_ENABLED || 'true').trim().toLowerCase();
  // Tolerate '0' / 'no' / 'off' / 'disabled' as falsy aliases — easier
  // to remember than the strict 'false' string when flipping under stress.
  const enabled = !['false','0','no','off','disabled'].includes(raw);
  const reason = String(process.env.VOICE_AI_REASON || '').trim().slice(0, 160);

  return new Response(JSON.stringify({
    enabled,
    reason: enabled ? '' : (reason || 'Voice AI is temporarily unavailable. Typed mode is fully active.'),
    // Forward-compat hooks for the auto-detect layer:
    source: 'env',
    checkedAt: new Date().toISOString(),
  }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=60, stale-while-revalidate=300',
      'Access-Control-Allow-Origin': '*',
    },
  });
};

export const config = { path: '/api/voice-status' };
