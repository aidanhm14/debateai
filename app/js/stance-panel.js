/* ──────────────────────────────────────────────────────────────────
   The opinion panel widget.

   One proposition at a time, answered on a 7-point agree/disagree scale
   with a confidence reading, then the room's split shown straight back.

   WHY THE RESULT IS SHOWN IMMEDIATELY
   The payout is the product. A question that vanishes into a database is
   a chore nobody answers twice; a question that answers "61% of debaters
   disagree with you, and a third of them changed their mind after a
   round" is worth answering again next week. Panel value is response
   rate, and response rate here is bought with the aggregate.

   WHY THE PRIOR ANSWER IS NEVER SHOWN ON A RE-ASK
   The server deliberately withholds it. Seeing your old answer anchors
   the new one, and an anchored second answer is not a drift measurement,
   it is a memory test.

   MOUNTING
     <div data-stance-panel></div>            auto-fills on load
     StancePanel.mount(el, opts)              explicit
     StancePanel.askAfterRound({...})         post-round attribution card

   The widget renders nothing at all when the panelist has answered
   everything and has no re-asks due, rather than recycling a stem early.
   ────────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  if (window.__debatableStancePanel) return;
  window.__debatableStancePanel = true;

  var DEVICE_KEY = 'debateos-panelist-device';
  var HIDE_KEY = 'debateos-panel-hidden';
  var SCALE = [
    { v: -3, label: 'Strongly disagree', short: 'Strongly' },
    { v: -2, label: 'Disagree', short: 'Disagree' },
    { v: -1, label: 'Lean disagree', short: 'Lean' },
    { v: 0, label: 'Neutral', short: 'Neutral' },
    { v: 1, label: 'Lean agree', short: 'Lean' },
    { v: 2, label: 'Agree', short: 'Agree' },
    { v: 3, label: 'Strongly agree', short: 'Strongly' },
  ];

  function get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

  // Stable pseudonymous device id. The server salts and hashes this before
  // it becomes a panelist id, so what lands in the database is not what is
  // stored here.
  function deviceId() {
    var d = get(DEVICE_KEY);
    if (d && /^[a-f0-9]{32}$/.test(d)) return d;
    var arr = new Uint8Array(16);
    if (window.crypto && crypto.getRandomValues) crypto.getRandomValues(arr);
    else for (var i = 0; i < 16; i++) arr[i] = Math.floor(Math.random() * 256);
    d = Array.prototype.map.call(arr, function (b) {
      return ('0' + b.toString(16)).slice(-2);
    }).join('');
    set(DEVICE_KEY, d);
    return d;
  }

  function authToken() {
    return new Promise(function (resolve) {
      try {
        if (typeof firebase === 'undefined' || !firebase.auth) return resolve(null);
        var u = firebase.auth().currentUser;
        if (!u) return resolve(null);
        u.getIdToken().then(resolve).catch(function () { resolve(null); });
      } catch (e) { resolve(null); }
    });
  }

  function track(name, params) {
    try { if (window.gtag) gtag('event', name, params || {}); } catch (e) {}
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // ── styles ────────────────────────────────────────────────────
  // Injected once. Scoped to .sp- so it cannot collide with a page's own
  // rules, and driven off the shared theme tokens where they exist so the
  // card themes with everything else instead of pinning its own palette.
  function injectStyles() {
    if (document.getElementById('sp-styles')) return;
    var css = [
      '.sp-card{border:1px solid rgba(127,127,127,.28);border-radius:14px;padding:18px 18px 16px;',
      'background:var(--c-surface,rgba(127,127,127,.06));max-width:560px;margin:0 auto;',
      'font-family:inherit;line-height:1.45}',
      '.sp-eyebrow{font-size:11px;letter-spacing:.09em;text-transform:uppercase;opacity:.6;',
      'margin:0 0 8px;font-weight:600}',
      '.sp-q{font-size:17px;font-weight:600;margin:0 0 4px}',
      '.sp-sub{font-size:13px;opacity:.62;margin:0 0 14px}',
      '.sp-scale{display:flex;gap:4px;margin:0 0 6px}',
      '.sp-opt{flex:1;border:1px solid rgba(127,127,127,.3);background:transparent;color:inherit;',
      'border-radius:8px;padding:9px 2px;cursor:pointer;font:inherit;font-size:11px;',
      'transition:background .12s,border-color .12s,transform .12s}',
      '.sp-opt:hover{background:rgba(239,68,68,.09);border-color:rgba(239,68,68,.45)}',
      '.sp-opt[aria-pressed="true"]{background:#ef4444;border-color:#ef4444;color:#fff;font-weight:600}',
      '.sp-ends{display:flex;justify-content:space-between;font-size:11px;opacity:.5;margin:0 0 14px}',
      '.sp-conf{margin:0 0 14px}',
      '.sp-conf label{font-size:12px;opacity:.72;display:block;margin:0 0 6px}',
      '.sp-conf input{width:100%;accent-color:#ef4444}',
      '.sp-why{width:100%;box-sizing:border-box;border:1px solid rgba(127,127,127,.3);',
      'border-radius:8px;padding:9px 10px;font:inherit;font-size:13px;background:transparent;',
      'color:inherit;resize:vertical;min-height:52px;margin:0 0 12px}',
      '.sp-actions{display:flex;gap:8px;align-items:center}',
      '.sp-go{background:#ef4444;color:#fff;border:0;border-radius:8px;padding:10px 18px;',
      'font:inherit;font-weight:600;font-size:14px;cursor:pointer}',
      '.sp-go:disabled{opacity:.45;cursor:default}',
      '.sp-skip{background:transparent;border:0;color:inherit;opacity:.55;font:inherit;',
      'font-size:13px;cursor:pointer;padding:10px 4px}',
      '.sp-skip:hover{opacity:.85}',
      '.sp-bar{display:flex;height:9px;border-radius:5px;overflow:hidden;margin:12px 0 8px;',
      'background:rgba(127,127,127,.18)}',
      '.sp-bar i{display:block;height:100%}',
      '.sp-bar .d{background:#7c8794}.sp-bar .n{background:rgba(127,127,127,.42)}',
      '.sp-bar .a{background:#ef4444}',
      '.sp-legend{display:flex;justify-content:space-between;font-size:12px;opacity:.7}',
      '.sp-note{font-size:13px;opacity:.75;margin:10px 0 0}',
      '.sp-count{font-size:11px;opacity:.5;margin:10px 0 0}',
      '.sp-err{font-size:13px;color:#ef4444;margin:8px 0 0}',
      '@media(max-width:520px){.sp-scale{flex-wrap:wrap}.sp-opt{flex:1 1 30%;font-size:11px}}',
    ].join('');
    var s = document.createElement('style');
    s.id = 'sp-styles';
    s.textContent = css;
    document.head.appendChild(s);
  }

  // ── network ───────────────────────────────────────────────────
  function fetchNext(opts) {
    var qs = 'deviceId=' + encodeURIComponent(deviceId());
    if (opts && opts.topic) qs += '&topic=' + encodeURIComponent(opts.topic);
    return fetch('/api/stance-panel?' + qs)
      .then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; });
  }

  function submit(payload) {
    return authToken().then(function (tok) {
      var headers = { 'Content-Type': 'application/json' };
      if (tok) headers.Authorization = 'Bearer ' + tok;
      payload.deviceId = deviceId();
      return fetch('/api/log-stance', {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(payload),
      }).then(function (r) {
        return r.json().catch(function () { return { error: 'Bad response' }; });
      });
    }).catch(function () { return { error: 'Network error' }; });
  }

  // ── render ────────────────────────────────────────────────────
  function renderQuestion(host, data, opts) {
    var p = data.proposition;
    var chosen = null;

    var eyebrow = data.reask ? 'You answered this before' : 'Where do you stand';
    var sub = data.reask
      ? 'Answer it fresh. We are looking for where you are now, not whether you match your old answer.'
      : 'One question. You will see how everyone else answered.';

    host.innerHTML =
      '<div class="sp-card">' +
        '<p class="sp-eyebrow">' + esc(eyebrow) + '</p>' +
        '<p class="sp-q">' + esc(p.text) + '</p>' +
        '<p class="sp-sub">' + esc(sub) + '</p>' +
        '<div class="sp-scale" role="group" aria-label="How much do you agree?">' +
          // The visible label is shortened to fit seven buttons on a phone,
          // which makes "Lean" and "Strongly" each appear twice. Sighted
          // users disambiguate by position against the Disagree/Agree end
          // labels; a screen reader has no position, so the full label goes
          // on aria-label or the choice is genuinely unusable.
          SCALE.map(function (o) {
            return '<button type="button" class="sp-opt" data-v="' + o.v + '" ' +
              'aria-pressed="false" aria-label="' + esc(o.label) + '" ' +
              'title="' + esc(o.label) + '">' + esc(o.short) + '</button>';
          }).join('') +
        '</div>' +
        '<div class="sp-ends"><span>Disagree</span><span>Agree</span></div>' +
        '<div class="sp-conf">' +
          '<label for="sp-conf">How sure are you? <b id="sp-confv">60</b>%</label>' +
          '<input id="sp-conf" type="range" min="0" max="100" value="60" step="5" />' +
        '</div>' +
        '<textarea class="sp-why" id="sp-why" maxlength="600" ' +
          'placeholder="In a sentence, why? (optional)"></textarea>' +
        '<div class="sp-actions">' +
          '<button type="button" class="sp-go" id="sp-go" disabled>See the results</button>' +
          '<button type="button" class="sp-skip" id="sp-skip">Skip</button>' +
        '</div>' +
        '<p class="sp-count">' + esc(String(data.answeredCount || 0)) + ' of ' +
          esc(String(data.total || 0)) + ' answered</p>' +
      '</div>';

    var go = host.querySelector('#sp-go');
    var conf = host.querySelector('#sp-conf');
    var confv = host.querySelector('#sp-confv');

    conf.addEventListener('input', function () { confv.textContent = this.value; });

    Array.prototype.forEach.call(host.querySelectorAll('.sp-opt'), function (btn) {
      btn.addEventListener('click', function () {
        Array.prototype.forEach.call(host.querySelectorAll('.sp-opt'), function (b) {
          b.setAttribute('aria-pressed', 'false');
        });
        btn.setAttribute('aria-pressed', 'true');
        chosen = parseInt(btn.getAttribute('data-v'), 10);
        go.disabled = false;
      });
    });

    host.querySelector('#sp-skip').addEventListener('click', function () {
      track('stance_skip', { proposition: p.id });
      host.innerHTML = '';
      set(HIDE_KEY, String(Date.now()));
    });

    go.addEventListener('click', function () {
      if (chosen === null) return;
      go.disabled = true;
      go.textContent = 'Saving';
      var payload = {
        propositionId: p.id,
        position: chosen,
        confidence: parseInt(conf.value, 10),
        reason: host.querySelector('#sp-why').value || '',
        trigger: (opts && opts.trigger) || 'panel',
        surface: location.pathname,
      };
      if (opts && opts.roundId) {
        payload.roundId = opts.roundId;
        payload.attribution = host.querySelector('#sp-why').value || '';
      }
      submit(payload).then(function (res) {
        if (!res || res.error) {
          go.disabled = false;
          go.textContent = 'See the results';
          var e = document.createElement('p');
          e.className = 'sp-err';
          e.textContent = (res && res.error) || 'Could not save that. Try again.';
          host.querySelector('.sp-card').appendChild(e);
          return;
        }
        track('stance_answer', {
          proposition: p.id,
          topic: p.topic,
          position: chosen,
          wave: res.wave,
          trigger: payload.trigger,
        });
        renderResult(host, p, res, opts);
      });
    });
  }

  function renderResult(host, p, res, opts) {
    var a = res.aggregate || {};
    var dis = a.disagreePct || 0;
    var neu = a.neutralPct || 0;
    var agr = a.agreePct || 0;

    // A split built on a handful of answers is noise, and presenting noise
    // as a finding is the fastest way to make the whole panel untrustworthy.
    var thin = (a.n || 0) < 12;

    var moved = '';
    if (res.shift !== null && res.shift !== undefined) {
      if (res.shift === 0) moved = 'You are exactly where you were last time.';
      else moved = 'You moved ' + Math.abs(res.shift) + ' ' +
        (Math.abs(res.shift) === 1 ? 'point' : 'points') + ' ' +
        (res.shift > 0 ? 'toward agree' : 'toward disagree') + ' since last time.';
    }

    var body = thin
      ? '<p class="sp-note">Not enough answers on this one yet to show a split. ' +
        'Yours is counted.</p>'
      : '<div class="sp-bar">' +
          '<i class="d" style="width:' + dis + '%"></i>' +
          '<i class="n" style="width:' + neu + '%"></i>' +
          '<i class="a" style="width:' + agr + '%"></i>' +
        '</div>' +
        '<div class="sp-legend"><span>' + dis + '% disagree</span>' +
        '<span>' + neu + '% neutral</span><span>' + agr + '% agree</span></div>' +
        (a.changedMindPct !== null && a.reaskedN >= 10
          ? '<p class="sp-note">' + a.changedMindPct + '% of people asked this a second ' +
            'time had moved.</p>'
          : '');

    host.innerHTML =
      '<div class="sp-card">' +
        '<p class="sp-eyebrow">The room</p>' +
        '<p class="sp-q">' + esc(p.text) + '</p>' +
        body +
        (moved ? '<p class="sp-note">' + esc(moved) + '</p>' : '') +
        '<div class="sp-actions" style="margin-top:14px">' +
          '<button type="button" class="sp-go" id="sp-next">Next question</button>' +
          '<button type="button" class="sp-skip" id="sp-done">Done</button>' +
        '</div>' +
      '</div>';

    host.querySelector('#sp-next').addEventListener('click', function () {
      load(host, opts);
    });
    host.querySelector('#sp-done').addEventListener('click', function () {
      host.innerHTML = '';
      set(HIDE_KEY, String(Date.now()));
    });
  }

  function load(host, opts) {
    injectStyles();
    fetchNext(opts).then(function (data) {
      if (!data || data.exhausted || !data.proposition) {
        host.innerHTML = '';
        return;
      }
      renderQuestion(host, data, opts);
      track('stance_view', { proposition: data.proposition.id, reask: !!data.reask });
    });
  }

  // ── public API ────────────────────────────────────────────────
  var StancePanel = {
    mount: function (el, opts) {
      var host = typeof el === 'string' ? document.querySelector(el) : el;
      if (!host) return;
      load(host, opts || {});
    },

    // Post-round attribution. This is the highest-value elicitation moment
    // on the site: the respondent has just heard a real argument on a real
    // motion, so the answer carries a cause. Call it from a ballot screen
    // with the round id.
    askAfterRound: function (o) {
      var host = typeof o.el === 'string' ? document.querySelector(o.el) : o.el;
      if (!host) return;
      load(host, {
        trigger: 'post_round',
        roundId: o.roundId || '',
        topic: o.topic || '',
      });
    },

    deviceId: deviceId,
  };

  window.StancePanel = StancePanel;

  // Auto-mount. Skipped for 30 days after someone dismisses the card, so a
  // visitor who said no is not asked again on the next page they open.
  function autoMount() {
    var hidden = parseInt(get(HIDE_KEY) || '0', 10);
    if (hidden && (Date.now() - hidden) < 30 * 24 * 60 * 60 * 1000) return;

    Array.prototype.forEach.call(
      document.querySelectorAll('[data-stance-panel]'),
      function (el) {
        StancePanel.mount(el, { topic: el.getAttribute('data-stance-topic') || '' });
      }
    );

    // Requests queued before this file finished loading.
    //
    // This is load-bearing, not defensive dressing. The pages worth mounting
    // on render their body from a PLAIN inline <script>, which runs at parse
    // time, while this file is deferred and therefore runs after the whole
    // document is parsed. A page that called StancePanel directly from its
    // render block would find the global undefined every single time and
    // fail silently, which is exactly the kind of bug that looks like "the
    // panel just never gets answered" rather than like a bug. So a page
    // pushes a request onto an array instead, and this drains it.
    var q = window.__stancePanelQueue;
    if (q && q.length) {
      q.splice(0).forEach(function (req) {
        try {
          if (req && req.roundId !== undefined) StancePanel.askAfterRound(req);
          else if (req) StancePanel.mount(req.el, req);
        } catch (e) {}
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', autoMount);
  } else {
    autoMount();
  }
})();
