/* A brief exchange ends at a heard reply, never just at generation.done.
 * https://developers.openai.com/api/reference/resources/realtime/server-events#output_audio_buffer.stopped
 * No transcript is stored here, only turn IDs and whether speech had substance.
 */
(function (root) {
  'use strict';
  root.DBVoicePreviewMomentum = {
    create: function (startedAt) {
      var users = new Map(), replies = new Map(), seen = new Set();
      var lastUser = '', speaking = false, playing = new Set(), opening = true;
      function reply(id) {
        if (!id) return null;
        if (!replies.has(id)) replies.set(id, { user: '', completed: false, heard: false, interrupted: false });
        return replies.get(id);
      }
      function answered() {
        var ids = new Set();
        replies.forEach(function (r) {
          if (r.completed && r.heard && !r.interrupted && users.get(r.user)) ids.add(r.user);
        });
        return ids;
      }
      function ready(now) {
        var ids = answered();
        return now - startedAt >= 12000 && ids.size >= 2 && ids.has(lastUser) && !speaking && !playing.size;
      }
      return {
        ready: ready,
        handle: function (e, now) {
          if (!e || (e.event_id && seen.has(e.event_id))) return false;
          if (e.event_id) seen.add(e.event_id);
          var r;
          switch (e.type) {
            case 'input_audio_buffer.speech_started': speaking = true; break;
            case 'input_audio_buffer.speech_stopped':
              speaking = false; lastUser = e.item_id || ''; break;
            case 'conversation.item.input_audio_transcription.completed': {
              var text = String(e.transcript || '').trim();
              // Reject a cough/backchannel; retain non-space-delimited languages.
              var meaningful = (text.match(/[\p{L}\p{N}]+/gu) || []).length >= 3 || (text.match(/[\p{L}\p{N}]/gu) || []).length >= 12;
              if (e.item_id) users.set(e.item_id, meaningful);
              break;
            }
            case 'response.created':
              r = reply(e.response && e.response.id);
              // The first requested response is our opener, even if the
              // person managed to speak before its created event arrived.
              if (r) { r.user = opening ? '' : lastUser; opening = false; }
              break;
            case 'output_audio_buffer.started':
              if (e.response_id) playing.add(e.response_id);
              break;
            case 'response.done':
              r = reply(e.response && e.response.id);
              if (r) r.completed = e.response.status === 'completed';
              break;
            case 'output_audio_buffer.stopped':
              playing.delete(e.response_id);
              r = reply(e.response_id); if (r) r.heard = true;
              break;
            case 'output_audio_buffer.cleared':
              playing.delete(e.response_id);
              r = reply(e.response_id); if (r) r.interrupted = true;
              break;
          }
          return ready(now);
        },
        summary: function () { return { answeredTurns: answered().size }; }
      };
    }
  };
})(window);
