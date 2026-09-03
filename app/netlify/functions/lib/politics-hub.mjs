// Shared taxonomy for the political-debate acquisition cluster.
//
// The issue dossiers remain the source of truth for each question. This file
// only says which questions belong in the public politics journey and how a
// cold visitor can browse them. Keep the groups broad and plain-language.
// Competitive formats do not belong on these pages.

export const PARTY_POSITION_SOURCES = {
  democratic: 'https://democrats.org/wp-content/uploads/2025/07/2024-Democratic-Party-Platform.pdf',
  republican: 'https://prod-static.gop.com/media/RNC2024-Platform.pdf',
};

export const INDEPENDENT_SYSTEM_SOURCES = {
  rankedChoice: 'https://www.ncsl.org/elections-and-campaigns/ranked-choice-voting',
  primaries: 'https://www.ncsl.org/elections-and-campaigns/state-primary-election-types',
  debates: 'https://www.fec.gov/help-candidates-and-committees/making-disbursements-ssf-or-connected-organization/public-debates/',
};

// These are deliberately phrased as common party CASES, not statements
// about every voter. A person chooses which case to defend before the issue
// enters the public challenge board. The question and neutral clash are what
// the judge sees; party identity never becomes a judging input.
export const PARTISAN_ISSUES = [
  {
    id: 'immigration-path',
    question: 'Should undocumented immigrants who have lived in the U.S. for years have a path to citizenship?',
    topic: 'Immigration',
    democratic: 'Pair a path to citizenship with stronger border staffing and faster asylum decisions.',
    republican: 'Secure the border and increase removals before considering broader legal status.',
    clash: 'Does earned legal status recognize long-term contribution, or weaken deterrence before the border is under control?',
  },
  {
    id: 'taxes-wealth',
    question: 'Should the U.S. raise taxes on corporations and the wealthiest households?',
    topic: 'Taxes',
    democratic: 'Raise top and corporate taxes to fund public services and make the tax code more equal.',
    republican: 'Keep taxes lower to reward investment, hiring, and economic growth.',
    clash: 'Which creates more broad prosperity, stronger public investment or stronger incentives to invest privately?',
    dossierSlug: 'should-billionaires-exist',
  },
  {
    id: 'health-coverage',
    question: 'Should the government guarantee universal health coverage?',
    topic: 'Health care',
    democratic: 'Guarantee broader coverage through a larger federal role and stronger public benefits.',
    republican: 'Preserve private choice and use competition, transparency, and targeted support to lower costs.',
    clash: 'Is health care more reliable as a public guarantee or as a competitive system with a safety net?',
    dossierSlug: 'should-the-government-provide-universal-healthcare',
  },
  {
    id: 'climate-energy',
    question: 'Should Washington speed the shift from fossil fuels through clean-energy rules and subsidies?',
    topic: 'Climate and energy',
    democratic: 'Use federal investment and standards to accelerate cleaner energy and reduce emissions.',
    republican: 'Expand domestic energy production and cut federal mandates that raise costs or restrict supply.',
    clash: 'Do federal rules correct a climate risk markets underprice, or impose costs before alternatives are ready?',
    dossierSlug: 'is-nuclear-energy-worth-it',
  },
  {
    id: 'gun-laws',
    question: 'Should federal gun laws be stricter?',
    topic: 'Gun policy',
    democratic: 'Expand background checks and national limits on access for people judged to present a high risk.',
    republican: 'Protect lawful gun ownership and focus on enforcing existing laws against dangerous conduct.',
    clash: 'Do broader federal rules prevent avoidable harm, or burden lawful ownership without stopping dangerous people?',
  },
  {
    id: 'voter-id',
    question: 'Should federal elections require government-issued photo ID?',
    topic: 'Elections',
    democratic: 'Avoid rules that burden eligible voters, expand access, and provide free identification where required.',
    republican: 'Require photo ID to strengthen election security and public confidence in the result.',
    clash: 'Does an ID rule add justified confidence, or create a larger access cost than the problem it addresses?',
  },
  {
    id: 'school-choice',
    question: 'Should public education money follow students to private or charter schools?',
    topic: 'Education',
    democratic: 'Invest public funds in accountable public schools and limit diversion to private providers.',
    republican: 'Give families broad school choice, including public support for alternatives to district schools.',
    clash: 'Does portable funding empower families, or weaken the common system responsible for serving every student?',
  },
  {
    id: 'police-accountability',
    question: 'Should federal police funding depend on national accountability standards?',
    topic: 'Policing',
    democratic: 'Fund public safety with national standards for training, transparency, and misconduct.',
    republican: 'Replenish local police and resist federal rules that limit local control or officer discretion.',
    clash: 'Do federal conditions create necessary accountability, or make local public safety answer to the wrong authority?',
  },
];

// Independent voters and candidates do not share one national platform.
// This lane therefore covers the structural case for political alternatives
// rather than inventing a single Independent position on taxes, borders, or
// culture. Every card remains binary because every public round is casual 1v1.
export const INDEPENDENT_ISSUES = [
  {
    id: 'vote-independent',
    question: 'Should voters back independent candidates even when they are unlikely to win?',
    topic: 'Independent candidates',
    independent: 'Vote for the strongest candidate and build an alternative over time; strategic voting keeps the two-party lock in place.',
    twoParty: 'Work through a major-party primary because elections allocate power now and a low-polling independent can split a coalition.',
    clash: 'Is a vote mainly an immediate choice between viable outcomes, or a long-term investment in political competition?',
  },
  {
    id: 'ranked-choice',
    question: 'Should federal elections use ranked-choice voting?',
    topic: 'Ranked-choice voting',
    independent: 'Let people rank an independent or third-party candidate first without losing a fallback choice.',
    twoParty: 'Keep one-choice ballots simple, legible, and less vulnerable to exhausted ballots or disputed counting rounds.',
    clash: 'Is broader candidate choice worth a more complex count, or is a simple plurality ballot the more trusted rule?',
  },
  {
    id: 'open-primaries',
    question: 'Should states replace party primaries with open top-four primaries?',
    topic: 'Open primaries',
    independent: 'Put every candidate on one primary ballot so independents and unaffiliated voters can compete from the start.',
    twoParty: 'Let political parties choose their own nominees before the general election and preserve clear party responsibility.',
    clash: 'Should nominations belong to the whole electorate, or to the parties whose names and coalitions appear on the ballot?',
  },
  {
    id: 'debate-access',
    question: 'Should major televised debates include more independent and third-party candidates?',
    topic: 'Debate access',
    independent: 'Broader access tests major-party ideas in public and lets support grow after voters hear a serious alternative.',
    twoParty: 'Use meaningful support thresholds so debates stay focused on candidates with a realistic path to governing.',
    clash: 'Do strict thresholds protect a useful debate, or prevent independent candidates from ever becoming viable?',
  },
];

export const POLITICS_GROUPS = [
  {
    id: 'elections-democracy',
    label: 'Elections & democracy',
    shortLabel: 'Democracy',
    description: 'Who gets a vote, how representation works, and what democratic participation can demand of people.',
    image: '/img/politics/ballot.jpg',
    imageWidth: 675,
    imageHeight: 900,
    imageAlt: 'A secure ballot drop box outside a public library',
    imageCredit: 'Kelson Vibber, CC0',
    imageSource: 'https://commons.wikimedia.org/wiki/File:Ballot_Box.jpg',
    slugs: [
      'should-the-electoral-college-be-abolished',
      'should-the-voting-age-be-lowered',
      'should-voting-be-mandatory',
    ],
  },
  {
    id: 'economy-public-services',
    label: 'Economy & public services',
    shortLabel: 'Economy',
    description: 'Wages, wealth, health care, education, and the policies that decide who pays and who benefits.',
    image: '/img/politics/cost-of-living.jpg',
    imageWidth: 1200,
    imageHeight: 795,
    imageAlt: 'Shelves of food in a grocery store',
    imageCredit: 'Lance Cheung, USDA, public domain',
    imageSource: 'https://commons.wikimedia.org/wiki/File:110303_CNPP_LSC_0206_(13065218273).jpg',
    slugs: [
      'universal-basic-income',
      'should-the-minimum-wage-be-raised',
      'should-billionaires-exist',
      'should-the-government-provide-universal-healthcare',
      'should-college-be-free',
      'should-junk-food-be-taxed',
    ],
  },
  {
    id: 'technology-power',
    label: 'Technology & power',
    shortLabel: 'Technology',
    description: 'Who controls the systems shaping speech, work, privacy, markets, and public decisions.',
    image: '/img/politics/technology-and-speech.jpg',
    imageWidth: 1200,
    imageHeight: 799,
    imageAlt: 'A person using a smartphone in a public place',
    imageCredit: 'Kristin Hardwick, CC0',
    imageSource: 'https://commons.wikimedia.org/wiki/File:Woman_texting_on_a_smartphone.jpg',
    slugs: [
      'should-ai-be-regulated',
      'should-the-government-control-ai',
      'should-the-us-ban-tiktok',
      'should-social-media-companies-be-broken-up',
      'should-the-government-monitor-citizens-online',
      'should-cryptocurrency-be-regulated',
      'should-companies-support-the-right-to-repair',
      'should-deepfakes-be-illegal',
      'should-ai-be-used-in-policing',
      'should-ai-be-used-in-hiring',
      'should-ai-content-be-labeled',
    ],
  },
  {
    id: 'rights-public-life',
    label: 'Rights, law & public life',
    shortLabel: 'Rights & law',
    description: 'The boundary between personal freedom, collective rules, public safety, and institutional power.',
    image: '/img/politics/capitol.jpg',
    imageWidth: 1400,
    imageHeight: 726,
    imageAlt: 'The west front of the United States Capitol',
    imageCredit: 'Architect of the Capitol, public domain',
    imageSource: 'https://commons.wikimedia.org/wiki/File:United_States_Capitol_-_west_front.jpg',
    slugs: [
      'should-marijuana-be-legalized',
      'should-prisons-be-abolished',
      'should-vaping-be-banned',
      'should-sports-betting-be-legal',
      'should-cars-be-banned-in-city-centers',
      'should-books-be-banned-in-schools',
      'should-social-media-be-banned-for-minors',
      'is-cancel-culture-good-for-society',
    ],
  },
  {
    id: 'climate-science-future',
    label: 'Climate, science & the future',
    shortLabel: 'Climate & science',
    description: 'Energy, emerging technology, the environment, and how much risk public policy should accept.',
    image: '/img/politics/climate-and-energy.jpg',
    imageWidth: 997,
    imageHeight: 477,
    imageAlt: 'A wind turbine beside a coastal community in Alaska',
    imageCredit: 'U.S. Department of Energy, public domain',
    imageSource: 'https://commons.wikimedia.org/wiki/File:Wind_turbine_in_Toksook_Bay,_Alaska.jpg',
    slugs: [
      'is-nuclear-energy-worth-it',
      'is-ai-bad-for-the-environment',
      'should-genetic-engineering-be-allowed',
      'is-space-exploration-worth-the-cost',
      'is-veganism-better-for-the-environment',
      'should-self-driving-cars-be-legal',
      'is-ai-a-threat-to-humanity',
      'should-ai-be-allowed-in-warfare',
    ],
  },
];

const GROUP_BY_SLUG = new Map();
for (const group of POLITICS_GROUPS) {
  for (const slug of group.slugs) GROUP_BY_SLUG.set(slug, group);
}

export const FEATURED_POLITICAL_SLUGS = [
  'should-the-electoral-college-be-abolished',
  'should-the-minimum-wage-be-raised',
  'should-the-us-ban-tiktok',
  'should-the-government-provide-universal-healthcare',
  'should-the-government-monitor-citizens-online',
  'is-nuclear-energy-worth-it',
];

export function getPoliticsGroup(slug) {
  return GROUP_BY_SLUG.get(slug) || null;
}

export function isPoliticalMotion(slug) {
  return GROUP_BY_SLUG.has(slug);
}

export function politicalSlugCount() {
  return GROUP_BY_SLUG.size;
}
