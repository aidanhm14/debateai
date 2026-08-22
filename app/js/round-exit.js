/* Round exit capture — the WHY behind unfinished rounds.
 *
 * The round funnel (admin-round-funnel.mjs) can say a round died between
 * "both seated" and "spoke"; nothing anywhere records whether the mic
 * failed, the opponent sat silent, the AI took too long, or the person
 * just had to go. This module is the missing half:
 *
 *   RoundExit.beacon(meta)          passive `round_abandoned` — fire on
 *                                   pagehide mid-round. fetch keepalive
 *                                   via track.js survives the unload.
 *   RoundExit.known(reason, meta)   `round_exit_reason` with no prompt,
 *                                   for bail buttons whose reason is
 *                                   already knowable (opponent no-show,
 *                                   forfeit). Never ask what you know.
 *   RoundExit.ask(opts) -> Promise  the one-tap card. Resolves when the
 *                                   user picks a chip, skips, or after
 *                                   nothing happens for 30s (so a caller
 *                                   awaiting it to navigate can never be
 *                                   trapped by an unanswered prompt).
 *
 * Both event names are first-class in log-event.mjs and in track.js's
 * ANON_OK, because two thirds of round activity is anonymous and an
 * auth-gated abandonment signal would measure the wrong population.
 *
 * Styling is deliberately EXPLICIT dark-on-dark, not theme tokens: this
 * card renders over four pages with different theme systems, and
 * var(--text) on an unknown surface is how the "Judge reading" pill and
 * #audFab both shipped invisible (2026-08-10, 2026-08-18).
 */
(function () {
  'use strict';
  if (window.RoundExit) return;

  var REASONS = {
    opponent_no_show: 'Opponent never showed',
    opponent_left: 'Opponent left mid-round',
    matching_too_long: 'Took too long to find someone',
    tech_problem: 'Mic, camera or audio problem',
    ai_slow: 'AI took too long to respond',
    confused: 'Wasn’t sure what to do next',
    not_now: 'Just looking / ran out of time',
    other: 'Something else…',
  };

  function send(event, meta) {
    var m = {};
    Object.keys(meta || {}).forEach(function (k) {
      var v = meta[k];
      if (v === undefined || v === null || v === '') return;
      m[k] = typeof v === 'string' ? String(v).slice(0, 240) : v;
    });
    try {
      if (typeof window.track === 'function') { window.track(event, m); return; }
    } catch (e) {}
    // No track.js on this page: ride the gtag bridge if one exists.
    try { if (typeof window.gtag === 'function') window.gtag('event', event, m); } catch (e) {}
  }

  var CSS =
    '#rx-card{position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:2147483000;' +
    'width:min(420px,calc(100vw - 24px));background:#15181d;color:#f3f4f6;border:1px solid #2a2f37;' +
    'border-radius:14px;box-shadow:0 12px 40px rgba(0,0,0,.5);padding:14px 14px 12px;' +
    'font:14px/1.45 Archivo,system-ui,sans-serif;text-align:left}' +
    '#rx-card .rx-q{font-weight:700;font-size:14.5px;margin:0 0 10px;color:#f9fafb}' +
    '#rx-card .rx-chips{display:flex;flex-wrap:wrap;gap:7px}' +
    '#rx-card button.rx-chip{background:#1f242b;color:#e5e7eb;border:1px solid #333a44;border-radius:999px;' +
    'padding:7px 12px;font:600 12.5px/1 Archivo,system-ui,sans-serif;cursor:pointer}' +
    '#rx-card button.rx-chip:hover{border-color:#dc2626;color:#fff}' +
    '#rx-card textarea{width:100%;margin-top:9px;background:#0f1216;color:#f3f4f6;border:1px solid #333a44;' +
    'border-radius:9px;padding:8px 10px;font:13px/1.4 Archivo,system-ui,sans-serif;resize:none;display:none}' +
    '#rx-card .rx-foot{display:flex;justify-content:space-between;align-items:center;margin-top:10px}' +
    '#rx-card .rx-skip{background:none;border:none;color:#9ca3af;font:600 12px Archivo,system-ui,sans-serif;' +
    'cursor:pointer;padding:6px 4px;text-decoration:underline}' +
    '#rx-card .rx-send{display:none;background:#dc2626;color:#fff;border:none;border-radius:9px;' +
    'padding:8px 16px;font:700 12.5px Archivo,system-ui,sans-serif;cursor:pointer}';

  function ask(opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
      // One card at a time; a second ask while one is open just resolves.
      if (document.getElementById('rx-card')) { resolve('duplicate'); return; }

      var done = false;
      function finish(outcome, reason, note) {
        if (done) return; done = true;
        clearTimeout(idleTimer);
        if (reason) {
          send('round_exit_reason', {
            reason: reason,
            note: note || '',
            surface: opts.surface || '',
            stage: opts.stage || '',
            round_id: (opts.roundId || '').slice(0, 60),
            elapsed_s: typeof opts.elapsed === 'number' ? Math.round(opts.elapsed) : undefined,
            via: 'card',
          });
        } else {
          send('round_exit_reason', {
            reason: 'skipped', surface: opts.surface || '', stage: opts.stage || '', via: 'card',
          });
        }
        try { card.remove(); style.remove(); } catch (e) {}
        resolve(outcome);
      }

      var style = document.createElement('style');
      style.textContent = CSS;
      document.head.appendChild(style);

      var card = document.createElement('div');
      card.id = 'rx-card';
      card.setAttribute('role', 'dialog');
      card.setAttribute('aria-label', 'What happened with this round?');

      var q = document.createElement('p');
      q.className = 'rx-q';
      q.textContent = opts.question || 'Before you go: what happened?';
      card.appendChild(q);

      var chips = document.createElement('div');
      chips.className = 'rx-chips';
      var keys = opts.reasons || Object.keys(REASONS);
      var note = document.createElement('textarea');
      note.maxLength = 240; note.rows = 2;
      note.placeholder = 'What went wrong? (optional)';
      var sendBtn = document.createElement('button');
      sendBtn.className = 'rx-send'; sendBtn.textContent = 'Send';
      var picked = null;

      keys.forEach(function (k) {
        if (!REASONS[k]) return;
        var b = document.createElement('button');
        b.className = 'rx-chip'; b.type = 'button';
        b.textContent = REASONS[k];
        b.addEventListener('click', function () {
          if (k === 'other') {
            picked = k;
            note.style.display = 'block';
            sendBtn.style.display = 'inline-block';
            note.focus();
            return;
          }
          finish('answered', k, note.value);
        });
        chips.appendChild(b);
      });
      card.appendChild(chips);
      card.appendChild(note);

      var foot = document.createElement('div');
      foot.className = 'rx-foot';
      var skip = document.createElement('button');
      skip.className = 'rx-skip'; skip.type = 'button'; skip.textContent = 'Skip';
      skip.addEventListener('click', function () { finish('skipped', null); });
      sendBtn.addEventListener('click', function () { finish('answered', picked || 'other', note.value); });
      foot.appendChild(skip);
      foot.appendChild(sendBtn);
      card.appendChild(foot);

      document.body.appendChild(card);
      send('round_exit_reason', {
        reason: 'shown', surface: opts.surface || '', stage: opts.stage || '', via: 'card',
      });

      // A prompt nobody answers must never trap a navigation that is
      // awaiting it. 30s of silence resolves as ignored.
      var idleTimer = setTimeout(function () { finish('ignored', null); }, 30000);
    });
  }

  window.RoundExit = {
    ask: ask,
    known: function (reason, meta) {
      var m = meta || {};
      send('round_exit_reason', {
        reason: reason,
        surface: m.surface || '',
        stage: m.stage || '',
        round_id: (m.roundId || '').slice(0, 60),
        elapsed_s: typeof m.elapsed === 'number' ? Math.round(m.elapsed) : undefined,
        via: m.via || 'known',
      });
    },
    beacon: function (meta) {
      var m = meta || {};
      send('round_abandoned', {
        surface: m.surface || '',
        stage: m.stage || '',
        round_id: (m.roundId || '').slice(0, 60),
        speech_idx: typeof m.speechIdx === 'number' ? m.speechIdx : undefined,
        elapsed_s: typeof m.elapsed === 'number' ? Math.round(m.elapsed) : undefined,
        ai_loading: m.aiLoading === true ? true : undefined,
        stuck_shown: m.stuckShown === true ? true : undefined,
        opp_seen: m.oppSeen === true ? true : (m.oppSeen === false ? false : undefined),
      });
    },
    REASONS: REASONS,
  };
})();
