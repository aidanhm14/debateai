// Keep proxied SSE responses alive while an upstream model is reasoning.
//
// A reasoning model may open a stream and then emit nothing for several
// seconds. Netlify's edge can close that silent connection while preserving
// the original 200 status, which leaves clients holding a truncated response
// that looks like malformed model output. A comment event keeps bytes moving
// without changing what an SSE parser sees.
//
// Heartbeats are injected only at an event boundary. Upstream chunks may split
// an SSE event anywhere, including between the two newlines that terminate it,
// so the rolling tail is load-bearing: inserting a comment into a partial JSON
// event would corrupt the response this helper is meant to protect.

export const SSE_HEARTBEAT_MS = 4_000;

export function withSseHeartbeat(upstream, enabled, heartbeatMs = SSE_HEARTBEAT_MS) {
  if (!upstream || !enabled) return upstream;

  const enc = new TextEncoder();
  const reader = upstream.getReader();
  const intervalMs = Math.max(1, Number(heartbeatMs) || SSE_HEARTBEAT_MS);
  let timer = null;
  let lastAt = Date.now();
  let tail = [];
  let atBoundary = true;

  return new ReadableStream({
    start(controller) {
      timer = setInterval(() => {
        if (!atBoundary || Date.now() - lastAt < intervalMs) return;
        try {
          controller.enqueue(enc.encode(': keepalive\n\n'));
          lastAt = Date.now();
        } catch {}
      }, Math.min(1_000, intervalMs));

      (async () => {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            controller.enqueue(value);
            lastAt = Date.now();
            // Inspect raw bytes rather than decoded text. If a chunk ends in
            // half of a multi-byte character, TextDecoder legitimately emits
            // nothing; treating the previous boundary as current in that
            // case could put a heartbeat inside the character.
            tail = tail.concat(Array.from(value.slice(-4))).slice(-4);
            const n = tail.length;
            atBoundary = (n >= 2 && tail[n - 2] === 10 && tail[n - 1] === 10)
              || (n >= 4 && tail[n - 4] === 13 && tail[n - 3] === 10
                && tail[n - 2] === 13 && tail[n - 1] === 10);
          }
          controller.close();
        } catch (err) {
          try { controller.error(err); } catch {}
        } finally {
          clearInterval(timer);
        }
      })();
    },
    cancel(reason) {
      clearInterval(timer);
      return reader.cancel(reason);
    },
  });
}
