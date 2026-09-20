# Guide letter avatars

The Meet example in `app/how-it-works.html` used A/B illustrations. Aidan asked to "bring real faces forthis" on 2026-09-20. They are replaced with the existing consented face46 and face48 photos.

Removed markup:

```html
<div class="example-avatar">A</div>
<div class="example-avatar example-avatar--red">B</div>
```

Previous CSS in both copies of `css/discovery-pages.css`:

```css
.example-avatar{display:grid;place-items:center;width:75px;height:84px;background:#e0e7ea;color:#344a55;font-size:33px;border-radius:36px 36px 7px 7px;margin:0 auto 10px}
.example-avatar--red{background:#f0dddd;color:#9c3136}
```

To restore, replace the two `img.example-avatar` elements inside `#step-opponent` with the markup above and restore the avatar CSS in both mirrors. Revisit the guide example decision in `soul.md` first.
