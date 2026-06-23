/* coach-fab.js — RETIRED 2026-06-23.
 *
 * The floating in-tab Coach orb + slide-up drawer (and its embedded
 * /coach session iframe, the "in-session" mode) were removed per Aidan:
 * the in-tab popup was glitchy. Coach now lives ONLY on its own page at
 * /coach, reached from the topbar "Coach" link.
 *
 * This file is kept as a no-op stub so any cached HTML still referencing
 * /js/coach-fab.js loads cleanly instead of 404ing. The site-wide
 * injector in topbar.js (ensureCoachFabLoaded) and the per-page
 * <script defer src="/js/coach-fab.js"> tags were removed in the same
 * change. To bring the floating orb back, restore this file + the loaders
 * from git history immediately before this commit.
 */
(function () { /* intentionally does nothing — the in-tab coach popup is retired */ })();
