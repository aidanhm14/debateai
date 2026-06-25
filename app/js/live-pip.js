/* live-pip.js — shared floating / picture-in-picture helper for DebateIt
   live debate surfaces (voice-debate.html, live-round.html).

   Public API (window.LivePiP):
     supported()                         → is Document Picture-in-Picture available?
     openWindow({width,height,title,onClose,background}) → Promise<PiPWindow|null>
     close()                             → close the active PiP window (if any)
     current()                           → the active PiP window (or null)
     makeDraggable(node, handle)         → drag a fixed-position node by a handle

   Document Picture-in-Picture (window.documentPictureInPicture) opens a real,
   browser-managed, always-on-top window that stays visible while the user
   works in OTHER tabs/apps — exactly like Google Meet's mini player. It's
   Chrome/Edge today; supported() lets callers fall back to an in-page
   floating widget where it's missing. */
(function () {
  'use strict';

  var activeWin = null;

  function supported() {
    return typeof window !== 'undefined' && 'documentPictureInPicture' in window;
  }

  // Mirror the opener's styles into the PiP document so moved / portaled DOM
  // renders identically. Same-origin sheets expose cssRules; cross-origin
  // ones throw on access, so re-link those by href instead.
  function copyStyles(srcDoc, dstDoc) {
    var sheets = srcDoc.styleSheets ? Array.prototype.slice.call(srcDoc.styleSheets) : [];
    sheets.forEach(function (sheet) {
      try {
        var rules = sheet.cssRules;
        if (!rules) return;
        var text = Array.prototype.map.call(rules, function (r) { return r.cssText; }).join('\n');
        var style = dstDoc.createElement('style');
        style.textContent = text;
        if (sheet.media && sheet.media.mediaText) style.media = sheet.media.mediaText;
        dstDoc.head.appendChild(style);
      } catch (e) {
        if (!sheet.href) return;
        var link = dstDoc.createElement('link');
        link.rel = 'stylesheet';
        if (sheet.type) link.type = sheet.type;
        if (sheet.media && sheet.media.mediaText) link.media = sheet.media.mediaText;
        link.href = sheet.href;
        dstDoc.head.appendChild(link);
      }
    });
    // Carry over <link rel=stylesheet> (web fonts etc.) not already present.
    Array.prototype.forEach.call(srcDoc.querySelectorAll('link[rel="stylesheet"]'), function (l) {
      try {
        if (l.href && !dstDoc.querySelector('link[href="' + l.href + '"]')) {
          var link = dstDoc.createElement('link');
          link.rel = 'stylesheet';
          link.href = l.href;
          dstDoc.head.appendChild(link);
        }
      } catch (e) {}
    });
  }

  // Inherit theme attributes/classes so CSS custom properties resolve the
  // same inside the PiP window as on the opener.
  function inheritTheme(dstDoc) {
    try {
      var root = document.documentElement;
      ['data-theme', 'data-lighting'].forEach(function (attr) {
        var v = root.getAttribute(attr);
        if (v != null) dstDoc.documentElement.setAttribute(attr, v);
      });
      if (root.className) dstDoc.documentElement.className = root.className;
      if (document.body && document.body.className) dstDoc.body.className = document.body.className;
    } catch (e) {}
  }

  function openWindow(opts) {
    opts = opts || {};
    if (!supported()) return Promise.resolve(null);
    if (activeWin) { try { activeWin.close(); } catch (e) {} activeWin = null; }
    return window.documentPictureInPicture.requestWindow({
      width: opts.width || 380,
      height: opts.height || 340
    }).then(function (pip) {
      activeWin = pip;
      try { copyStyles(document, pip.document); } catch (e) {}
      inheritTheme(pip.document);
      if (opts.title) { try { pip.document.title = opts.title; } catch (e) {} }
      var b = pip.document.body;
      b.style.margin = '0';
      b.style.padding = '0';
      b.style.overflow = 'hidden';
      b.style.background = opts.background || 'var(--bg, #0a0a0c)';

      var closed = false;
      var fire = function () {
        if (closed) return;
        closed = true;
        if (activeWin === pip) activeWin = null;
        if (typeof opts.onClose === 'function') { try { opts.onClose(); } catch (e) {} }
      };
      pip.addEventListener('pagehide', fire);
      pip.addEventListener('unload', fire);
      return pip;
    }).catch(function () {
      activeWin = null;
      return null;
    });
  }

  function close() {
    if (activeWin) { try { activeWin.close(); } catch (e) {} activeWin = null; }
  }

  function current() { return activeWin; }

  // Drag a fixed-position element by `handle`. Switches from right/bottom
  // anchoring to left/top on first grab and clamps to the viewport so the
  // widget can't be lost off-screen. Clicks on inner <button>s pass through.
  function makeDraggable(node, handle) {
    if (!node || node.__lpipDrag) return;
    handle = handle || node;
    node.__lpipDrag = true;
    var startX, startY, originLeft, originTop, dragging = false;
    handle.style.cursor = 'grab';
    handle.addEventListener('pointerdown', function (e) {
      if (e.target.closest && e.target.closest('button')) return;
      dragging = true;
      var r = node.getBoundingClientRect();
      originLeft = r.left; originTop = r.top;
      startX = e.clientX; startY = e.clientY;
      node.style.left = originLeft + 'px';
      node.style.top = originTop + 'px';
      node.style.right = 'auto';
      node.style.bottom = 'auto';
      handle.style.cursor = 'grabbing';
      try { handle.setPointerCapture(e.pointerId); } catch (_) {}
      e.preventDefault();
    });
    handle.addEventListener('pointermove', function (e) {
      if (!dragging) return;
      var w = node.offsetWidth, h = node.offsetHeight;
      var left = Math.min(Math.max(8, originLeft + (e.clientX - startX)), window.innerWidth - w - 8);
      var top = Math.min(Math.max(8, originTop + (e.clientY - startY)), window.innerHeight - h - 8);
      node.style.left = left + 'px';
      node.style.top = top + 'px';
    });
    var end = function (e) {
      if (!dragging) return;
      dragging = false;
      handle.style.cursor = 'grab';
      try { handle.releasePointerCapture(e.pointerId); } catch (_) {}
    };
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
  }

  window.LivePiP = {
    supported: supported,
    openWindow: openWindow,
    close: close,
    current: current,
    makeDraggable: makeDraggable
  };
})();
