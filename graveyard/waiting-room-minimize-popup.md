# Waiting-room minimize popup

Removed 2026-09-05 at Aidan's request. The normal arrival grace remains quiet; the later no-show prompt and its exit controls remain. The live player controls are a separate surface.

Previous implementation from app/live-round.html:

```js
  // ── "Looking for your debater" (pre-grace, and while snoozed) ─────
  // Landing in an empty room with no explanation reads as broken. This
  // says what is happening, and points at Minimize so the wait is spent
  // on the rest of the site instead of on a blank tile. It is a strip,
  // not a modal: the room behind it stays usable, because prep and the
  // motion are worth reading before the opponent lands.
  function showLooking(){
    if (state.lookingEl){ state.lookingEl.style.display = 'flex'; return; }
    var el = document.createElement('div');
    el.id = 'lookingPrompt';
    el.style.cssText = 'position:fixed;top:64px;left:50%;transform:translateX(-50%);max-width:540px;width:calc(100% - 32px);padding:13px 18px;background:var(--bg-elev,#16131a);border:1px solid var(--border-strong,rgba(255,255,255,.2));border-radius:14px;z-index:319;box-shadow:0 14px 40px rgba(0,0,0,.45);display:flex;align-items:center;gap:12px;font-family:inherit';
    el.innerHTML =
      '<span style="flex:none;width:9px;height:9px;border-radius:50%;background:var(--accent,#ef4444);animation:pulse 1.6s ease-in-out infinite"></span>' +
      '<span style="flex:1;min-width:0;font-size:.86rem;line-height:1.45;color:var(--text,#fff)">' +
        '<b style="font-weight:900;letter-spacing:.05em">LOOKING FOR YOUR DEBATER.</b> ' +
        '<span style="color:var(--text-dim,rgba(255,255,255,.62))">They are on their way in. Read the motion, or minimize and keep browsing.</span>' +
      '</span>' +
      '<button type="button" id="lookingMin" style="flex:none;padding:8px 14px;border-radius:9px;border:1px solid var(--border-strong,rgba(255,255,255,.22));background:transparent;color:var(--text,#fff);font-family:inherit;font-size:.76rem;font-weight:700;cursor:pointer">Minimize</button>';
    document.body.appendChild(el);
    // Delegate to the real Minimize control so this stays one code path:
    // the dock, the site shell and the surviving Daily iframe all come
    // from there, and duplicating any of it would fork the call handling.
    var mb = el.querySelector('#lookingMin');
    if (mb) mb.addEventListener('click', function(){
      var real = document.getElementById('lrMinBtn');
      if (real) real.click();
      try { gtag('event', 'live_looking_minimize', { format: state.formatKey }); } catch(e){}
    });
    state.lookingEl = el;
  }
  function hideLooking(){ if (state.lookingEl) state.lookingEl.style.display = 'none'; }
```
