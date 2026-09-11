/* GPT-Live protocol adapter. Transcript rows are display groups, not
   authoritative turns or proof that audio was played. Both speakers can
   grow independently, and the original timed fragments stay on each row. */
(function (root) {
  'use strict';
  function create(options) {
    let ready = false, closing = false, closed = false, serial = 0;
    let closeResolve, closeTimer;
    const seen = new Set(), calls = new Set(), responses = new Map(), speechRequests = new Set();
    let rows = {};
    const id = () => 'db_live_' + (++serial);
    function send(event) {
      if (!ready || closing || closed) return false;
      options.send({ event_id: id(), ...event });
      return true;
    }
    function instruct(content) {
      // Appends are capped at 500 tokens. Short app-owned directives only.
      return send({ type: 'session.instructions.append', delegation_id: null, content: String(content).slice(0, 1200) });
    }
    function speak(content) {
      const eventId = id();
      speechRequests.add(eventId);
      if (!send({ type: 'session.instructions.append', event_id: eventId, delegation_id: null, content: String(content).slice(0, 1200) })) {
        speechRequests.delete(eventId); return false;
      }
      return true;
    }
    function flush() {
      Object.values(rows).forEach(row => options.onCommit && options.onCommit(row));
      rows = {};
    }
    function transcript(event, who) {
      if (typeof event.delta !== 'string' || !event.delta) return;
      let row = rows[who];
      const start = Number(event.start_ms), end = Number(event.end_ms);
      if (!row || start - row.end_ms > 1200) {
        if (row && options.onCommit) options.onCommit(row);
        row = { who, text: '', start_ms: start, end_ms: end, fragments: [] };
        rows[who] = row;
        options.onRow(row);
      }
      row.fragments.push({ delta: event.delta, start_ms: start, end_ms: end });
      row.text += event.delta;
      row.end_ms = Math.max(row.end_ms, end);
      options.onTranscript(row);
    }
    function finish(event) {
      closed = true; closing = false; ready = false;
      clearTimeout(closeTimer);
      flush();
      if (closeResolve) { closeResolve(event); closeResolve = null; }
      if (options.onClosed) options.onClosed(event);
    }
    async function handle(event) {
      if (closed) return;
      if (event.event_id) {
        if (seen.has(event.event_id)) return;
        seen.add(event.event_id);
      }
      if (event.type === 'session.started') {
        ready = true;
        options.onReady();
      } else if (event.type === 'session.instructions.appended' && speechRequests.delete(event.client_event_id)) {
        send({ type: 'session.commentary.append', delegation_id: null, content: 'Begin speaking now, following the instructions just provided, then listen.' });
      } else if (event.type === 'session.input_transcript.delta') transcript(event, 'you');
      else if (event.type === 'session.output_transcript.delta') transcript(event, 'ai');
      else if (event.type === 'session.closed') finish(event);
      else if (event.type === 'session.usage.updated') {
        if (options.onUsage) options.onUsage(event.usage);
      } else if (event.type === 'error') {
        if (options.onError) options.onError(event.error || event);
      } else if (event.type === 'response.event' && !closing) {
        const inner = event.event || {};
        const key = event.delegation_id;
        if (inner.type === 'response.created') responses.set(key, { id: inner.response?.id, calls: [] });
        let response = responses.get(key);
        if (inner.type === 'response.output_item.done' && inner.item?.type === 'function_call') {
          if (!response) { response = { id: inner.response_id, calls: [] }; responses.set(key, response); }
          if (inner.item.call_id && !calls.has(inner.item.call_id)) {
            calls.add(inner.item.call_id);
            response.calls.push(inner.item);
          }
        }
        if (['response.completed', 'response.failed', 'response.incomplete', 'response.cancelled'].includes(inner.type)) {
          responses.delete(key);
          if (inner.type !== 'response.completed') {
            if (options.onError) options.onError({ message: 'The voice control could not finish. Please try again.' });
            return;
          }
          // Terminal snapshots intentionally have output: []. Use collected
          // completed items, execute once, and return every result first.
          if (response?.calls.length) {
            for (const call of response.calls) {
              try { await options.onTool(call); }
              catch (_) { toolOutput(call.call_id, { ok: false, error: 'Voice control failed. Try again.' }); }
              if (closing || closed) return;
            }
            send({ type: 'response.create' });
            if (options.onToolsDone) options.onToolsDone();
          }
        }
      }
    }
    function toolOutput(callId, output) {
      send({ type: 'response.item.create', item: { type: 'function_call_output', call_id: callId, output: JSON.stringify(output) } });
    }
    function close(timeoutMs = 5000) {
      if (closed) return Promise.resolve(null);
      if (closing) return closePromise;
      closing = true;
      closePromise = new Promise(resolve => { closeResolve = resolve; });
      closeTimer = setTimeout(() => finish({ incomplete: true }), timeoutMs);
      try { options.send({ type: 'session.close', event_id: id() }); }
      catch (_) { finish({ incomplete: true }); }
      return closePromise;
    }
    let closePromise;
    return { handle, instruct, speak, toolOutput, flush, close, get ready() { return ready; }, get closing() { return closing; } };
  }
  root.DBLiveVoice = { create };
})(typeof window === 'undefined' ? globalThis : window);
