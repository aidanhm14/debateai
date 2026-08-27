import assert from 'node:assert/strict';
import { withSseHeartbeat } from '../app/netlify/functions/lib/sse-heartbeat.mjs';

const enc = new TextEncoder();
const dec = new TextDecoder();
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function collect(stream) {
  const reader = stream.getReader();
  let text = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) return text;
    text += dec.decode(value, { stream: true });
  }
}

function delayedStream(parts) {
  return new ReadableStream({
    async start(controller) {
      for (const part of parts) {
        if (part.wait) await wait(part.wait);
        if (part.text) controller.enqueue(enc.encode(part.text));
      }
      controller.close();
    },
  });
}

{
  const original = delayedStream([{ text: 'data: ok\n\n' }]);
  assert.equal(withSseHeartbeat(original, false, 5), original, 'disabled wrapper must be a no-op');
}

{
  const output = await collect(withSseHeartbeat(delayedStream([
    { text: 'data: first\n\n' },
    { wait: 45 },
    { text: 'data: second\n\n' },
  ]), true, 10));
  assert.match(output, /data: first\n\n: keepalive\n\n/,
    'a silent gap after an event boundary must receive a heartbeat');
  assert.match(output, /data: second\n\n$/);
}

{
  const output = await collect(withSseHeartbeat(delayedStream([
    { text: 'data: {"partial":' },
    { wait: 35 },
    { text: 'true}\n' },
    { wait: 5 },
    { text: '\n' },
    { wait: 35 },
  ]), true, 10));
  assert.ok(!output.includes('data: {"partial":: keepalive'),
    'a heartbeat must never be spliced into a partial SSE event');
  assert.match(output, /data: \{"partial":true\}\n\n(?:\: keepalive\n\n)+$/,
    'split event boundaries must still be recognized');
}

console.log('sse heartbeat: all assertions passed');
