import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../app/judge.html', import.meta.url), 'utf8');
const start = source.indexOf('  function modelText(chunk){');
const end = source.indexOf('\n  function brainHeaders(brainKey){', start);
assert.ok(start >= 0 && end > start, 'judge transport helpers must remain discoverable');

const context = {};
vm.createContext(context);
vm.runInContext(source.slice(start, end), context);

const ballot = '{"winner":"pro","rfd":"clear decision"}';
const event = (value) => `data: ${JSON.stringify(value)}\n\n`;

{
  const raw = event({ type: 'message_start' })
    + event({ type: 'content_block_start', content_block: { type: 'thinking' } })
    + ': keepalive\n\n';
  const result = context.readModelResponse(raw, 'text/event-stream');
  assert.equal(result.text, '', 'thinking-only SSE must not become parser input');
  assert.equal(result.complete, false, 'thinking-only SSE is incomplete without message_stop');
}

{
  const raw = event({ type: 'content_block_delta', delta: { type: 'text_delta', text: ballot.slice(0, 18) } })
    + ': keepalive\n\n'
    + event({ type: 'content_block_delta', delta: { type: 'text_delta', text: ballot.slice(18) } });
  const result = context.readModelResponse(raw, 'text/event-stream');
  assert.equal(result.text, ballot, 'partial ballot text must still be extracted for diagnostics');
  assert.equal(result.complete, false, 'text without a terminal event must retry instead of parsing');
}

{
  const raw = event({ type: 'content_block_delta', delta: { type: 'text_delta', text: ballot } })
    + 'event: message_stop\n'
    + event({ type: 'message_stop' });
  const result = context.readModelResponse(raw, 'text/event-stream');
  assert.equal(result.text, ballot);
  assert.equal(result.complete, true, 'Anthropic message_stop must complete the stream');
}

{
  const raw = event({ choices: [{ delta: { content: ballot }, finish_reason: null }] })
    + 'data: [DONE]\n\n';
  const result = context.readModelResponse(raw, 'text/event-stream');
  assert.equal(result.text, ballot);
  assert.equal(result.complete, true, 'OpenAI-compatible DONE must complete the stream');
}

{
  const raw = event({ candidates: [{ content: { parts: [{ text: ballot }] }, finishReason: 'STOP' }] });
  const result = context.readModelResponse(raw, 'text/event-stream');
  assert.equal(result.text, ballot);
  assert.equal(result.complete, true, 'Gemini finishReason must complete the stream');
}

{
  const raw = JSON.stringify({ content: [{ type: 'text', text: ballot }] });
  const result = context.readModelResponse(raw, 'application/json');
  assert.equal(result.text, ballot);
  assert.equal(result.complete, true, 'non-stream wrappers remain supported');
}

console.log('judge transport: all assertions passed');
