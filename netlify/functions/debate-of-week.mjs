/* debate-of-week.mjs
 *
 * GET /api/debate-of-week
 *
 * Returns the featured "debate of the week" motion pinned by the admin.
 * The UI in debate-ai.html renders this as a highlighted motion suggestion
 * above the motion input — one click fills the field.
 *
 * Storage: config/debate_of_week
 *   { motion, format, context, setAt (serverTimestamp) }
 *
 * To change the featured motion, write directly via the Firestore console:
 *   db.doc('config/debate_of_week').set({ motion: '...', format: 'bp', context: '...', setAt: serverTimestamp() })
 *
 * A future /admin UI will expose this as a form; for now the console is fine.
 *
 * Cache: 6 hours (Netlify edge cache + in-memory). A stale feature motion
 * for up to 6 hours is acceptable; the admin is the bottleneck anyway.
 *
 * Fallback: if the doc doesn't exist, returns a hardcoded weekly default
 * so the UI never renders an empty banner.
 */

import { getDb } from './lib/firestore.mjs';
import { corsResponse, jsonResponse } from './lib/response.mjs';

const DOC_PATH = 'config/debate_of_week';
const CACHE_TTL = 6 * 60 * 60 * 1000; // 6 hours

// Rotate weekly fallbacks by ISO week number so the hardcoded motions
// cycle even when no admin has manually set one.
const WEEKLY_FALLBACKS = [
  { motion: 'This House would ban algorithmic content curation.', format: 'bp', context: 'The era of chronological feeds is gone. This motion asks whether that shift was a mistake.' },
  { motion: 'Resolved: The United States should abolish the electoral college.', format: 'ld', context: '2024 showed the structural tensions. Run this before they calcify.' },
  { motion: 'This House believes that affirmative action does more harm than good.', format: 'apda', context: 'A canonical impromptu. Prep both sides before someone else does.' },
  { motion: 'THBT developed nations should open their borders to climate migrants.', format: 'wsdc', context: 'On the WSDC circuit this year. Know the case before your prep week.' },
  { motion: 'This House would introduce a universal basic income.', format: 'asian', context: 'High-frequency motion. Every format has run this. Know yours cold.' },
  { motion: 'Resolved: Plea bargaining should be abolished.', format: 'ld', context: 'LD topic for the season. Best prep is the opp — practice that side.' },
  { motion: 'This House would hold social media companies liable for user-generated content.', format: 'bp', context: 'BP panel prep classic. The MA extension is what wins it.' },
  { motion: 'THBT the International Criminal Court does more harm than good.', format: 'wsdc', context: 'Current MUN/WSDC favourite. The Sov-Shield neg is underrated.' },
  { motion: 'This House believes that cancel culture has gone too far.', format: 'apda', context: 'Surface-level motion with a deep second layer. The good prop finds it.' },
  { motion: 'Resolved: The benefits of space exploration outweigh the costs.', format: 'pf', context: 'PF opener for new debaters. Solid for drilling summary collapse.' },
  { motion: 'This House would make voting mandatory.', format: 'bp', context: 'Deceptively hard. The Whip clashes are the round.' },
  { motion: 'This House believes artificial intelligence is a net positive for democracy.', format: 'asian', context: 'Emerging circuit motion. Both sides need real-world 2025 grounding.' },
  { motion: 'Resolved: Economic sanctions are an effective tool of foreign policy.', format: 'pf', context: 'PF classic. 1st-speaker offense on Ukraine uniqueness is this month.' },
  { motion: 'This House would end anonymous online speech.', format: 'bp', context: 'Strong DPM extension opportunity. Worth running twice.' },
  { motion: 'THBT India should transition to a presidential system of government.', format: 'wsdc', context: 'High-India-circuit motion. India won WSDC 2025 — know their case shapes.' },
  { motion: 'Resolved: Governments should prioritize economic growth over environmental protection.', format: 'pf', context: 'The weighing mechanic here is the round. Prob × Severity × Timeframe.' },
  { motion: 'This House would abolish nuclear weapons.', format: 'wsdc', context: 'Perennial WSDC motion. Deterrence theory vs humanitarian law is the core.' },
  { motion: 'This House believes that free trade does more harm than good.', format: 'bp', context: 'BP PM speech is well-trodden. The LO split is where rounds get creative.' },
  { motion: 'That civil disobedience is justified in a functioning democracy.', format: 'apda', context: 'APDA classic. The definitional debate is only the first layer.' },
  { motion: 'Resolved: The US should substantially increase restrictions on immigration.', format: 'policy', context: 'Policy motion on the table. K-aff landscape on this is worth knowing.' },
  { motion: 'This House would require social media companies to verify user ages.', format: 'asian', context: 'Age-verification debate is live. UK Online Safety Act is your uniqueness.' },
  { motion: 'THBT the global community should prioritize pandemic prevention over economic recovery.', format: 'wsdc', context: 'Post-COVID lens. WSDC and MUN both run versions of this.' },
  { motion: 'This House believes that the ends justify the means.', format: 'apda', context: 'The classic impromptu test. Good for drilling your philosophical framework at speed.' },
  { motion: 'Resolved: Affirmative action is justified as a remedy for historical injustice.', format: 'ld', context: '2024-25 LD topic. Rawls vs desert is the trad framework fight.' },
  { motion: 'This House would impose a global carbon tax.', format: 'bp', context: 'BP round that requires real econ grounding. The Opposition split is the play.' },
  { motion: 'THBT democracy is not the best form of government for developing nations.', format: 'wsdc', context: 'Runs hot at WSDC. Know the Singapore/Rwanda case shapes before the semi.' },
];

function weekNumber() {
  const d = new Date();
  const jan1 = new Date(d.getFullYear(), 0, 1);
  return Math.ceil(((d - jan1) / 86400000 + jan1.getDay() + 1) / 7);
}

let cache = { data: null, ts: 0 };

export default async (request) => {
  if (request.method === 'OPTIONS') return corsResponse(request);

  // Serve from memory cache if fresh.
  if (cache.data && Date.now() - cache.ts < CACHE_TTL) {
    return jsonResponse(cache.data, 200, request, { 'Cache-Control': 'public, max-age=21600' });
  }

  let db;
  try { db = getDb(); }
  catch (e) {
    const fallback = WEEKLY_FALLBACKS[weekNumber() % WEEKLY_FALLBACKS.length];
    return jsonResponse({ ...fallback, source: 'fallback' }, 200, request, { 'Cache-Control': 'public, max-age=3600' });
  }

  try {
    const snap = await db.doc(DOC_PATH).get();
    const payload = snap.exists
      ? { ...snap.data(), source: 'firestore', setAt: snap.data().setAt?.toMillis?.() || null }
      : { ...WEEKLY_FALLBACKS[weekNumber() % WEEKLY_FALLBACKS.length], source: 'fallback' };

    cache = { data: payload, ts: Date.now() };
    return jsonResponse(payload, 200, request, { 'Cache-Control': 'public, max-age=21600' });
  } catch (err) {
    console.error('[debate-of-week] Firestore read failed:', err.message);
    const fallback = WEEKLY_FALLBACKS[weekNumber() % WEEKLY_FALLBACKS.length];
    return jsonResponse({ ...fallback, source: 'fallback-error' }, 200, request, { 'Cache-Control': 'public, max-age=3600' });
  }
};

export const config = { path: '/api/debate-of-week' };
