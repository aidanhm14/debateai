# Round visibility menu

Replaced with a private status and one Make public action. Audience cameras moved into Chat. Restore only with a fresh product decision.

```html
    <div class="visibility-control">
      <button id="privacyToggle" class="privacy-toggle" type="button" aria-haspopup="menu" aria-expanded="false" aria-controls="privacyMenu" hidden>
        <span class="privacy-toggle-dot" aria-hidden="true"></span>
        <span class="privacy-toggle-copy">
          <span id="privacyToggleLabel" class="privacy-toggle-label">Public</span>
          <span id="privacyToggleHint" class="privacy-toggle-hint">Sign in to watch live</span>
        </span>
        <svg class="privacy-toggle-chevron" aria-hidden="true" viewBox="0 0 12 12" fill="none"><path d="M2.5 4.25 6 7.75l3.5-3.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>
      <div id="privacyMenu" class="privacy-menu" role="menu" aria-labelledby="privacyMenuTitle" hidden>
        <div class="privacy-menu-head">
          <strong id="privacyMenuTitle">Who can find this round?</strong>
          <span>This controls how spectators find the live room.</span>
        </div>
        <button class="privacy-option" type="button" role="menuitemradio" data-private="false" aria-checked="true">
          <span class="privacy-option-top"><strong>Public</strong><em>Listed</em></span>
          <span class="privacy-option-copy">Appears in Live rounds. Anyone signed in with Google can watch the video, timer, and transcript. Watcher mics stay off.</span>
        </button>
        <button class="privacy-option" type="button" role="menuitemradio" data-private="true" aria-checked="false">
          <span class="privacy-option-top"><strong>Unlisted</strong><em>Link only</em></span>
          <span class="privacy-option-copy">Hidden from Live rounds. People with the room link can still spectate after signing in with Google.</span>
        </button>
        <!-- Separate control, separate section. Two radios answer the
             heading; this is a switch that answers something else, and
             role=switch is not even valid inside role=menu. -->
        <div class="privacy-sub">
          <button class="privacy-switch" type="button" role="menuitemcheckbox" id="audCamsToggle" aria-checked="true">
            <span class="ps-copy">
              <span class="ps-head"><strong>Audience cameras</strong><em id="audCamsToggleState">On</em></span>
              <span class="ps-what" id="audCamsToggleCopy">Verified watchers can appear on camera, video only, mics never open. Tap to turn every audience camera off.</span>
            </span>
            <span class="ps-track" aria-hidden="true"><span class="ps-knob"></span></span>
          </button>
        </div>
        <p class="privacy-menu-note">This does not publish your case or add the result to the leaderboard. Those are separate choices after the round.</p>
      </div>
    </div>
```

```css
.visibility-control{position:relative;display:inline-flex}
.privacy-toggle{
  min-height:44px;padding:6px 12px 6px 10px;border:1px solid var(--border);border-radius:14px;
  display:inline-flex;align-items:center;gap:8px;text-align:left;
  color:var(--text-dim);background:rgba(255,255,255,.02);cursor:pointer;font-family:inherit;
  transition:color .15s,border-color .15s,background .15s,box-shadow .15s;
}
.privacy-toggle[hidden]{display:none}
.privacy-toggle:hover,.privacy-toggle[aria-expanded="true"]{color:var(--text);border-color:var(--border-strong);background:rgba(255,255,255,.05)}
.privacy-toggle:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.privacy-toggle-dot{width:8px;height:8px;flex:0 0 auto;border-radius:50%;background:#22c55e;box-shadow:0 0 0 3px rgba(34,197,94,.12)}
.privacy-toggle-copy{display:grid;gap:1px;line-height:1.05}
.privacy-toggle-label{font-size:.8rem;font-weight:800;color:var(--text)}
.privacy-toggle-hint{font-size:.66rem;font-weight:650;color:var(--text-dim);white-space:nowrap}
.privacy-toggle-chevron{width:12px;height:12px;flex:0 0 auto;transition:transform .15s}
.privacy-toggle[aria-expanded="true"] .privacy-toggle-chevron{transform:rotate(180deg)}
.privacy-toggle.is-private{border-color:rgba(245,158,11,.42);background:rgba(245,158,11,.07)}
.privacy-toggle.is-private .privacy-toggle-dot{background:var(--amber);box-shadow:0 0 0 3px rgba(245,158,11,.12)}
.privacy-menu{
  position:absolute;top:calc(100% + 10px);right:0;z-index:700;width:360px;padding:14px;
  color:var(--text);background:var(--bg-card);border:1px solid var(--border-strong);border-radius:16px;
  box-shadow:var(--shadow-lg);
}
.privacy-menu[hidden]{display:none}
.privacy-menu-head{padding:2px 3px 11px}
.privacy-menu-head strong{display:block;font-size:.92rem;font-weight:850;margin-bottom:3px}
.privacy-menu-head span{display:block;font-size:.74rem;line-height:1.42;color:var(--text-dim)}
.privacy-option{
  width:100%;padding:11px 12px;border:1px solid var(--border);border-radius:12px;
  display:grid;gap:4px;text-align:left;color:var(--text);background:transparent;cursor:pointer;font-family:inherit;
  transition:border-color .15s,background .15s;
}
.privacy-option + .privacy-option{margin-top:8px}
/* --ui-soft, not a white overlay: a 4% white wash over the light
   theme's white card is no hover state at all. */
.privacy-option:hover{border-color:var(--border-strong);background:var(--ui-soft)}
.privacy-option:focus-visible{outline:2px solid var(--blue);outline-offset:2px}
/* Selected chrome is scoped to the two visibility RADIOS. It used to
   match on aria-checked alone, which the audience-camera switch also
   carries, so with cameras on (the default) two rows in a
   pick-exactly-one list both painted selected-green. */
.privacy-option[data-private][aria-checked="true"]{border-color:rgba(34,197,94,.45);background:rgba(34,197,94,.06)}
.privacy-option[data-private="true"][aria-checked="true"]{border-color:rgba(245,158,11,.45);background:rgba(245,158,11,.07)}
.privacy-option-top{display:flex;align-items:center;justify-content:space-between;gap:10px}
.privacy-option-top strong{font-size:.84rem;font-weight:850}
.privacy-option-top em{font-size:.62rem;font-style:normal;font-weight:800;letter-spacing:.09em;text-transform:uppercase;color:var(--text-dim)}
.privacy-option-copy{font-size:.72rem;line-height:1.42;color:var(--text-dim)}
/* Audience cameras. Its own section under a rule, because it is a
   switch and not a third answer to "who can find this round?" — it
   sat in the radio list wearing the same card, and read as one. */
.privacy-sub{margin-top:12px;padding-top:12px;border-top:1px solid var(--border)}
.privacy-switch{
  width:100%;display:flex;align-items:flex-start;gap:12px;padding:10px 12px;
  border:1px solid var(--border);border-radius:12px;text-align:left;
  color:var(--text);background:transparent;cursor:pointer;font-family:inherit;
  transition:border-color .15s,background .15s;
}
.privacy-switch:hover{border-color:var(--border-strong);background:var(--ui-soft)}
.privacy-switch:focus-visible{outline:2px solid var(--blue);outline-offset:2px}
.ps-copy{flex:1;min-width:0;display:grid;gap:4px}
.ps-head{display:flex;align-items:center;gap:8px}
.ps-head strong{font-size:.84rem;font-weight:850}
.ps-head em{font-size:.62rem;font-style:normal;font-weight:800;letter-spacing:.09em;text-transform:uppercase;color:var(--text-dim)}
.ps-what{font-size:.72rem;line-height:1.42;color:var(--text-dim)}
.ps-track{
  position:relative;flex:0 0 auto;width:38px;height:22px;margin-top:1px;border-radius:999px;
  background:var(--ui-soft);border:1px solid var(--border-strong);transition:background .15s,border-color .15s;
}
.ps-knob{position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;background:var(--text-dim);transition:transform .15s,background .15s}
.privacy-switch[aria-checked="true"] .ps-track{background:rgba(34,197,94,.22);border-color:rgba(34,197,94,.5)}
.privacy-switch[aria-checked="true"] .ps-knob{transform:translateX(16px);background:var(--green)}
.privacy-menu-note{margin:11px 3px 1px;padding-top:10px;border-top:1px solid var(--border);font-size:.68rem;line-height:1.45;color:var(--text-dim)}
```
