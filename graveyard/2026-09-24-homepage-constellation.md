# Homepage constellation backdrop

Removed from `app/landing.html` during Aidan's request to “un-vibe code the entire front page look” and reconsider fonts and button shapes. The flat background gives the real people, debate question and chat a clearer hierarchy. The shared canvas implementation and other pages are unchanged.

Original markup, immediately before the left-rail jump-nav comment:

```html
<!-- Shared neural-constellation background (dark/crimson themes only) -->
<canvas id="uiNeuralCanvas" class="ui-neural-canvas"></canvas>
<script defer src="/js/ui-neural.js"></script>
```

To restore, insert these tags at that anchor. The shared rules in `app/css/ui.css` and renderer in `app/js/ui-neural.js` still exist. Reconsider the visual density against the homepage's flat panels before restoring it.
