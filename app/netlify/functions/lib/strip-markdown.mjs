// Streaming markdown scrubber for brain-endpoint SSE responses.
//
// Strips markdown formatting characters from model output as it streams,
// so plain-text-only outputs reach the client even when a model occasionally
// slips a ## header or **bold** through despite the prompt and voice rules.
//
// Removed characters when used as formatting:
//   - Hash characters that open a markdown header (## or ### at start of a
//     line, optionally after whitespace), including the trailing space.
//   - Asterisks used for bold/italic markers (** and __ pairs, plus
//     standalone * / _ when delimiting word content). Bullet-leading
//     "* " / "- " / "+ " gets normalized to plain indent so list visual
//     indentation is preserved without the marker.
//   - Backtick fences (```), since we never emit code blocks.
//
// Three transforms are exported:
//   - transformAnthropicSSE: Anthropic SSE (content_block_delta.text)
//   - transformOpenAISSE:    OpenAI / Grok / Perplexity SSE (choices[].delta.content)
//   - transformGeminiArray:  Gemini :streamGenerateContent (candidates[].content.parts[].text)
// All three accept a ReadableStream, return a ReadableStream, and pass
// anything they can't parse through unchanged.
//
// scrubPlainText() is also exported for non-streaming JSON responses
// (e.g., perplexity's news fetch returns one consolidated string).

const STRIP_PASSTHROUGH = false; // flip to true to disable scrubbing

function scrubPlainText(text) {
  if (!text) return text;
  let s = text;
  s = s.replace(/```+/g, '');
  s = s.replace(/(^|\n)[ \t]*#{1,6}[ \t]+/g, '$1');
  s = s.replace(/\*\*([^*\n]+?)\*\*/g, '$1');
  s = s.replace(/__([^_\n]+?)__/g, '$1');
  s = s.replace(/(^|[\s(])\*([^*\n][^*\n]*?)\*([\s).,!?;:]|$)/g, '$1$2$3');
  s = s.replace(/(^|[\s(])_([^_\n][^_\n]*?)_([\s).,!?;:]|$)/g, '$1$2$3');
  s = s.replace(/(^|\n)[ \t]*[*+\-][ \t]+/g, '$1');
  s = s.replace(/\*\*/g, '');
  s = s.replace(/__/g, '');
  s = s.replace(/(^|[\s(])\*(?=[\s).,!?;:]|$)/g, '$1');
  s = s.replace(/#{1,6}/g, '');
  return s;
}

function transformAnthropicSSE(stream) {
  if (STRIP_PASSTHROUGH || !stream) return stream;
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buf = '';
  return new ReadableStream({
    async start(controller) {
      const reader = stream.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            if (buf) controller.enqueue(encoder.encode(buf));
            controller.close();
            return;
          }
          buf += decoder.decode(value, { stream: true });
          let idx;
          while ((idx = buf.indexOf('\n\n')) !== -1) {
            const message = buf.slice(0, idx + 2);
            buf = buf.slice(idx + 2);
            controller.enqueue(encoder.encode(rewriteAnthropicMessage(message)));
          }
        }
      } catch (err) {
        controller.error(err);
      }
    },
  });
}

function rewriteAnthropicMessage(message) {
  const lines = message.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.startsWith('data: ')) continue;
    const payload = line.slice(6).trim();
    if (!payload || payload === '[DONE]') continue;
    let obj;
    try { obj = JSON.parse(payload); } catch { continue; }
    if (obj && obj.type === 'content_block_delta' && obj.delta && obj.delta.type === 'text_delta' && typeof obj.delta.text === 'string') {
      const before = obj.delta.text;
      const after = scrubPlainText(before);
      if (after !== before) {
        obj.delta.text = after;
        lines[i] = 'data: ' + JSON.stringify(obj);
      }
    }
  }
  return lines.join('\n');
}

function transformOpenAISSE(stream) {
  if (STRIP_PASSTHROUGH || !stream) return stream;
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buf = '';
  return new ReadableStream({
    async start(controller) {
      const reader = stream.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            if (buf) controller.enqueue(encoder.encode(buf));
            controller.close();
            return;
          }
          buf += decoder.decode(value, { stream: true });
          let idx;
          while ((idx = buf.indexOf('\n\n')) !== -1) {
            const message = buf.slice(0, idx + 2);
            buf = buf.slice(idx + 2);
            controller.enqueue(encoder.encode(rewriteOpenAIMessage(message)));
          }
        }
      } catch (err) {
        controller.error(err);
      }
    },
  });
}

function rewriteOpenAIMessage(message) {
  const lines = message.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.startsWith('data: ')) continue;
    const payload = line.slice(6).trim();
    if (!payload || payload === '[DONE]') continue;
    let obj;
    try { obj = JSON.parse(payload); } catch { continue; }
    let mutated = false;
    if (obj && Array.isArray(obj.choices)) {
      for (const choice of obj.choices) {
        if (choice && choice.delta && typeof choice.delta.content === 'string') {
          const after = scrubPlainText(choice.delta.content);
          if (after !== choice.delta.content) { choice.delta.content = after; mutated = true; }
        }
        if (choice && choice.message && typeof choice.message.content === 'string') {
          const after = scrubPlainText(choice.message.content);
          if (after !== choice.message.content) { choice.message.content = after; mutated = true; }
        }
      }
    }
    if (mutated) lines[i] = 'data: ' + JSON.stringify(obj);
  }
  return lines.join('\n');
}

function transformGeminiArray(stream) {
  if (STRIP_PASSTHROUGH || !stream) return stream;
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buf = '';
  let depth = 0;
  let inString = false;
  let escape = false;
  let objStart = -1;
  return new ReadableStream({
    async start(controller) {
      const reader = stream.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            if (buf) controller.enqueue(encoder.encode(buf));
            controller.close();
            return;
          }
          const chunk = decoder.decode(value, { stream: true });
          let out = '';
          for (let i = 0; i < chunk.length; i++) {
            const c = chunk[i];
            buf += c;
            if (escape) { escape = false; continue; }
            if (c === '\\' && inString) { escape = true; continue; }
            if (c === '"') { inString = !inString; continue; }
            if (inString) continue;
            if (c === '{') {
              if (depth === 0) objStart = buf.length - 1;
              depth++;
            } else if (c === '}') {
              depth--;
              if (depth === 0 && objStart >= 0) {
                const objText = buf.slice(objStart, buf.length);
                let parsed;
                try { parsed = JSON.parse(objText); } catch { parsed = null; }
                if (parsed && Array.isArray(parsed.candidates)) {
                  let mutated = false;
                  for (const cand of parsed.candidates) {
                    const parts = cand && cand.content && cand.content.parts;
                    if (Array.isArray(parts)) {
                      for (const p of parts) {
                        if (p && typeof p.text === 'string') {
                          const after = scrubPlainText(p.text);
                          if (after !== p.text) { p.text = after; mutated = true; }
                        }
                      }
                    }
                  }
                  if (mutated) {
                    const replaced = JSON.stringify(parsed);
                    out += buf.slice(0, objStart) + replaced;
                    buf = '';
                  } else {
                    out += buf;
                    buf = '';
                  }
                } else {
                  out += buf;
                  buf = '';
                }
                objStart = -1;
              }
            }
          }
          if (out) controller.enqueue(encoder.encode(out));
        }
      } catch (err) {
        controller.error(err);
      }
    },
  });
}

export {
  scrubPlainText,
  transformAnthropicSSE,
  transformOpenAISSE,
  transformGeminiArray,
};
