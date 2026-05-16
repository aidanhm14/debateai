// Keep-alive ping. Hits each brain function every 5 minutes so the
// underlying Netlify Functions Lambda containers stay warm. Cold
// starts on the brain functions add 2-5 seconds to the first request
// after an idle period — painful for the first user of the morning,
// or anyone who hits the site after a quiet stretch.
//
// This is a no-op against the upstream LLMs: we don't actually call
// Anthropic/OpenAI/Gemini/Grok. We invoke the function URLs with a
// special header that the brain functions check and short-circuit on,
// returning 204 No Content. Keeps the container loaded (modules,
// Firestore client, voice-guidelines bank) without burning API
// credits.
//
// If you ever need to disable, just delete this file. The brain
// functions still work without it; first call after idle just gets
// the cold-start penalty back.

const BRAINS = ['claude', 'openai-chat', 'gemini', 'grok'];

export default async (req) => {
  const origin = new URL(req.url).origin;

  const results = await Promise.allSettled(
    BRAINS.map(async (name) => {
      const start = Date.now();
      try {
        const res = await fetch(`${origin}/.netlify/functions/${name}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Keepalive': '1',
          },
          body: '{}',
        });
        return { name, status: res.status, ms: Date.now() - start };
      } catch (err) {
        return { name, error: err.message, ms: Date.now() - start };
      }
    })
  );

  return new Response(
    JSON.stringify({
      ok: true,
      at: new Date().toISOString(),
      results: results.map((r) => r.value || r.reason),
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
};

// Every 15 minutes. Dropped from 5-min on 2026-05-16 because the
// 5-min cadence × 5 invocations per run (1 cron + 4 brain pings) =
// ~43K invocations/month from keepalive alone — 35% of the Netlify
// free-tier quota. 15-min still hits warm containers most of the
// time (user traffic also keeps them warm), and the few extra cold
// starts during off-peak hours are barely user-perceptible.
export const config = {
  schedule: '*/15 * * * *',
};
