// Daily motion bank for /today (the SEO content engine).
//
// Each date deterministically maps to a motion via a per-date hash, so
// /today/2026-05-14 always shows the same content (Google-stable) but
// different dates show different motions. No cron, no Firestore writes,
// no scheduled job needed — the page renders pure-function from date.
//
// The bank is intentionally diverse across debate domains (econ, tech,
// ethics, civic, edu, env, global). Each entry carries a short framing
// blurb that gives the /today page enough unique body content to be
// indexable, plus the gov/opp side hints so the CTA can pre-fill the
// debate-ai setup form.

export const DAILY_MOTIONS = [
  {
    motion: 'This House would ban algorithmic newsfeeds.',
    domain: 'tech',
    frame: 'Recommendation algorithms decide what hundreds of millions of people read every day. Defenders argue they connect people to relevant content at unprecedented scale. Critics say they fragment shared reality and reward outrage. A live debate motion any direction you take it.',
    govHint: 'Outrage compounds; chronological feeds restore epistemic baseline.',
    oppHint: 'Banning algorithmic ranking returns us to the engagement metrics it replaced, just slower.',
  },
  {
    motion: 'This House would tax wealth above $100M at 2% annually.',
    domain: 'econ',
    frame: 'Wealth taxes have been tried in 12 OECD countries; 9 of them repealed them. Yet the policy keeps re-emerging in U.S. presidential platforms. The empirics are messier than either side admits.',
    govHint: 'Concentrated capital distorts political markets; an annual tax restores accountability.',
    oppHint: 'Wealth fled every European wealth tax; the U.S. would lose more revenue than it raised.',
  },
  {
    motion: 'This House would require AI-generated content to be visibly labeled.',
    domain: 'tech',
    frame: 'Generative AI now produces tens of millions of images and articles daily. Without disclosure, users cannot tell what they are consuming. With disclosure, every output carries a friction tax that erodes the technology\'s value.',
    govHint: 'Asymmetric information markets always favor the producer; labeling restores consumer choice.',
    oppHint: 'Mandatory labels create false confidence in what is unlabeled and discriminate against legitimate AI use.',
  },
  {
    motion: 'This House would scrap legacy admissions at universities.',
    domain: 'edu',
    frame: 'Legacy preferences give children of alumni a meaningful boost at elite U.S. universities. After the 2023 affirmative action ruling, the practice faces renewed scrutiny. Defenders cite donor relationships; critics cite hereditary privilege.',
    govHint: 'Inherited advantage in education is anti-meritocratic by definition.',
    oppHint: 'Legacy admits fund the scholarships that admit first-gen students; the math is uncomfortable but real.',
  },
  {
    motion: 'This House would let people sell one of their kidneys.',
    domain: 'ethics',
    frame: 'Iran is the only country with a regulated kidney market. The waitlist for transplants there is near zero. Critics argue the policy commodifies the poor; defenders argue prohibition leaves people to die.',
    govHint: 'A regulated market with price floors saves more lives than prohibition.',
    oppHint: 'Voluntary in the abstract is coerced in practice; the poor will be the donor class.',
  },
  {
    motion: 'This House would extend voting rights to 16-year-olds.',
    domain: 'civic',
    frame: 'Austria, Scotland, and Brazil all allow voting at 16. Turnout data is mixed; civic-engagement research is split. The U.S. debate has now moved beyond the academic question into actual ballot measures.',
    govHint: 'Civic habits are formed in adolescence; voting earlier creates a more durable voter.',
    oppHint: 'We do not entrust 16-year-olds with contracts, juries, or the draft for a reason.',
  },
  {
    motion: 'This House would ban private jets.',
    domain: 'env',
    frame: 'A private jet emits per-passenger CO2 at roughly 20 to 50 times the rate of commercial flight. Defenders argue private aviation drives 0.04 percent of global emissions and the ban is symbolic. Critics argue symbolism is the point.',
    govHint: 'Climate norms need a high-end target; jets are the most visible carbon excess.',
    oppHint: 'Banning the most-disliked emitter buys nothing in tonnage and corrodes climate seriousness.',
  },
  {
    motion: 'This House would lift the ban on commercial surrogacy in India.',
    domain: 'ethics',
    frame: 'India banned commercial surrogacy in 2021 after a decade as the global hub. The ban removed an income source for thousands of women; it also closed off practices critics called exploitative. Two real harms in tension.',
    govHint: 'Prohibition pushes the practice underground without reducing demand; regulation is safer.',
    oppHint: 'The Indian pre-ban market did not produce informed consent at the rates regulation requires.',
  },
  {
    motion: 'This House would require every social media platform to provide an algorithmic-feed off switch.',
    domain: 'tech',
    frame: 'The EU\'s Digital Services Act mandates this for VLOPs. The U.S. has no equivalent. The toggle is technically trivial; the platform incentives against it are not.',
    govHint: 'Default-on engagement algorithms are the addiction layer; opt-out is the minimum dignity.',
    oppHint: 'A toggle nobody uses is regulatory theater; the binding mechanism is open competition for attention.',
  },
  {
    motion: 'This House would replace the SAT with portfolio-based admissions.',
    domain: 'edu',
    frame: 'Test-optional policies have not improved diversity at top schools as much as advocates predicted. Portfolios reward students with the resources to build them. Both directions face uncomfortable evidence.',
    govHint: 'Standardized tests measure tutoring access more than ability.',
    oppHint: 'Portfolio admissions measure adult mentorship even more than tests measure tutoring.',
  },
  {
    motion: 'This House would prohibit corporate ownership of single-family homes.',
    domain: 'econ',
    frame: 'Institutional investors now own 3 to 5 percent of U.S. single-family rentals. In specific metros (Atlanta, Phoenix, Charlotte) the share is 15 to 25 percent. The macro impact on prices is disputed; the micro impact on renters is not.',
    govHint: 'Housing is the cornerstone of household wealth; corporate ownership extracts that cornerstone.',
    oppHint: 'Banning institutional buyers shrinks the rental supply that renters depend on.',
  },
  {
    motion: 'This House would mandate a four-day work week.',
    domain: 'econ',
    frame: 'The largest pilot to date, in the UK, found productivity neutral and worker satisfaction sharply higher. Critics point out that pilots self-select for firms whose work suits the schedule. The policy question is whether mandate makes sense at all.',
    govHint: 'Productivity is now measured per hour, not per week; the workweek lags the data.',
    oppHint: 'A mandate flattens differences across industries where the four-day week is not feasible.',
  },
  {
    motion: 'This House would ban facial recognition in public spaces.',
    domain: 'tech',
    frame: 'San Francisco, Portland, and Boston have banned police use. China and the UK have expanded use. The technology improves faster than the policy debate around it.',
    govHint: 'Continuous identification in public is a categorical change in what privacy means.',
    oppHint: 'Bans push the practice to private actors with worse accountability than police.',
  },
  {
    motion: 'This House would let cities set their own immigration policy.',
    domain: 'civic',
    frame: 'Sanctuary cities already partially do this in practice. Federalists argue policy coherence demands a single national stance; localists argue cities bear the costs and benefits and should decide.',
    govHint: 'Cities know their labor markets, schools, and capacity; one-size policy fails both ends.',
    oppHint: 'Federalizing immigration was a solved problem; un-federalizing it is a rule-of-law problem.',
  },
  {
    motion: 'This House would require all teenagers to learn a second language to graduate high school.',
    domain: 'edu',
    frame: 'The U.S. is one of the few rich countries where a second language is not the norm. The cognitive case is well-documented. The opportunity-cost case is rarely engaged honestly.',
    govHint: 'Monolingualism is a competitive disadvantage in every market the U.S. competes in.',
    oppHint: 'A required course taught poorly produces resentment, not fluency; the policy fails its own goal.',
  },
  {
    motion: 'This House would treat repeated drunk driving as a violent offense.',
    domain: 'ethics',
    frame: 'Drunk-driving fatalities have plateaued after decades of decline. Existing penalties are clearly not deterring the repeat-offender population. Critics warn that reclassification is a punishment-creep slippery slope.',
    govHint: 'A 0.20 BAC driver on a third offense is choosing to point a weapon at strangers.',
    oppHint: 'Treating impaired choice as intentional violence erases the line that makes intent meaningful.',
  },
  {
    motion: 'This House would require ranked-choice voting in all U.S. federal elections.',
    domain: 'civic',
    frame: 'Maine and Alaska use RCV statewide. Outcomes diverge from what plurality would have produced. The procedural-fairness case is strong; the legitimacy-perception case is messier.',
    govHint: 'Plurality voting forces a two-party duopoly that suppresses real choice.',
    oppHint: 'RCV results require explanation; democratic legitimacy needs results that explain themselves.',
  },
  {
    motion: 'This House would ban targeted political advertising online.',
    domain: 'tech',
    frame: 'The EU restricts cross-context behavioral ads for political content; the U.S. does not. Defenders of restriction cite Cambridge Analytica; opponents cite incumbent protection.',
    govHint: 'Micro-targeted ads atomize public discourse into millions of private conversations no one can audit.',
    oppHint: 'Restrictions help the candidates with built-in name recognition and hurt outsiders.',
  },
  {
    motion: 'This House would prioritize reducing economic inequality over reducing the federal deficit.',
    domain: 'econ',
    frame: 'The trade-off is real: deficit-funded transfers can reduce inequality short-term but raise long-term interest costs that crowd out future transfers. Either side, the empirics matter.',
    govHint: 'Inequality is the binding constraint on growth at this level; deficits are not.',
    oppHint: 'Inequality reduction funded by deficit raises the cost of the safety net it claims to expand.',
  },
  {
    motion: 'This House regrets the rise of remote-first work.',
    domain: 'econ',
    frame: 'Five years post-pandemic the productivity data is contested, the city-revenue data is not. The career-progression data for early-career workers is the quietest part of the debate and probably the most important.',
    govHint: 'Remote work has hollowed mentorship and tilted careers toward the already-established.',
    oppHint: 'Remote work freed millions of workers from commute, geography, and the office class system.',
  },
];

// Deterministic per-date picker. Same date → same motion, every render.
// Different dates → different motion. Spreads across the bank by hashing
// year+day-of-year so consecutive days don't cluster in the same domain.
export function dailyMotionFor(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return DAILY_MOTIONS[0];
  // Days-since-epoch hash for a clean linear walk through the bank with
  // a small offset so we don't start at index 0 on Jan 1.
  const days = Math.floor(d.getTime() / (24 * 60 * 60 * 1000));
  const idx = ((days * 13) + 7) % DAILY_MOTIONS.length;
  return DAILY_MOTIONS[idx];
}

// ISO-formatted YYYY-MM-DD parser. Used to validate /today/{date}
// URLs; rejects anything that doesn't parse to a real date within the
// last 5 years or the next 5 years (keeps the URL space bounded and
// blocks spam crawling).
export function parseDailyDate(raw) {
  if (!raw) return null;
  const m = String(raw).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const d = new Date(Date.UTC(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10)));
  if (Number.isNaN(d.getTime())) return null;
  const now = Date.now();
  const fiveYears = 5 * 365 * 24 * 60 * 60 * 1000;
  if (d.getTime() < now - fiveYears || d.getTime() > now + fiveYears) return null;
  return d;
}

export function formatDailyDate(date) {
  const d = date instanceof Date ? date : new Date(date);
  return d.toISOString().slice(0, 10);
}

// Pretty long-form date for the page body (server-side, en-US locale
// for stability — Google's crawler is en-US by default).
export function prettyDate(date) {
  const d = date instanceof Date ? date : new Date(date);
  return d.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
}
