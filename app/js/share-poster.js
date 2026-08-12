/* share-poster.js
 *
 * Share affordances for a promotional poster. Built for the Debatable Open
 * poster on the landing #tournament-band and on /tournaments, but it is
 * generic: it enhances any element carrying `data-share-poster`.
 *
 *   <div data-share-poster
 *        data-share-url="https://itsdebatable.com/tournaments"
 *        data-share-title="The Debatable Open"
 *        data-share-text="One day, all online. $500 for first."
 *        data-share-image="/img/tournament/debatable-open.jpg"></div>
 *
 * WHY THE IMAGE MATTERS. A link share is a link; a poster share is a post.
 * The circuits this needs to reach organise on WhatsApp groups, Instagram
 * stories and Discord servers, and in all three the thing that travels is
 * the IMAGE, not the URL. So on any browser that supports it, the primary
 * button shares the actual JPEG through the Web Share API and the receiving
 * app treats it as a photo. Everything else is fallback.
 *
 * PROGRESSIVE ENHANCEMENT, and it matters more than usual here. The
 * explicit buttons (WhatsApp / X / Copy / Download) ALWAYS render. The
 * native "Share poster" button is added only when the browser actually
 * supports it. That ordering is deliberate: a share UI whose only control
 * is a native trigger that silently no-ops on desktop Firefox is a dead
 * end, and the whole point of this file is promotion, so a dead end is the
 * one outcome that costs something real.
 *
 * No dependencies, no build step, no network cost until a button is
 * pressed. The image is fetched lazily on click and only when the browser
 * has already told us it can share files.
 */
(function () {
  'use strict';

  var MOUNTED = 'data-share-poster-ready';

  // Styles ride with the module rather than sitting in ui.css. /tournaments
  // does not load ui.css at all, and the landing loads it with the
  // media="print" swap trick, so a shared sheet would mean one page with no
  // styling and another with a flash of unstyled buttons. Injected once,
  // guarded by id, and written against inherited colour so the row works on
  // the light paper surfaces and the dark bands without a per-page fork.
  function injectStyles() {
    if (document.getElementById('sposterStyle')) return;
    var s = document.createElement('style');
    s.id = 'sposterStyle';
    s.textContent = [
      '.sposter-row{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-top:14px}',
      '.sposter-label{font-size:.66rem;font-weight:900;letter-spacing:.14em;text-transform:uppercase;',
        'opacity:.55;margin-right:2px}',
      '.sposter-btn{display:inline-flex;align-items:center;gap:7px;padding:8px 13px;border-radius:999px;',
        'font:inherit;font-size:.78rem;font-weight:750;line-height:1;cursor:pointer;text-decoration:none;',
        'color:inherit;background:transparent;',
        'border:1px solid color-mix(in srgb,currentColor 26%,transparent);',
        'transition:background .15s,border-color .15s,transform .15s,opacity .15s}',
      '.sposter-btn:hover{background:color-mix(in srgb,currentColor 8%,transparent);',
        'border-color:color-mix(in srgb,currentColor 45%,transparent);transform:translateY(-1px)}',
      '.sposter-btn:focus-visible{outline:3px solid var(--accent,#dc2626);outline-offset:3px}',
      '.sposter-btn svg{flex:none;opacity:.8}',
      // The native trigger is the one that shares the actual image, so it
      // is the only filled control in the row.
      '.sposter-btn--primary{background:var(--accent-solid,#b91c1c);border-color:var(--accent-solid,#b91c1c);',
        'color:#fff}',
      '.sposter-btn--primary:hover{background:var(--accent-solid,#b91c1c);filter:brightness(1.07)}',
      '.sposter-btn--primary svg{opacity:1}',
      '.sposter-btn--wa:hover{border-color:#25D366;color:#128C4A}',
      '.sposter-btn--x:hover{border-color:currentColor}',
      '.sposter-btn.is-done{border-color:#16a34a;color:#15803d}',
      '.sposter-btn.is-loading{opacity:.6;pointer-events:none}',
      // Dark bands: the green confirmation and the WhatsApp hover both go
      // muddy on a dark background, so lift them rather than inherit.
      '[data-theme="dark"] .sposter-btn.is-done,[data-theme="crimson"] .sposter-btn.is-done,',
        '[data-theme="grey"] .sposter-btn.is-done,[data-theme="stone"] .sposter-btn.is-done',
        '{border-color:#4ade80;color:#86efac}',
      '[data-theme="dark"] .sposter-btn--wa:hover,[data-theme="crimson"] .sposter-btn--wa:hover,',
        '[data-theme="grey"] .sposter-btn--wa:hover,[data-theme="stone"] .sposter-btn--wa:hover',
        '{color:#25D366}',
      '@media(max-width:520px){.sposter-btn span{font-size:.74rem}}',
      '@media(prefers-reduced-motion:reduce){.sposter-btn{transition:none}',
        '.sposter-btn:hover{transform:none}}',
    ].join('');
    document.head.appendChild(s);
  }

  // Sharing a file needs a probe, not a feature-detect: Chrome on desktop
  // exposes navigator.share and navigator.canShare while refusing files,
  // so asking canShare() with a real (tiny, throwaway) File is the only
  // honest test. Cached, because building a File per call is silly.
  var _canFile = null;
  function canShareFiles() {
    if (_canFile !== null) return _canFile;
    _canFile = false;
    try {
      if (navigator.canShare && window.File) {
        var probe = new File(['x'], 'probe.jpg', { type: 'image/jpeg' });
        _canFile = !!navigator.canShare({ files: [probe] });
      }
    } catch (e) { _canFile = false; }
    return _canFile;
  }

  function track(event, meta) {
    try {
      if (typeof window.gtag === 'function') window.gtag('event', event, meta || {});
      else if (typeof window.track === 'function') window.track(event, meta || {});
    } catch (e) {}
  }

  function svg(path, w) {
    return '<svg viewBox="0 0 24 24" width="' + (w || 15) + '" height="' + (w || 15) + '" fill="none" '
      + 'stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" '
      + 'aria-hidden="true">' + path + '</svg>';
  }

  var ICON = {
    share:    '<path d="M4 12v7a1.8 1.8 0 0 0 1.8 1.8h12.4A1.8 1.8 0 0 0 20 19v-7"/><path d="M12 15.4V3.6M8.2 7.4L12 3.6l3.8 3.8"/>',
    whatsapp: '<path d="M20.2 11.4a7.8 7.8 0 0 1-8.2 7.5 8.7 8.7 0 0 1-3.5-.7L4 19.6l1.4-4a7.3 7.3 0 0 1-1.6-4.2A7.8 7.8 0 0 1 12 3.9a7.8 7.8 0 0 1 8.2 7.5z"/><path d="M9.3 8.9c.3 1.6 1 2.7 1.9 3.6.9.9 1.9 1.4 3 1.7"/>',
    x:        '<path d="M4.2 4.2l15.6 15.6M19.8 4.2L4.2 19.8"/>',
    copy:     '<rect x="9" y="9" width="11" height="11" rx="2.2"/><path d="M5.6 15H5a1.8 1.8 0 0 1-1.8-1.8V5A1.8 1.8 0 0 1 5 3.2h8.2A1.8 1.8 0 0 1 15 5v.6"/>',
    download: '<path d="M4.4 15.4V19a1.8 1.8 0 0 0 1.8 1.8h11.6A1.8 1.8 0 0 0 19.6 19v-3.6"/><path d="M12 3.6v11.2M7.8 10.6l4.2 4.2 4.2-4.2"/>',
  };

  function button(cls, iconKey, label) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'sposter-btn' + (cls ? ' ' + cls : '');
    b.innerHTML = svg(ICON[iconKey]) + '<span>' + label + '</span>';
    return b;
  }

  function anchor(cls, iconKey, label, href) {
    var a = document.createElement('a');
    a.className = 'sposter-btn' + (cls ? ' ' + cls : '');
    a.href = href;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.innerHTML = svg(ICON[iconKey]) + '<span>' + label + '</span>';
    return a;
  }

  // Swap a button's label for a confirmation, then put it back. Used for
  // copy and for the "saved" state, so the user gets a receipt instead of
  // wondering whether the press registered.
  function flash(el, msg, ms) {
    var span = el.querySelector('span');
    if (!span) return;
    if (el.dataset.sposterBusy) return;
    var original = span.textContent;
    el.dataset.sposterBusy = '1';
    el.classList.add('is-done');
    span.textContent = msg;
    setTimeout(function () {
      span.textContent = original;
      el.classList.remove('is-done');
      delete el.dataset.sposterBusy;
    }, ms || 1900);
  }

  function absolute(url) {
    try { return new URL(url, location.href).href; } catch (e) { return url; }
  }

  function mount(host) {
    if (host.getAttribute(MOUNTED)) return;
    host.setAttribute(MOUNTED, '1');
    injectStyles();

    var url    = absolute(host.getAttribute('data-share-url') || location.href);
    var title  = host.getAttribute('data-share-title') || document.title;
    var text   = host.getAttribute('data-share-text') || '';
    var image  = host.getAttribute('data-share-image') || '';
    var evName = host.getAttribute('data-share-event') || 'poster_share';
    // What goes in a WhatsApp/X message body. The URL rides at the end so
    // the platform can unfurl it.
    var blurb  = (text ? text + ' ' : '') + url;

    var row = document.createElement('div');
    row.className = 'sposter-row';

    var label = document.createElement('span');
    label.className = 'sposter-label';
    label.textContent = 'Share it';
    row.appendChild(label);

    function fire(method) { track(evName, { method: method, url: url }); }

    // ── Native share, first only when the browser can really do it ──────
    if (navigator.share) {
      var nat = button('sposter-btn--primary', 'share', canShareFiles() ? 'Share poster' : 'Share');
      nat.addEventListener('click', function () {
        var payload = { title: title, text: text, url: url };

        function plain() {
          navigator.share(payload).then(function () { fire('native'); }).catch(function () {});
        }

        if (!image || !canShareFiles()) return plain();

        // Fetch the poster and share it as a real file. Any failure at all
        // (offline, CORS, an image that grew past what the OS will accept)
        // falls back to the link share rather than leaving the press dead.
        nat.classList.add('is-loading');
        fetch(image, { cache: 'force-cache' })
          .then(function (r) { if (!r.ok) throw new Error('http ' + r.status); return r.blob(); })
          .then(function (blob) {
            var name = (image.split('/').pop() || 'poster.jpg').split('?')[0];
            var file = new File([blob], name, { type: blob.type || 'image/jpeg' });
            if (!navigator.canShare({ files: [file] })) throw new Error('files refused');
            payload.files = [file];
            return navigator.share(payload).then(function () { fire('native_image'); });
          })
          .catch(function (err) {
            // AbortError means the user dismissed the sheet on purpose.
            // That is not a failure and must not re-open a second sheet.
            if (err && err.name === 'AbortError') return;
            plain();
          })
          .then(function () { nat.classList.remove('is-loading'); },
                function () { nat.classList.remove('is-loading'); });
      });
      row.appendChild(nat);
    }

    // ── Explicit targets, always present ────────────────────────────────
    // WhatsApp leads. On the school and university circuits this is aimed
    // at, the group chat is the distribution layer, not the timeline.
    var wa = anchor('sposter-btn--wa', 'whatsapp', 'WhatsApp',
      'https://wa.me/?text=' + encodeURIComponent(blurb));
    wa.addEventListener('click', function () { fire('whatsapp'); });
    row.appendChild(wa);

    var x = anchor('sposter-btn--x', 'x', 'X',
      'https://twitter.com/intent/tweet?text=' + encodeURIComponent(text || title)
        + '&url=' + encodeURIComponent(url));
    x.addEventListener('click', function () { fire('x'); });
    row.appendChild(x);

    var copy = button('', 'copy', 'Copy link');
    copy.addEventListener('click', function () {
      function done() { flash(copy, 'Copied'); fire('copy'); }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(done, function () { legacyCopy(url, done); });
      } else {
        legacyCopy(url, done);
      }
    });
    row.appendChild(copy);

    // 2026-08-11: the Download poster button was removed per Aidan. The
    // `image` argument is still accepted and still rides the share intents
    // (it is what a link unfurls with), so restoring the button is adding
    // this block back rather than re-threading the poster through.

    host.appendChild(row);
  }

  // execCommand fallback for Safari versions that gate the async clipboard
  // and for any non-secure context. Off-screen, readonly, removed after.
  function legacyCopy(value, done) {
    try {
      var ta = document.createElement('textarea');
      ta.value = value;
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;top:0;left:-9999px;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      done();
    } catch (e) {}
  }

  function init() {
    var hosts = document.querySelectorAll('[data-share-poster]');
    for (var i = 0; i < hosts.length; i++) mount(hosts[i]);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
  // Exposed so a page that injects a band after load can mount it too.
  window.SharePoster = { mount: mount, refresh: init };
})();
