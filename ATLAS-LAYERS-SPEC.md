# Atlas — build spec for two new layers (Adult Leagues + Impact map)

> Handoff doc for the session that owns `app/atlas.html`. Written by the
> other session after scoping these with Aidan. All design decisions below
> are Aidan's confirmed answers, not suggestions. Implement directly; don't
> re-ask the forks.
>
> Why this exists: two sessions were both editing `atlas.html` and colliding
> on every push. This session backed off the file. Everything it learned
> about the atlas internals + the agreed design for the two new layers is
> captured here so the atlas-owning session can build it conflict-free.

---

## What already shipped (don't redo)

- Inline `var SCHOOLS = [...]` (curated core) + `window.ATLAS_EXTRA` from
  `/js/atlas-data.js` (research dataset, ~715 records) merged into SCHOOLS at
  runtime (the `(window.ATLAS_EXTRA||[]).forEach(...)` block).
- Record schema: `{n, city, lat, lng, lvl:'college'|'hs', fmt:[...], tier:1-3, country, region}`.
- 12 international high schools were added to the curated core to fill the
  global/Europe HS gap (the research dataset was ~170 North America, only 3
  Asia, 0 Europe/Oceania/Africa). Raffles was deduped (core already had it).
- Color-by-level already exists: `LVL_COLOR = {college:'#ef4444', hs:'#3b82f6'}`,
  `colorMode` can be `status|format|level`, `colorFor(d)` switches on it,
  `seg-color` buttons set it, `seg-level` filters (`data-l`: all/college/hs).

So "improve HS research" and "color grade for colleges" are effectively done.
The two builds below are the genuinely new asks.

---

## Atlas internals you'll touch (orientation)

- `var LVL_COLOR`, `var STATUS_COLOR`, `var FMT_COLOR` — color maps. FMT_COLOR
  keys are the only valid `fmt` values (APDA, BP, Worlds, Policy, LD, PF,
  Parli, Congress, Asian Parli, Karl Popper, MUN). `WSDC` is NOT a key; use
  `Worlds` for school-circuit international programs or it gets filtered out.
- `colorFor(d)` → returns a hex by `colorMode`. `pinIcon(d)` → sizes by tier
  (1=16px,2=12px,3=9px), colors by `colorFor`. `hashOff(n)` → deterministic
  jitter so same-city pins fan out.
- `passes(d)` → filter (levelFilter + activeFormats). `visibleSet()` → the
  rendered set. The legend (`colorMode==='level'` branch) counts
  `lc={college:0,hs:0}`.
- The revenue calculator ("If schools pay") — the `#calc-*` block + the
  `~27,000 US high schools` framing. Cites NCES/UDISE/gov stats.

---

## LAYER A — Adult-league potential

**What an adult league is (Aidan's call): ONLINE-FIRST on DebateIt.** Adults
matched + ranked through the platform itself (rides the existing /spar
matchmaker + leaderboard). In-person meetups are a later phase. So this layer
is "which metros to seed an online adult league in first," not "where to open
a clubhouse."

**Grain:** metro-level nodes (one node per candidate metro), separate from the
school pins. New `lvl:'adult'`.

**Scoring — use ALL signals, broken into separate sections (Aidan: "all
actually, but divide it up rightly and do more sections to make this data
insightful"). Do NOT collapse to one number only.** Per metro, compute and
SHOW each sub-score, plus a blended 0-100 `potential`:

1. **Alumni supply** (the strongest, and free to compute). Sum of
   tier-weighted college programs within ~100 km of the metro, from SCHOOLS
   where `lvl==='college'` (tier1=3, tier2=2, tier3=1). Ex-debaters who
   graduate are the natural supply for an adult league. Normalize to 0-100.
   No external data needed — it's already on the map.
2. **Reach** — metro population. Hardcode populations for the top ~30-40
   global metros (cite a source line like the calculator does). Normalize.
3. **Your demand** — DebateIt signed-in user density per metro. This lives in
   Firestore and isn't cleanly available to a static page. For v1: leave a
   clearly-labelled placeholder (0 or proportional to alumni supply) and a
   `TODO: wire from a Firestore user-geo export`. Don't fake precision.
4. **Existing appetite** — proxy for "people here already pay to practice
   speaking": Toastmasters club density / known adult debate clubs. Lighter
   confidence; optional for v1, but reserve the section.

`potential = 0.40*alumni + 0.30*reach + 0.20*demand + 0.10*appetite`
(tune weights; expose them as constants).

**Wiring:**
- `LVL_COLOR.adult = '#a855f7'` (violet — distinct from college red / hs blue;
  not a status color). Add `adult` to the `seg-level` filter and the
  `colorMode==='level'` legend counter (`lc={college:0,hs:0,adult:0}`).
- Adult nodes render as a heat/intensity by `potential` (bigger/brighter =
  higher), violet.
- Panel sections (this is the "more sections" ask): (a) blended ranking of
  top metros, (b) top metros by alumni supply, (c) by reach, (d) demand +
  appetite when wired. Each a short ranked list.
- Framing copy: online-first ("seed an online adult league here, in-person
  later"), tie to /spar + leaderboard.

---

## LAYER B — Impact map (Market / Impact toggle)

**Form (Aidan's call): a top-level Market / Impact toggle on the SAME atlas**
(not a separate page). Market = today's view (school pins + revenue
calculator). Impact = the mission view below.

**The reframe:** Market answers "where can we sell to schools." Impact answers
"where does this skill create the most human value." They're not in tension —
the highest-impact regions are also where free, online, English debate has the
most pull, so Impact doubles as a growth thesis.

**Grain (Aidan's call): metro-level.** Score candidate metros (fall back to
country-level shading only where metro data is genuinely too sparse, and say so).

**Score (Aidan's call): one blended "debate opportunity" heat for the map,
with the two lenses BROKEN OUT as their own ranked sections in the panel.**
The two lenses:

1. **Literacy gain** — where practicing argumentation in English most improves
   fluency. = (English-as-career-gateway) × (room to improve). Base on EF EPI
   (national), but the bright spot is MID proficiency inside an
   English-mediated economy — not the already-fluent (US/UK = no gap), not
   where English is economically irrelevant. Lights up India, Philippines,
   Indonesia, Vietnam, Nigeria, Brazil, Egypt.
2. **Resume / employability value** — where debate (spoken English +
   structured reasoning) most moves a CV. Highest in emerging white-collar job
   markets with English-medium professional sectors (IT/BPO/consulting/law)
   and youth job competition. Proxy from EF EPI + services-export / GNI +
   youth-share.

`opportunity = blend(literacyGain, resumeValue) ÷ existingDebateDensity`
(white space: need with no supply scores highest; debate-program density per
metro/country is computable from SCHOOLS + ATLAS_EXTRA counts).

**Data sources** (cite them on the panel, like the calculator cites NCES):
EF English Proficiency Index, World Bank (under-25 share, services exports,
GNI per capita), and the atlas's own program-density counts.

**Render:** Impact mode swaps the school pins for metro bubbles/choropleth
colored + sized by `opportunity`. Panel sections: combined opportunity
ranking, literacy-gain ranking, resume-value ranking, and a one-line "why"
per top metro ("Lagos: huge under-25 cohort, English is the job ladder, debate
density near zero").

**FRAMING GUARDRAIL (important):** lead with the learner's ambition, never
deficit. "Where a free skill has the most leverage for ambitious young
people," never "where people need fixing." The condescension version wrecks
the brand voice. No white-savior tone.

**Deck-credible now, real later (Aidan: "Both, in that order"):** seed Impact
with a credible curated set of ~20-30 top metros + cited indices so it looks
right in a pitch immediately, but structure the scoring so a real data feed
can replace the seed later.

---

## Sequencing suggestion

1. Layer A wiring (LVL_COLOR.adult + seg-level + legend) — small.
2. Layer A scoring + nodes + sections.
3. Layer B toggle shell (Market/Impact switch) — keep Market untouched.
4. Layer B impact scoring + render + sections.

Each is independently shippable. SW bump on each (both `sw.js` files).
