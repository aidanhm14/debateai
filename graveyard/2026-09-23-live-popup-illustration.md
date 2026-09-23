# Live popup illustration, removed September 23

Aidan requested an image or thumbnail of the advertised round instead of this animation. The card now requests its own room snapshot directly, with a compact text fallback. Do not restore this artwork without a new direction. Archived from origin/main 45534cef.

## Renderer

```js
  // Illustrations are fictional, with varied pairings. No real profile
  // or inferred gender controls the artwork; names stay in the card body.
  function illustrationHtml() {
    var variant = (readNum(sessionStorage, 'da-livepop-art') + 1) % 4;
    write(sessionStorage, 'da-livepop-art', variant);
    var hair = [[false, true], [true, false], [true, true], [false, false]][variant];
    function person(x, longHair, skin, shirt, delay) {
      return '<g class="da-debate-person" style="--talk-delay:' + delay + 's" transform="translate(' + x + ',0)">' +
        '<g class="da-debate-head">' +
          (longHair ? '<path d="M39 130V83c0-51 76-51 76 0v55z" fill="#29252d"/>' : '') +
          '<rect x="64" y="119" width="27" height="30" rx="9" fill="' + skin + '"/>' +
          '<ellipse cx="77" cy="90" rx="30" ry="38" fill="' + skin + '"/>' +
          (longHair ? '<path d="M47 90c-9-53 62-63 63-4-15-7-25-17-31-29-8 18-16 25-32 33" fill="#29252d"/>' : '<path d="M47 80c-8-39 21-49 46-35 17-1 27 18 13 40l-7-22c-18 12-27-3-47 14z" fill="#382f33"/>') +
          '<path d="M62 91h3m24 0h3" stroke="#30272a" stroke-width="4" stroke-linecap="round"/>' +
          '<path class="da-debate-mouth" d="M71 109q7 6 14-1" fill="none" stroke="#783d3c" stroke-width="3" stroke-linecap="round"/>' +
        '</g>' +
        '<path d="M22 210v-37c0-47 110-47 110 0v37" fill="' + shirt + '"/>' +
        '<path class="da-debate-hand" d="M117 178l20-29m-3 0 5-15m-2 15 13-9" fill="none" stroke="' + skin + '" stroke-width="13" stroke-linecap="round"/>' +
        '<g class="da-debate-bubble"><rect x="105" y="49" width="49" height="25" rx="12" fill="#fffaf2"/><path d="m114 70-4 10 15-8" fill="#fffaf2"/><path d="M116 60h4m7 0h4m7 0h4" stroke="#494351" stroke-width="3" stroke-linecap="round"/></g>' +
      '</g>';
    }
    return '<span class="da-livepop__illustration" role="img" aria-label="Illustration of two people debating">' +
      '<svg viewBox="0 0 400 225" aria-hidden="true"><rect width="400" height="225" fill="#e8e4ed"/>' +
      '<rect x="6" y="7" width="192" height="211" rx="16" fill="#f0d9ce"/><rect x="202" y="7" width="192" height="211" rx="16" fill="#d0deda"/>' +
      person(13, hair[0], variant % 2 ? '#b97552' : '#edb991', '#b84d4b', 0) +
      person(210, hair[1], variant % 2 ? '#e9b394' : '#8c543f', '#486d68', 1.6) +
      '</svg><span class="da-livepop__art-label">Illustration</span></span>';
  }

```

## Styles

```js
      '.da-livepop__illustration{position:absolute;inset:0;display:block;background:#e8e4ed}',
      '.da-livepop__illustration svg{display:block;width:100%;height:100%;object-fit:cover}',
      '.da-livepop__art-label{position:absolute;right:9px;bottom:9px;padding:3px 6px;border-radius:4px;background:rgba(255,250,242,.88);color:#4c4644;font-size:9px;font-weight:700}',
      '.da-livepop__room-note{position:absolute;left:9px;bottom:9px;padding:5px 8px;border-radius:6px;background:rgba(10,10,12,.8);color:#fff;font-size:11px;font-weight:700}',
      '.da-debate-head{transform-box:fill-box;transform-origin:50% 90%;animation:daDebateNod 3.2s ease-in-out infinite;animation-delay:var(--talk-delay)}',
      '.da-debate-hand{transform-box:fill-box;transform-origin:0% 100%;animation:daDebateHand 3.2s ease-in-out infinite;animation-delay:var(--talk-delay)}',
      '.da-debate-bubble{opacity:.3;animation:daDebateTalk 3.2s ease-in-out infinite;animation-delay:var(--talk-delay)}',
      '@keyframes daDebateNod{0%,50%,100%{transform:rotate(0)}20%{transform:rotate(-4deg)}35%{transform:rotate(2deg)}}',
      '@keyframes daDebateHand{0%,50%,100%{transform:rotate(0)}22%{transform:rotate(-12deg)}}',
      '@keyframes daDebateTalk{0%,45%,100%{opacity:.3}12%,32%{opacity:1}}',
      '.da-livepop.is-paused .da-livepop__illustration *{animation-play-state:paused}',

```
