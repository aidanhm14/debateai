// The proposition bank for the opinion panel.
//
// WHY A FIXED BANK, NOT FREE-FORM QUESTIONS
// A panel is only worth something if the same instrument is asked to many
// people, repeatedly, in identical wording. The moment the question text
// drifts, the time series breaks and the responses stop being comparable.
// So propositions live here as immutable records: once an id ships, its
// `text` never changes. To reword, retire the old id and mint a new one.
//
// SHAPE
//   id      stable slug, never reused, never reworded
//   text    the proposition, phrased as a flat declarative the respondent
//           agrees or disagrees with. No "should we" questions, no double
//           barrels, no negations (a negated stem makes -3 ambiguous).
//   topic   coarse domain, used for rotation and for buyer-side filtering
//   tags    finer facets for slicing
//   debated whether this maps to a live competitive motion, so the panel
//           can be cross-referenced against round outcomes on the same claim
//
// SCALE
// Responses are a 7-point Likert (-3 strongly disagree ... +3 strongly
// agree, 0 genuinely neutral) plus a separate 0-100 confidence. Keeping
// direction and certainty on separate axes is the whole point: a debater
// who moves from +3/low-confidence to +1/high-confidence has changed in a
// way a single agree-disagree number cannot express, and that distinction
// is most of what makes this data interesting.

export const STANCE_SCALE = {
  min: -3,
  max: 3,
  labels: {
    '-3': 'Strongly disagree',
    '-2': 'Disagree',
    '-1': 'Lean disagree',
    '0': 'Neutral',
    '1': 'Lean agree',
    '2': 'Agree',
    '3': 'Strongly agree',
  },
};

// How long before a proposition becomes eligible to ask the same panelist
// again. Re-asks are where the value is: the second answer to an identical
// stem is a drift measurement. Too short and you measure mood; too long and
// most panelists churn before the second wave.
export const REASK_AFTER_DAYS = 75;

// Cap on stored waves per panelist per proposition. A 5-point series is
// plenty for drift, and it bounds the doc size.
export const MAX_WAVES = 5;

export const TOPICS = [
  'ai',
  'economics',
  'education',
  'climate',
  'liberties',
  'international',
  'society',
  'governance',
];

export const PROPOSITIONS = [
  // ── AI and technology ──────────────────────────────────────────
  { id: 'ai-training-consent', topic: 'ai', debated: true,
    text: 'AI companies should be required to get consent before training on published work.',
    tags: ['copyright', 'consent', 'regulation'] },
  { id: 'ai-open-weights', topic: 'ai', debated: true,
    text: 'Frontier AI models should be released with open weights.',
    tags: ['open-source', 'safety', 'proliferation'] },
  { id: 'ai-liability-developer', topic: 'ai', debated: true,
    text: 'When an AI system causes harm, the developer should bear the legal liability rather than the user.',
    tags: ['liability', 'regulation', 'law'] },
  { id: 'ai-in-schools', topic: 'ai', debated: true,
    text: 'Students should be allowed to use AI assistants on graded written work.',
    tags: ['education', 'assessment', 'academic-integrity'] },
  { id: 'ai-job-displacement', topic: 'ai', debated: false,
    text: 'AI will destroy more jobs than it creates over the next twenty years.',
    tags: ['labor', 'forecast', 'automation'] },
  { id: 'ai-compute-licensing', topic: 'ai', debated: true,
    text: 'Governments should require a license to train models above a set compute threshold.',
    tags: ['regulation', 'compute', 'safety'] },
  { id: 'social-media-minors', topic: 'ai', debated: true,
    text: 'Social media platforms should be banned for users under sixteen.',
    tags: ['minors', 'platforms', 'regulation'] },
  { id: 'algorithmic-feeds', topic: 'ai', debated: true,
    text: 'Users should have a legal right to a chronological, non-personalised feed.',
    tags: ['platforms', 'transparency', 'regulation'] },

  // ── Economics ──────────────────────────────────────────────────
  { id: 'ubi', topic: 'economics', debated: true,
    text: 'A universal basic income would do more good than harm in wealthy countries.',
    tags: ['welfare', 'redistribution', 'labor'] },
  { id: 'wealth-tax', topic: 'economics', debated: true,
    text: 'An annual tax on wealth above ten million is justified.',
    tags: ['tax', 'inequality', 'redistribution'] },
  { id: 'rent-control', topic: 'economics', debated: true,
    text: 'Rent control makes housing more affordable overall.',
    tags: ['housing', 'price-controls', 'urban'] },
  { id: 'free-trade', topic: 'economics', debated: true,
    text: 'Free trade agreements have been good for workers in developing economies.',
    tags: ['trade', 'globalisation', 'labor'] },
  { id: 'sovereign-debt-forgiveness', topic: 'economics', debated: true,
    text: 'Wealthy creditor nations should cancel the sovereign debt of the poorest countries.',
    tags: ['development', 'debt', 'international'] },
  { id: 'four-day-week', topic: 'economics', debated: true,
    text: 'A four-day working week with no loss of pay should become the standard.',
    tags: ['labor', 'productivity', 'welfare'] },
  { id: 'crypto-legitimacy', topic: 'economics', debated: false,
    text: 'Cryptocurrencies will play a significant role in the mainstream financial system within a decade.',
    tags: ['finance', 'forecast', 'technology'] },

  // ── Education ──────────────────────────────────────────────────
  { id: 'standardised-testing', topic: 'education', debated: true,
    text: 'Standardised admissions tests do more to help disadvantaged applicants than to hurt them.',
    tags: ['admissions', 'assessment', 'equity'] },
  { id: 'free-university', topic: 'education', debated: true,
    text: 'University tuition should be free at the point of use.',
    tags: ['access', 'funding', 'higher-ed'] },
  { id: 'phones-in-school', topic: 'education', debated: true,
    text: 'Smartphones should be banned during the school day.',
    tags: ['minors', 'attention', 'policy'] },
  { id: 'debate-requirement', topic: 'education', debated: true,
    text: 'Competitive debate should be a required part of secondary education.',
    tags: ['curriculum', 'debate', 'civics'] },
  { id: 'homework-abolition', topic: 'education', debated: true,
    text: 'Homework should be abolished in primary schools.',
    tags: ['pedagogy', 'minors', 'curriculum'] },
  { id: 'selective-schools', topic: 'education', debated: true,
    text: 'Academically selective schools worsen social mobility.',
    tags: ['equity', 'selection', 'mobility'] },

  // ── Climate and energy ─────────────────────────────────────────
  { id: 'nuclear-power', topic: 'climate', debated: true,
    text: 'Expanding nuclear power is necessary to meet climate targets.',
    tags: ['energy', 'decarbonisation', 'risk'] },
  { id: 'carbon-tax', topic: 'climate', debated: true,
    text: 'A carbon tax is a better instrument than direct regulation for cutting emissions.',
    tags: ['policy-instrument', 'tax', 'emissions'] },
  { id: 'degrowth', topic: 'climate', debated: true,
    text: 'Rich countries should pursue degrowth rather than green growth.',
    tags: ['economics', 'emissions', 'consumption'] },
  { id: 'climate-reparations', topic: 'climate', debated: true,
    text: 'High-emitting countries owe financial reparations to countries most harmed by climate change.',
    tags: ['justice', 'international', 'finance'] },
  { id: 'geoengineering', topic: 'climate', debated: true,
    text: 'Solar geoengineering research should be actively funded.',
    tags: ['technology', 'risk', 'research'] },

  // ── Civil liberties ────────────────────────────────────────────
  { id: 'hate-speech-law', topic: 'liberties', debated: true,
    text: 'Hate speech should be criminally prosecuted.',
    tags: ['speech', 'law', 'harm'] },
  { id: 'encryption-backdoors', topic: 'liberties', debated: true,
    text: 'Governments should be able to compel access to encrypted communications in serious criminal cases.',
    tags: ['privacy', 'security', 'surveillance'] },
  { id: 'facial-recognition-police', topic: 'liberties', debated: true,
    text: 'Police use of live facial recognition in public spaces should be banned.',
    tags: ['surveillance', 'policing', 'privacy'] },
  { id: 'compulsory-voting', topic: 'liberties', debated: true,
    text: 'Voting should be compulsory.',
    tags: ['democracy', 'participation', 'law'] },
  { id: 'jury-trials', topic: 'liberties', debated: true,
    text: 'Trial by jury produces more just outcomes than trial by judge alone.',
    tags: ['law', 'justice', 'institutions'] },
  { id: 'drug-decriminalisation', topic: 'liberties', debated: true,
    text: 'All personal drug possession should be decriminalised.',
    tags: ['criminal-justice', 'health', 'harm-reduction'] },

  // ── International ──────────────────────────────────────────────
  { id: 'humanitarian-intervention', topic: 'international', debated: true,
    text: 'Military intervention without Security Council authorisation is sometimes justified to stop atrocities.',
    tags: ['sovereignty', 'force', 'law'] },
  { id: 'open-borders', topic: 'international', debated: true,
    text: 'Wealthy countries should substantially open their borders to economic migrants.',
    tags: ['migration', 'labor', 'sovereignty'] },
  { id: 'unsc-veto', topic: 'international', debated: true,
    text: 'The permanent members of the UN Security Council should lose the veto.',
    tags: ['institutions', 'reform', 'governance'] },
  { id: 'sanctions-efficacy', topic: 'international', debated: true,
    text: 'Economic sanctions usually fail to change the behaviour of the governments they target.',
    tags: ['statecraft', 'efficacy', 'coercion'] },

  // ── Society and governance ─────────────────────────────────────
  { id: 'term-limits', topic: 'governance', debated: true,
    text: 'Elected legislators should face strict term limits.',
    tags: ['democracy', 'institutions', 'accountability'] },
  { id: 'sortition', topic: 'governance', debated: true,
    text: 'Some legislative seats should be filled by lottery from the general population.',
    tags: ['democracy', 'institutions', 'reform'] },
  { id: 'voting-age-16', topic: 'governance', debated: true,
    text: 'The voting age should be lowered to sixteen.',
    tags: ['democracy', 'minors', 'participation'] },
  { id: 'meritocracy', topic: 'society', debated: true,
    text: 'Rewarding people according to measured merit produces a fairer society than the alternatives.',
    tags: ['fairness', 'inequality', 'philosophy'] },
  { id: 'moral-progress', topic: 'society', debated: false,
    text: 'Humanity is becoming morally better over time.',
    tags: ['philosophy', 'history', 'values'] },
  { id: 'cancel-culture', topic: 'society', debated: true,
    text: 'Public pressure campaigns against individuals for their speech do more harm than good.',
    tags: ['speech', 'norms', 'accountability'] },
  { id: 'animal-rights', topic: 'society', debated: true,
    text: 'Intensive animal farming should be phased out.',
    tags: ['ethics', 'agriculture', 'welfare'] },
];

// Indexed lookup. Built once at module load.
const BY_ID = new Map(PROPOSITIONS.map(p => [p.id, p]));

export function getProposition(id) {
  return BY_ID.get(id) || null;
}

export function isValidProposition(id) {
  return typeof id === 'string' && BY_ID.has(id);
}

export function propositionIds() {
  return PROPOSITIONS.map(p => p.id);
}

// Where a response came from. Kept as a closed set so the export can be
// filtered by elicitation context, which matters to a buyer: an answer
// given cold on a landing page is a different instrument from one given
// straight after losing a round on that exact motion.
export const STANCE_TRIGGERS = new Set([
  'panel',       // the standing panel widget, asked cold
  'post_round',  // straight after a round, with attribution attached
  'onboarding',  // during first-run setup
  'topic_page',  // on a motion or topic page, in context
]);

// Self-reported segmentation buckets. Deliberately coarse: fine-grained
// demographics on a platform with school-age users is a liability, and
// coarse buckets are all a cross-tab actually needs. Everything here is
// optional and skippable, and none of it is asked of signed-out users.
export const SEGMENTS = {
  experience: ['none', 'under-1y', '1-3y', '3-5y', '5y-plus'],
  circuit: ['school', 'university', 'coach', 'former', 'non-competitive'],
  region: ['africa', 'asia-east', 'asia-south', 'asia-west', 'europe', 'latam', 'north-america', 'oceania'],
  // Age is a band, not a number, and the youngest band is the floor for
  // corpus eligibility. Nothing below 18 is ever licensable.
  ageBand: ['under-18', '18-24', '25-34', '35-49', '50-plus'],
};

export function isValidSegment(key, value) {
  return Object.prototype.hasOwnProperty.call(SEGMENTS, key)
    && SEGMENTS[key].includes(value);
}

// The public read-shape of a stance_aggregates doc. Lives here so the
// writer, the serve endpoint, and the admin surfaces can never disagree
// about how a pile of counters becomes a percentage.
//
// Bucket keys are the Likert point with the sign spelled out (`pm2` is -2),
// because a Firestore field path cannot contain a hyphen.
export function summariseAggregate(a) {
  const buckets = (a && a.buckets) || {};
  const total = Object.values(buckets).reduce((s, v) => s + (v || 0), 0);
  const agree = (buckets.p1 || 0) + (buckets.p2 || 0) + (buckets.p3 || 0);
  const disagree = (buckets.pm1 || 0) + (buckets.pm2 || 0) + (buckets.pm3 || 0);
  const neutral = buckets.p0 || 0;
  const uniqueN = (a && a.uniqueN) || 0;
  const shiftN = (a && a.shiftN) || 0;
  return {
    n: (a && a.n) || 0,
    uniqueN,
    // Mean is computed off first answers only. Including re-asks would
    // weight the average toward whoever comes back most often.
    mean: uniqueN ? +(((a.uniqueSum || 0) / uniqueN).toFixed(2)) : null,
    agreePct: total ? Math.round((agree / total) * 100) : null,
    disagreePct: total ? Math.round((disagree / total) * 100) : null,
    neutralPct: total ? Math.round((neutral / total) * 100) : null,
    meanConfidence: (a && a.confidenceN) ? Math.round((a.confidenceSum || 0) / a.confidenceN) : null,
    // The headline pair for the whole panel: of the people who met this
    // stem twice, what share moved at all, and in which direction on average.
    changedMindPct: shiftN ? Math.round((((a && a.changedMindN) || 0) / shiftN) * 100) : null,
    meanShift: shiftN ? +((((a && a.shiftSum) || 0) / shiftN).toFixed(2)) : null,
    reaskedN: shiftN,
  };
}

// The bucket field-path fragment for a Likert point.
export function bucketKey(position) {
  return position < 0 ? 'pm' + Math.abs(position) : 'p' + position;
}
