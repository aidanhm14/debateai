# Landing page modules

`landing.html` owns the semantic markup and asset order. These classic scripts
run at their original parser positions, without `async` or `defer`. Their local
IIFEs retain their existing state and event handlers. Early theme selection,
entrance preparation and above-the-fold fetch starts remain inline.

- `example-rounds.js` owns authored examples and unaccepted challenges.
  Its factory supplies a fresh deck to `example-board.js`, which owns selection,
  face casting, rendering and carousel interaction.
- `standings.js` and `standings-rail.js` render the existing shared leaderboard
  fetch. The retained rail is still default-off, not deleted.
- `expanded-page.js`, `chapter-navigation.js`, `jump-navigation.js` and
  `walkthrough.js` own their respective page sections.
- `live-stream.js`, `live-round-strip.js` and `live-notifications.js` preserve
  distinct stream, public-round and invitation behavior.
- Language, feedback, account, waitlist, billing and community sections each
  have their own module. `legacy-*` modules support retained debug layouts.

Styles live in `app/css/landing/` and are mirrored under `css/landing/`.
Their link positions preserve the original cascade. The layered classic,
editorial and illustrated rules remain for compatibility; they are not a
new design. Document-relative SVG paint references stay inline.

`data-page-source` marks these extracted assets for source-based guards.
`scripts/lib/page-source.mjs` composes them in order, so existing tests still
inspect the actual shipped behavior. Browser tests load the real external
files and cover carousel navigation, page expansion and live-only Spectate.
