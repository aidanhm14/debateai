// Shared taxonomy for the political-debate acquisition cluster.
//
// The issue dossiers remain the source of truth for each question. This file
// only says which questions belong in the public politics journey and how a
// cold visitor can browse them. Keep the groups broad and plain-language.
// Competitive formats do not belong on these pages.

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
