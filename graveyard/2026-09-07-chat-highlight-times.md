# Homepage chat highlight times

Removed from `app/landing.html`, the `fsChats` renderer and its styles, on
2026-09-07. Aidan: "dont show the times", with a screenshot of the right-hand
`6h`, `4h`, `3h`, and `2h` labels. Message timestamps still select and order
the feed; only their display is removed.

## Removed code

```css
  .fs-chats-age{margin-left:auto;flex:none;font-family:var(--font-mono);font-size:.62rem;
    color:rgba(245,239,231,.56)}
  [data-theme="light"] .fs-chats-age{color:rgba(26,26,31,.52)}
```

```js
    function relTime(ms){
      var d = Math.max(0, Date.now() - ms);
      if (d < 60000) return 'now';
      if (d < 3600000) return Math.floor(d / 60000) + 'm';
      if (d < 86400000) return Math.floor(d / 3600000) + 'h';
      return Math.floor(d / 86400000) + 'd';
    }
```

```js
        var age = document.createElement('span');
        age.className = 'fs-chats-age';
        age.textContent = m.at ? relTime(m.at) : '';
        meta.appendChild(handle); meta.appendChild(age);
```

## Restore

Only restore after a new display decision. Put the CSS after the
`.fs-chats-handle` light-theme rule, the formatter before `pickMix`, and
replace `meta.appendChild(handle);` with the removed row code. No layout
columns changed.
