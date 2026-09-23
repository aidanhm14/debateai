/* Live room verdict. Dependencies are explicit; the page owns shared round state. */
(function(){
  window.DBLiveVerdict = { create: function(context){
  var $ = function(){ return context.$.apply(this, arguments); };
  var capFinish = function(){ return context.capFinish.apply(this, arguments); };
  var clearBallotRecovery = function(){ return context.clearBallotRecovery.apply(this, arguments); };
  var cloudRecordingPost = function(){ return context.cloudRecordingPost.apply(this, arguments); };
  var currentPublicAvatarIdentity = function(){ return context.currentPublicAvatarIdentity.apply(this, arguments); };
  var deepRfdSlotHtml = function(){ return context.deepRfdSlotHtml.apply(this, arguments); };
  var endRecordingAfterReactions = function(){ return context.endRecordingAfterReactions.apply(this, arguments); };
  var ensureGuestAuth = function(){ return context.ensureGuestAuth.apply(this, arguments); };
  var escHtml = function(){ return context.escHtml.apply(this, arguments); };
  var flowOfferHtml = function(){ return context.flowOfferHtml.apply(this, arguments); };
  var generateClashMap = function(){ return context.generateClashMap.apply(this, arguments); };
  var getRoundDocRef = function(){ return context.getRoundDocRef.apply(this, arguments); };
  var isFourTeam = function(){ return context.isFourTeam.apply(this, arguments); };
  var isSpectator = function(){ return context.isSpectator.apply(this, arguments); };
  var judgeHtml = function(){ return context.judgeHtml.apply(this, arguments); };
  var judgePlain = function(){ return context.judgePlain.apply(this, arguments); };
  var liveJourney = function(){ return context.liveJourney.apply(this, arguments); };
  var loadRoomShift = function(){ return context.loadRoomShift.apply(this, arguments); };
  var localRoundEvidence = function(){ return context.localRoundEvidence.apply(this, arguments); };
  var logMyRoundSpeeches = function(){ return context.logMyRoundSpeeches.apply(this, arguments); };
  var mySide = function(){ return context.mySide.apply(this, arguments); };
  var openShareClipModal = function(){ return context.openShareClipModal.apply(this, arguments); };
  var publicAvatarHtml = function(){ return context.publicAvatarHtml.apply(this, arguments); };
  var publicNameOf = function(){ return context.publicNameOf.apply(this, arguments); };
  var reelShowBallot = function(){ return context.reelShowBallot.apply(this, arguments); };
  var renderRecTail = function(){ return context.renderRecTail.apply(this, arguments); };
  var renderRoundNotes = function(){ return context.renderRoundNotes.apply(this, arguments); };
  var replayNoteHtml = function(){ return context.replayNoteHtml.apply(this, arguments); };
  var roomShiftSlotHtml = function(){ return context.roomShiftSlotHtml.apply(this, arguments); };
  var showJudgeAtTop = function(){ return context.showJudgeAtTop.apply(this, arguments); };
  var sideBench = function(){ return context.sideBench.apply(this, arguments); };
  var startBallotReadAloud = function(){ return context.startBallotReadAloud.apply(this, arguments); };
  var stopBallotWaitCue = function(){ return context.stopBallotWaitCue.apply(this, arguments); };
  var stripTerminal = function(){ return context.stripTerminal.apply(this, arguments); };
  var teamDisplayName = function(){ return context.teamDisplayName.apply(this, arguments); };
  var toast = function(){ return context.toast.apply(this, arguments); };
  var tournamentContentAskHtml = function(){ return context.tournamentContentAskHtml.apply(this, arguments); };
  var updateConsentStatus = function(){ return context.updateConsentStatus.apply(this, arguments); };
  var updateRoundGuide = function(){ return context.updateRoundGuide.apply(this, arguments); };
  var validateLeaderboardEligibility = function(){ return context.validateLeaderboardEligibility.apply(this, arguments); };

  function renderUnresolvedBallot(noWinner){
    liveJourney('result_unresolved', { reason: typeof noWinner === 'string' ? noWinner : ((noWinner && noWinner.resolution) || 'unresolved') });
    clearBallotRecovery();
    if (typeof noWinner === 'string') noWinner = { resolution: noWinner };
    noWinner = noWinner && typeof noWinner === 'object' ? noWinner : {};
    context.state.ballotUnresolved = noWinner;
    context.state.phase = 'ballot-unresolved';
    updateRoundGuide();
    $('phaseLabel').innerHTML = '<span class="dot" style="background:var(--amber);box-shadow:0 0 8px var(--amber)"></span> No winner';
    $('roundView').classList.add('hidden');
    $('ballotView').classList.remove('hidden');
    try { showJudgeAtTop(); } catch(e){}
    $('ballotResult').classList.add('hidden');
    stopBallotWaitCue();
    var host = $('ballotLoading');
    host.classList.remove('hidden');
    if (noWinner.outcome === 'no_contest'){
      context.state.lastBallot = null;
      host.innerHTML = '<div style="max-width:620px;margin:0 auto;text-align:center">'
        + '<div class="verdict-headline">No winner</div>'
        + '<p style="font-size:1rem;line-height:1.6;color:var(--text-dim)">' + escHtml(noWinner.reason) + '</p>'
        + '<p style="font-size:.84rem;color:var(--text-dim)">No scores, wins, losses or rating changes are recorded.</p>'
        + '<a class="btn" href="/live">Back to live debates</a></div>';
      try { capFinish(null); } catch(e){}
      try { endRecordingAfterReactions(); renderRecTail(); } catch(e){}
      return;
    }
    var proName = String(noWinner.proName || context.state.proName || 'For');
    var conName = String(noWinner.conName || context.state.conName || 'Against');
    var tally = noWinner.tally && typeof noWinner.tally === 'object' ? noWinner.tally : {};
    var proVotes = Math.max(0, Number(tally.pro) || 0);
    var conVotes = Math.max(0, Number(tally.con) || 0);
    var votesCast = Math.max(0, Number(noWinner.votesCast) || (proVotes + conVotes));
    var panelSize = Math.max(votesCast, Number(noWinner.panelSize) || votesCast);
    var missing = Math.max(0, Number(noWinner.missing) || (panelSize - votesCast));
    var reason = String(noWinner.reason || 'No side reached the required majority, so the panel did not record a winner.');
    var judgeReasons = Array.isArray(noWinner.judgeReasons) ? noWinner.judgeReasons : [];
    var hasProPoints = typeof noWinner.proPoints === 'number' && isFinite(noWinner.proPoints);
    var hasConPoints = typeof noWinner.conPoints === 'number' && isFinite(noWinner.conPoints);
    var pointsHtml = hasProPoints || hasConPoints
      ? '<div class="points-grid" style="margin-top:18px;text-align:left">'
          + '<div class="points-card">'
            + '<div class="name">' + escHtml(proName) + '</div>'
            + '<div class="pts">' + (hasProPoints ? escHtml(String(noWinner.proPoints)) : 'n/a') + '</div>'
            + '<div class="pts-label">Argument score · out of 100</div>'
          + '</div>'
          + '<div class="points-card">'
            + '<div class="name">' + escHtml(conName) + '</div>'
            + '<div class="pts">' + (hasConPoints ? escHtml(String(noWinner.conPoints)) : 'n/a') + '</div>'
            + '<div class="pts-label">Argument score · out of 100</div>'
          + '</div>'
        + '</div>'
      : '';
    var splitHtml = votesCast
      ? '<div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center;margin-top:16px">'
          + '<span style="padding:6px 10px;border-radius:999px;border:1px solid rgba(74,222,128,.35);background:rgba(74,222,128,.08);color:#86efac;font-size:.72rem;font-weight:800">' + escHtml(proName) + ' ' + proVotes + '</span>'
          + '<span style="padding:6px 10px;border-radius:999px;border:1px solid rgba(248,113,113,.35);background:rgba(248,113,113,.08);color:#fca5a5;font-size:.72rem;font-weight:800">' + escHtml(conName) + ' ' + conVotes + '</span>'
          + (missing ? '<span style="padding:6px 10px;border-radius:999px;border:1px solid var(--border);color:var(--text-dim);font-size:.72rem;font-weight:800">' + missing + ' missing</span>' : '')
        + '</div>'
      : '';
    var reasonsHtml = judgeReasons.map(function(vote, index){
      var side = vote.winner === 'pro' ? proName : conName;
      var issue = String(vote.decidingIssue || '');
      var rfd = String(vote.rfd || 'No written reason returned.');
      var brain = vote.model ? councilBrainName(vote.model) : 'Judge ' + (index + 1);
      return '<div style="text-align:left;padding:14px 16px;border:1px solid var(--border);border-radius:12px;background:rgba(255,255,255,.025);margin-top:10px">'
        + '<div style="font-size:.68rem;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--text-dim)">' + escHtml(brain) + ' voted for ' + escHtml(side) + '</div>'
        + (issue ? '<div style="font-size:.84rem;font-weight:800;color:var(--text);margin-top:7px">Deciding issue: ' + escHtml(issue) + '</div>' : '')
        + '<div style="font-size:.82rem;line-height:1.6;color:var(--text-dim);margin-top:7px;white-space:pre-wrap">' + judgeHtml(rfd) + '</div>'
        + '</div>';
    }).join('');
    var legacyWhy = !judgeReasons.length
      ? '<div style="text-align:left;padding:13px 15px;border:1px solid var(--border);border-radius:12px;background:rgba(255,255,255,.025);font-size:.78rem;line-height:1.55;color:var(--text-dim);margin-top:10px">This round was judged before per-judge split reasons were saved.</div>'
      : '';
    host.innerHTML = '<div style="max-width:720px;margin:0 auto">'
      + '<div style="font-size:.66rem;font-weight:900;letter-spacing:.16em;text-transform:uppercase;color:var(--amber)">No winner</div>'
      + '<div style="color:var(--text);font-weight:900;font-size:1.35rem;line-height:1.2;margin-top:7px">The panel did not reach a majority.</div>'
      + '<div style="font-size:.84rem;line-height:1.55;margin-top:10px;color:var(--text-dim)">' + escHtml(reason) + '</div>'
      + splitHtml
      + pointsHtml
      + '<div style="text-align:left;font-size:.68rem;font-weight:900;letter-spacing:.12em;text-transform:uppercase;color:var(--text-dim);margin-top:22px">Why the judges disagreed</div>'
      + reasonsHtml + legacyWhy
      + '<div style="font-size:.76rem;margin-top:16px;color:var(--text-ghost)">' + (context.state.isDuo ? '2v2 results do not change the 1v1 leaderboard.' : 'The ladder records a draw<span id="afterRatingSlot"></span>.') + '</div>'
      + '<div style="margin-top:18px"><a class="btn" href="/live">Back to live debates</a></div>'
      + '</div>';
    try { renderAfterRating(); } catch(e){}
  }

  function ballotSummaryRead(b){
    var winnerName = '';
    if (b && b.winner === 'pro') winnerName = teamDisplayName('pro');
    else if (b && b.winner === 'con') winnerName = teamDisplayName('con');
    if (window.BallotRead && BallotRead.summaryFrom){
      return BallotRead.summaryFrom(b, { winnerName: winnerName });
    }
    var s = (b && typeof b.summary === 'string') ? b.summary.trim() : '';
    if (s) return s;
    var fs = (window.BallotRead && BallotRead.firstSentences)
      ? BallotRead.firstSentences(b && b.rfd, 2) : '';
    return fs || (b && b.rfd) || '';
  }

  function mountBallotRead(){
    if (!window.BallotRead) return;
    var host = document.getElementById('ballotReadHost');
    var body = document.getElementById('ballotReadBlock');
    if (host && body) BallotRead.mount(host, body, { surface: 'live-round' });
  }

  function renderBallot(b){
    if (!RoundEvidence.assess(localRoundEvidence()).ok){
      renderUnresolvedBallot(RoundEvidence.noContest(localRoundEvidence()));
      return;
    }
    if (!context.state.journeyResult){ context.state.journeyResult = true; liveJourney('result_received'); }
    context.state.lastBallot = b || null;
    // Both clients pass through here (the generating debater directly,
    // the other via the Firestore sync), so this is the one choke point
    // where each side can flush its own consented speeches.
    try { logMyRoundSpeeches(b); } catch(e){}
    try { capFinish(b); } catch(e){}
    // A rendered ballot is a completed round, so this is where the
    // research-corpus opt-in gets asked (the module counts rounds and
    // asks on the second one, after a delay, once ever). Seated
    // debaters only: a spectator did not debate, and their rounds are
    // not what the corpus is made of. renderBallot runs long after
    // parse, so the deferred module is loaded by now and a direct call
    // is safe.
    try { if (mySide() && typeof window.noteRoundComplete === 'function') window.noteRoundComplete(); } catch(e){}
    // Pin phase so the Firestore snapshot guard (state.phase ===
    // 'ballot-rendered') stops re-firing renderBallot. Without this,
    // generateBallot's success path enters renderBallot first while
    // state.phase is still 'ballot'; the snapshot then re-triggers
    // and restarts staged-reveal animations or clobbers a user who
    // is mid-interstitial.
    context.state.phase = 'ballot-rendered';
    updateRoundGuide();
    try { renderRoundNotes(); showJudgeAtTop(); } catch(e){}
    // The recording's clock runs off the VERDICT, not off this screen.
    // Both hooks live above the interstitial return on purpose: the reel
    // is footage for people who were not in the room, so it must not
    // wait on whether the local debater has pressed through their own
    // reveal choice.
    try { endRecordingAfterReactions(); renderRecTail(); } catch(e){ console.warn('[recording]', e); }
    try { reelShowBallot(b); } catch(e){ console.warn('[reel]', e); }
    if (!context.state.ballotRevealMode){
      showBallotInterstitial(b);
      return;
    }
    renderBallotBody(b, context.state.ballotRevealMode);
    // The audience aggregate is a footnote to the ballot, so it is
    // fetched after the verdict is on screen rather than raced with it.
    // First read is delayed: spectators restate in the seconds AFTER the
    // ballot lands, so an instant fetch reads a tally nobody has filled.
    try { setTimeout(loadRoomShift, 6000); } catch(e){}
    // The clash map reads the whole transcript, so it can only be drawn
    // once the round is over. Fired here rather than on the toggle so it
    // is usually ready by the time somebody opens the flow.
    try { setTimeout(generateClashMap, 1200); } catch(e){}
  }

  function showBallotInterstitial(b){
    stopBallotWaitCue();
    $('ballotLoading').classList.add('hidden');
    var result = $('ballotResult');
    result.classList.remove('hidden');
    result.classList.remove('ballot-staged');
    // Spectators get a slimmer interstitial since the dramatic-reveal
    // controls are most useful to the speakers themselves. Spectators
    // still get the choice so they can sync their watch to whoever
    // shouts "reveal" first, minus read-aloud: the judge speaking is the
    // debaters' moment, and a watcher's autoplay is blocked anyway.
    var slim = isSpectator();
    result.innerHTML =
      '<div class="ballot-interstitial">' +
        '<div class="bi-eyebrow">Decision ready</div>' +
        '<div class="bi-headline">The judge has decided.</div>' +
        (slim
          ? '<div class="bi-sub">Reveal shows the decision beat-by-beat.</div>'
            + '<div class="bi-actions">'
            + '<button class="btn btn-primary" id="biDramaticBtn" type="button">Reveal the decision</button>'
            + '</div>'
          : '<div class="bi-sub">Pick how you want to see it. Dramatic reveals the decision beat-by-beat; read-aloud plays the decision.</div>'
            + '<div class="bi-actions">'
            + '<button class="btn btn-primary" id="biRevealBtn" type="button">Read aloud</button>'
            + '<button class="btn" id="biDramaticBtn" type="button">Dramatic reveal</button>'
            + '</div>') +
        '<div class="bi-ghost"><button id="biInstantBtn" type="button">or skip the suspense, show me now</button></div>' +
      '</div>';
    var dramaticBtn = $('biDramaticBtn');
    var revealBtn = $('biRevealBtn');
    var instantBtn = $('biInstantBtn');
    if (dramaticBtn) dramaticBtn.addEventListener('click', function(){
      context.state.ballotRevealMode = 'staged';
      try { gtag('event', 'ballot_reveal_mode', { mode: 'staged', format: context.state.formatKey }); } catch(e){}
      renderBallotBody(b, 'staged');
    });
    if (revealBtn) revealBtn.addEventListener('click', function(){
      context.state.ballotRevealMode = 'read-aloud';
      try { gtag('event', 'ballot_reveal_mode', { mode: 'read-aloud', format: context.state.formatKey }); } catch(e){}
      renderBallotBody(b, 'read-aloud');
    });
    if (instantBtn) instantBtn.addEventListener('click', function(){
      context.state.ballotRevealMode = 'instant';
      try { gtag('event', 'ballot_reveal_mode', { mode: 'instant', format: context.state.formatKey }); } catch(e){}
      renderBallotBody(b, 'instant');
    });
  }

  function renderBpBallotBody(b, f, result, mode, staged){
    var SIDE_KEYS = ['og','oo','cg','co'];
    var SIDE_SHORT = { og:'OG', oo:'OO', cg:'CG', co:'CO' };
    var SIDE_COLOR = { og:'#4ade80', oo:'#fca5a5', cg:'#86efac', co:'#fecaca' };
    var SPEECH_OF_SIDE = { og:['PM','DPM'], oo:['LO','DLO'], cg:['MG','GW'], co:['MO','OW'] };
    function teamName(side){
      if (context.state.teamNames && context.state.teamNames[side]) return context.state.teamNames[side];
      if (side === 'og') return context.state.proName || 'OG';
      if (side === 'oo') return context.state.conName || 'OO';
      return f.sideLabels[side] || (SIDE_SHORT[side] || side);
    }
    var ranking = b.teamRanking.slice().sort(function(a, c){ return (a.rank||9) - (c.rank||9); });
    var scores = b.speakerScores || {};
    var feedback = b.teamFeedback || {};
    var topTeam = ranking[0] || {};
    var topSide = String(topTeam.side || '').toLowerCase();

    var rankRows = ranking.map(function(r){
      var side = String(r.side || '').toLowerCase();
      var seats = SPEECH_OF_SIDE[side] || [];
      var seatScores = seats.map(function(code){
        var s = scores[code];
        return '<span class="bp-seat"><span class="bp-seat-code">' + escHtml(code) + '</span><span class="bp-seat-score">' + (typeof s === 'number' ? s.toFixed(1) : '—') + '</span></span>';
      }).join('');
      return '<div class="bp-rank-row bp-rank-' + r.rank + '" style="border-left-color:' + SIDE_COLOR[side] + '">'
        + '<div class="bp-rank-num">' + r.rank + '</div>'
        + '<div class="bp-rank-body">'
          + '<div class="bp-rank-team">' + escHtml(r.label || f.sideLabels[side] || side) + ' <span class="bp-rank-team-name">' + escHtml(teamName(side)) + '</span></div>'
          + '<div class="bp-rank-summary">' + escHtml(r.summary || '') + '</div>'
          + '<div class="bp-rank-seats">' + seatScores + '</div>'
        + '</div>'
      + '</div>';
    }).join('');

    var feedbackRows = SIDE_KEYS.map(function(side){
      var fb = feedback[side];
      if (!fb) return '';
      return '<div class="bp-fb"><div class="bp-fb-head" style="color:' + SIDE_COLOR[side] + '">' + escHtml(f.sideLabels[side] || SIDE_SHORT[side]) + ' <span style="color:var(--text-dim);font-weight:600">· ' + escHtml(teamName(side)) + '</span></div><div class="bp-fb-body">' + escHtml(fb) + '</div></div>';
    }).join('');

    result.innerHTML =
      '<style>'
        + '.bp-result{padding:8px 0}'
        + '.bp-verdict{display:flex;align-items:center;gap:14px;padding:18px 22px;background:linear-gradient(135deg,rgba(34,197,94,.08),rgba(34,197,94,.02));border:1px solid rgba(34,197,94,.32);border-radius:14px;margin-bottom:18px}'
        + '.bp-verdict-eyebrow{font-size:.62rem;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:#4ade80}'
        + '.bp-verdict-headline{font-size:1.4rem;font-weight:900;color:var(--text);line-height:1.2;margin-top:4px}'
        + '.bp-verdict-headline em{font-style:normal;color:#4ade80}'
        + '.bp-rank-row{display:flex;gap:14px;align-items:flex-start;padding:14px 18px;border:1px solid var(--border);border-left:4px solid;border-radius:10px;background:rgba(255,255,255,.02);margin-bottom:10px}'
        + '.bp-rank-num{font-size:2.4rem;font-weight:900;line-height:1;width:50px;text-align:center;color:var(--text);flex-shrink:0}'
        + '.bp-rank-1 .bp-rank-num{color:#fde68a;text-shadow:0 0 18px rgba(253,224,71,.45)}'
        + '[data-theme="light"] .bp-rank-1 .bp-rank-num{color:#a16207;text-shadow:none}'
        + '.bp-rank-body{flex:1;min-width:0}'
        + '.bp-rank-team{font-size:.95rem;font-weight:800;color:var(--text);margin-bottom:4px}'
        + '.bp-rank-team-name{font-weight:600;color:var(--text-dim);font-size:.84rem}'
        + '.bp-rank-summary{font-size:.84rem;color:var(--text-dim);line-height:1.5;margin-bottom:8px}'
        + '.bp-rank-seats{display:flex;gap:10px;flex-wrap:wrap}'
        + '.bp-seat{display:inline-flex;align-items:baseline;gap:4px;padding:3px 9px;border-radius:999px;background:rgba(255,255,255,.04);border:1px solid var(--border)}'
        + '.bp-seat-code{font-size:.6rem;font-weight:800;letter-spacing:.08em;color:var(--text-dim)}'
        + '.bp-seat-score{font-size:.78rem;font-weight:800;color:var(--text)}'
        + '.bp-rfd{padding:18px 22px;background:rgba(255,255,255,.02);border:1px solid var(--border);border-radius:12px;margin:18px 0;font-size:.92rem;line-height:1.65;color:var(--text);white-space:pre-wrap}'
        + '.bp-fb{padding:14px 18px;border:1px solid var(--border);border-radius:10px;background:var(--bg-card);margin-bottom:10px}'
        + '.bp-fb-head{font-size:.7rem;font-weight:800;letter-spacing:.1em;text-transform:uppercase;margin-bottom:6px}'
        + '.bp-fb-body{font-size:.86rem;color:var(--text);line-height:1.55}'
      + '</style>'
      + '<div class="bp-result">'
        + '<div class="bp-verdict"' + (staged ? ' data-stage="0"' : '') + '>'
          + '<div style="flex:1">'
            + '<div class="bp-verdict-eyebrow">Decision · ' + escHtml(f.name) + '</div>'
            + '<div class="bp-verdict-headline"><em>' + escHtml(f.sideLabels[topSide] || SIDE_SHORT[topSide]) + '</em> takes the round</div>'
          + '</div>'
        + '</div>'
        + '<div class="ballot-section"' + (staged ? ' data-stage="1"' : '') + '>'
          + '<h3 style="font-size:.72rem;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:var(--text-dim);margin-bottom:10px">Team ranking</h3>'
          + rankRows
        + '</div>'
        + '<div class="ballot-section" id="ballotReadBlock"' + (staged ? ' data-stage="2"' : '') + '>'
          + '<h3 style="font-size:.72rem;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:var(--text-dim);margin:18px 0 10px">Why they won</h3>'
          + '<div id="ballotReadHost"></div>'
          + '<div data-read-tier="summary"><div class="bp-rfd">' + judgeHtml(ballotSummaryRead(b) || '(no decision text)') + '</div></div>'
          + '<div data-read-tier="ballot"><div class="bp-rfd">' + judgeHtml(b.rfd || '(no written decision)') + '</div></div>'
          + '<div id="deepRfdSlot" data-read-tier="full">' + deepRfdSlotHtml() + '</div>'
          + flowOfferHtml()
          + roomShiftSlotHtml()
        + '</div>'
        + (feedbackRows ? '<div class="ballot-section"' + (staged ? ' data-stage="3"' : '') + '>'
            + '<h3 style="font-size:.72rem;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:var(--text-dim);margin:18px 0 10px">Team feedback</h3>'
            + feedbackRows
          + '</div>' : '')
      + '</div>';
  }

  function councilBrainName(model){
    var m = String(model || '');
    if (/^claude/i.test(m)) return 'Anthropic Claude (' + m + ')';
    if (/^gpt/i.test(m)) return 'OpenAI GPT (' + m + ')';
    if (/^gemini/i.test(m)) return 'Google Gemini (' + m + ')';
    if (/^grok/i.test(m)) return 'xAI Grok (' + m + ')';
    if (/^deepseek/i.test(m)) return 'DeepSeek (' + m + ')';
    return m || 'model not named';
  }

  function ballotCouncilHtml(b){
    try {
      var p = b && b.panel;
      if (!p) return '';
      var models = Array.isArray(p.models) ? p.models.filter(Boolean) : [];
      var names = models.length ? models.map(councilBrainName).map(escHtml).join(' · ') : 'Model not recorded';
      if (p.resolution === 'single'){
        return '<div class="ballot-council"><div class="bc-head">Single-brain decision</div>' +
          '<p class="bc-models">' + names + '</p>' +
          '<p class="bc-method">' + (p.degraded ? 'The council could not reach quorum, so the stamped fallback wrote this decision.' : 'One brain wrote this decision.') +
          ' <a href="/judge-integrity">How judging works</a></p></div>';
      }
      var cast = Number(p.votesCast) || 0;
      var wanted = Number(p.jurorsWanted) || Number(p.panelSize) || cast;
      var tally = p.tally || {};
      var carried = Math.max(Number(tally.a) || 0, Number(tally.b) || 0);
      var head = p.unanimous && !p.degraded
        ? 'AI council · unanimous, ' + cast + ' of ' + cast
        : 'AI council · ' + carried + ' matching votes from ' + cast + ' cast' + (p.degraded && wanted > cast ? ', ' + (wanted - cast) + ' seat unavailable' : '');
      var dissents = Array.isArray(p.dissents) ? p.dissents : [];
      var dissentHtml = dissents.map(function(d){
        var side = d.winner === 'pro' ? (context.state.proName || 'For') : (context.state.conName || 'Against');
        return '<div class="bc-dissent"><strong>Dissent · ' + escHtml(councilBrainName(d.model)) + ' · for ' + escHtml(side) + '</strong>' +
          '<p>' + judgeHtml(d.rfd || 'No written dissent returned.') + '</p></div>';
      }).join('');
      return '<div class="ballot-council"><div class="bc-head">' + escHtml(head) + '</div>' +
        '<p class="bc-models">Brains used: ' + names + '</p>' +
        '<p class="bc-method">Same transcript and rubric, one vote per brain. Two matching votes carry. Scores and scorecard axes are panel medians, and dissent is kept separate. <a href="/judge-integrity#decision">Read the method</a>.</p>' +
        dissentHtml + '</div>';
    } catch(e){ return ''; }
  }

  function dimScorecardHtml(b){
    try {
      var dm = b && b.dimensions;
      if (!dm) return '';
      // Core 4 axes must all validate or nothing renders (old-ballot
      // degrade). strategy/persuasion arrived with the 1-100 speaks
      // rework and render only when the ballot carries them, so
      // pre-rework ballots keep their exact 4-row scorecard.
      var AXES = [['clarity','Clarity'],['reasoning','Reasoning'],['responsiveness','Clash'],['weighing','Weighing'],['strategy','Strategy'],['persuasion','Persuasion']];
      var rows = [], persuasionShown = false;
      for (var i = 0; i < AXES.length; i++){
        var optional = i >= 4;
        var a = dm[AXES[i][0]];
        var pv = a && Number(a.pro), cv = a && Number(a.con);
        if (!a || !isFinite(pv) || !isFinite(cv)){
          if (optional) continue;
          return '';
        }
        if (AXES[i][0] === 'persuasion') persuasionShown = true;
        pv = Math.max(1, Math.min(10, pv)); cv = Math.max(1, Math.min(10, cv));
        rows.push(
          '<div style="display:grid;grid-template-columns:minmax(0,96px) minmax(0,1fr);gap:10px;align-items:center;margin:7px 0">' +
            '<span style="font-size:.8rem;font-weight:600;opacity:.85">' + AXES[i][1] + '</span>' +
            // minmax(0,72px) on the name track: an auto max sizes to the
            // longest name and pushes the bars out of the card on a
            // phone; the ellipsis on the span only works once the track
            // itself can shrink.
            '<span style="display:grid;grid-template-columns:minmax(0,72px) minmax(0,1fr) 38px;gap:5px 8px;align-items:center">' +
              '<span style="font-size:.68rem;font-weight:700;color:#22c55e;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + escHtml(context.state.proName) + '</span>' +
              '<span style="height:7px;border-radius:99px;overflow:hidden;background:rgba(127,127,127,.2)"><i style="display:block;height:100%;width:' + (pv * 10) + '%;background:#22c55e;border-radius:inherit"></i></span>' +
              '<b style="font-size:.72rem;color:#22c55e;font-variant-numeric:tabular-nums;text-align:right">' + escHtml(String(pv)) + '/10</b>' +
              '<span style="font-size:.68rem;font-weight:700;color:#ef4444;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + escHtml(context.state.conName) + '</span>' +
              '<span style="height:7px;border-radius:99px;overflow:hidden;background:rgba(127,127,127,.2)"><i style="display:block;height:100%;width:' + (cv * 10) + '%;background:#ef4444;border-radius:inherit"></i></span>' +
              '<b style="font-size:.72rem;color:#ef4444;font-variant-numeric:tabular-nums;text-align:right">' + escHtml(String(cv)) + '/10</b>' +
            '</span>' +
          '</div>'
        );
      }
      return '<div class="dim-scorecard" style="margin:0 0 18px;border:1px solid rgba(127,127,127,.28);border-radius:12px;padding:13px 16px 9px">' +
        '<div style="display:flex;justify-content:space-between;align-items:baseline;gap:12px;flex-wrap:wrap;margin-bottom:8px">' +
          '<span style="font-size:.68rem;font-weight:800;letter-spacing:.12em;text-transform:uppercase;opacity:.65">Judge&#39;s scorecard</span>' +
          '<span style="font-size:.74rem;opacity:.72">Each category is scored independently from 1 to 10</span>' +
        '</div>' +
        rows.join('') +
        (persuasionShown
          ? '<p style="margin:9px 0 2px;padding-top:9px;border-top:1px solid rgba(127,127,127,.2);font-size:.7rem;line-height:1.5;color:var(--text-dim)">Persuasion measures concrete stakes and an understandable, checkable world. It never scores charm, confidence, fluency, polish, accent, or delivery, and it can decide only a tie the flow left level.' + ((b.panel && b.panel.resolution !== 'single') ? ' The value shown is the panel median.' : '') + '</p>'
          : '') +
      '</div>';
    } catch(e){ return ''; }
  }

  function tournamentScoringHtml(b){
    var ts = b && b.tournamentScoring;
    if (!ts || !ts.pro || !ts.con) return '';
    function modeLabel(mode){
      if (mode === 'camera') return 'Camera';
      if (mode === 'avatar') return 'Avatar';
      if (mode === 'off') return 'Off or dark';
      if (mode === 'mixed') return 'Mixed modes';
      return 'Mode not verified';
    }
    function signed(n){
      n = Number(n) || 0;
      return n > 0 ? '+' + n : (n < 0 ? '−' + Math.abs(n) : '0');
    }
    function sideLine(name, score){
      var pace = Number(score.paceWpm);
      var camRating = Number(score.ratingAdjustment) || 0;
      return '<div style="padding:10px 12px;border-radius:10px;background:rgba(127,127,127,.08)">' +
        '<strong style="display:block;font-size:.82rem;margin-bottom:3px">' + escHtml(name) + '</strong>' +
        '<span style="font-size:.78rem">' + escHtml(String(score.argumentPoints)) +
          ' argument ' + signed(score.presenceAdjustment) + ' ' + escHtml(modeLabel(score.cameraMode)) +
          ' = <strong>' + escHtml(String(score.standingPoints)) + ' standings points</strong></span>' +
        (camRating < 0
          ? '<span style="display:block;margin-top:4px;font-size:.7rem;color:var(--text-dim)">Event rating: ' + signed(camRating) + ' for debating without a camera this round.</span>'
          : '') +
        (isFinite(pace) && pace > 0
          ? '<span style="display:block;margin-top:4px;font-size:.7rem;color:var(--text-dim)">Calculated pace: ' + pace + ' WPM' + (score.spreading ? ', spreading flagged' : '') + '.</span>'
          : '') +
      '</div>';
    }
    return '<div class="ballot-section" data-stage="1" style="margin:0 0 18px;border:1px solid rgba(127,127,127,.28);border-radius:12px;padding:13px 16px">' +
      '<div style="font-size:.68rem;font-weight:800;letter-spacing:.12em;text-transform:uppercase;opacity:.65;margin-bottom:9px">Tournament standings points</div>' +
      '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:8px">' +
        sideLine(context.state.proName, ts.pro) + sideLine(context.state.conName, ts.con) +
      '</div>' +
      '<p style="margin:9px 0 0;font-size:.7rem;line-height:1.5;color:var(--text-dim)">Camera choice moves your event rating each round: camera on 0, Avatar −10, Off or dark −20. Standings points use Camera +2, Avatar −1, Off −3. Mixed use is weighted by speech time, and neither adjustment ever changes the winner. Pace above ' + escHtml(String(ts.spreadingThresholdWpm || 250)) + ' WPM is flagged; the AI lowers an argument score only when density makes the reasoning hard to follow.</p>' +
    '</div>';
  }

  function afterRoundBandHtml(b){
    var ms = mySide();
    if (!ms || isSpectator() || !b || (b.winner !== 'pro' && b.winner !== 'con')) return '';
    var iWon = b.winner === ms;
    var oppUid  = ms === 'pro' ? context.state.conUid  : context.state.proUid;
    var oppName = ms === 'pro' ? context.state.conName : context.state.proName;
    var issue = String(b.decidingIssue || '').trim().replace(/\.$/, '');
    var rematchHref = (oppUid && String(oppUid).length >= 8)
      ? '/challenges?to=' + encodeURIComponent(oppUid) + '&name=' + encodeURIComponent(oppName || 'Debater')
      : '/spar?format=' + encodeURIComponent(context.state.formatKey);
    var newHref = '/spar?format=' + encodeURIComponent(context.state.formatKey);
    // A tournament round is NOT a spar round, and this band did not know
    // that: it offered a primary 'Next opponent' pointing at the open
    // /spar queue, which walks an entrant straight OUT of the event they
    // are competing in, while the tray below simultaneously offered the
    // correct 'Next round -> /tournament?ready=1'. Two primaries, two
    // destinations, one of them wrong. The band keeps its close (outcome,
    // deciding issue, rating) and hands the forward action to the tray,
    // which already resolves the right queue. Rematch is meaningless here
    // anyway: tournament pairings are assigned, not chosen.
    var isTourney = (context.prefill.source || '') === 'tournament' && !!context.prefill.tkey;
    if (!context.state._afterViewFired){
      context.state._afterViewFired = true;
      try { gtag('event', 'after_round_view', { outcome: iWon ? 'win' : 'loss', surface: 'live', format: context.state.formatKey }); } catch(e){}
    }
    var line;
    if (iWon){
      line = issue
        ? 'It turned on ' + escHtml(stripTerminal(issue)) + ', and you held that ground. Hold it against the next person.'
        : 'You held the deciding ground. Hold it against the next person.';
    } else {
      line = issue
        ? 'It turned on ' + escHtml(stripTerminal(issue)) + '. That is the thread to pull. Run it back and take it away from them.'
        : 'One clash decided it, and the decision names it. Run it back and take it away from them.';
    }
    return '' +
      '<div class="ballot-section after-round' + (iWon ? ' after-won' : ' after-lost') + '" data-stage="3" id="afterRoundBand">' +
        '<div class="after-eyebrow">' + (iWon ? 'You took the round' : 'You dropped the round') + '<span id="afterRatingSlot"></span></div>' +
        '<p class="after-line">' + line + '</p>' +
        '<div id="afterCredSlot"></div>' +
        (isTourney ? '' :
        '<div class="rfd-actions" style="margin-top:12px">' +
          (iWon
            ? '<a class="btn btn-primary" href="' + newHref + '" data-after="new">Next opponent →</a>' +
              '<a class="btn" href="' + rematchHref + '" data-after="rematch">Run it back vs ' + escHtml(oppName || 'them') + '</a>'
            : '<a class="btn btn-primary" href="' + rematchHref + '" data-after="rematch">Run it back vs ' + escHtml(oppName || 'them') + '</a>' +
              '<a class="btn" href="' + newHref + '" data-after="new">New opponent</a>') +
        '</div>') +
      '</div>';
  }

  // A good round earns a credential (live-judge issues it server-side
  // once the panel scores 75+). One plain line with the link, filled late
  // like the rating because it lands on the round doc after the ballot.
  function renderAfterCredential(){
    var cslot = document.getElementById('afterCredSlot');
    if (!cslot || !context.state.credentials || !context.state.user) return;
    var c = context.state.credentials[context.state.user.uid];
    if (!c || !/^[a-z0-9]{8,20}$/.test(String(c.certId || ''))) return;
    cslot.innerHTML = '<p class="after-line" style="margin-top:10px">That was a strong round. You earned a <strong>' + escHtml(c.tierName || 'Debatable') + '</strong> credential' +
      (typeof c.score === 'number' ? ' (' + escHtml(String(c.score)) + ' out of 100)' : '') +
      '. <a href="/verify/' + c.certId + '" target="_blank" rel="noopener" data-after="credential" style="color:inherit;font-weight:700;text-decoration:underline">See your credential</a></p>';
    if (!renderAfterCredential._fired){
      renderAfterCredential._fired = true;
      try { gtag('event', 'live_credential_shown', { tier: c.tierName || '' }); } catch(e){}
    }
  }

  function renderAfterRating(){
    try { renderAfterCredential(); } catch(e){}
    var slot = document.getElementById('afterRatingSlot');
    if (!slot || !context.state.ratingChanges || !context.state.user) return;
    var mine = context.state.ratingChanges[context.state.user.uid];
    if (!mine || typeof mine.after !== 'number') return;
    var up = (mine.delta || 0) >= 0;
    slot.innerHTML = ' · Rating <strong style="color:' + (up ? 'var(--green,#22c55e)' : 'var(--accent,#ef4444)') + '">' +
      Math.round(mine.after) + '</strong> (' + (up ? '+' : '') + (mine.delta != null ? mine.delta : 0) + ')';
  }

  function fillFriendSlot(){
    try {
      if (!document.getElementById('friendSlot')) return;
      // Armed once per page: the ballot body re-renders on reveal-mode
      // changes and recreates the slot node, so the guard lives on the
      // function and the watcher re-queries the node on every paint.
      if (fillFriendSlot._armed) return;
      var ms = mySide();
      if (!ms || isSpectator()) return;
      if (context.state.proUid2 || context.state.conUid2) return;          // 1v1 only
      var me = context.state.user || (firebase.auth && firebase.auth().currentUser);
      if (!me || me.isAnonymous) return;                    // named accounts only
      var oppUid = ms === 'pro' ? context.state.conUid : context.state.proUid;
      var oppName = ms === 'pro' ? (context.state.conName || 'Your opponent') : (context.state.proName || 'Your opponent');
      if (!oppUid || oppUid === me.uid || oppUid === 'ai') return;
      if (!window.DBFriends) return;
      fillFriendSlot._armed = true;
      var db2 = firebase.firestore();
      window.DBFriends.init({ db: db2, uid: me.uid });
      var painted = '';
      window.DBFriends.watch(function(v){
        if (v.status !== 'ready') return;
        var slot = document.getElementById('friendSlot');
        if (!slot) return;
        var st = window.DBFriends.statusWith(oppUid);
        if (st === painted && slot.innerHTML !== '') return;
        painted = st;
        var inner = '';
        if (st === 'friends') {
          inner = '<span style="font-weight:700">You and ' + escHtml(oppName) + ' are friends.</span> '
            + '<a href="/friends" style="color:var(--accent,#f87171);font-weight:700">Your friends →</a>';
        } else if (st === 'outgoing') {
          inner = 'Friend request sent to ' + escHtml(oppName) + '. They can accept from Notifications.';
        } else if (st === 'incoming') {
          inner = '<span style="font-weight:700">' + escHtml(oppName) + ' already asked to be friends.</span> '
            + '<button class="btn btn-primary" id="friendAcceptBtn" type="button" style="margin-left:8px">Accept</button>';
        } else {
          inner = '<span style="font-weight:700">Good round?</span> Keep the opponent. '
            + '<button class="btn btn-primary" id="friendAddBtn" type="button" style="margin-left:8px">🤝 Add ' + escHtml(oppName) + ' as a friend</button>';
        }
        slot.innerHTML = '<div style="margin:14px 0;padding:12px 14px;border:1px solid rgba(127,127,127,.3);'
          + 'border-radius:12px;font-size:.92rem;display:flex;align-items:center;gap:8px;flex-wrap:wrap">' + inner + '</div>';
        var addBtn = document.getElementById('friendAddBtn');
        if (addBtn) addBtn.onclick = function(){
          addBtn.disabled = true;
          var myPub = (window.daPublicName ? window.daPublicName(me) : null) || 'A debater';
          window.DBFriends.request(oppUid, oppName, myPub).then(function(){
            try { gtag('event', 'friend_request_sent', { event_category: 'friends', event_label: 'ballot' }); } catch (e) {}
          }).catch(function(){ addBtn.disabled = false; });
        };
        var accBtn = document.getElementById('friendAcceptBtn');
        if (accBtn) accBtn.onclick = function(){
          accBtn.disabled = true;
          var myPub = (window.daPublicName ? window.daPublicName(me) : null) || 'A debater';
          window.DBFriends.accept(oppUid, myPub).catch(function(){ accBtn.disabled = false; });
        };
      });
    } catch (e) { console.warn('[friend slot]', e); }
  }

  function renderBallotBody(b, mode){
    // Peak-end. The after-round band IS this page's closing beat: it names
    // the outcome, names the deciding issue, and carries ONE outcome-aware
    // forward action (won -> next opponent, lost -> run it back). The tray
    // further down was independently rendering its own 'Next opponent',
    // also styled primary, about a screen below the band's. So the same
    // action appeared twice and, with 'Save round' also primary, the
    // post-ballot region carried THREE primary buttons and none of them
    // read as the one thing to do next. Captured here so the tray can ask
    // whether a forward action is already on screen rather than guess.
    var afterBand = afterRoundBandHtml(b);
    var staged = mode === 'staged' || mode === 'read-aloud';
    // Hand the verdict to the reel so the recording gets it too. No-op
    // on every client that is not driving one.
    try { reelShowBallot(b); } catch(e){ console.warn('[reel]', e); }
    stopBallotWaitCue();
    $('ballotLoading').classList.add('hidden');
    var result = $('ballotResult');
    result.classList.remove('hidden');
    try {
      var crit = $('ballotCritique'), critA = $('ballotCritiqueLink');
      if (critA) critA.href = '/judge-integrity?from=live' + (context.state.room ? '&round=' + encodeURIComponent(context.state.room) : '') + '#critiques';
      if (crit) crit.classList.remove('hidden');
    } catch(e){}
    if (staged) result.classList.add('ballot-staged');
    else result.classList.remove('ballot-staged');
    // Fire-and-forget TTS request. Starts in parallel with the staged
    // CSS animations so the voice usually catches the verdict reveal
    // around stage 0–1. Failure is silent (toast), the staged reveal
    // still plays.
    if (mode === 'read-aloud'){
      try { startBallotReadAloud(b); } catch(e){ console.warn('[read-aloud]', e); }
    }
    var f = context.FORMATS[context.state.formatKey];
    // 4-team ballot path. Render the 1-2-3-4 ranking + per-seat
    // speaker scores + per-team feedback. Falls back to the 2-side
    // body if the ballot didn't actually come back as 4-team-shaped
    // (e.g., the model returned the old schema by mistake).
    if (isFourTeam(f) && Array.isArray(b.teamRanking) && b.teamRanking.length === 4){
      renderBpBallotBody(b, f, result, mode, staged);
      try { mountBallotRead(); } catch(e){ console.warn('[ballot read]', e); }
      return;
    }
    var winnerName = teamDisplayName(b.winner === 'pro' ? 'pro' : 'con');
    var winnerUid = b.winner === 'pro' ? context.state.proUid : context.state.conUid;
    var winnerSide = b.winner === 'pro' ? f.sideLabels[f.sides[0]] : f.sideLabels[f.sides[1]];
    var loserName  = teamDisplayName(b.winner === 'pro' ? 'con' : 'pro');
    var loserSide  = b.winner === 'pro' ? f.sideLabels[f.sides[1]] : f.sideLabels[f.sides[0]];
    var validity = validateLeaderboardEligibility();
    var myPointsForLb = null;
    if (context.state.user){
      if (context.state.user.uid === (context.state.proUid || '')) myPointsForLb = b.proPoints;
      else if (context.state.user.uid === (context.state.conUid || '')) myPointsForLb = b.conPoints;
    }
    var lbBlock;
    if (context.state.isDuo){
      lbBlock = '<div class="lb-consent"><div class="lb-body"><strong>Team result</strong>Both teammates share the verdict and score. 2v2 results do not change the 1v1 leaderboard.</div></div>';
    } else if (validity.ok){
      // The round is ALREADY on the board by the time this renders. The
      // control is the way back off, not the way on, which is the whole
      // 2026-08-24 change: a played round is a record by default.
      lbBlock =
        '<label class="lb-consent" for="lbConsentCheckbox">' +
          '<input type="checkbox" id="lbConsentCheckbox" checked />' +
          '<div class="lb-body">' +
            '<strong>This round is on the public leaderboard</strong>' +
            'Your result' + (typeof myPointsForLb === 'number' ? ' and ' + myPointsForLb + '/100' : '') +
            ' are counted on /leaderboard, whatever the outcome. Untick to keep this one off; it only affects your own row, and your opponent decides theirs.' +
            '<span class="lb-status" id="lbConsentStatus"></span>' +
          '</div>' +
        '</label>';
    } else {
      lbBlock =
        '<label class="lb-consent invalid">' +
          '<input type="checkbox" disabled />' +
          '<div class="lb-body">' +
            '<strong>Not recorded on the leaderboard</strong>' +
            escHtml(validity.reason) + '. Every other round goes on the board whether it was won, lost, or scrappy.' +
          '</div>' +
        '</label>';
    }
    result.innerHTML =
      '<div class="verdict ballot-section ' + (b.winner === 'pro' ? 'pro' : 'con') + '" data-stage="0">' +
        publicAvatarHtml(winnerUid, winnerName, 54) +
        '<div class="verdict-headline">' + escHtml(winnerName) + (context.state.isDuo ? ' win</div>' : ' wins</div>') +
        '<div class="verdict-sub">' + escHtml(winnerSide) + ' over ' + escHtml(loserSide) + ' (' + escHtml(loserName) + ')</div>' +
      '</div>' +
      ballotCouncilHtml(b) +
      // Current public ballots always use the 1-100 scale.
      '<div class="points-grid ballot-section" data-stage="1">' +
        '<div class="points-card">' +
          '<div class="name">' + escHtml(teamDisplayName('pro')) + ' · ' + escHtml(f.sideLabels[f.sides[0]]) + '</div>' +
          '<div class="pts">' + (b.proPoints != null ? escHtml(String(b.proPoints)) : 'n/a') + '</div>' +
          '<div class="pts-label">Argument score · out of 100</div>' +
        '</div>' +
        '<div class="points-card">' +
          '<div class="name">' + escHtml(teamDisplayName('con')) + ' · ' + escHtml(f.sideLabels[f.sides[1]]) + '</div>' +
          '<div class="pts">' + (b.conPoints != null ? escHtml(String(b.conPoints)) : 'n/a') + '</div>' +
          '<div class="pts-label">Argument score · out of 100</div>' +
        '</div>' +
      '</div>' +
      tournamentScoringHtml(b) +
      // Reading depth. The judge writes the same decision at three
      // depths and printing all three at once is what made a ballot
      // read as a wall of text. One renders at a time; the verdict,
      // the points and the scorecard sit outside the switch because
      // they are the ballot at any depth.
      '<div class="rfd ballot-section" data-stage="2" id="ballotReadBlock">' +
        '<div id="ballotReadHost"></div>' +
        dimScorecardHtml(b) +
        '<div data-read-tier="summary">' +
          '<h3>The short version</h3>' +
          '<p style="white-space:pre-wrap">' + judgeHtml(ballotSummaryRead(b) || '(no decision text)') + '</p>' +
        '</div>' +
        '<div data-read-tier="ballot">' +
          '<h3>Why they won</h3>' +
          '<p style="white-space:pre-wrap">' + judgeHtml(b.rfd || '(no written decision)') + '</p>' +
        '</div>' +
        '<div id="deepRfdSlot" data-read-tier="full">' + deepRfdSlotHtml() + '</div>' +
        // Per-speaker feedback rides read-min, not the ballot tier: a
        // reader who escalates to the full ballot must not LOSE their
        // own personalised notes, which is what nesting them inside the
        // exclusive ballot tier did.
        '<div data-read-min="ballot">' +
          (b.proFeedback ? '<h3 style="margin-top:18px">For ' + escHtml(teamDisplayName('pro')) + '</h3><p>' + judgeHtml(b.proFeedback) + '</p>' : '') +
          (b.conFeedback ? '<h3 style="margin-top:14px">For ' + escHtml(teamDisplayName('con')) + '</h3><p>' + judgeHtml(b.conFeedback) + '</p>' : '') +
        '</div>' +
        flowOfferHtml() +
        roomShiftSlotHtml() +
      '</div>' +
      afterBand +
      // Friend slot (2026-08-31): filled after render by fillFriendSlot().
      // Empty div here so the ask never blocks the ballot paint; the
      // roomShiftSlot / deepRfdSlot pattern. Guards live in the filler.
      '<div id="friendSlot" data-stage="3"></div>' +
      '<div class="ballot-section" data-stage="3">' +
      tournamentContentAskHtml() +
      lbBlock +
      '<div class="rfd-actions">' +
        '<button class="btn" id="saveRoundBtn" type="button">💾 Save round to my record</button>' +
        '<button class="btn" id="copyBallotBtn" type="button">Copy decision</button>' +
        // Share clip — generates a 9:16 PNG with motion + verdict +
        // best line + watermark. The viral hook: post-round, one tap
        // and you have a Reels/TikTok-ready card. Surfaces for every
        // round, not just /spar (a /live round that ends in a sharp
        // win is also worth sharing).
        '<button class="btn" id="shareClipBtn" type="button" title="Generate a 9:16 share card with the motion, decision, and your best line">📲 Share clip</button>' +
        replayNoteHtml() +
        '<button class="btn" id="publishDiscBtn" type="button" title="Publish your speeches so other people can read and reuse them">🌐 Publish to Community</button>' +
        // Next opponent — only surfaces for /spar-sourced rounds.
        // Routes back to the queue, preserving the format so the next
        // round happens in the same surface. Re-queue, not forfeit
        // (round is already over).
        // Where you go next, and on a tournament day this is the
        // load-bearing control on the whole screen. A drop-in entrant
        // finishing a five-minute round has to rejoin the queue to get
        // another one, and until this existed the only route was
        // remembering the tournament URL and finding the Ready button
        // again. `?ready=1` does that rejoin in the same tap.
        ((context.prefill.source || '') === 'tournament' && context.prefill.tkey
          ? '<a class="btn btn-primary" href="/tournament?t=' + encodeURIComponent(context.prefill.tkey) + '&ready=1" id="nextRoundBtn" style="background:var(--green);border-color:var(--green);box-shadow:0 6px 24px rgba(34,197,94,.32)">Next round →</a>'
            + '<a class="btn" href="/tournament?t=' + encodeURIComponent(context.prefill.tkey) + '">Standings</a>'
          : ((context.prefill.source || '').indexOf('spar') === 0 && !afterBand)
          ? '<a class="btn btn-primary" href="/spar?format=' + encodeURIComponent(context.state.formatKey) + '" id="nextOpponentBtn" style="background:var(--green);border-color:var(--green);box-shadow:0 6px 24px rgba(34,197,94,.32)">Next opponent →</a>'
          : ((context.prefill.source || '').indexOf('spar') === 0)
          ? ''
          : '<a class="btn" href="/live">Back to board</a>'
        ) +
      '</div>' + // .rfd-actions
      '</div>'; // .ballot-section[data-stage="3"]
    try { mountBallotRead(); } catch(e){ console.warn('[ballot read]', e); }
    try { fillFriendSlot(); } catch(e){ console.warn('[friend slot]', e); }

    // Spectators don't get the save-to-record button — the round is
    // not theirs to log against their personal speaker history. Same
    // applies to the leaderboard consent checkbox + the publish-to-
    // disclosures button (none of those are theirs to fire). Hide
    // the whole set so the UI doesn't dangle broken controls.
    if (isSpectator()){
      var sb = document.getElementById('saveRoundBtn');
      if (sb) sb.remove();
      var lbc = document.querySelector('.lb-consent');
      if (lbc) lbc.remove();
      var pdb = document.getElementById('publishDiscBtn');
      if (pdb) pdb.remove();
      // A watcher has no entry, so "Next round" would send them to a
      // queue that answers "register for this tournament first".
      // Standings, which is theirs to read, stays.
      var nrb = document.getElementById('nextRoundBtn');
      if (nrb) nrb.remove();
    }

    // Mandatory tournament capture is private by default. A seated person
    // may separately approve the public Watch replay after seeing the round;
    // the server publishes only once every recorded seat has agreed.
    var publishReplayBtn = document.getElementById('publishTournamentReplayBtn');
    if (publishReplayBtn){
      publishReplayBtn.addEventListener('click', function(){
        publishReplayBtn.disabled = true;
        publishReplayBtn.textContent = 'Saving…';
        cloudRecordingPost({ action: 'publish-consent', consent: true }).then(function(result){
          publishReplayBtn.textContent = result && result.publishAllowed
            ? 'Approved for Watch'
            : 'Approved, waiting on the other person';
          toast(result && result.publishAllowed
            ? 'Replay approved. It will appear on Watch after processing.'
            : 'You approved the replay. It stays private until everyone in the round approves.');
        }).catch(function(error){
          publishReplayBtn.disabled = false;
          publishReplayBtn.textContent = 'Approve Watch replay';
          toast((error && error.message) || 'Could not save replay approval.');
        });
      });
    }

    // After-round band: clicks tagged by outcome (the after-loss D30
    // read lives or dies on this), rating slot filled if the deltas
    // already arrived on the doc before the ballot rendered.
    Array.prototype.forEach.call(document.querySelectorAll('#afterRoundBand [data-after]'), function(a){
      a.addEventListener('click', function(){
        try {
          var band = document.getElementById('afterRoundBand');
          gtag('event', 'after_round_next', {
            action: a.getAttribute('data-after'),
            outcome: band && band.classList.contains('after-won') ? 'win' : 'loss',
            surface: 'live',
          });
        } catch(e){}
      });
    });
    try { renderAfterRating(); } catch(e){}

    // Publish-to-/disclosures handler. Builds the speaker's own
    // speeches into a single text blob and writes a shared_cases doc
    // with visibility:'public'. Idempotent on (uid, room) so re-clicks
    // just update the same doc instead of spamming the board.
    var pubBtn = $('publishDiscBtn');
    if (pubBtn) pubBtn.addEventListener('click', function(){
      if (!context.firebaseDb || !context.state.user){
        toast('Guest access is still starting.');
        if (!context.state.user && typeof ensureGuestAuth === 'function') ensureGuestAuth().catch(function(){});
        return;
      }
      var ms = mySide();
      var f = context.FORMATS[context.state.formatKey];
      // Filter the speech log to MY speeches (the ones tied to my side).
      // The opponent's text isn't mine to disclose — even on a
      // publicly-resolved round, a disclosure only carries the
      // publisher's own arguments.
      var mine = (context.state.log || []).filter(function(e){
        if (!ms) return true;
        var spIsFirstSide = sideBench(f, e.side) === 'gov';
        return (ms === 'pro' && spIsFirstSide) || (ms === 'con' && !spIsFirstSide);
      });
      var fullText = mine.map(function(e){ return '[' + (e.code || '') + ']\n' + (e.text || ''); }).join('\n\n');
      if (!fullText.trim()){ toast('No speeches to publish yet.'); return; }
      var shortName = publicNameOf(context.state.user);
      var sideLabel = ms ? f.sideLabels[ms === 'pro' ? f.sides[0] : f.sides[1]] : '';
      // Closed-over publish writer. Runs once the safety guard
      // resolves (or immediately if the guard isn't available).
      var runPublish = function(){
        pubBtn.textContent = 'Publishing…';
        pubBtn.disabled = true;
        context.firebaseDb.collection('shared_cases').doc(context.state.user.uid + '_' + context.state.room).set({
          teamId: null,
          sharedBy: shortName,
          sharedByUid: context.state.user.uid,
          authorUid: context.state.user.uid,
          motion: context.state.motion || 'Untitled',
          side: sideLabel,
          format: f.name,
          depth: '',
          output: fullText,
          sharedAt: firebase.firestore.FieldValue.serverTimestamp(),
          visibility: 'public',
          sourceRound: context.state.room,
        }, { merge: true }).then(function(){
          pubBtn.textContent = '✓ Published · view';
          pubBtn.disabled = false;
          pubBtn.onclick = function(){ window.open('/community', '_blank'); };
          try { gtag('event', 'disclosure_publish', { format: context.state.formatKey, source: 'live_round' }); } catch(e){}
          toast('✓ Published to Community.');
        }).catch(function(e){
          console.warn('[publishDisc]', e);
          pubBtn.textContent = '🌐 Publish to Community';
          pubBtn.disabled = false;
          toast('Publish failed: ' + (e.message || 'unknown'));
        });
      };
      // Quality / safety floor + LLM classifier. Word-list local
      // check is instant; LLM classify fires server-side only if
      // local passed AND we have an auth token. fullCheck fails open
      // on network errors so a blip never blocks a real publisher.
      var input = { motion: context.state.motion, output: fullText };
      if (window.disclosureGuard && window.disclosureGuard.fullCheck){
        context.state.user.getIdToken().then(function(token){
          window.disclosureGuard.fullCheck(input, token).then(function(check){
            if (!check.ok){ toast(check.reason); return; }
            runPublish();
          });
        }).catch(function(){ runPublish(); });
      } else if (window.disclosureGuard){
        var localOnly = window.disclosureGuard.check(input);
        if (!localOnly.ok){ toast(localOnly.reason); return; }
        runPublish();
      } else {
        runPublish();
      }
    });

    // Share-clip handler. Renders a 9:16 PNG card with the round's
    // verdict + motion + your best line, then offers it via Web
    // Share API (mobile, one-tap to Reels/IG/X) with a download
    // fallback for desktop. The viral hook for the matchmaking
    // flywheel: post-round, the user has a Reels-ready trophy in
    // <2s, no editor required.
    var shareBtn = $('shareClipBtn');
    if (shareBtn) shareBtn.addEventListener('click', function(){
      try { gtag('event', 'share_clip_open', { format: context.state.formatKey, won: b.winner === mySide() }); } catch(e){}
      openShareClipModal(b);
    });
    // The tournament content ask's clip button: same generator, its own
    // GA4 tag so the ask's pull can be read against the quiet button's.
    var tournClipBtn = $('tournClipBtn');
    if (tournClipBtn) tournClipBtn.addEventListener('click', function(){
      try { gtag('event', 'share_clip_open', { format: context.state.formatKey, won: b.winner === mySide(), via: 'tournament_ask' }); } catch(e){}
      openShareClipModal(b);
    });

    // Save round to Firestore (saved_rounds/{uid}_{room}). One per
    // user per round. Idempotent — clicking twice just re-writes
    // the same doc with an updated savedAt timestamp.
    //
    // Leaderboard is now decoupled: clicking Save also publishes the
    // user's consent flag to the round doc. The actual leaderboard
    // write fires from the snapshot listener once BOTH sides have
    // consented — see the leaderboardConsent block in onRoundSnapshot.
    var saveBtn = $('saveRoundBtn');
    if (saveBtn) saveBtn.addEventListener('click', function(){
      if (!context.firebaseDb || !context.state.user){
        toast('Guest access is still starting.');
        if (!context.state.user && typeof ensureGuestAuth === 'function') ensureGuestAuth().catch(function(){});
        return;
      }
      var docId = context.state.user.uid + '_' + context.state.room;
      // Who the saver was in this round, and whether they won, recorded
      // as data rather than left to be re-derived from names later.
      //
      // The profile used to work this out by comparing userName against
      // winnerName. That can never match: userName is the full display
      // name ("Noor Jain") while proName/conName/winnerName carry the
      // shortened public form ("Noor J."), and they come from different
      // producers (this page vs the spar handoff). The comparison
      // therefore failed on every live round, and a failed comparison
      // was read as a loss, so winners saw their wins recorded as
      // losses. mySide() resolves off proUid/conUid, which is the
      // authoritative signal and is already on the page.
      var savedSide = mySide();
      var savedDoc = {
        uid: context.state.user.uid,
        userName: publicNameOf(context.state.user),
        userSide: savedSide || '',
        outcome: (savedSide && b.winner) ? (b.winner === savedSide ? 'win' : 'loss') : '',
        proUid: context.state.proUid || '',
        conUid: context.state.conUid || '',
        source: 'live-round',
        avatarIdentity: currentPublicAvatarIdentity(),
        userEmail: context.state.user.email || '',
        room: context.state.room,
        motion: context.state.motion,
        format: context.state.formatKey,
        formatName: f.name,
        proName: context.state.proName,
        conName: context.state.conName,
        speeches: context.state.log,
        ballot: b,
        winnerName: winnerName,
        winnerSide: winnerSide,
        savedAt: firebase.firestore.FieldValue.serverTimestamp(),
      };
      context.firebaseDb.collection('saved_rounds').doc(docId).set(savedDoc).then(function(){
        toast('✓ Round saved to your record.');
        saveBtn.textContent = '✓ Saved to record';
        saveBtn.disabled = true;
      }).catch(function(e){
        console.warn('[save round]', e);
        toast('Save failed: ' + (e.message || 'unknown'));
      });

    });
    // The leaderboard control acts on the spot rather than riding the
    // save button, because it now means "take this down" and a takedown
    // that waits for another button to be pressed is not a takedown.
    // false is the only value written; true clears the opt-out. The
    // Firestore rule on leaderboardConsent lets a writer touch their own
    // key only, so this cannot reach into the opponent's row.
    var lbBox = document.getElementById('lbConsentCheckbox');
    if (lbBox && !lbBox.disabled){
      lbBox.addEventListener('change', function(){
        var ref = getRoundDocRef();
        if (!ref || !context.state.user) return;
        var keep = !!lbBox.checked;
        var patch = {};
        patch['leaderboardConsent.' + context.state.user.uid] = keep;
        ref.set({ leaderboardConsent: {} }, { merge: true })
          .then(function(){ return ref.update(patch); })
          .then(function(){ updateConsentStatus(keep ? 'posted' : 'off'); })
          .catch(function(e){
            console.warn('[lb opt-out]', e);
            lbBox.checked = !keep;
            toast('Could not change that just now.');
          });
        try { gtag('event', 'live_round_lb_optout', { keep: keep ? 1 : 0 }); } catch(e){}
      });
    }
    $('copyBallotBtn').addEventListener('click', function(){
      var f = context.FORMATS[context.state.formatKey];
      var lines = [
        'Live Round Decision, ' + f.name,
        'Motion: ' + context.state.motion,
        '',
        winnerName + ' (' + winnerSide + ') wins.',
        '',
        context.state.proName + ': ' + (b.proPoints != null ? b.proPoints + '/100' : ''),
        context.state.conName + ': ' + (b.conPoints != null ? b.conPoints + '/100' : ''),
        '',
        'Why they won: ' + judgePlain(b.rfd || ''),
        '',
        context.state.proName + ': ' + judgePlain(b.proFeedback || ''),
        context.state.conName + ': ' + judgePlain(b.conFeedback || ''),
        context.state.rfdDeep ? '\nFULL DECISION:\n' + judgePlain(context.state.rfdDeep) : '',
      ].join('\n');
      try { navigator.clipboard.writeText(lines); toast('Decision copied to clipboard.'); } catch(e){ toast('Couldn\'t copy.'); }
    });
  }

  return { renderUnresolvedBallot, ballotSummaryRead, mountBallotRead, renderBallot, showBallotInterstitial, renderBpBallotBody, councilBrainName, ballotCouncilHtml, dimScorecardHtml, tournamentScoringHtml, afterRoundBandHtml, renderAfterRating, fillFriendSlot, renderBallotBody };
  } };
})();
