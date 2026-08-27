/* Subject-domain mastery for Debatable.

   The leaderboard used to slice people by debate FORMAT, which is the
   wrong axis: format is the rulebook, not the skill. Two debaters with
   identical BP records can be completely different animals, one sharp
   on sanctions and deterrence, the other lost the moment a motion
   mentions interest rates. Format tells you neither.

   So we classify the MOTION instead. Every judged round already stores
   its motion on `leaderboard_entries`, so a debater's history is a
   free record of which subjects they actually perform in.

     DBDomains.classify(motion)      -> { key, name, confidence }
     DBDomains.forEntries(entries)   -> { xp, level, domains: [...] }
     DBDomains.get(key)              -> domain descriptor

   Honesty rules baked in, not bolted on:
   - A domain verdict needs MIN_ROUNDS judged rounds. Below that the
     domain reads "Untested", never "weak". Calling someone weak at
     finance off one round is a claim the data cannot carry.
   - Strength is measured against the debater's OWN mean, so it says
     "sharper here than elsewhere", not "better than other people".
     Cross-debater comparison is what the board's rank column is for.
   - A motion that matches nothing is General, not silently dropped.  */
(function (global) {
  'use strict';

  // Rounds in a domain before we will call it a strength or a weakness.
  var MIN_ROUNDS = 3;
  // Keyword score a domain must clear to claim a motion. STRONG hits are
  // worth 3, MEDIUM 1, so this is "one unambiguous term, or three
  // circumstantial ones agreeing with each other".
  var MIN_SCORE = 3;
  var STRONG_WEIGHT = 3;

  // ── taxonomy ──────────────────────────────────────────────────────
  // `strong` terms are ones that essentially only appear in that
  // subject. `medium` terms lean that way but travel (a motion about
  // "markets" could be economics or tech), so they need corroboration.
  var DOMAINS = [
    {
      key: 'geopolitics',
      name: 'Geopolitics',
      short: 'Geopolitics',
      blurb: 'Foreign policy, war and peace, alliances, sovereignty.',
      accent: '#3b82f6',
      strong: [
        'foreign policy', 'nato', 'united nations', 'security council', 'peacekeeping',
        'sanctions', 'deterrence', 'nuclear weapon', 'disarmament', 'non-proliferation',
        'sovereignty', 'annexation', 'occupation', 'ceasefire', 'armed intervention',
        'humanitarian intervention', 'regime change', 'arms sale', 'arms trade',
        'great power', 'hegemony', 'multipolar', 'unipolar', 'grand strategy',
        'belt and road', 'taiwan', 'south china sea', 'indo-pacific', 'aukus',
        'geopolitic', 'diplomatic recognition', 'territorial dispute', 'proxy war',
        'military alliance', 'defence spending', 'defense spending', 'drone strike',
      ],
      medium: [
        'war', 'invasion', 'military', 'troops', 'army', 'navy', 'treaty', 'diplomacy',
        'embassy', 'ambassador', 'superpower', 'ally', 'allies', 'border', 'borders',
        'nation-state', 'international', 'global south', 'imperial', 'colonial',
        'russia', 'ukraine', 'china', 'israel', 'palestine', 'iran', 'north korea',
        'african union', 'european union', 'brics', 'asean', 'conflict', 'ceasefire',
      ],
    },
    {
      key: 'economics',
      name: 'Economics and finance',
      short: 'Economics',
      blurb: 'Markets, money, labour, trade, inequality.',
      accent: '#f59e0b',
      strong: [
        'central bank', 'monetary policy', 'fiscal policy', 'interest rate',
        'quantitative easing', 'inflation', 'recession', 'sovereign debt',
        'universal basic income', 'wealth tax', 'progressive taxation', 'capital gains',
        'minimum wage', 'collective bargaining', 'labour union', 'labor union',
        'nationalisation', 'nationalization', 'privatisation', 'privatization',
        'nationalise', 'nationalize', 'privatise', 'privatize', 'public ownership',
        'state ownership', 'free trade', 'protectionism', 'tariff', 'subsidy', 'subsidies',
        'antitrust', 'monopoly', 'hedge fund', 'private equity', 'stock market',
        'cryptocurrency', 'microfinance', 'foreign aid', 'development aid',
        'gig economy', 'austerity', 'gdp', 'imf', 'world bank', 'sweatshop',
      ],
      medium: [
        'economy', 'economic', 'market', 'markets', 'tax', 'taxes', 'taxation',
        'wage', 'wages', 'worker', 'workers', 'employment', 'unemployment', 'job',
        'poverty', 'inequality', 'wealth', 'income', 'welfare', 'pension',
        'bank', 'banking', 'investment', 'investor', 'capital', 'profit',
        'corporation', 'corporate', 'business', 'consumer', 'price', 'debt',
        'trade', 'growth', 'industry', 'union', 'strike', 'landlord', 'rent',
        'railway', 'infrastructure', 'utility', 'utilities', 'nationalised',
      ],
    },
    {
      key: 'technology',
      name: 'Technology and AI',
      short: 'Technology',
      blurb: 'AI, platforms, data, automation, the internet.',
      accent: '#8b5cf6',
      strong: [
        'artificial intelligence', 'machine learning', 'large language model',
        'algorithm', 'algorithmic', 'automation', 'autonomous vehicle',
        'self-driving', 'facial recognition', 'biometric', 'surveillance technology',
        'social media platform', 'content moderation', 'end-to-end encryption',
        'data protection', 'data privacy', 'net neutrality', 'open source',
        'cybersecurity', 'cyberattack', 'deepfake', 'gene editing', 'crispr',
        'space exploration', 'colonise mars', 'colonize mars', 'nuclear power',
        'renewable technology', 'digital divide', 'right to be forgotten',
        'smartphone ban', 'screen time', 'video game', 'metaverse', 'blockchain',
      ],
      medium: [
        'technology', 'tech', 'digital', 'internet', 'online', 'software',
        'computer', 'robot', 'robotics', 'data', 'privacy', 'encryption', 'ai',
        'platform', 'silicon valley', 'app', 'apps', 'innovation', 'engineer',
        'automate', 'machine', 'network', 'code', 'hacker', 'startup',
      ],
    },
    {
      key: 'ethics',
      name: 'Ethics and philosophy',
      short: 'Ethics',
      blurb: 'Moral theory, rights in principle, the good life.',
      accent: '#ec4899',
      strong: [
        'moral obligation', 'moral duty', 'morally permissible', 'morally justified',
        'utilitarian', 'utilitarianism', 'deontolog', 'categorical imperative',
        'virtue ethic', 'social contract', 'veil of ignorance', 'distributive justice',
        'retributive justice', 'moral luck', 'free will', 'personhood',
        'trolley problem', 'greater good', 'ends justify the means',
        'animal rights', 'moral status', 'civic duty', 'public ethics',
        'intergenerational justice', 'future generations', 'existential risk',
        'paternalism', 'autonomy of the individual', 'human dignity',
      ],
      medium: [
        'ethic', 'ethics', 'ethical', 'moral', 'morality', 'justice', 'virtue',
        'duty', 'obligation', 'consent', 'dignity', 'philosophy', 'philosophical',
        'good life', 'happiness', 'suffering', 'harm', 'value', 'values',
        'principle', 'religion', 'religious', 'faith', 'god', 'secular',
      ],
    },
    {
      key: 'law',
      name: 'Law and rights',
      short: 'Law',
      blurb: 'Courts, constitutions, policing, civil liberties.',
      accent: '#ef4444',
      strong: [
        'supreme court', 'constitutional', 'constitution', 'judicial review',
        'rule of law', 'due process', 'habeas corpus', 'jury trial', 'plea bargain',
        'mandatory sentencing', 'sentencing reform', 'restorative justice',
        'mass incarceration', 'prison abolition', 'criminal justice', 'policing',
        'police', 'qualified immunity', 'civil liberties', 'human rights',
        'international criminal court', 'peacekeeping', 'refugee',
        'asylum seeker', 'immigration policy', 'deportation', 'citizenship',
        'freedom of speech', 'hate speech law', 'defamation', 'legalise',
        'legalize', 'decriminalise', 'decriminalize', 'age of consent',
        'voting rights', 'same-sex marriage', 'affirmative action',
      ],
      medium: [
        'law', 'laws', 'legal', 'illegal', 'court', 'courts', 'judge', 'judicial',
        'crime', 'criminal', 'punish', 'punishment', 'prison', 'sentence',
        'right', 'rights', 'liberty', 'freedom', 'ban', 'prohibit', 'regulate',
        'regulation', 'legislation', 'parliament', 'congress', 'statute',
        'immigrant', 'immigration', 'border', 'discrimination', 'equality',
      ],
    },
    {
      key: 'climate',
      name: 'Climate and environment',
      short: 'Climate',
      blurb: 'Emissions, energy, conservation, the biosphere.',
      accent: '#10b981',
      strong: [
        'climate change', 'climate crisis', 'global warming', 'carbon tax',
        'carbon emission', 'carbon price', 'net zero', 'greenhouse gas',
        'fossil fuel', 'renewable energy', 'solar power', 'wind power',
        'paris agreement', 'cop28', 'cop29', 'cop30', 'climate reparations',
        'deforestation', 'biodiversity', 'extinction', 'conservation',
        'rewilding', 'nuclear energy', 'geoengineering', 'degrowth',
        'environmental protection', 'pollution', 'plastic waste', 'recycling',
        'sustainable development', 'ecosystem', 'endangered species',
        'factory farming', 'veganism', 'meat consumption',
      ],
      medium: [
        'climate', 'environment', 'environmental', 'carbon', 'emission',
        'energy', 'green', 'sustainable', 'sustainability', 'nature',
        'wildlife', 'forest', 'ocean', 'water', 'drought', 'flood',
        'agriculture', 'farming', 'animal', 'animals', 'planet', 'earth',
      ],
    },
    {
      key: 'health',
      name: 'Health and science',
      short: 'Health',
      blurb: 'Medicine, public health, research, the body.',
      accent: '#06b6d4',
      strong: [
        'public health', 'universal healthcare', 'single-payer', 'health insurance',
        'vaccine', 'vaccination', 'vaccine mandate', 'pandemic', 'epidemic',
        'quarantine', 'mental health', 'psychiatric', 'antidepressant',
        'clinical trial', 'pharmaceutical', 'big pharma', 'drug pricing',
        'organ donation', 'organ market', 'surrogacy', 'ivf', 'genetic screening',
        'human enhancement', 'doping', 'performance-enhancing', 'obesity',
        'sugar tax', 'tobacco', 'drug legalisation', 'drug legalization',
        'harm reduction', 'medical research', 'stem cell', 'gender-affirming care',
        'nhs', 'national health service', 'palliative care',
      ],
      medium: [
        'health', 'healthcare', 'medical', 'medicine', 'doctor', 'doctors',
        'hospital', 'patient', 'patients', 'disease', 'illness', 'treatment',
        'therapy', 'nurse', 'science', 'scientific', 'research', 'clinical',
        'drug', 'drugs', 'addiction', 'diet', 'nutrition', 'body', 'wellbeing',
      ],
    },
    {
      key: 'education',
      name: 'Education',
      short: 'Education',
      blurb: 'Schools, universities, curriculum, access.',
      accent: '#eab308',
      strong: [
        'public education', 'private school', 'charter school', 'school choice',
        'standardised testing', 'standardized testing', 'exam', 'examination',
        'curriculum', 'homeschool', 'tuition fee', 'student loan', 'student debt',
        'free university', 'higher education', 'affirmative action in admission',
        'legacy admission', 'grade inflation', 'streaming by ability',
        'tracking students', 'teacher union', 'teacher pay', 'school uniform',
        'sex education', 'religious education', 'compulsory schooling',
        'vocational training', 'university admission', 'academic freedom',
      ],
      medium: [
        'education', 'educational', 'school', 'schools', 'student', 'students',
        'teacher', 'teachers', 'university', 'universities', 'college',
        'classroom', 'learning', 'literacy', 'degree', 'pupil', 'campus',
        'homework', 'grades', 'scholarship', 'youth', 'children',
      ],
    },
    {
      key: 'media',
      name: 'Media and speech',
      short: 'Media',
      blurb: 'Press, platforms, propaganda, public discourse.',
      accent: '#a855f7',
      strong: [
        'free press', 'press freedom', 'journalism', 'journalist', 'newsroom',
        'public broadcaster', 'state media', 'media ownership', 'paywall',
        'misinformation', 'disinformation', 'fake news', 'fact-check',
        'propaganda', 'censorship', 'cancel culture', 'no-platform',
        'deplatform', 'political advertising', 'campaign advertising',
        'influencer', 'celebrity culture', 'tabloid', 'clickbait',
        'whistleblower', 'source protection', 'editorial independence',
      ],
      medium: [
        'media', 'press', 'news', 'broadcast', 'newspaper', 'reporting',
        'reporter', 'publish', 'publication', 'speech', 'expression',
        'audience', 'public opinion', 'narrative', 'coverage', 'debate',
        'discourse', 'platform', 'advertising', 'entertainment', 'film',
      ],
    },
    {
      key: 'society',
      name: 'Society and culture',
      short: 'Society',
      blurb: 'Identity, family, religion in public life, sport, art.',
      accent: '#f97316',
      strong: [
        'feminism', 'feminist', 'patriarchy', 'gender equality', 'gender role',
        'transgender', 'lgbt', 'queer', 'racial justice', 'racism', 'antiracism',
        'caste', 'multiculturalism', 'assimilation', 'cultural appropriation',
        'identity politics', 'social mobility', 'class divide', 'nuclear family',
        'parenting', 'marriage', 'divorce', 'birth rate', 'ageing population',
        'aging population', 'housing crisis', 'gentrification', 'urban planning',
        'public transport', 'professional sport', 'olympic', 'world cup',
        'cultural heritage', 'museum restitution', 'public art', 'monument',
        'social media and teenagers', 'loneliness',
      ],
      medium: [
        'society', 'social', 'culture', 'cultural', 'community', 'communities',
        'family', 'families', 'gender', 'women', 'men', 'race', 'ethnic',
        'minority', 'minorities', 'tradition', 'identity', 'city', 'cities',
        'housing', 'sport', 'sports', 'art', 'artist', 'music', 'religion',
        'immigrant', 'generation', 'demographic',
      ],
    },
  ];

  var GENERAL = {
    key: 'general',
    name: 'General',
    short: 'General',
    blurb: 'Motions that do not sit in one subject.',
    accent: '#94a3b8',
    strong: [],
    medium: [],
  };

  var BY_KEY = {};
  for (var i = 0; i < DOMAINS.length; i++) BY_KEY[DOMAINS[i].key] = DOMAINS[i];
  BY_KEY[GENERAL.key] = GENERAL;

  // ── classifier ────────────────────────────────────────────────────
  // Word-boundary matching so "war" does not fire on "warrant" and
  // "app" does not fire on "apparent". Multi-word terms match as a
  // phrase. A trailing s/es/ing on the motion side still counts, which
  // is why we test the term against a boundary-padded haystack rather
  // than doing exact token equality.
  function normalise(text) {
    return ' ' + String(text || '')
      .toLowerCase()
      .replace(/[‘’]/g, "'")
      .replace(/[^a-z0-9'\- ]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim() + ' ';
  }

  function hits(haystack, term) {
    // Allow an optional plural/gerund tail on the final word of the term.
    var idx = haystack.indexOf(' ' + term);
    while (idx !== -1) {
      var after = haystack.slice(idx + term.length + 1);
      if (/^(s|es|ed|ing|d)?[^a-z0-9]/.test(after)) return true;
      idx = haystack.indexOf(' ' + term, idx + 1);
    }
    return false;
  }

  function scoreDomain(haystack, domain) {
    var score = 0;
    var j;
    for (j = 0; j < domain.strong.length; j++) {
      if (hits(haystack, domain.strong[j])) score += STRONG_WEIGHT;
    }
    for (j = 0; j < domain.medium.length; j++) {
      if (hits(haystack, domain.medium[j])) score += 1;
    }
    return score;
  }

  function classify(motion) {
    var haystack = normalise(motion);
    if (haystack.length < 4) return { key: 'general', name: GENERAL.name, confidence: 0 };
    var best = null;
    var bestScore = 0;
    var runnerUp = 0;
    for (var d = 0; d < DOMAINS.length; d++) {
      var s = scoreDomain(haystack, DOMAINS[d]);
      if (s > bestScore) { runnerUp = bestScore; bestScore = s; best = DOMAINS[d]; }
      else if (s > runnerUp) { runnerUp = s; }
    }
    if (!best || bestScore < MIN_SCORE) {
      return { key: 'general', name: GENERAL.name, confidence: 0 };
    }
    // Confidence is how cleanly the winner beat the next domain. A motion
    // that scores 9 on economics and 8 on law is a genuinely mixed motion
    // and we say so rather than pretending the 9 settled it.
    var margin = bestScore - runnerUp;
    var confidence = Math.max(0, Math.min(1, (margin / Math.max(bestScore, 1)) * 0.6 + 0.4));
    return { key: best.key, name: best.name, confidence: confidence };
  }

  // ── XP ────────────────────────────────────────────────────────────
  // XP is the sum of every AI-judged speaker score, and the level table
  // below is copied from /profile. Both numbers MUST agree: /profile is
  // the private account page and this is the public one, and a debater
  // who sees 1,240 XP on one and 673 on the other has caught us making
  // it up. Because domain XP is the same sum scoped to one subject, the
  // per-domain figures add up to the total by construction.
  //
  // If the ladder ever changes, change it in app/profile.html too, or
  // better, make that page read DBDomains.levelFor and delete its copy.
  var SCORE_FLOOR = 22;   // bottom of the realistic speaker-point band
  var SCORE_CEIL = 30;    // top of it, used for bar fill, not for XP

  function xpForRound(entry) {
    var score = entry && typeof entry.score === 'number' ? entry.score : null;
    if (score === null || !isFinite(score)) return 0;
    return Math.max(0, Math.round(score));
  }

  var LEVELS = [0, 80, 200, 400, 700, 1100, 1600, 2200, 3000, 4000];
  var LEVEL_TITLES = [
    'Novice', 'Walk-on', 'Speaker', 'Member', 'Whip',
    'Leader of Opp', 'Prime Minister', 'Closer', 'Veteran', 'National Champion',
  ];

  function levelFor(xp) {
    var lvl = 1;
    for (var i = 0; i < LEVELS.length; i++) {
      if (xp >= LEVELS[i]) lvl = i + 1;
    }
    var floorXp = LEVELS[lvl - 1];
    var nextXp = lvl < LEVELS.length ? LEVELS[lvl] : null;
    return {
      level: lvl,
      title: LEVEL_TITLES[Math.min(lvl - 1, LEVEL_TITLES.length - 1)],
      xp: xp,
      floorXp: floorXp,
      nextXp: nextXp,
      // Progress through the current level, 0..1. Maxed levels read 1.
      progress: nextXp === null ? 1
        : Math.max(0, Math.min(1, (xp - floorXp) / (nextXp - floorXp))),
      toNext: nextXp === null ? 0 : Math.max(0, nextXp - xp),
    };
  }

  // ── aggregation ───────────────────────────────────────────────────
  // `entries` is an array of leaderboard_entries docs for ONE debater.
  function forEntries(entries) {
    var list = Array.isArray(entries) ? entries : [];
    var buckets = {};
    var totalXp = 0;
    var scored = [];
    var rounds = 0;
    var wins = 0;
    var losses = 0;

    for (var i = 0; i < list.length; i++) {
      var e = list[i] || {};
      if (typeof e.score !== 'number' || !isFinite(e.score)) continue;
      var c = classify(e.motion || '');
      var b = buckets[c.key];
      if (!b) { b = buckets[c.key] = { key: c.key, rounds: 0, wins: 0, xp: 0, scores: [], best: null, lastAt: null }; }
      var xp = xpForRound(e);
      b.rounds += 1;
      b.xp += xp;
      b.scores.push(e.score);
      if (b.best === null || e.score > b.best) b.best = e.score;
      if (e.won === true) b.wins += 1;
      var at = millisOf(e.completedAt);
      if (at && (!b.lastAt || at > b.lastAt)) b.lastAt = at;

      totalXp += xp;
      scored.push(e.score);
      rounds += 1;
      if (e.won === true) wins += 1; else if (e.won === false) losses += 1;
    }

    var overallMean = mean(scored);

    var domains = Object.keys(buckets).map(function (key) {
      var b = buckets[key];
      var desc = BY_KEY[key] || GENERAL;
      var m = mean(b.scores);
      var delta = (overallMean === null || m === null) ? null : (m - overallMean);
      return {
        key: key,
        name: desc.name,
        blurb: desc.blurb,
        accent: desc.accent,
        rounds: b.rounds,
        wins: b.wins,
        losses: b.rounds - b.wins,
        xp: b.xp,
        mean: m,
        best: b.best,
        lastAt: b.lastAt,
        delta: delta,
        // The verdict is the whole point of the feature, so it is the
        // one field that refuses to guess. Under MIN_ROUNDS it is
        // 'untested' no matter how flattering the average looks.
        verdict: verdictFor(b.rounds, delta),
        // 0..1 bar fill, for the skill map. Untested domains still draw
        // a bar so the map shows coverage, just a muted one.
        fill: m === null ? 0 : Math.max(0.06, Math.min(1, (m - SCORE_FLOOR) / (SCORE_CEIL - SCORE_FLOOR))),
      };
    });

    // Strongest first, but untested domains always sink to the bottom:
    // a 2-round 29.0 average is not a headline.
    domains.sort(function (a, b) {
      var au = a.verdict === 'untested' ? 1 : 0;
      var bu = b.verdict === 'untested' ? 1 : 0;
      if (au !== bu) return au - bu;
      if (au === 1) return b.rounds - a.rounds;
      return (b.delta || 0) - (a.delta || 0) || b.rounds - a.rounds;
    });

    var ranked = domains.filter(function (d) { return d.verdict !== 'untested'; });

    return {
      xp: totalXp,
      level: levelFor(totalXp),
      rounds: rounds,
      wins: wins,
      losses: losses,
      mean: overallMean,
      domains: domains,
      // Convenience for one-line summaries. Null when the record is too
      // thin to name either, which is the common case early on.
      strongest: ranked.length && ranked[0].verdict === 'strength' ? ranked[0] : null,
      weakest: ranked.length && ranked[ranked.length - 1].verdict === 'needs-work'
        ? ranked[ranked.length - 1] : null,
      minRounds: MIN_ROUNDS,
    };
  }

  function verdictFor(rounds, delta) {
    if (rounds < MIN_ROUNDS || delta === null) return 'untested';
    if (delta >= 0.5) return 'strength';
    if (delta <= -0.5) return 'needs-work';
    return 'steady';
  }

  var VERDICT_LABEL = {
    'strength': 'Strength',
    'steady': 'Steady',
    'needs-work': 'Needs work',
    'untested': 'Untested',
  };

  function mean(arr) {
    if (!arr || !arr.length) return null;
    var t = 0;
    for (var i = 0; i < arr.length; i++) t += arr[i];
    return t / arr.length;
  }

  function millisOf(ts) {
    if (!ts) return null;
    try {
      if (typeof ts === 'number') return ts;
      if (typeof ts.toMillis === 'function') return ts.toMillis();
      if (typeof ts.toDate === 'function') return ts.toDate().getTime();
      var d = new Date(ts);
      var t = d.getTime();
      return isFinite(t) ? t : null;
    } catch (e) { return null; }
  }

  global.DBDomains = {
    classify: classify,
    forEntries: forEntries,
    xpForRound: xpForRound,
    levelFor: levelFor,
    get: function (key) { return BY_KEY[key] || GENERAL; },
    titleFor: function (level) {
      return LEVEL_TITLES[Math.max(0, Math.min(level - 1, LEVEL_TITLES.length - 1))];
    },
    all: function () { return DOMAINS.slice(); },
    label: function (verdict) { return VERDICT_LABEL[verdict] || ''; },
    MIN_ROUNDS: MIN_ROUNDS,
    LEVELS: LEVELS,
  };
})(typeof window !== 'undefined' ? window : this);
