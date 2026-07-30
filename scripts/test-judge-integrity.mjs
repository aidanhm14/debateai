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

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
