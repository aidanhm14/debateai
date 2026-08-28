// ─────────────────────────────────────────────────────────────
// Guards on the judge integrity layer.
//
// The five fixes are only worth anything if a later commit cannot undo
// them quietly, which is the same reasoning as test-credits.mjs: that
// file asserts no randomness can return to the money path, and this one
// asserts the judge cannot go back to being a single tunable model with
// no published rubric and no route above it.
//
// Run: node scripts/test-judge-integrity.mjs
// ─────────────────────────────────────────────────────────────
import { readFileSync } from 'node:fs';
import {
  SEASONS, RUBRICS, seasonFor, seasonById, seasonExpired, rubricHash, rubricFor,
  charterDoc, canonicalJson, FEE_POLICY, APPEAL_POLICY, AUDIT_POLICY,
} from '../app/netlify/functions/lib/judge-charter.mjs';
import {
  normalizeVote, tallyPanel, median, fleissKappa, kappaBand, reliabilityFrom,
  issueConsensus, issueTokens,
} from '../app/netlify/functions/lib/judge-panel.mjs';
import { auditRecord } from '../app/netlify/functions/lib/judge-audit.mjs';
import {
  canAppeal, canReview, newAppeal, revisedJudgment, requiresReversal,
  appealId, validGround, validOutcome, APPEAL_WINDOW_MS,
} from '../app/netlify/functions/lib/judge-appeals.mjs';

let pass = 0;
let fail = 0;
function t(label, cond) {
  if (cond) { pass++; return; }
  fail++;
  console.error('FAIL: ' + label);
}

// ── 1. the season calendar is a real calendar ───────────────────────
{
  t('seasons are declared', SEASONS.length >= 2);

  // No gaps and no overlaps. A gap means a round could be judged under
  // no declared configuration at all, which is the thing the calendar
  // exists to make impossible.
  let contiguous = true;
  for (let i = 1; i < SEASONS.length; i++) {
    if (SEASONS[i].from !== SEASONS[i - 1].to) contiguous = false;
  }
  t('season windows are contiguous', contiguous);
  t('first season starts at zero', SEASONS[0].from === 0);

  const ids = SEASONS.map((s) => s.id);
  t('season ids are unique', new Set(ids).size === ids.length);
  t('seasonById finds a season', seasonById(SEASONS[0].id) === SEASONS[0]);
  t('seasonById misses cleanly', seasonById('nope') === null);

  // A round with no timestamp lands in the earliest season rather than
  // being stamped with today's rubric, which would be a false record.
  t('epoch falls in the first season', seasonFor(0).id === SEASONS[0].id);
  t('undefined time does not throw', !!seasonFor(undefined));
  t('a moment inside season 2 resolves to it',
    seasonFor(SEASONS[1].from + 1000).id === SEASONS[1].id);
  t('a moment just before season 2 is season 1',
    seasonFor(SEASONS[1].from - 1).id === SEASONS[0].id);

  // Past the calendar we fall through to the last season, but the
  // charter has to SAY so rather than pretend the pin still holds.
  const last = SEASONS[SEASONS.length - 1];
  if (last.to !== null) {
    t('past the calendar reports expired', seasonExpired(last.to + 1) === true);
    t('inside the calendar is not expired', seasonExpired(last.from) === false);
  }
}

// ── 2. the rubric is published and hashed ───────────────────────────
{
  const current = seasonFor(Date.now());
  t('the current season is published', current.published === true);
  t('the current season has a rubric', !!rubricFor(current.rubricVersion));
  t('the current season pins a panel', !!current.panel);

  const h = rubricHash(current.rubricVersion);
  t('rubric hash is a hex digest', /^[0-9a-f]{16}$/.test(h));
  t('rubric hash is stable across calls', rubricHash(current.rubricVersion) === h);
  t('unknown rubric hashes to empty', rubricHash('nope') === '');

  // The hash has to follow CONTENT, not key order, or a reformat would
  // read as a rubric change and a real change could be hidden by one.
  const a = canonicalJson({ x: 1, y: [1, 2], z: { b: 2, a: 1 } });
  const b = canonicalJson({ z: { a: 1, b: 2 }, y: [1, 2], x: 1 });
  t('canonical form ignores key order', a === b);
  t('canonical form respects array order',
    canonicalJson([1, 2]) !== canonicalJson([2, 1]));

  const rubric = rubricFor(current.rubricVersion);
  t('rubric states the weighing order', Array.isArray(rubric.weighing) && rubric.weighing.length >= 5);
  t('rubric states the tests', Array.isArray(rubric.tests) && rubric.tests.length >= 8);
  t('rubric states a deadlock ladder', Array.isArray(rubric.deadlock.ladder) && rubric.deadlock.ladder.length >= 2);
  t('rubric states what is out of bounds', rubric.outOfBounds.length >= 4);

  // Public copy rules. These strings render on a public page.
  const copy = JSON.stringify([RUBRICS, FEE_POLICY, APPEAL_POLICY, AUDIT_POLICY]);
  t('no em dashes in published copy', !copy.includes('—'));
  const banned = ['holistic', 'robust framework', 'at the end of the day', 'it\'s important to note', 'unlimited'];
  t('no banned phrases in published copy',
    !banned.some((p) => copy.toLowerCase().includes(p.toLowerCase())));
}

// ── 2b. the persuasion rubric and the pinned panel ──────────────────
//
// Added with the 2026-persuasion season. Persuasion is the one axis that
// could quietly turn the ballot into a popularity contest, so its fence
// is asserted rather than trusted, and the panel pin is asserted to be a
// real configuration rather than a plausible-looking one.
{
  // Deliberately the NEWEST season rather than today's. A season starts
  // at a stated boundary and never reaches backwards, so on the day a
  // new configuration ships there is a window where the incoming season
  // is real but not yet in force. Asserting against `seasonFor(now)`
  // here would either fail for those hours or push someone to backdate
  // the boundary, which is the one edit this calendar exists to prevent.
  const current = SEASONS[SEASONS.length - 1];
  const rubric = rubricFor(current.rubricVersion);

  t('the newest season is published', current.published === true);
  t('the newest season resolves a rubric', !!rubric);
  t('the newest season pins a panel', !!current.panel);
  t('the newest season is the one in force at its own start',
    seasonFor(current.from).id === current.id);

  t('rubric scores persuasion', rubric.dimensions.some((d) => d.key === 'persuasion'));
  const persuasion = rubric.dimensions.find((d) => d.key === 'persuasion');

  // The fence IS the feature. A persuasion axis that does not disclaim
  // delivery is a delivery score wearing a better name, and it would
  // penalise exactly the debaters this product is trying to reach.
  t('persuasion disclaims delivery on the public card',
    /not charm|Not charm/.test(persuasion.body) && /accent/i.test(persuasion.body));

  const bounds = rubric.outOfBounds.join(' ').toLowerCase();
  t('persuasion cannot override the arguments', bounds.includes('persuasion never overrides the arguments'));
  t('competitive format penalties are excluded', bounds.includes('no format penalty'));
  t('a judge preference cannot invent a burden', bounds.includes('invent a burden'));

  // Persuasion sits at the BOTTOM of the weighing order. If it ever
  // climbs, a well-delivered case starts beating a better-warranted one.
  const bottom = rubric.weighing[rubric.weighing.length - 1];
  t('persuasion weighs last', /persuasion/i.test(bottom.label));
  t('every rung above persuasion is substantive',
    rubric.weighing.slice(0, -1).every((w) => !/persuasion/i.test(w.label)));

  t('the rubric requires a deciding issue', !!(rubric.decidingIssue && rubric.decidingIssue.body));
  t('the newest rubric is casual 1v1', /casual 1v1/i.test(rubric.title));
  t('the newest rubric publishes a 100-point score', /1 to 100/.test(rubric.speakerPoints.scale));
  t('the newest rubric scores focus', rubric.dimensions.some((d) => d.key === 'strategy'));

  // The pin is a promise about what judged your round, so it has to be
  // complete. A juror with no model id is a seat nobody can check.
  const jurors = current.panel.jurors;
  t('the panel pins three jurors', jurors.length === 3);
  t('every juror names a provider and a model',
    jurors.every((j) => !!j.provider && !!j.model));
  t('the panel spans three model families',
    new Set(jurors.map((j) => j.provider)).size === 3);
  t('juror ids are unique', new Set(jurors.map((j) => j.id)).size === jurors.length);
  // Effort changes how a ballot is reached, so an undisclosed effort is
  // the same quiet dial as an undisclosed model.
  t('any pinned effort is a real level',
    jurors.every((j) => !j.effort || ['low', 'medium', 'high', 'xhigh', 'max'].includes(j.effort)));
  t('an even panel is still never tie-broken', current.panel.noMajority === 'unresolved');

  // The dispatch table has to know every provider the season pins, or
  // the seat is dark for a reason no dashboard would explain.
  // A persona per pinned family, so a debater can read who is on the
  // bench. An unnamed seat is allowed by design but never for a family
  // the season actually pinned.
  const benchSrc = readFileSync(new URL('../app/netlify/functions/lib/judge-bench.mjs', import.meta.url), 'utf8');
  t('every pinned family has a bench persona',
    jurors.every((j) => new RegExp('^\\s*' + j.provider + ': \\{', 'm').test(benchSrc)));

  // Degradation is disclosed or it is nothing. The flag has to key off
  // votes actually cast, not off which keys are configured: a juror
  // whose provider errors is available by key and absent from the panel,
  // and reporting that as a full-strength panel is precisely the silent
  // degradation this layer forbids.
  const runSrc = readFileSync(new URL('../app/netlify/functions/lib/judge-run.mjs', import.meta.url), 'utf8');
  t('degradation is measured in votes, not configured keys',
    /degraded: tally\.votesCast < wanted\.length/.test(runSrc));
  t('the juror budget clears a reasoning ballot',
    /JUROR_MAX_TOKENS = Number\(process\.env\.JUDGE_JUROR_MAX_TOKENS \|\| 3000\)/.test(runSrc));

  const jurorsSrc = readFileSync(new URL('../app/netlify/functions/lib/judge-jurors.mjs', import.meta.url), 'utf8');
  t('every pinned provider has a dispatch entry',
    jurors.every((j) => new RegExp('^\\s*' + j.provider + ':', 'm').test(jurorsSrc)));
  t('every pinned provider has an availability check',
    jurors.every((j) => new RegExp("provider === '" + j.provider + "'").test(jurorsSrc)));

  // The public disclosure has to live where people meet the council and
  // where they read its ballot. A complete audit row hidden behind an API
  // is evidence, but it is not an explanation.
  const integrityPage = readFileSync(new URL('../app/judge-integrity.html', import.meta.url), 'utf8');
  t('integrity page names how the council decides',
    integrityPage.includes('How the council reaches a decision.')
      && integrityPage.includes('Same round, separate reads.')
      && integrityPage.includes('One brain, one vote.'));
  t('integrity page separates AI persuasion from audience movement',
    integrityPage.includes('How persuasion is captured.')
      && integrityPage.includes('The AI score')
      && integrityPage.includes('The human read'));
  t('integrity page draws named brain roles from the live charter',
    integrityPage.includes('(c.bench && c.bench.seated)')
      && integrityPage.includes('b.temper')
      && integrityPage.includes('j.pinnedModel'));

  const draftSrc = readFileSync(new URL('../app/js/judge-draft.js', import.meta.url), 'utf8');
  t('pre-round council names providers, models, method, and persuasion fence',
    draftSrc.includes("esc(providerName(s.provider)) + ' · ' + esc(s.model)")
      && draftSrc.includes('How the council decides')
      && draftSrc.includes('How persuasion is scored'));

  const roundsPage = readFileSync(new URL('../app/rounds.html', import.meta.url), 'utf8');
  const liveRoundPage = readFileSync(new URL('../app/live-round.html', import.meta.url), 'utf8');
  t('published async ballots name the brains actually used',
    roundsPage.includes('Brains used: ')
      && roundsPage.includes('p.models')
      && roundsPage.includes('scorecard axes are panel medians'));
  t('live ballots name the brains and explain the persuasion score',
    liveRoundPage.includes('Brains used: ')
      && liveRoundPage.includes('ballotCouncilHtml(b)')
      && liveRoundPage.includes('human audience, not the AI score'));

  const judgePage = readFileSync(new URL('../app/judge.html', import.meta.url), 'utf8');
  t('one-off judge names its selected provider and exact model',
    judgePage.includes("brain.maker + ' ' + brain.name + ' · ' + brain.model")
      && judgePage.includes('This one-off ballot uses only'));
}

// ── 2c. deciding-issue agreement ────────────────────────────────────
//
// Reporting that three jurors picked the same winner while hiding that
// they picked it for three different reasons is the flattering number
// this whole subsystem exists to refuse.
{
  const mk = (id, winner, issue) => ({ jurorId: id, winner, decidingIssue: issue, points: { a: 28, b: 27 }, margin: 1 });

  const same = issueConsensus([
    mk('j1', 'a', 'whether the ad libraries answer accountability'),
    mk('j2', 'a', 'do the libraries actually answer accountability'),
    mk('j3', 'a', 'accountability and the libraries'),
  ]);
  t('jurors naming one issue read as agreed', same.agreement === 1);
  t('issue consensus counts the jurors who named one', same.named === 3);

  const split = issueConsensus([
    mk('j1', 'a', 'whether ad libraries answer accountability'),
    mk('j2', 'a', 'incumbent entrenchment and challenger access'),
    mk('j3', 'a', 'displacement to organic posts'),
  ]);
  t('three different reasons do not read as agreement', split.agreement < 1);

  // One opinion is not agreement. Recording a lone juror as unanimous on
  // the reason would inflate the published figure using exactly the
  // rounds that had no panel behind them.
  t('a lone naming juror reports no agreement',
    issueConsensus([mk('j1', 'a', 'the comparative')]).agreement === null);
  t('nobody naming an issue reports no agreement',
    issueConsensus([mk('j1', 'a', ''), mk('j2', 'a', '')]).agreement === null);

  // Stopwords must not manufacture agreement between unrelated issues.
  t('stopwords are not evidence of agreement',
    issueConsensus([mk('j1', 'a', 'the round turned on the issue of solvency'),
                    mk('j2', 'a', 'the round turned on the issue of topicality')]).agreement < 1);
  t('issue tokens drop stopwords', !issueTokens('the round turned on solvency').has('round'));

  // It rides the tally, not just the helper.
  const tallied = tallyPanel([
    { jurorId: 'j1', winner: 'a', points: { a: 28, b: 27 }, margin: 1, decidingIssue: 'capacity gap on enforcement' },
    { jurorId: 'j2', winner: 'a', points: { a: 28, b: 27 }, margin: 1, decidingIssue: 'the enforcement capacity gap' },
  ], { size: 3, quorum: 2 });
  t('the tally reports issue agreement', tallied.issueAgreement === 1);
  t('the tally names the deciding issue', !!tallied.decidingIssue);
}

// ── 2d. the public judge exposes only casual 1v1 styles ─────────────
//
// Legacy competitive paradigms remain in the data source so an old saved
// ballot can still be explained accurately. They must not reappear in the
// public picker now that new rounds are casual 1v1 only.
{
  const opts = readFileSync(new URL('../app/js/judge-options.js', import.meta.url), 'utf8');
  const judge = readFileSync(new URL('../app/judge.html', import.meta.url), 'utf8');
  const guide = readFileSync(new URL('../app/judge-paradigms.html', import.meta.url), 'utf8');

  // Read ONE group object out of js/judge-options.js by brace depth.
  // Slicing from a marker to a guessed end (to 'brains: {', or to the end
  // of the file) silently absorbs any group added next to the one being
  // read, so a new group elsewhere in the file gets parsed as a member of
  // this one and blocks every commit in the repo. That happened on
  // 2026-08-23 when the delivery groups were added; both readers are
  // exact now, so where a group sits in the file no longer matters.
  function optionGroup(src, name) {
    const at = src.indexOf(name + ': {');
    if (at < 0) return '';
    let depth = 0;
    for (let i = src.indexOf('{', at); i < src.length; i++) {
      if (src[i] === '{') depth++;
      else if (src[i] === '}') { depth--; if (!depth) return src.slice(at, i); }
    }
    return src.slice(at);
  }

  const block = optionGroup(opts, 'paradigms');
  const keys = [...block.matchAll(/^\s{6}([a-z]+): \{/gm)].map((m) => m[1]);
  t('the paradigm list parsed', keys.length >= 10);

  const select = judge.slice(judge.indexOf('id="judgeParadigm"'), judge.indexOf('</select>', judge.indexOf('id="judgeParadigm"')));
  const publicKeys = [...select.matchAll(/value="([a-z]+)"/g)].map((m) => m[1]);
  const casualKeys = ['auto', 'communication', 'moved', 'teaching', 'custom'];
  t('the /judge dropdown contains only casual styles',
    publicKeys.length === casualKeys.length && casualKeys.every((k) => publicKeys.includes(k)));
  t('legacy competitive paradigms stay out of the public picker',
    ['tabula', 'policymaker', 'stock', 'games', 'truth', 'hypothesis'].every((k) => !publicKeys.includes(k)));

  // A guide card that deep-links to a paradigm the picker cannot select
  // is a dead link, which is how the same defect surfaces to a user.
  const linked = [...guide.matchAll(/paradigm=([a-z]+)/g)].map((m) => m[1]);
  const dead = [...new Set(linked)].filter((k) => !keys.includes(k));
  t('every guide deep link names a real paradigm', dead.length === 0);
}

// ── 3. the charter document ─────────────────────────────────────────
{
  const doc = charterDoc(Date.now());
  t('charter names its season', !!doc.season.id);
  t('charter carries the rubric hash', /^[0-9a-f]{16}$/.test(doc.season.rubricHash));
  t('charter publishes the panel', !!doc.season.panel);
  t('charter publishes the fee policy', doc.fee.rake === 0);
  t('charter publishes the appeal route', doc.appeals.windowHours > 0);
  t('charter publishes what is logged', doc.audit.fields.length >= 5);
  t('charter carries season history', doc.history.length === SEASONS.length);
  t('charter reports a running state when given one',
    charterDoc(Date.now(), { panelEnabled: true }).running.panelEnabled === true);
}

// ── 4. fee neutrality is structural, not a promise ──────────────────
{
  // Fix 4. The operator's take must not depend on who wins. Read the
  // real settlement code and assert no rake term has appeared. A
  // side-dependent cut is the single change that would make every other
  // fix in this layer worthless.
  for (const f of ['lib/credits.mjs', 'lib/settle.mjs']) {
    const code = readFileSync(new URL('../app/netlify/functions/' + f, import.meta.url), 'utf8')
      .replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    t(`${f} takes no rake`, !/\brake\b/i.test(code));
    t(`${f} charges no fee`, !/\bhouseFee\b|\bcommission\b|\bplatformCut\b|\bvig\b/i.test(code));
    t(`${f} holds no house account`, !/house_account|houseAccount|operatorAccount/i.test(code));
  }
  t('fee policy states a zero rake', FEE_POLICY.rake === 0);
  t('fee policy lists guarantees', FEE_POLICY.guarantees.length >= 4);

  // Money only moves on a verdict this server wrote. A verdict authored
  // by one of the two interested parties must never settle an economy.
  const settle = readFileSync(new URL('../app/netlify/functions/lib/settle.mjs', import.meta.url), 'utf8');
  t('settlement gates on verdict provenance', /MONEY_VERDICT_SOURCES/.test(settle));
  t('provenance gate allows only server verdicts',
    /MONEY_VERDICT_SOURCES\s*=\s*new Set\(\['server'\]\)/.test(settle));
  t('settlement can be reversed', /export async function reverseMarket/.test(settle));
}

// ── 5. the panel tally ──────────────────────────────────────────────
{
  const jurors = [
    { id: 'j1', provider: 'anthropic', model: 'm1' },
    { id: 'j2', provider: 'openai', model: 'm2' },
    { id: 'j3', provider: 'google', model: 'm3' },
  ];
  const ballot = (winner, p, o) => ({ winner, propPoints: p, oppPoints: o, rfd: 'r' });
  const vote = (j, w, p, o) => normalizeVote(j, ballot(w, p, o), 'prop', 'opp');
  const panel = { size: 3, quorum: 2 };

  t('surface labels normalize to a', vote(jurors[0], 'prop', 28, 27).winner === 'a');
  t('surface labels normalize to b', vote(jurors[0], 'opp', 27, 28).winner === 'b');
  // The shape production actually passes. judge-run calls
  // normalizeVote(r, ...) with the object callJuror RETURNS, which names
  // the juror `jurorId`, not `id`. Every assertion above builds a config
  // object instead, which is how a bug that broke every split panel on
  // the site sat under a green suite: the two shapes disagree and each
  // one looks correct on its own.
  {
    const asResult = { jurorId: 'j-result', provider: 'anthropic', model: 'm', ok: true, ballot: {} };
    const v = normalizeVote(asResult, ballot('prop', 28, 27), 'prop', 'opp');
    t('a juror RESULT keeps its id through normalizeVote', v && v.jurorId === 'j-result');
    const split = tallyPanel([
      normalizeVote({ jurorId: 'j1' }, ballot('prop', 28, 27), 'prop', 'opp'),
      normalizeVote({ jurorId: 'j2' }, ballot('prop', 28, 27), 'prop', 'opp'),
      normalizeVote({ jurorId: 'j3' }, ballot('opp', 27, 28), 'prop', 'opp'),
    ], { size: 3, quorum: 2 });
    t('a 2-1 split names its dissenter', split.dissent.length === 1 && split.dissent[0] === 'j3');
    t('no undefined can reach Firestore in dissent', split.dissent.every((x) => typeof x === 'string' && x));
    t('the lead juror is one of the majority', split.leadJurorId === 'j1' || split.leadJurorId === 'j2');
  }

  t('a garbage winner is not a vote', normalizeVote(jurors[0], ballot('maybe', 28, 27), 'prop', 'opp') === null);
  t('a missing ballot is not a vote', normalizeVote(jurors[0], null, 'prop', 'opp') === null);
  t('margin is signed from a', vote(jurors[0], 'prop', 28.5, 27).margin === 1.5);

  const unanimous = tallyPanel([
    vote(jurors[0], 'prop', 28, 27), vote(jurors[1], 'prop', 28.5, 27), vote(jurors[2], 'prop', 29, 26.5),
  ], panel);
  t('unanimous panel decides', unanimous.winner === 'a');
  t('unanimous panel is flagged', unanimous.unanimous === true);
  t('unanimous agreement is 1', unanimous.agreement === 1);
  t('unanimous panel has no dissent', unanimous.dissent.length === 0);
  t('points are the median not the mean', unanimous.points.a === 28.5);
  t('margin spread is reported', unanimous.marginSpread === 1.5);

  const split21 = tallyPanel([
    vote(jurors[0], 'prop', 28, 27), vote(jurors[1], 'opp', 27, 28), vote(jurors[2], 'prop', 28, 27.5),
  ], panel);
  t('2-1 panel decides on the majority', split21.winner === 'a');
  t('2-1 panel is not unanimous', split21.unanimous === false);
  t('2-1 agreement is reported honestly', split21.agreement === 0.67);
  t('2-1 panel names the dissenter', split21.dissent.length === 1 && split21.dissent[0] === 'j2');

  // The load-bearing case. An even split must NOT be tie-broken, because
  // any tie-break rule hands the operator a thumb on the scale. It is
  // recorded unresolved, and nothing downstream may coerce it.
  const even = tallyPanel([vote(jurors[0], 'prop', 28, 27), vote(jurors[1], 'opp', 27, 28)], panel);
  t('an even split does not pick a winner', even.winner === null);
  t('an even split is marked unresolved', even.resolution === 'unresolved');

  // The 1-1 case above is also blocked by quorum, so it does not
  // exercise the majority rule on its own. This one does: four jurors
  // split 2-2 clears a quorum of 2 and still must not resolve, because
  // any rule that breaks that tie is a thumb on the scale. Caught by
  // deliberately weakening the tally and finding this case untested.
  const j4 = { id: 'j4', provider: 'anthropic', model: 'm4' };
  const evenQuorate = tallyPanel([
    vote(jurors[0], 'prop', 28, 27), vote(jurors[1], 'prop', 28, 27),
    vote(jurors[2], 'opp', 27, 28), vote(j4, 'opp', 27, 28),
  ], { size: 4, quorum: 2 });
  t('a 2-2 split does not resolve despite meeting quorum', evenQuorate.winner === null);
  t('a 2-2 split is marked unresolved', evenQuorate.resolution === 'unresolved');
  t('a 2-2 split still reports its tally', evenQuorate.tally.a === 2 && evenQuorate.tally.b === 2);
  t('a 2-2 split reports 0.5 agreement', evenQuorate.agreement === 0.5);

  const lone = tallyPanel([vote(jurors[0], 'prop', 28, 27)], panel);
  t('a lone juror cannot carry a verdict', lone.winner === null);
  t('a lone juror counts as unresolved', lone.resolution === 'unresolved');
  t('a lone juror reports the missing seats', lone.missing === 2);

  const none = tallyPanel([], panel);
  t('no votes is distinguishable from a split', none.resolution === 'no_votes');
  t('no votes has no winner', none.winner === null);

  // Two agreeing jurors DO carry a verdict: the panel has to survive
  // losing a provider or an outage freezes every ballot on the site.
  const twoAgree = tallyPanel([vote(jurors[0], 'prop', 28, 27), vote(jurors[1], 'prop', 29, 27)], panel);
  t('two agreeing jurors reach quorum', twoAgree.winner === 'a');
  t('a short panel is not called unanimous', twoAgree.unanimous === false);

  t('median of an even count averages the middle', median([1, 2, 3, 4]) === 2.5);
  t('median ignores non-numbers', median([1, null, 3, undefined]) === 2);
  t('median of nothing is null', median([]) === null);
}

// ── 6. inter-rater reliability ──────────────────────────────────────
{
  // Perfect agreement across items that are not all the same way.
  const perfect = fleissKappa([{ a: 3, b: 0 }, { a: 0, b: 3 }, { a: 3, b: 0 }, { a: 0, b: 3 }]);
  t('perfect agreement scores kappa 1', perfect.kappa === 1);

  // A panel that always says the same thing has high raw agreement and
  // measures nothing. Kappa has to net that out, which is exactly why
  // it is the published statistic rather than a percentage.
  const degenerate = fleissKappa([{ a: 3, b: 0 }, { a: 3, b: 0 }, { a: 3, b: 0 }]);
  t('always-one-way agreement is flagged degenerate', degenerate.degenerate === true);

  const mixed = fleissKappa([{ a: 2, b: 1 }, { a: 1, b: 2 }, { a: 3, b: 0 }, { a: 0, b: 3 }]);
  t('mixed agreement scores between 0 and 1', mixed.kappa > 0 && mixed.kappa < 1);

  // Items with fewer than two raters carry no agreement information and
  // must not be counted as perfect.
  t('single-rater items are excluded', fleissKappa([{ a: 1, b: 0 }]) === null);
  t('empty input yields null', fleissKappa([]) === null);

  t('kappa bands are labelled', kappaBand(0.9) === 'almost perfect');
  t('a null kappa reads as insufficient data', kappaBand(null) === 'not enough data');
  t('negative kappa is named', kappaBand(-0.1) === 'worse than chance');

  const recs = [
    { panel: { tally: { a: 3, b: 0 }, resolution: 'majority', unanimous: true, agreement: 1, marginSpread: 0.5 } },
    { panel: { tally: { a: 2, b: 1 }, resolution: 'majority', unanimous: false, agreement: 0.67, marginSpread: 2 } },
    { panel: { tally: { a: 1, b: 1 }, resolution: 'unresolved', unanimous: false, agreement: 0.5, marginSpread: 3 } },
  ];
  const rel = reliabilityFrom(recs);
  t('reliability counts rounds', rel.rounds === 3);
  t('reliability counts decided rounds', rel.decided === 2);
  t('reliability publishes the unresolved rate', rel.unresolved === 1);
  t('reliability publishes a median spread', rel.medianMarginSpread === 2);

  // Honesty guard. A kappa over a handful of rounds is noise, and
  // publishing noise as documented reliability is the overclaim this
  // whole layer exists to avoid.
  t('a small sample is not reportable', rel.reportable === false);
  const many = Array.from({ length: 40 }, (_, i) => ({
    panel: { tally: i % 2 ? { a: 3, b: 0 } : { a: 0, b: 3 }, resolution: 'majority', unanimous: true, agreement: 1, marginSpread: 1 },
  }));
  t('a large sample is reportable', reliabilityFrom(many).reportable === true);
}

// ── 7. the audit record ─────────────────────────────────────────────
{
  const season = seasonFor(Date.now());
  const rec = auditRecord({
    judgmentId: 'async_e1',
    source: 'async',
    eventId: 'e1',
    season,
    jurorResults: [
      { jurorId: 'j1', provider: 'anthropic', model: season.panel.jurors[0].model, ok: true, ms: 900, promptHash: 'abc123', ballot: { winner: 'prop', propPoints: 28, oppPoints: 27, rfd: 'r' } },
      { jurorId: 'j2', provider: 'openai', model: 'some-other-model', ok: true, ms: 800, promptHash: 'abc123', ballot: { winner: 'opp', propPoints: 27, oppPoints: 28, rfd: 'r' } },
      { jurorId: 'j3', provider: 'google', model: season.panel.jurors[2].model, ok: false, ms: 22000, promptHash: 'abc123', error: 'timeout' },
    ],
    panel: { resolution: 'unresolved', tally: { a: 1, b: 1 }, agreement: 0.5 },
    motion: 'THW test',
    format: 'apda',
    clashMapUsed: true,
    now: 1000,
  });

  t('audit stamps the season', rec.seasonId === season.id);
  t('audit stamps the rubric version', rec.rubricVersion === season.rubricVersion);
  t('audit stamps the rubric hash', /^[0-9a-f]{16}$/.test(rec.rubricHash));
  t('audit records every juror', rec.jurors.length === 3);

  // A model that is not the season pin is an override, and the record
  // says so. A quiet override is the whole problem this layer solves.
  const overridden = rec.jurors.filter((j) => j.overridden);
  t('an off-pin model is stamped as an override', overridden.length === 1);
  t('the override names the pinned model', overridden[0].pinnedModel === season.panel.jurors[1].model);
  t('an on-pin model is not stamped', !rec.jurors[0].overridden);

  // Dissents are the most valuable rows in here and are kept.
  t('audit keeps the dissenting vote', rec.jurors[1].vote.winner === 'opp');
  t('audit keeps a juror failure', rec.jurors[2].error === 'timeout');
  t('a failed juror casts no vote', rec.jurors[2].vote === undefined);

  // One distinct prompt hash proves the jurors were shown identical
  // input, which is what makes their disagreement attributable to the
  // models rather than to prompt engineering.
  t('identical prompts are asserted', rec.identicalPrompts === true);
  const mismatched = auditRecord({
    judgmentId: 'x', source: 'async', eventId: 'x', season,
    jurorResults: [
      { jurorId: 'j1', provider: 'anthropic', model: 'm', ok: true, promptHash: 'aaa', ballot: { winner: 'prop' } },
      { jurorId: 'j2', provider: 'openai', model: 'm', ok: true, promptHash: 'bbb', ballot: { winner: 'prop' } },
    ],
    panel: {}, now: 1,
  });
  t('differing prompts are flagged', mismatched.identicalPrompts === false);

  t('audit starts with no appeal', rec.appealState === 'none');
  t('audit starts with no revisions', rec.revisionCount === 0);
}

// ── 8. appeals ──────────────────────────────────────────────────────
{
  const now = 1_000_000_000;
  const judgment = {
    id: 'async_e1', source: 'async', eventId: 'e1',
    winner: 'a', sideLabels: { a: 'prop', b: 'opp' },
    participants: { a: 'u1', b: 'u2' },
    judgedAt: now, disputeState: 'none',
    sideScores: { a: 28, b: 27 }, rfd: 'original reasoning',
  };

  t('appeal ids are deterministic', appealId('async_e1', 'u1') === 'async_e1__u1');
  t('a real ground validates', validGround(APPEAL_POLICY.grounds[0].key));
  t('an invented ground is rejected', !validGround('vibes'));
  t('a real outcome validates', validOutcome('overturned'));
  t('an invented outcome is rejected', !validOutcome('mostly'));

  t('a debater can appeal', canAppeal({ judgment, uid: 'u1', nowMs: now + 1000 }).ok);
  t('the appeal names the side', canAppeal({ judgment, uid: 'u2', nowMs: now }).side === 'b');
  t('a stranger cannot appeal',
    canAppeal({ judgment, uid: 'u9', nowMs: now }).reason === 'not_a_participant');
  t('an anonymous caller cannot appeal',
    canAppeal({ judgment, uid: '', nowMs: now }).reason === 'not_signed_in');
  t('a second appeal is refused',
    canAppeal({ judgment, uid: 'u1', nowMs: now, existing: true }).reason === 'already_filed');
  t('an appeal outside the window is refused',
    canAppeal({ judgment, uid: 'u1', nowMs: now + APPEAL_WINDOW_MS + 1 }).reason === 'window_closed');
  t('an appeal at the window edge is allowed',
    canAppeal({ judgment, uid: 'u1', nowMs: now + APPEAL_WINDOW_MS }).ok);
  t('a ballot already under review is refused',
    canAppeal({ judgment: { ...judgment, disputeState: 'open' }, uid: 'u1', nowMs: now }).reason === 'already_under_review');
  // A judgment with no timestamp must not compute an expired window and
  // silently deny a real appeal.
  t('an unstamped judgment stays appealable',
    canAppeal({ judgment: { ...judgment, judgedAt: 0, createdAt: 0 }, uid: 'u1', nowMs: now }).ok);

  const appeal = newAppeal({ judgment, uid: 'u1', name: 'A', side: 'a', ground: 'missed-drop', detail: 'x', nowMs: now });
  t('an appeal records the verdict it contests', appeal.verdictAppealed === 'a');
  t('a new appeal is open', appeal.state === 'open');

  // A reviewer cannot rule on their own round. The conflict test is
  // against the round, so an admin who debated it is disqualified.
  t('an independent reviewer can review', canReview({ judgment, appeal, reviewerUid: 'r1' }).ok);
  t('a debater cannot review their own round',
    canReview({ judgment, appeal, reviewerUid: 'u1' }).reason === 'reviewer_conflict');
  t('the opponent cannot review it either',
    canReview({ judgment, appeal, reviewerUid: 'u2' }).reason === 'reviewer_conflict');
  t('a resolved appeal cannot be re-reviewed',
    canReview({ judgment, appeal: { ...appeal, state: 'resolved' }, reviewerUid: 'r1' }).reason === 'already_resolved');

  // Nothing is ever deleted. The original ballot survives every outcome,
  // which is the only version of this that survives being subpoenaed.
  const upheld = revisedJudgment(judgment, { outcome: 'upheld', reviewerUid: 'r1', reason: 'stands', nowMs: now });
  t('upheld keeps the verdict', upheld.winner === undefined);
  t('upheld still records the review', upheld.humanReview.outcome === 'upheld');
  t('upheld preserves the original', upheld.original.winner === 'a');

  const over = revisedJudgment(judgment, { outcome: 'overturned', reviewerUid: 'r1', reason: 'missed a drop', nowMs: now });
  t('overturned flips the winner', over.winner === 'b');
  t('overturned preserves the original verdict', over.original.winner === 'a');
  t('overturned preserves the original reasoning', over.original.rfd === 'original reasoning');
  t('overturned is marked human-reviewed', over.judgeType === 'human-review');
  // A human overturning a call is not claiming to have re-scored four
  // axes of speaker points, and inventing numbers to match would be a
  // fabrication sitting in the permanent record.
  t('overturned does not invent new scores', over.sideScores === undefined);

  const voided = revisedJudgment(judgment, { outcome: 'void', reviewerUid: 'r1', reason: 'no transcript', nowMs: now });
  t('void clears the winner', voided.winner === null);
  t('void preserves the original', voided.original.winner === 'a');

  t('overturned requires reversal', requiresReversal('overturned'));
  t('void requires reversal', requiresReversal('void'));
  t('upheld requires no reversal', !requiresReversal('upheld'));

  // Re-revising must not lose the first original. `original` is set
  // once and carried forward, or an overturn followed by anything else
  // would overwrite the model's actual ballot with the corrected one.
  const twice = revisedJudgment({ ...judgment, ...over, id: judgment.id }, {
    outcome: 'void', reviewerUid: 'r2', reason: 'second look', nowMs: now + 1,
  });
  t('a second revision keeps the first original', twice.original.winner === 'a');
}

// ── 9. no model may resolve an appeal ───────────────────────────────
{
  // Fix 3's load-bearing rule. Routing an appeal back to a model, even a
  // bigger one, is the same circularity with a larger bill. Assert the
  // human bench contains no provider call and no scheduled trigger.
  const bench = readFileSync(new URL('../app/netlify/functions/admin-appeals.mjs', import.meta.url), 'utf8');
  t('the appeal bench calls no model', !/api\.anthropic|api\.openai|generativelanguage|judge-jurors|callPanel/.test(bench));
  t('the appeal bench is not scheduled', !/export const config[\s\S]*schedule/.test(bench));
  t('the appeal bench requires an admin', /requireAdmin/.test(bench));
  t('the appeal bench reverses the market', /reverseMarket/.test(bench));
  t('the appeal bench reverses the ladder', /reverseRoundRating/.test(bench));

  const filing = readFileSync(new URL('../app/netlify/functions/judge-appeal.mjs', import.meta.url), 'utf8');
  t('filing calls no model', !/api\.anthropic|api\.openai|generativelanguage|callPanel/.test(filing));
  t('filing freezes settlement', /disputeState: 'open'/.test(filing));
}

// ── 10. the bench is a face, not a lever ────────────────────────────
{
  // lib/judge-bench.mjs puts archetypes on the pinned jurors so a panel
  // can be drawn. The risk it introduces is that "pick your judge"
  // arrives through the presentation layer, which is the pinned-panel
  // promise defeated from the other side. So: it may describe the panel
  // and it may not participate in deciding one.
  const bench = readFileSync(new URL('../app/netlify/functions/lib/judge-bench.mjs', import.meta.url), 'utf8');
  // Comments are stripped before these checks. This file documents its
  // own prohibitions ("exports no winner"), so matching raw text would
  // fail on the prose that promises the thing being asserted, and a
  // guard that fires on a comment teaches people to weaken the guard.
  const benchCode = bench.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
  t('the bench calls no model', !/api\.anthropic|api\.openai|generativelanguage|callPanel|callJuror/.test(benchCode));
  t('the bench exports no verdict', !/\bwinner\b|speakerPoints|tallyPanel/.test(benchCode));
  t('every guest judge is unranked', /guestJudgeIsRanked[\s\S]*return false/.test(benchCode));

  // The tally path must not know the bench exists. If judge-panel ever
  // imports it, a persona could weight a vote.
  const panel = readFileSync(new URL('../app/netlify/functions/lib/judge-panel.mjs', import.meta.url), 'utf8');
  t('the tally does not import the bench', !/judge-bench/.test(panel));

  // The bench must derive from the season's own juror list rather than
  // carrying its own copy of the pin. A hardcoded model id here would be
  // a second, unversioned pin that the charter hash does not cover.
  t('the bench pins no model of its own', !/claude-sonnet|gpt-4o|gemini-[0-9]/.test(bench));

  const { benchForSeason } = await import('../app/netlify/functions/lib/judge-bench.mjs');
  const { SEASONS } = await import('../app/netlify/functions/lib/judge-charter.mjs');
  const current = SEASONS[SEASONS.length - 1];
  const drawn = benchForSeason(current);
  t('the bench seats exactly the pinned jurors', drawn.seated.length === current.panel.jurors.length);
  t('the bench reports itself as pinned', drawn.pinned === true);
  t(
    'the bench carries the pinned model ids unchanged',
    drawn.seated.every((s, i) => s.pinnedModel === current.panel.jurors[i].model),
  );
  // A disclosed override has to show on the card. A silent one is the
  // whole problem the charter exists to prevent.
  const overridden = benchForSeason(current, { [current.panel.jurors[0].id]: 'some-other-model' });
  t('an override is marked on the bench', overridden.seated[0].overridden === true);

  // The pre-panel season has no panel. It must say so rather than
  // drawing three chairs that were never there.
  const preseason = SEASONS[0];
  t('a single-judge season draws no panel', benchForSeason(preseason).seated.length === 0);
}

// ── 11. the crowd vote decides nothing ──────────────────────────────
{
  // Every completed round takes an audience vote (async-round.mjs,
  // action 'vote', tallied onto async_rounds/{id}.votes). It is a
  // public reading and it is the contrast that makes panel divergence
  // measurable. It must never become a resolver.
  //
  // Two reasons, and the second is the one that bites. First, a vote is
  // brigadable in a way a three-family panel is not: one motivated
  // group with throwaway accounts outvotes a room, and every guarantee
  // above (published rubric, no tie-break, human appeal, no rake) exists
  // precisely because settlement has to survive someone trying. Second,
  // a resolver cannot also be an independent measurement OF the
  // resolver. The moment the vote settles anything, crowd-versus-panel
  // agreement stops being a reliability signal and becomes a
  // self-portrait, which throws away the one genuinely novel number
  // this product can publish.
  //
  // MONEY_VERDICT_SOURCES is already pinned to exactly ['server'] in
  // section 4, so a crowd verdict cannot enter through the front door.
  // This closes the back door: reading the tally DIRECTLY inside the
  // money or ladder path, which would never touch that set.
  const CROWD = /\bvotes\b|\bvoteScore\b|\bvoteCount\b|crowdVote|audienceVote|popularVote|\bcrowdWinner\b/i;
  for (const f of ['lib/settle.mjs', 'lib/credits.mjs', 'lib/rating-apply.mjs']) {
    let code;
    try {
      code = readFileSync(new URL('../app/netlify/functions/' + f, import.meta.url), 'utf8');
    } catch {
      // A renamed or deleted money path must fail loudly rather than
      // silently passing a guard over a file that is no longer there.
      t(`${f} exists to be guarded`, false);
      continue;
    }
    const stripped = code.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    t(`${f} never reads a crowd tally`, !CROWD.test(stripped));
  }

  // And state it where users can read it, not only where we can.
  t(
    'the fee policy publishes that the audience vote settles nothing',
    FEE_POLICY.guarantees.some((g) => /audience vote/i.test(g) && /never settles/i.test(g)),
  );
}

// ── 12. the public board ranks on rating, never on the scorecard ────
//
// Measured 2026-08-14 (judge bias probe: 48 runs of the live panel over
// constructed speech pairs). No manipulation flipped a verdict, but
// padding a speech buys roughly +0.3 speaker points of clarity on the
// scorecard. Ratings, credits and settlement read ballot.winner only,
// so the one path that measured softness had to a public ranking was a
// surface ordering people by raw judge score. These assertions keep
// every standings endpoint on the rating ladder, and keep the money
// path off speaker-point fields, so reintroducing either is a failing
// commit rather than a quiet regression.
{
  const { composeTopRows } = await import('../app/netlify/functions/lib/rating-board.mjs');

  const ratedUid = 'r'.repeat(28);
  const rated = [
    { uid: ratedUid, kind: 'rating', rating: 1420 },
    { uid: 'x'.repeat(28), kind: 'rating', rating: 1776 },
    { uid: 'y'.repeat(28), kind: 'rating', rating: 1654 },
  ];
  const entries = [
    { uid: null, kind: 'live', score: 29.9 },            // seed, top speaker score
    { uid: ratedUid, kind: 'voice', score: 29.8 },       // same person's score entry
    { uid: 'w'.repeat(28), kind: 'live', score: 28.1 },
  ];
  const rows = composeTopRows(rated, entries, 8);
  t('no speaker score outranks a rated debater', rows[0] && rows[0].kind === 'rating');
  t('teaser rank order follows its displayed ratings',
    rows.slice(0, 3).map((r) => r.rating).join(',') === '1776,1654,1420');
  t('a rated debater never reappears as a score row',
    rows.filter((r) => r.uid === ratedUid).length === 1);
  t('score rows still fill a thin ladder', rows.some((r) => r.kind !== 'rating'));
  t('an empty ladder leaves the board to the entries',
    composeTopRows([], entries, 8)[0] === entries[0]);
  t('the row cap holds', composeTopRows(rated, entries, 2).length === 2);

  const boardSrc = {};
  for (const f of ['leaderboard-top.mjs', 'leaderboard-ratings.mjs', 'lib/rating-board.mjs']) {
    try {
      boardSrc[f] = readFileSync(new URL('../app/netlify/functions/' + f, import.meta.url), 'utf8');
    } catch {
      t(`${f} exists to be guarded`, false);
      boardSrc[f] = '';
    }
  }
  t('the ladder orders on rating', /orderBy\('rating'/.test(boardSrc['lib/rating-board.mjs']));
  t('the ladder never orders on judge score', !/orderBy\('score'/.test(boardSrc['lib/rating-board.mjs']));
  t('/api/leaderboard-ratings serves the shared ladder',
    /fetchRatingRows/.test(boardSrc['leaderboard-ratings.mjs'])
    && !/orderBy\('score'/.test(boardSrc['leaderboard-ratings.mjs']));
  t('/api/leaderboard-top puts the ladder first',
    /fetchRatingRows/.test(boardSrc['leaderboard-top.mjs'])
    && /composeTopRows/.test(boardSrc['leaderboard-top.mjs']));
  t('the ladder never ranks an AI seat', /doc\.id\.length < 20/.test(boardSrc['lib/rating-board.mjs']));

  // The probe's clean boundary, kept clean: the paths that move ratings
  // and money never read a speaker-point field.
  const POINTS = /proPoints|conPoints|speakerPoints/;
  for (const f of ['lib/rating-apply.mjs', 'lib/settle.mjs', 'lib/credits.mjs']) {
    let code = '';
    try {
      code = readFileSync(new URL('../app/netlify/functions/' + f, import.meta.url), 'utf8');
    } catch {
      t(`${f} exists to be guarded`, false);
      continue;
    }
    const stripped = code.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    t(`${f} never reads speaker points`, !POINTS.test(stripped));
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
