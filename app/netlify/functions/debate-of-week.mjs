/* debate-of-week.mjs
 *
 * GET /api/debate-of-week
 *
 * Returns the featured "debate of the week" motion pinned by the admin.
 * The UI in debate-it.html renders this as a highlighted motion suggestion
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
  {
    motion: 'This House would ban algorithmic content curation.',
    format: 'bp',
    context: 'The clash is user autonomy versus engagement. Prop wins on manufactured addiction and the democratic harm of rage-optimized feeds; opp wins on the counterfactual, a chronological feed nobody can actually navigate at modern volume. The strongest opp reframes curation as a service users opt into, then carries the burden back onto prop to show a workable alternative.',
    background: 'Chronological-by-default feeds are effectively gone. Instagram, TikTok, and X all rank algorithmically, and the EU Digital Services Act now forces very large platforms to offer a non-profiling feed option. So the live fight is not whether ranking exists, but who controls the dial.'
  },
  {
    motion: 'Resolved: The United States should abolish the electoral college.',
    format: 'ld',
    context: 'Trad rounds turn on the value clash, democratic legitimacy versus federalism. Circuit rounds get won on the framework and the disadvantage to abolition, the campaign shift toward pure population centers. Have a clean, pre-loaded answer to the National Popular Vote Compact either way.',
    background: 'Two of the last seven presidential elections sent the popular-vote loser to the White House. The National Popular Vote Interstate Compact has pledges worth 209 of the 270 electoral votes it needs to take effect, so the abolition question is closer to live policy than it looks.'
  },
  {
    motion: 'This House believes that affirmative action does more harm than good.',
    format: 'apda',
    context: 'A canonical impromptu. The trap is debating whether discrimination exists; the real round is mechanism, does race-conscious policy repair the harm or entrench it. Prep the mismatch argument and keep a race-neutral alternative (class-based, geographic) ready so you are not just defending the status quo.',
    background: 'The 2023 Students for Fair Admissions ruling struck down race-conscious college admissions in the US. That makes this a live test of what actually replaces it, not an abstract values debate.'
  },
  {
    motion: 'THBT developed nations should open their borders to climate migrants.',
    format: 'wsdc',
    context: 'On the WSDC circuit this year. Opp almost always concedes the moral pull and wins on absorption capacity and political backlash. Prop should not run open borders as a slogan; bring a phased, capacity-linked model so the practical objections have somewhere to land.',
    background: 'The World Bank projects up to 216 million internal climate migrants by 2050. No binding treaty currently recognizes a climate refugee, which is precisely the legal gap this motion asks you to fill.'
  },
  {
    motion: 'This House would introduce a universal basic income.',
    format: 'asian',
    context: 'High-frequency motion, so judges have heard the easy lines. Win on the funding mechanism and the labor-supply response, not on the warm story. Cite specific pilots and be honest about what they did and did not show.',
    background: 'Pilots in Finland, Kenya (the long-run GiveDirectly study), and Stockton, California reported better mental health and no large drop in employment. Opp should attack scale and cost rather than denying the local benefits.'
  },
  {
    motion: 'Resolved: Plea bargaining should be abolished.',
    format: 'ld',
    context: 'LD topic for the season, and the best prep is the opp. Practice defending a system that disposes of almost every case. Prop wins on coercion of the innocent; opp wins on the collapse that follows if every charge demands a trial.',
    background: 'Roughly 95 percent of US criminal convictions come from plea deals, not trials. The Innocence Project ties a meaningful share of later exonerations to defendants who pled guilty to crimes they did not commit, which is the prop core.'
  },
  {
    motion: 'This House would hold social media companies liable for user-generated content.',
    format: 'bp',
    context: 'BP panel classic. The MA extension is where it is won, usually the chilling-effect-at-scale tradeoff that opening prop glossed. Closing half has to add a mechanism the opening did not already say, not just re-weigh.',
    background: 'Section 230 in the US still shields platforms from liability for user posts, while the EU DSA and the UK Online Safety Act move the other way. The motion is contested live law, not a hypothetical.'
  },
  {
    motion: 'THBT the International Criminal Court does more harm than good.',
    format: 'wsdc',
    context: 'A current WSDC and MUN favourite. The sovereignty-shield opp is underrated: argue the Court entrenches impunity through selective, unenforceable warrants. Prop needs a tight line on deterrence and a response to the great-power exemption.',
    background: 'The ICC issued an arrest warrant for Vladimir Putin in 2023 and for Israeli and Hamas leaders in 2024, yet it has no police force and depends entirely on member-state cooperation that the most powerful states withhold.'
  },
  {
    motion: 'This House believes that cancel culture has gone too far.',
    format: 'apda',
    context: 'A surface-level motion with a deep second layer, and the good prop finds it. Define the harm precisely, disproportionate punishment without process or proportionality, not just hurt feelings. The both-sides mush loses; a clean threshold for when accountability becomes mob sanction wins.'
  },
  {
    motion: 'Resolved: The benefits of space exploration outweigh the costs.',
    format: 'pf',
    context: 'A PF opener for newer debaters and a clean drill for summary collapse and weighing. The round is opportunity cost: every dollar to orbit is a dollar not spent on Earth. Quantify the spillover technology rather than gesturing at it.'
  },
  {
    motion: 'This House would make voting mandatory.',
    format: 'bp',
    context: 'Deceptively hard, and the Whip speeches are the round. Prop wins on legitimacy and turnout equality across class; opp wins on compelled speech and the uninformed-vote harm. Whoever handles the Australia comparison most honestly tends to take it.',
    background: 'Australia has enforced compulsory voting since 1924 and posts turnout above 90 percent, against roughly 60 percent in comparable voluntary systems. That single contrast anchors most of the clash.'
  },
  {
    motion: 'This House believes artificial intelligence is a net positive for democracy.',
    format: 'asian',
    context: 'An emerging circuit motion that rewards real 2025 grounding over sci-fi. Prop wins on access and civic information; opp wins on deepfakes and microtargeted manipulation. Name specific harms and specific safeguards, not vibes.',
    background: '2024 brought the first real wave of AI-generated deepfakes into elections from the US to India to Slovakia. Generative tools now draft campaign copy and help moderate platforms at scale, so the benefits and harms are both already operating.'
  },
  {
    motion: 'Resolved: Economic sanctions are an effective tool of foreign policy.',
    format: 'pf',
    context: 'A PF classic where first-speaker offense on uniqueness decides it. The weighing is effectiveness versus civilian harm, and the empirics cut both ways depending on which case you anchor. Pick your sanctions regime deliberately.',
    background: 'The post-2022 sanctions on Russia are the largest coordinated package in history, yet the ruble recovered and oil kept flowing to new buyers. That gap between intent and result is the center of the round.'
  },
  {
    motion: 'This House would end anonymous online speech.',
    format: 'bp',
    context: 'A strong DPM extension opportunity worth running twice. The clash is accountability versus the cover anonymity gives whistleblowers, activists, and abuse survivors. Specify the verification mechanism, because the harms live in the implementation, not the principle.'
  },
  {
    motion: 'THBT India should transition to a presidential system of government.',
    format: 'wsdc',
    context: 'A high-India-circuit motion, and India won WSDC 2025, so their case shapes are worth knowing. Prop wins on decisive governance and ending coalition paralysis; opp wins on the federalism and minority-protection harms of concentrating executive power.',
    background: 'India runs a Westminster parliamentary system: a ceremonial president and a prime minister who needs a Lok Sabha majority. The 2024 election returned a coalition government, which sharpens the stability-versus-accountability question this motion runs on.'
  },
  {
    motion: 'Resolved: Governments should prioritize economic growth over environmental protection.',
    format: 'pf',
    context: 'The weighing mechanic is the whole round: probability times severity times timeframe. Prop leans on near-term, high-certainty development gains; opp leans on irreversible long-term harm. Whoever controls how the judge discounts the future wins.'
  },
  {
    motion: 'This House would abolish nuclear weapons.',
    format: 'wsdc',
    context: 'A perennial WSDC motion where deterrence theory versus humanitarian law is the core clash. Opp wins on the stability of mutually assured destruction; prop wins on accident risk and proliferation. Prop must have a credible verification answer or the round slips away.',
    background: 'The 2021 Treaty on the Prohibition of Nuclear Weapons is in force, but no nuclear-armed state has signed it. Modernizing arsenals in Russia, China, and North Korea make the principled-versus-practical split impossible to dodge.'
  },
  {
    motion: 'This House believes that free trade does more harm than good.',
    format: 'bp',
    context: 'The BP PM speech here is well-trodden, so the LO split is where rounds get creative. Prop wins on hollowed-out communities and strategic dependency; opp wins on aggregate welfare and poverty reduction. Distributional weighing, who gains and who loses, decides it.',
    background: 'The turn to tariffs and industrial policy since 2016, from US-China trade barriers to reshoring subsidies, means the free-trade consensus is genuinely contested again rather than assumed.'
  },
  {
    motion: 'That civil disobedience is justified in a functioning democracy.',
    format: 'apda',
    context: 'An APDA classic where the definitional debate is only the first layer. The real round is the threshold: when does a working democracy still fail to justify breaking its own laws. Bring a principled limiting principle so you are not defending every act of lawbreaking.'
  },
  {
    motion: 'Resolved: The US should substantially increase restrictions on immigration.',
    format: 'policy',
    context: 'A policy motion on the table, and the K-aff landscape is worth knowing cold, borders-as-violence frameworks dominate the affirmative. Neg needs a clean framework answer and a topical counterplan, not just a politics disad.'
  },
  {
    motion: 'This House would require social media companies to verify user ages.',
    format: 'asian',
    context: 'Age verification is live policy, and the recent statutes are your uniqueness. Prop wins on documented harm to minors; opp wins on the privacy cost of universal ID checks and how easily teens route around them. Engage the circumvention point directly.',
    background: 'The UK Online Safety Act and a 2024 Australian law banning under-16 social-media accounts both mandate age checks. That makes this a real-world test of enforceability rather than a thought experiment.'
  },
  {
    motion: 'THBT the global community should prioritize pandemic prevention over economic recovery.',
    format: 'wsdc',
    context: 'A post-COVID lens that WSDC and MUN both run versions of. The clash is precaution versus present, certain harm, and the round turns on how you discount a low-probability, high-magnitude future event against jobs and growth people can feel now.'
  },
  {
    motion: 'This House believes that the ends justify the means.',
    format: 'apda',
    context: 'The classic impromptu test, good for drilling your ethical framework at speed. Resist the philosophy-seminar pull; ground it in one concrete case and let the principle fall out of the example. Examiners reward a clean line over a name-dropped one.'
  },
  {
    motion: 'Resolved: Affirmative action is justified as a remedy for historical injustice.',
    format: 'ld',
    context: 'A live LD topic where the trad framework fight is corrective justice versus desert, and circuit rounds add a structural-violence layer. Have the post-2023 legal landscape ready to deploy as offense or as defensive ground depending on side.',
    background: 'After the 2023 Students for Fair Admissions ruling barred race-conscious admissions, this motion is really arguing whether the remedy was ever justified and what, if anything, legitimately takes its place.'
  },
  {
    motion: 'This House would impose a global carbon tax.',
    format: 'bp',
    context: 'A BP round that demands real economics grounding. The Opposition split is the play, usually competitiveness and regressivity set against the prop mechanism. Border carbon adjustments are your uniqueness, so know how they actually work before you cite them.',
    background: 'The EU Carbon Border Adjustment Mechanism entered its transitional phase in 2023, pricing the carbon content of imports. That turns a coordinated global carbon price into a live negotiation rather than a hypothetical.'
  },
  {
    motion: 'THBT democracy is not the best form of government for developing nations.',
    format: 'wsdc',
    context: 'Runs hot at WSDC, so know the Singapore and Rwanda case shapes before the semifinal. Prop wins on developmental-state speed and coordination; opp wins on accountability and the long-run fragility of authoritarian growth. The round is whether the success stories generalize.',
    background: 'The China and Singapore growth records are the prop backbone; the counter-evidence is post-authoritarian collapse and stagnation elsewhere. Most of the clash is really about selection bias in which cases each side cites.'
  },
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
