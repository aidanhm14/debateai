/* Debatable stage join — a viewer asks to argue on the live broadcast.
 *
 * Mounted by js/broadcast-viewer.js onto the player, so every surface that
 * carries the broadcast (the homepage, /watch, /open, /tournaments) gets
 * the same door without four copies of it.
 *
 * WHAT THIS FILE MAY AND MAY NOT DO. It collects a preference and posts a
 * REQUEST. It never seats anybody, never mints a token, and never decides
 * a side: the host admits, and /api/stage mints the send token against the
 * verified uid at claim time. Everything here is a form and a poll.
 *
 * The two modes are a real choice rather than a timer setting, so they are
 * described in the words that actually differ: one floor and a clock, or
 * both microphones live with cutting in allowed. See lib/stage.mjs.
 */
(function (global) {
  'use strict';

  var POLL_MS = 6000;
  var API = '/api/stage';

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function styles() {
    if (document.getElementById('db-stage-join-css')) return;
    var css = document.createElement('style');
    css.id = 'db-stage-join-css';
    css.textContent = [
      /* The lower-third. Lives inside the player, above the video, and
         says only what a watcher needs: what is being argued, in which
         mode, and whose clock is running. */
      '.dbs-lower{position:absolute;left:0;right:0;bottom:0;z-index:7;padding:34px 14px 12px;pointer-events:none;',
      'background:linear-gradient(180deg,transparent,rgba(3,4,7,.86));color:#fff;',
      'font-family:Inter,system-ui,-apple-system,"Segoe UI",sans-serif;display:none}',
      '.dbv.is-stage .dbs-lower{display:block}',
      // Reserve the action row VERTICALLY rather than beside the text.
      // Measured at 380px with a long motion: the two-line motion and
      // the seats line both ran under Join and Fullscreen. A side
      // gutter would have to guess the row's width, which changes with
      // the platform links; clearing it downward holds at every width.
      '.dbv.is-stage .dbs-lower{padding-bottom:58px}',
      // A small player is often 380px wide and ~214px tall, where the
      // full lower-third measured 187px and swallowed the picture. The
      // compact arm keeps every field and gives back the frame: one
      // line of motion, tighter type, no top gradient run-up.
      // Keyed on a class this module sets from the PLAYER's own width,
      // never a viewport media query: the player is an embedded box that
      // is routinely 380px wide inside a 1280px page, and a viewport
      // query would never fire for it. (Same trap as the /live drawer
      // inheriting the full board's grid, 2026-08-31.)
      '.dbv.dbs-narrow.is-stage .dbs-lower{padding:14px 10px 56px}',
      '.dbv.dbs-narrow .dbs-motion{font-size:13px;-webkit-line-clamp:1}',
      '.dbv.dbs-narrow .dbs-seats{font-size:11px;margin-top:3px}',
      '.dbv.dbs-narrow .dbs-chip{font-size:9px;padding:2px 6px}',
      '.dbv.dbs-narrow .dbs-clock{font-size:11px;padding:2px 6px}',
      '.dbv.is-screen .dbs-lower{display:none}',
      // In embed mode the audience is watching a platform CDN whose
      // frame already carries the studio composite, so our own
      // lower-third would be a second one drawn over somebody else's
      // player. The DOOR is different: STREAM_SITE_PLAYER=embed is a
      // scaling knob, not a decision about who may ask to come on, so
      // the ask button is exempted from the player's own actions hide.
      '.dbv.is-embed .dbs-lower{display:none}',
      '.dbv.is-embed .dbv-actions{display:flex!important}',
      '.dbv.is-embed .dbv-actions > :not(.dbs-ask){display:none!important}',
      '.dbs-l-top{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:5px}',
      '.dbs-chip{display:inline-flex;align-items:center;gap:5px;padding:3px 8px;border-radius:6px;',
      'background:rgba(255,255,255,.14);font-size:10px;font-weight:900;letter-spacing:.1em;text-transform:uppercase}',
      '.dbs-chip.live{background:#b91c1c}',
      '.dbs-clock{margin-left:auto;font-variant-numeric:tabular-nums;font-weight:800;font-size:13px;',
      'background:rgba(3,4,7,.6);border:1px solid rgba(255,255,255,.16);border-radius:6px;padding:3px 8px}',
      '.dbs-motion{font-size:clamp(13px,1.7vw,19px);font-weight:800;letter-spacing:-.01em;line-height:1.25;',
      'display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}',
      '.dbs-seats{margin-top:5px;font-size:12px;color:rgba(255,255,255,.76);font-weight:700}',
      '.dbs-seats b{color:#fff}',

      /* The door. Rides the player's own action row so it sits with
         Sound and Fullscreen rather than floating somewhere new. */
      '.dbs-ask{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:36px;',
      'padding:0 13px;border:1px solid #dc2626;border-radius:9px;background:#dc2626;color:#fff;',
      'font:inherit;font-size:12px;font-weight:900;cursor:pointer;backdrop-filter:blur(10px)}',
      '.dbs-ask:hover{background:#ef4444;border-color:#ef4444}',
      '.dbs-ask[hidden]{display:none!important}',
      '.dbs-ask.waiting{background:rgba(3,4,7,.72);border-color:rgba(255,255,255,.34)}',

      /* The panel. A dialog rather than an inline expander, because the
         player is often 300px tall inside a page. */
      '.dbs-wrap{position:fixed;inset:0;z-index:2147482900;display:none;place-items:center;padding:18px;',
      'background:rgba(4,5,9,.72);backdrop-filter:blur(6px);',
      'font-family:Inter,system-ui,-apple-system,"Segoe UI",sans-serif}',
      '.dbs-wrap.on{display:grid}',
      '.dbs-card{width:min(100%,520px);max-height:88vh;overflow:auto;background:#101014;color:#f4f4f2;',
      'border:1px solid rgba(255,255,255,.14);border-radius:16px;padding:22px;box-shadow:0 30px 80px rgba(0,0,0,.6)}',
      '.dbs-card h2{margin:0 0 4px;font-size:21px;font-weight:900;letter-spacing:-.02em}',
      '.dbs-card p.sub{margin:0 0 16px;font-size:13px;line-height:1.5;color:rgba(244,244,242,.68)}',
      '.dbs-lab{display:block;font-size:10px;font-weight:900;letter-spacing:.14em;text-transform:uppercase;',
      'color:rgba(244,244,242,.5);margin:14px 0 7px}',
      '.dbs-modes{display:grid;gap:9px}',
      '.dbs-mode{display:block;text-align:left;width:100%;padding:12px 14px;border-radius:11px;cursor:pointer;',
      'border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.03);color:inherit;font:inherit}',
      '.dbs-mode:hover{border-color:rgba(255,255,255,.32)}',
      '.dbs-mode[aria-pressed="true"]{border-color:#ef4444;background:rgba(239,68,68,.12)}',
      '.dbs-mode b{display:block;font-size:14px;font-weight:800;margin-bottom:3px}',
      '.dbs-mode span{display:block;font-size:12px;line-height:1.45;color:rgba(244,244,242,.66)}',
      '.dbs-row{display:flex;gap:8px;flex-wrap:wrap}',
      '.dbs-pill{padding:7px 13px;border-radius:999px;border:1px solid rgba(255,255,255,.14);',
      'background:transparent;color:inherit;font:inherit;font-size:12px;font-weight:800;cursor:pointer}',
      '.dbs-pill[aria-pressed="true"]{border-color:#ef4444;background:rgba(239,68,68,.14)}',
      '.dbs-note{width:100%;box-sizing:border-box;padding:10px 12px;border-radius:10px;font:inherit;font-size:13px;',
      'background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.14);color:inherit}',
      '.dbs-note:focus{outline:none;border-color:#ef4444}',
      '.dbs-acts{display:flex;gap:9px;margin-top:18px;flex-wrap:wrap}',
      '.dbs-go{flex:1;min-width:170px;min-height:46px;border:0;border-radius:11px;background:#dc2626;color:#fff;',
      'font:inherit;font-size:14px;font-weight:900;cursor:pointer}',
      '.dbs-go:hover{background:#ef4444}',
      '.dbs-go:disabled{opacity:.55;cursor:default}',
      '.dbs-ghost{min-height:46px;padding:0 16px;border-radius:11px;background:transparent;color:inherit;',
      'border:1px solid rgba(255,255,255,.2);font:inherit;font-size:13px;font-weight:800;cursor:pointer}',
      '.dbs-msg{margin:12px 0 0;font-size:13px;line-height:1.5;color:rgba(244,244,242,.72)}',
      '.dbs-msg.bad{color:#fca5a5}',
      '.dbs-msg.good{color:#86efac}',
      '.dbs-fine{margin:14px 0 0;font-size:11.5px;line-height:1.5;color:rgba(244,244,242,.46)}',
      '@media(max-width:560px){.dbs-card{padding:18px}}'
    ].join('');
    document.head.appendChild(css);
  }

  function auth() {
    try { return global.firebase && global.firebase.apps && global.firebase.apps.length ? global.firebase.auth() : null; }
    catch (e) { return null; }
  }

  // A named account is the bar, same as every other live-video door. An
  // anonymous Firebase user is not one: js/notifications.js mints those on
  // nearly every page, so `!!currentUser` here would mean "has a browser".
  function namedUser() {
    var a = auth();
    var u = a && a.currentUser;
    if (!u || u.isAnonymous) return null;
    var provs = (u.providerData || []).map(function (p) { return p && p.providerId; });
    return provs.length ? u : null;
  }

  function post(body) {
    var u = namedUser();
    if (!u) return Promise.reject(new Error('signin'));
    return u.getIdToken().then(function (tok) {
      return fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok },
        body: JSON.stringify(body)
      }).then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (j) {
          j.__status = r.status;
          j.__ok = r.ok;
          return j;
        });
      });
    });
  }

  function fmtClock(ms) {
    var t = Math.max(0, Math.round(ms / 1000));
    return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0');
  }

  function mount(root, options) {
    if (!root) return null;
    styles();
    options = options || {};

    // ── the lower-third ────────────────────────────────────────────
    // The compact arm is decided by the player box, not the window.
    var NARROW = 520;
    function sizeToBox(){
      var w = root.getBoundingClientRect().width;
      if (w) root.classList.toggle('dbs-narrow', w < NARROW);
    }
    if (global.ResizeObserver){
      try { new ResizeObserver(sizeToBox).observe(root); } catch (e) { global.addEventListener('resize', sizeToBox); }
    } else global.addEventListener('resize', sizeToBox);

    var lower = el('div', 'dbs-lower');
    var top = el('div', 'dbs-l-top');
    var modeChip = el('span', 'dbs-chip');
    var liveChip = el('span', 'dbs-chip live', 'On the stage');
    var clock = el('span', 'dbs-clock');
    top.appendChild(liveChip);
    top.appendChild(modeChip);
    top.appendChild(clock);
    var motion = el('div', 'dbs-motion');
    var seats = el('div', 'dbs-seats');
    lower.appendChild(top);
    lower.appendChild(motion);
    lower.appendChild(seats);
    root.appendChild(lower);

    // ── the door ───────────────────────────────────────────────────
    var ask = el('button', 'dbs-ask', 'Join the debate');
    ask.type = 'button';
    ask.hidden = true;
    var actions = root.querySelector('.dbv-actions');
    if (actions) actions.insertBefore(ask, actions.firstChild);
    else root.appendChild(ask);

    // ── the panel ──────────────────────────────────────────────────
    var wrap = el('div', 'dbs-wrap');
    var card = el('div', 'dbs-card');
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-modal', 'true');
    card.setAttribute('aria-label', 'Ask to join the live debate');
    card.innerHTML =
      '<h2>Ask to join the debate</h2>' +
      '<p class="sub">The host picks who comes on. If they take you, you get a seat on the live broadcast and argue one question against the other guest.</p>' +
      '<span class="dbs-lab">How you want to argue</span>' +
      '<div class="dbs-modes">' +
        '<button type="button" class="dbs-mode" data-mode="structured" aria-pressed="true">' +
          '<b>Take turns</b><span>One person talks at a time, on a clock. Ten minutes: three to open, two to reply, each side. Nobody cuts in.</span>' +
        '</button>' +
        '<button type="button" class="dbs-mode" data-mode="casual" aria-pressed="false">' +
          '<b>Open floor</b><span>Both microphones live for one stretch. Cutting in is allowed. It is a real argument, and the judge reads it as one.</span>' +
        '</button>' +
      '</div>' +
      '<span class="dbs-lab">Side you would rather take</span>' +
      '<div class="dbs-row" data-side>' +
        '<button type="button" class="dbs-pill" data-side-val="" aria-pressed="true">Either</button>' +
        '<button type="button" class="dbs-pill" data-side-val="pro" aria-pressed="false">For</button>' +
        '<button type="button" class="dbs-pill" data-side-val="con" aria-pressed="false">Against</button>' +
      '</div>' +
      '<span class="dbs-lab">One line for the host (optional)</span>' +
      '<input class="dbs-note" maxlength="140" placeholder="What you want to argue, or why you">' +
      '<div class="dbs-acts">' +
        '<button type="button" class="dbs-go">Raise my hand</button>' +
        '<button type="button" class="dbs-ghost" data-close>Not now</button>' +
      '</div>' +
      '<p class="dbs-msg" hidden></p>' +
      '<p class="dbs-fine">Going on a public broadcast is 18+. It is recorded, it can be replayed, and it can be restreamed off Debatable. You can take your hand down any time before the host picks you.</p>';
    wrap.appendChild(card);
    document.body.appendChild(wrap);

    var modeBtns = card.querySelectorAll('.dbs-mode');
    var sideBtns = card.querySelectorAll('[data-side] .dbs-pill');
    var note = card.querySelector('.dbs-note');
    var go = card.querySelector('.dbs-go');
    var msg = card.querySelector('.dbs-msg');
    var mode = 'structured';
    var side = '';
    var state = 'none';
    var pollTimer = null;
    var lastReturn = null;
    var stageOpen = false;
    var boardActive = false;
    var clockTick = null;
    var clockEndsAt = null;
    var skewMs = 0;

    function say(text, kind) {
      msg.textContent = text || '';
      msg.hidden = !text;
      msg.className = 'dbs-msg' + (kind ? ' ' + kind : '');
    }

    function press(list, attr, value) {
      Array.prototype.forEach.call(list, function (b) {
        b.setAttribute('aria-pressed', String(b.getAttribute(attr) === value));
      });
    }

    Array.prototype.forEach.call(modeBtns, function (b) {
      b.addEventListener('click', function () { mode = b.getAttribute('data-mode'); press(modeBtns, 'data-mode', mode); });
    });
    Array.prototype.forEach.call(sideBtns, function (b) {
      b.addEventListener('click', function () { side = b.getAttribute('data-side-val') || ''; press(sideBtns, 'data-side-val', side); });
    });

    function close() {
      wrap.classList.remove('on');
      if (lastReturn && lastReturn.focus) { try { lastReturn.focus(); } catch (e) {} }
    }
    card.querySelector('[data-close]').addEventListener('click', close);
    wrap.addEventListener('click', function (e) { if (e.target === wrap) close(); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && wrap.classList.contains('on')) close();
    });

    function openPanel() {
      lastReturn = document.activeElement;
      say('');
      wrap.classList.add('on');
      var first = card.querySelector('.dbs-mode');
      if (first) { try { first.focus(); } catch (e) {} }
      try { if (global.gtag) global.gtag('event', 'stage_ask_open'); } catch (e) {}
    }

    ask.addEventListener('click', function () {
      if (state === 'seated') { global.location.href = '/stage'; return; }
      if (state === 'pending') { openPending(); return; }
      if (!namedUser()) {
        // Same chooser every other live-video door opens, in the mode
        // that offers only the providers this door can actually accept.
        if (typeof global.openAuthModal === 'function') {
          global.openAuthModal('signup', {
            liveVideo: true,
            headline: 'Sign in to join the broadcast',
            sub: 'A seat on the live stage needs an account the other guest can be paired with.'
          });
        } else {
          global.location.href = '/spar';
        }
        return;
      }
      openPanel();
    });

    function openPending() {
      lastReturn = document.activeElement;
      wrap.classList.add('on');
      say('Your hand is up. The host sees it, oldest first. Keep this page open.', 'good');
      go.textContent = 'Take my hand down';
      go.disabled = false;
    }

    go.addEventListener('click', function () {
      if (state === 'pending') {
        go.disabled = true;
        post({ action: 'withdraw' }).then(function () {
          state = 'none';
          go.textContent = 'Raise my hand';
          go.disabled = false;
          say('Hand down.', '');
          paintAsk();
          close();
        }).catch(function () { go.disabled = false; });
        return;
      }
      go.disabled = true;
      say('Sending', '');
      post({ action: 'request', mode: mode, side: side, note: note.value })
        .then(function (r) {
          go.disabled = false;
          if (r.__ok && r.state === 'pending') {
            state = 'pending';
            paintAsk();
            startPoll();
            openPending();
            try { if (global.gtag) global.gtag('event', 'stage_ask_sent', { mode: mode }); } catch (e) {}
            return;
          }
          if (r.code === 'need_age') {
            say('Answer the one age question first, then raise your hand again.', 'bad');
            if (typeof global.daAskAgeBand === 'function') global.daAskAgeBand(function () {});
            return;
          }
          if (r.code === 'minor') { say(r.error, 'bad'); return; }
          if (r.code === 'closed') { say('The host has closed hand raises for now.', 'bad'); return; }
          say(r.error || 'That did not go through. Try again in a moment.', 'bad');
        })
        .catch(function (e) {
          go.disabled = false;
          say(e && e.message === 'signin' ? 'Sign in first.' : 'That did not go through. Try again in a moment.', 'bad');
        });
    });

    // ── polling my own status ──────────────────────────────────────
    function startPoll() {
      if (pollTimer) return;
      pollTimer = setInterval(function () {
        if (document.hidden) return;
        post({ action: 'poll' }).then(function (r) {
          if (!r.__ok) return;
          if (typeof r.serverNow === 'number') skewMs = r.serverNow - Date.now();
          var next = r.state || 'none';
          if (next !== state) {
            state = next;
            paintAsk();
            if (state === 'seated') {
              say('You are on. Open the stage to go live.', 'good');
              go.textContent = 'Open the stage';
              go.disabled = false;
              go.onclick = function () { global.location.href = '/stage'; };
              if (!wrap.classList.contains('on')) openPanel();
              try { if (global.gtag) global.gtag('event', 'stage_admitted'); } catch (e) {}
            } else if (state === 'none') {
              stopPoll();
            }
          }
        }).catch(function () {});
      }, POLL_MS);
    }
    function stopPoll() { if (pollTimer) { clearInterval(pollTimer); pollTimer = null; } }

    function paintAsk() {
      if (state === 'seated') {
        ask.hidden = false;
        ask.textContent = 'You are on. Open the stage';
        ask.className = 'dbs-ask';
        return;
      }
      if (state === 'pending') {
        ask.hidden = false;
        ask.textContent = 'Hand up';
        ask.className = 'dbs-ask waiting';
        return;
      }
      ask.className = 'dbs-ask';
      ask.textContent = 'Join the debate';
      ask.hidden = !stageOpen;
    }

    // The clock ticks locally off the server's anchor, so the shared
    // 15s stream-status cache still produces a smooth countdown.
    function startClock() {
      if (clockTick) return;
      clockTick = setInterval(function () {
        if (!clockEndsAt) { clock.textContent = ''; return; }
        clock.textContent = fmtClock(clockEndsAt - (Date.now() + skewMs));
      }, 500);
    }

    function update(status) {
      status = status || {};
      var stage = status.stage || {};
      stageOpen = !!(status.live && status.stageOpen !== false);
      boardActive = !!stage.active;
      root.classList.toggle('is-stage', boardActive);
      if (typeof stage.serverNow === 'number') skewMs = stage.serverNow - Date.now();

      if (boardActive) {
        motion.textContent = stage.motion || '';
        modeChip.textContent = stage.mode === 'casual' ? 'Open floor' : 'Taking turns';
        var pro = stage.seats && stage.seats.pro;
        var con = stage.seats && stage.seats.con;
        // textContent only, never innerHTML: these names come from a
        // stranger's account and land on a public broadcast overlay.
        seats.textContent = '';
        if (pro || con) {
          seats.appendChild(document.createTextNode('For: '));
          seats.appendChild(el('b', null, (pro && pro.name) || 'open seat'));
          seats.appendChild(document.createTextNode('  ·  Against: '));
          seats.appendChild(el('b', null, (con && con.name) || 'open seat'));
        }
        var c = stage.clock || {};
        clockEndsAt = c.running ? c.endsAt : null;
        clock.textContent = clockEndsAt ? fmtClock(clockEndsAt - (Date.now() + skewMs)) : '';
        if (c.label) modeChip.textContent = stage.mode === 'casual' ? 'Open floor' : c.label;
        startClock();
      } else {
        clockEndsAt = null;
      }
      sizeToBox();
      paintAsk();
      if (state === 'pending' || state === 'seated') startPoll();
    }

    // A signed-in visitor who already has a hand up should see it on
    // arrival rather than raising a second one.
    function primeOnce() {
      if (!namedUser()) return;
      post({ action: 'poll' }).then(function (r) {
        if (!r.__ok) return;
        state = r.state || 'none';
        if (typeof r.serverNow === 'number') skewMs = r.serverNow - Date.now();
        paintAsk();
        if (state === 'pending' || state === 'seated') startPoll();
      }).catch(function () {});
    }
    var a = auth();
    if (a && a.onAuthStateChanged) {
      var primed = false;
      a.onAuthStateChanged(function () { if (!primed) { primed = true; primeOnce(); } });
    }

    global.addEventListener('pagehide', stopPoll);

    return { update: update, destroy: function () { stopPoll(); if (clockTick) clearInterval(clockTick); wrap.remove(); ask.remove(); lower.remove(); } };
  }

  global.DebatableStageJoin = { mount: mount };
})(window);
