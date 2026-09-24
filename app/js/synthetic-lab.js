(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  let catalog = null, current = null, running = false, stopRequested = false;
  const label = value => String(value || '').replaceAll('_', ' ');
  function node(tag, text, className) { const el = document.createElement(tag); if (text !== undefined) el.textContent = text; if (className) el.className = className; return el; }
  function notice(text = '', error = false) { $('notice').textContent = text; $('notice').classList.toggle('error', error); }
  function lock(message = '') {
    stopRequested = true; current = null; catalog = null;
    $('workspace').hidden = true; $('gate').hidden = false; $('logout').hidden = true;
    $('login-error').textContent = message; $('saved-rounds').replaceChildren(); $('transcript').replaceChildren(); $('judgments').replaceChildren(); $('repairs').replaceChildren(); $('judgment-json').value = '';
  }
  async function api(body, query = '') {
    const options = { credentials: 'same-origin', cache: 'no-store', headers: {} };
    if (body) { options.method = 'POST'; options.headers['Content-Type'] = 'application/json'; options.body = JSON.stringify(body); }
    const response = await fetch('/api/synthetic-lab' + query, options);
    let result; try { result = await response.json(); } catch { throw new Error('The server did not finish the request. Your saved steps are still available.'); }
    if (!response.ok) {
      if (response.status === 401 && body?.action !== 'login') lock(result.error);
      const error = new Error(result.error || 'Request failed.'); error.status = response.status; throw error;
    }
    return result;
  }
  function models() {
    if (!catalog) return;
    const swap = $('swap').checked, roles = catalog.models;
    $('model-pair').replaceChildren();
    for (const [side, key] of [['FOR', swap ? 'debaterB' : 'debaterA'], ['AGAINST', swap ? 'debaterA' : 'debaterB']]) {
      const line = node('div'); line.append(node('strong', side + '  '), document.createTextNode(roles[key].model)); $('model-pair').append(line);
    }
  }
  function selectedExample() {
    const custom = $('example').value === 'custom'; $('custom-fields').hidden = !custom;
    $('motion').required = custom; $('family').required = custom;
    $('example-context').textContent = custom ? '' : (catalog?.examples.find(e => e.id === $('example').value)?.context || ''); models();
  }
  function showRuns() {
    const container = $('saved-rounds'); container.replaceChildren();
    if (!catalog.runs.length) { container.append(node('p', 'Your first round will appear here.', 'hint')); return; }
    for (const run of catalog.runs) {
      const button = node('button', undefined, 'saved-round' + (current?.id === run.id ? ' active' : '')); button.type = 'button'; button.disabled = running;
      button.append(node('span', run.motion), node('small', `${run.reviewStatus === 'approved' ? 'REVIEWED' : run.status === 'complete' ? 'READY TO REVIEW' : 'IN PROGRESS'} · ${run.split || 'NEW'}`));
      button.addEventListener('click', () => openRound(run.id).catch(e => notice(e.message, true))); container.append(button);
    }
  }
  async function refresh() {
    catalog = await api();
    if (!$('example').options.length) {
      for (const example of catalog.examples) { const option = node('option', example.motion); option.value = example.id; $('example').append(option); }
      const option = node('option', 'Write my own example'); option.value = 'custom'; $('example').append(option);
    }
    selectedExample(); showRuns();
    $('gate').hidden = true; $('workspace').hidden = false; $('logout').hidden = false;
  }
  function stage(job) {
    if (job.status === 'complete') return 'Round complete';
    if (job.steps < 6) return `Writing turn ${job.steps + 1} of 6`;
    if (job.steps < 8) return `Judge ${job.steps - 5} is evaluating`;
    return 'Testing candidate corrections';
  }
  function render(job) {
    current = job; $('empty-round').hidden = true; $('round').hidden = false;
    $('round-title').textContent = job.example.motion;
    $('round-meta').textContent = `${job.record?.split || 'RESEARCH'} / ${job.example.family} / ${new Date(job.createdAt).toLocaleDateString()}`;
    $('run-status-text').textContent = running ? stage(job) : job.status === 'complete' ? 'Ready for review' : 'Progress saved';
    $('step-count').textContent = `${job.steps} saved steps`;
    $('status-dot').classList.toggle('running', running);
    $('progress').max = job.maximumSteps; $('progress').value = job.status === 'complete' ? job.maximumSteps : job.steps;
    $('continue').hidden = running || job.status === 'complete'; $('pause').hidden = !running;
    $('start').disabled = running; $('refresh').disabled = running; $('logout').disabled = running;
    $('transcript').replaceChildren();
    for (const turn of job.record?.turns || []) {
      const card = node('article', undefined, 'speech ' + turn.side);
      const header = node('div', undefined, 'speech-head');
      const role = turn.side === 'pro' ? (job.variant ? 'debaterB' : 'debaterA') : (job.variant ? 'debaterA' : 'debaterB');
      header.append(node('span', `${turn.side === 'pro' ? 'For' : 'Against'} · ${turn.phase}`), node('span', `${turn.id} / ${job.models[role].model}`));
      card.append(header, node('p', turn.text)); $('transcript').append(card);
    }
    renderJudges(job); renderRepairs(job);
    $('review-panel').hidden = job.status !== 'complete';
    if (job.status === 'complete') populateReview(job);
    if (job.error && !running) notice(job.error, true);
    if (catalog) showRuns();
  }
  function renderJudges(job) {
    const container = $('judgments'); container.replaceChildren(); const judges = job.record?.judgments || []; if (!judges.length) return;
    container.append(node('h3', 'The judges'), node('p', judges.length === 2 ? (job.record.judgesAgree ? 'Both judges reached the same verdict. Their labels still need review.' : 'The judges disagree. Keep that disagreement visible when reviewing.') : 'The second judge evaluates the transcript independently.', 'subtle'));
    for (const { role, judgment: j } of judges) {
      const card = node('article', undefined, 'judge-card');
      card.append(node('h4', `${job.models[role].model} · ${j.winner === 'unresolved' ? 'Unresolved' : (j.winner === 'pro' ? 'For' : 'Against') + ' wins'}`), node('h5', j.decidingIssue), node('p', j.rationale));
      const scores = node('div', undefined, 'score-grid'); scores.append(node('span', 'DIMENSION'), node('strong', 'FOR'), node('strong', 'AGAINST'));
      for (const key of Object.keys(j.scores.pro)) scores.append(node('span', label(key)), node('strong', String(j.scores.pro[key])), node('strong', String(j.scores.con[key])));
      card.append(scores);
      for (const m of j.mistakes) { const item = node('div', undefined, 'mistake'); item.append(node('code', `${m.turnId} / ${label(m.tag)} / ${m.severity}`), node('blockquote', m.quote), node('p', m.explanation)); card.append(item); }
      if (!j.mistakes.length) card.append(node('p', 'No specific mistake spans flagged.', 'subtle'));
      if (j.factualChecksNeeded.length) card.append(node('p', 'Needs fact-checking: ' + j.factualChecksNeeded.join(' '), 'error'));
      container.append(card);
    }
  }
  function renderRepairs(job) {
    const container = $('repairs'); container.replaceChildren(); const repairs = job.record?.repairs || []; if (!repairs.length) return;
    container.append(node('h3', 'What could have been stronger'), node('p', 'Each correction uses only the context available at that turn. Two blind comparisons check the original and revision in opposite orders.', 'subtle'));
    for (const repair of repairs) {
      const card = node('article', undefined, 'repair-card');
      card.append(node('h4', `${repair.turnId} · ${label(repair.tag)}`), node('p', repair.passesPreference ? 'Both comparisons preferred the correction. Awaiting your review.' : 'The comparisons did not both prefer the correction. Excluded from training export.', 'subtle'), node('div', 'ORIGINAL', 'comparison-label'), node('p', repair.original), node('div', 'CANDIDATE CORRECTION', 'comparison-label'), node('p', repair.repaired));
      const details = node('details'); details.append(node('summary', 'Why the comparisons decided this'));
      repair.comparisons.forEach((c, i) => details.append(node('p', `${i + 1}. ${c.reason}`))); card.append(details); container.append(card);
    }
  }
  function populateReview(job) {
    const review = job.review;
    if ($('review-form').dataset.record === job.id) return;
    $('review-form').dataset.record = job.id;
    $('reviewer').value = review?.reviewer || '';
    $('review-notes').value = review?.notes || '';
    $('facts-reviewed').checked = review?.factualChecksResolved || false;
    $('judge-choice').value = review?.status === 'approved' && !review.finalJudgment ? 'none' : '0';
    $('judgment-json').value = JSON.stringify(review?.finalJudgment || job.record.judgments[0].judgment, null, 2);
    $('judgment-json').disabled = $('judge-choice').value === 'none';
    $('repair-checks').replaceChildren();
    for (const repair of job.record.repairs) {
      const wrapper = node('label', undefined, 'check'), checkbox = node('input'); checkbox.type = 'checkbox'; checkbox.value = repair.id; checkbox.name = 'approved-repair'; checkbox.disabled = !repair.passesPreference; checkbox.checked = review?.approvedRepairIds?.includes(repair.id) || false;
      wrapper.append(checkbox, document.createTextNode(`Approve ${repair.turnId}: ${label(repair.tag)}${repair.passesPreference ? '' : ' (comparison checks failed)'}`)); $('repair-checks').append(wrapper);
    }
    $('save-review').textContent = review?.status === 'approved' ? 'Update approved review' : 'Save approved review';
  }
  async function openRound(id) { if (running) return; notice(); const result = await api(null, '?id=' + encodeURIComponent(id)); render(result.job); }
  async function run() {
    if (!current || running || current.status === 'complete') return;
    running = true; stopRequested = false; notice(); render(current);
    try {
      while (!stopRequested && current && current.status !== 'complete') {
        const id = current.id;
        const result = await api({ action: 'step', id, expectedStep: current.steps });
        if (!current || current.id !== id) break;
        render(result.job);
      }
      if (current?.status === 'complete') notice('Round complete. Inspect the judges and corrections below, then save your review when ready.');
      else if (current) notice('Paused. Your progress is saved.');
    } catch (e) {
      notice(e.message, true);
      if (current) { try { current = (await api(null, '?id=' + encodeURIComponent(current.id))).job; } catch {} }
    } finally {
      running = false;
      $('start').disabled = false; $('refresh').disabled = false; $('logout').disabled = false;
      if (current) render(current);
      if (catalog) { try { await refresh(); } catch {} }
    }
  }
  function download(value, filename, type = 'application/json') {
    const url = URL.createObjectURL(new Blob([value], { type })); const link = node('a'); link.href = url; link.download = filename; document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  $('unlock-form').addEventListener('submit', async e => {
    e.preventDefault(); $('unlock').disabled = true; $('login-error').textContent = '';
    try { await api({ action: 'login', password: $('access-code').value }); $('access-code').value = ''; await refresh(); if (catalog.runs.length) await openRound(catalog.runs[0].id); }
    catch (e) { $('login-error').textContent = e.message; }
    finally { $('unlock').disabled = false; }
  });
  $('logout').addEventListener('click', async () => { try { await api({ action: 'logout' }); lock(); } catch (e) { notice(e.message, true); } });
  $('example').addEventListener('change', selectedExample); $('swap').addEventListener('change', models);
  $('refresh').addEventListener('click', () => refresh().catch(e => notice(e.message, true)));
  $('create-form').addEventListener('submit', async e => {
    e.preventDefault(); if (running) return; $('start').disabled = true; notice();
    const body = { action: 'create', swap: $('swap').checked };
    if ($('example').value === 'custom') Object.assign(body, { motion: $('motion').value, context: $('context').value, family: $('family').value, evidence: $('evidence').value }); else body.exampleId = $('example').value;
    try { const result = await api(body); render(result.job); if (matchMedia('(max-width: 650px)').matches) $('round').scrollIntoView({ behavior: 'smooth', block: 'start' }); await run(); }
    catch (e) { notice(e.message, true); $('start').disabled = false; }
  });
  $('continue').addEventListener('click', run);
  $('pause').addEventListener('click', () => { stopRequested = true; notice('Pausing after the current step finishes.'); });
  $('download-raw').addEventListener('click', async () => {
    if (!current) return;
    try { const result = await api(null, '?id=' + encodeURIComponent(current.id) + '&raw=1'); download(JSON.stringify(result.job, null, 2), `debatable-synthetic-${current.id}.json`); } catch (e) { notice(e.message, true); }
  });
  $('judge-choice').addEventListener('change', () => {
    const value = $('judge-choice').value; $('judgment-json').disabled = value === 'none';
    if (value !== 'none') $('judgment-json').value = JSON.stringify(current.record.judgments[Number(value)].judgment, null, 2);
  });
  $('review-form').addEventListener('submit', async e => {
    e.preventDefault(); $('save-review').disabled = true;
    try {
      const finalJudgment = $('judge-choice').value === 'none' ? null : JSON.parse($('judgment-json').value);
      const result = await api({ action: 'review', id: current.id, reviewer: $('reviewer').value, factualChecksResolved: $('facts-reviewed').checked, finalJudgment, approvedRepairIds: [...document.querySelectorAll('input[name="approved-repair"]:checked')].map(el => el.value), notes: $('review-notes').value });
      delete $('review-form').dataset.record; render(result.job); await refresh(); notice('Review saved. Approved examples are now available in dataset exports.');
    } catch (e) { notice(e instanceof SyntaxError ? 'The reviewed judgment must be valid JSON. Check the edited text.' : e.message, true); }
    finally { $('save-review').disabled = false; }
  });
  $('export-dataset').addEventListener('click', async () => {
    $('export-dataset').disabled = true;
    try {
      const result = await api({ action: 'export' }); const type = $('dataset-type').value, rows = result.datasets[type] || [];
      if (!rows.length) { notice('No reviewed examples in that dataset yet. Review a round or choose another split.'); return; }
      download(rows.map(row => JSON.stringify(row)).join('\n') + '\n', `debatable-${type}.jsonl`, 'application/x-ndjson'); notice(`Downloaded ${rows.length} examples from ${result.reviewedRounds} reviewed rounds.`);
    } catch (e) { notice(e.message, true); } finally { $('export-dataset').disabled = false; }
  });
  $('score-benchmark').addEventListener('click', async () => {
    $('score-benchmark').disabled = true;
    try {
      const predictions = $('predictions').value.split('\n').filter(line => line.trim()).map(line => JSON.parse(line));
      const { score } = await api({ action: 'benchmark', predictions });
      $('benchmark-result').textContent = `${score.correct}/${score.total} correct (${Math.round(score.accuracy * 100)}%). ${score.missingOrInvalid} missing or invalid. 95% interval: ${score.wilson95.map(n => Math.round(n * 100) + '%').join(' to ')}. Agreement with reviewed winners only; related rounds are correlated.`;
    } catch (e) { $('benchmark-result').textContent = e instanceof SyntaxError ? 'Use one valid JSON object per line, with id and winner.' : e.message; }
    finally { $('score-benchmark').disabled = false; }
  });
  refresh().then(async () => { if (catalog.runs.length) await openRound(catalog.runs[0].id); }).catch(e => { if (e.status !== 401) $('login-error').textContent = e.message; });
})();
