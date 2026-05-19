#!/usr/bin/env node
// Test harness for the server-side topic auto-classifier in
// app/netlify/functions/lib/voice-guidelines.mjs.
//
// Run: `node scripts/test-topic-classifier.mjs`
// Run with --verbose to print every case (default prints only failures).
//
// Why this exists: TOPIC_PRIMERS auto-injection is now load-bearing
// infrastructure (every new primer the format-research workstream
// produces lands here). The classifier scores keywords against motion
// text and fires only above a strict threshold. If the threshold or
// keyword list drifts wrong, the primer either over-fires (wrong
// primer on unrelated motions, polluting the system prompt) or
// under-fires (right primer never reaches the LLM despite the motion
// clearly matching). Both failure modes are silent in production —
// the user just sees worse AI output without knowing why.
//
// Each CASE is a tuple [motion-text, expected-primer-or-empty-string].
// Add new entries when adding a new TOPIC_PRIMER so we never regress.

import {
  inferTopicFromText,
  extractUserTextFromBody,
  MIN_TOPIC_SCORE,
  TOPIC_KEYWORDS,
} from '../app/netlify/functions/lib/voice-guidelines.mjs';

const verbose = process.argv.includes('--verbose');

// ── Cases ─────────────────────────────────────────────────────────
// Format: [label, motion-text, expected-topic ('' = should not fire)]
const CASES = [
  // ── finance: SHOULD fire ────────────────────────────────────────
  ['fin: central-bank asset targeting',
    'Motion: THBT central banks should target asset prices, not just inflation.', 'finance'],
  ['fin: abolish Fed + FDIC',
    'Motion: THW abolish the Federal Reserve and the FDIC. Replace with free banking.', 'finance'],
  ['fin: ban PE healthcare',
    'THBT private equity ownership of healthcare providers should be banned. Leveraged buyout creates moral hazard.', 'finance'],
  ['fin: shadow banking',
    'This house believes systemic risk in shadow banking justifies Basel III-style capital requirements on hedge funds.', 'finance'],
  ['fin: sovereign debt',
    'THBT IMF conditionality on sovereign debt restructuring does more harm than good. Consider the lender of last resort framing.', 'finance'],
  ['fin: repo market',
    'This house would impose hard leverage caps on repo market participants and securitization vehicles.', 'finance'],
  ['fin: dodd-frank rollback',
    'THBT Dodd-Frank should be rolled back. Bank consolidation is killing community banking.', 'finance'],

  // ── arctic: SHOULD fire ─────────────────────────────────────────
  ['arctic: icebreaker plan',
    'Motion: THBT the US should significantly increase its fleet of Arctic Security Cutters and reengage the Arctic Council with Russia.', 'arctic'],
  ['arctic: greenland REM',
    'THW develop Greenland rare-earth minerals through a US-led ICE Pact with Finland and Canada. Arctic sovereignty matters.', 'arctic'],
  ['arctic: indigenous co-mgmt',
    'Motion: THBT Inuit and Saami permanent participants on the Arctic Council should have binding veto power over circumpolar mining and icebreaker basing decisions.', 'arctic'],

  // ── collective_bargaining: SHOULD fire ──────────────────────────
  ['labor: federal workers EO',
    'Motion: THBT Congress should restore the collective bargaining rights stripped from federal workers by EO 14251. Strengthen the NLRA for public-sector unions.', 'collective_bargaining'],
  ['labor: sectoral bargaining',
    'THW adopt sectoral bargaining at the federal level for gig workers. NLRB should treat platform workers as employees with full union rights.', 'collective_bargaining'],
  ['labor: PRO Act repassage',
    'This house believes Congress should repass the PRO Act and ban right-to-work laws. Reverse Janus and rebuild public-sector unions.', 'collective_bargaining'],

  // ── hegemony: SHOULD fire ───────────────────────────────────────
  ['heg: liberal order',
    'Motion: THBT the United States should retrench from the liberal international order. Multipolarity is more stable than US hegemony in the Indo-Pacific.', 'hegemony'],
  ['heg: thucydides trap',
    'THBT the US should accommodate Chinese great-power competition rather than balance against it. The Thucydides Trap is empirically inevitable.', 'hegemony'],

  // ── capitalism_k: SHOULD fire ───────────────────────────────────
  ['capk: marxist alt',
    'Motion: THBT the capitalist mode of production must be abolished. Historical materialism shows wage-labor produces racial capitalism and accumulation by dispossession.', 'capitalism_k'],
  ['capk: neoliberal rationality',
    'THW reject neoliberal rationality in policymaking. Communization and social reproduction theory show capitalism cannot reform out of its own contradictions.', 'capitalism_k'],

  // ── critical_phil_k: SHOULD fire ────────────────────────────────
  ['critphil: afropessimism',
    'Motion: This House believes afropessimism and Wilderson better describe the structural position of Black people than civil rights reformism. Social death is ontological.', 'critical_phil_k'],
  ['critphil: settler colonialism',
    'THBT settler colonialism is a structure not an event. Tuck and Yang argue decolonization is not a metaphor; the logic of elimination persists.', 'critical_phil_k'],

  // ── PF monthly-topic primers: SHOULD fire ───────────────────────
  ['pf_uk_eu: rejoin EU',
    'Motion: Resolved, the United Kingdom should rejoin the European Union. Bregret polling supports it; Article 49 TEU is the route.', 'pf_uk_eu'],
  ['pf_encryption: lawful access',
    'Motion: The federal government should require lawful access to end-to-end encrypted communications. The EARN IT Act + going dark debate.', 'pf_encryption'],
  ['pf_china_extraction: china belt and road',
    'Resolved: The Peoples Republic of China should substantially reduce its international extraction of natural resources via Belt and Road BRI rare earth mining.', 'pf_china_extraction'],
  ['pf_sports_betting: FTC sports betting',
    'Motion: The FTC should establish a federal regulatory framework for sports betting. Murphy v NCAA returned policy to states but addiction services overwhelmed; the SAFE Bet Act + AGA debate is live.', 'pf_sports_betting'],
  ['pf_zoning: corporate SFH ban',
    'Motion: The federal government should ban corporate acquisition of single-family residences. Invitation Homes / Pretium / Tricon REIT landlord harms.', 'pf_zoning'],
  ['pf_war_powers: WPR',
    'Motion: Eliminate the Presidents authority to deploy military forces abroad without Congressional approval. The War Powers Resolution + AUMF interpretation is the question.', 'pf_war_powers'],

  // ── LD topic-cycle primers: SHOULD fire ─────────────────────────
  ['plea_bargaining: just',
    'Motion: Resolved, in the United States criminal justice system, plea bargaining is just. Bordenkircher v Hayes set the standard; the trial penalty + 18% innocent-pleader rate matter.', 'plea_bargaining'],
  ['plea_bargaining: mass incarceration',
    'THBT plea bargaining causes mass incarceration. Alschuler and Pfaff argue prosecutorial discretion in plea deals drives the prison population, not crime rates.', 'plea_bargaining'],
  ['rewilding: substantial tracts',
    'Resolved: The United States ought to rewild substantial tracts of land. Half-Earth via E.O. Wilson, trophic cascade in Yellowstone wolves, 30 by 30 framework.', 'rewilding'],
  ['rewilding: half earth indigenous',
    'THBT rewilding without indigenous co-management replicates fortress conservation. Land Back + Red Deal vs Half-Earth in conservation biology.', 'rewilding'],
  ['nuclear_weapons: possession immoral',
    'Motion: The possession of nuclear weapons is immoral. Drummond conditional intent + NPT 1968 + TPNW 2017 + Walzer supreme emergency framing.', 'nuclear_weapons'],
  ['nuclear_weapons: deterrence',
    'THBT nuclear deterrence has prevented great-power war since 1945. The long peace + mutually assured destruction + no first use doctrine debate.', 'nuclear_weapons'],

  // ── finance: should NOT fire (true negatives) ─────────────────────
  ['skip: tiktok in schools', 'Motion: THW ban TikTok in US schools.', ''],
  ['skip: zoos', 'Motion: This House Would Abolish Zoos.', ''],
  ['skip: housing zoning', 'THW eliminate single-family zoning in all American cities.', ''],
  ['skip: gun control', 'Motion: THW ban civilian ownership of semi-automatic rifles.', ''],
  ['skip: ICC jurisdiction', 'This house believes the ICC should exercise jurisdiction over heads of state.', ''],
  ['skip: drug decrim', 'Motion: THW decriminalize all drug possession for personal use, on the Portugal model.', ''],
  ['skip: prison abolition', 'This house would abolish prisons within a generation.', ''],
  // Edge: a single weak finance keyword should NOT trip the threshold
  ['skip: World-Bank-only edge',
    'THBT the World Bank should require gender quotas in lending to recipient governments.', ''],
  // Edge: "bank" appears but not the finance-domain sense
  ['skip: river-bank metaphor (no fin terms)',
    'Motion: THBT erosion of the river bank along major flood plains is the canary in the coal mine for climate adaptation policy.', ''],

  // ── extraction: body shapes ───────────────────────────────────────
  // These don't test the classifier directly; they test extractUserTextFromBody
  // and then run through the same scorer.
];

// Test body-shape extraction with a runtime assertion separate from the
// CASES table (since the input is structured).
const BODY_SHAPE_TESTS = [
  {
    label: 'extract: Claude string-content',
    body: { messages: [{ role: 'user', content: 'Motion: THBT central banks should regulate hedge funds. Brief me.' }] },
    expected: 'finance',
  },
  {
    label: 'extract: OpenAI parts-array content',
    body: { messages: [{ role: 'user', content: [{ type: 'text', text: 'Argue against the Basel III framework. Hedge funds and shadow banks slip through.' }] }] },
    expected: 'finance',
  },
  {
    label: 'extract: Gemini contents/parts',
    body: { contents: [{ role: 'user', parts: [{ text: 'THBT we should ban private credit. Systemic risk is the load-bearing argument.' }] }] },
    expected: 'finance',
  },
  {
    label: 'extract: system-only finance words ignored',
    body: { system: 'You are a debater. Vocabulary includes central bank, monetary policy, derivative, hedge fund.', messages: [{ role: 'user', content: 'Argue this motion about zoos.' }] },
    expected: '',
  },
  {
    label: 'extract: mixed assistant + user (only user scored)',
    body: { messages: [
      { role: 'assistant', content: 'Central banks should regulate hedge funds.' },
      { role: 'user', content: 'Talk about zoos.' },
    ] },
    expected: '',
  },
];

// ── Runner ────────────────────────────────────────────────────────
let pass = 0;
let fail = 0;
const failures = [];

console.log(`Topic classifier test — MIN_TOPIC_SCORE = ${MIN_TOPIC_SCORE}`);
console.log(`Known topics: ${Object.keys(TOPIC_KEYWORDS).join(', ')}`);
console.log('---');

for (const [label, motionText, expected] of CASES) {
  const got = inferTopicFromText(motionText);
  const ok = got === expected;
  if (ok) {
    pass++;
    if (verbose) console.log(`  PASS  ${label.padEnd(38)} → ${got || '(no fire)'}`);
  } else {
    fail++;
    failures.push({ label, expected, got, motionText });
    console.log(`  FAIL  ${label.padEnd(38)} → got=${got || '(no fire)'} expected=${expected || '(no fire)'}`);
  }
}

for (const { label, body, expected } of BODY_SHAPE_TESTS) {
  const extracted = extractUserTextFromBody(body);
  const got = inferTopicFromText(extracted);
  const ok = got === expected;
  if (ok) {
    pass++;
    if (verbose) console.log(`  PASS  ${label.padEnd(38)} → ${got || '(no fire)'}`);
  } else {
    fail++;
    failures.push({ label, expected, got, extracted });
    console.log(`  FAIL  ${label.padEnd(38)} → got=${got || '(no fire)'} expected=${expected || '(no fire)'}`);
  }
}

console.log('---');
console.log(`${pass} pass / ${fail} fail (${pass + fail} total)`);

if (fail > 0) {
  console.log('\nFailures:');
  for (const f of failures) {
    console.log(`  ${f.label}`);
    console.log(`    expected: ${f.expected || '(no fire)'}`);
    console.log(`    got:      ${f.got || '(no fire)'}`);
    if (f.motionText) console.log(`    motion:   ${f.motionText}`);
    if (f.extracted != null) console.log(`    extracted: "${f.extracted}"`);
  }
  process.exit(1);
}

process.exit(0);
