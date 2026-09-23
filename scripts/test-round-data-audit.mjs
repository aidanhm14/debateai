import assert from 'node:assert/strict';
import {auditRoundData} from './lib/round-data-audit.mjs';
const g={id:'private-record',uid:'private-account',kind:'live_round',context:{fullTranscript:'Sam (For): An argument.\nLee (Against): Another argument.'}};
const report=auditRoundData({generations:[g,{...g,id:'duplicate'}],voice_rounds:[{id:'saved',generationId:g.id,transcript:[{who:'user',text:'hello'}]},{id:'dangling',generationId:'missing'}],feedback:[{data:{feedbackText:'hello'}}],round_feedback:[
  {uid:'private-account',roundId:'private-round',notes:'private-report',reviewStatus:'reviewed'},
  {reviewStatus:'pending'},{},
]});
assert.equal(report.counts.legacyMixedLiveGenerations,2);assert.equal(report.counts.duplicateGenerationTranscripts,1);assert.equal(report.counts.savedVoiceTurns,1);assert.equal(report.counts.voiceRoundsLinkedToGeneration,1);assert.equal(report.counts.voiceRoundsWithMissingGeneration,1);assert.equal(report.counts.legacyFeedback,1);
assert.equal(report.counts.roundFeedback,3);assert.equal(report.counts.roundFeedbackReviewed,1);assert.equal(report.counts.roundFeedbackPending,2);
for(const privateValue of ['private-record','private-account','private-round','private-report','Sam (For)','Lee (Against)'])assert.ok(!JSON.stringify(report).includes(privateValue));
console.log('Round audit: duplicate/speaker flags, saved-voice lineage, absent collections and identifier-free reports passed.');

const complete=auditRoundData({live_rounds:[{id:"new",ballot:{transcriptVersion:2},speeches:[{text:"x".repeat(13000)}]}]});assert.equal(complete.counts.historicalSpeechCutoffs,0);

const now=Date.parse('2026-09-23T12:00:00Z');
const captured={proUid:'private-pro',conUid:'private-con',speeches:[{side:'pro',text:'For argument'},{side:'con',text:'Against argument'}]};
const stamp=ms=>({_seconds:Math.floor(ms/1000),_nanoseconds:0});
const triage=auditRoundData({live_rounds:[
  {id:'seatless',...captured,proUid:null,ballotPending:true},
  {id:'same-seat',...captured,conUid:captured.proUid},
  {id:'not-finished',...captured},
  {id:'pending-old',...captured,ballotPending:true,ballotPendingAt:stamp(now-2*86400000)},
  {id:'pending-no-stamp',...captured,ballotPending:true},
  {id:'incomplete-recent',...captured,ballotPending:true,serverJudgeState:'incomplete',ballotPendingAt:stamp(now-300000)},
  {id:'old-marker',...captured,ballotPending:false,serverJudgeState:'unresolved',ballotUnresolved:{resolution:'unresolved'}},
  {id:'partial-split',...captured,serverJudgeState:'unresolved',ballotUnresolved:{outcome:'no_winner',votesCast:2,panelSize:3,missing:1,tally:{pro:1,con:1}}},
  {id:'real-split',...captured,serverJudgeState:'unresolved',ballotUnresolved:{outcome:'no_winner',votesCast:4,panelSize:4,missing:0,tally:{pro:2,con:2}}},
  {id:'evidence-conflict',...captured,ballotUnresolved:{outcome:'no_contest'}},
  {id:'one-side-ballot',...captured,ballot:{winner:'pro',panel:{}},speeches:[captured.speeches[0]],completedAt:stamp(now-20*86400000)},
  {id:'empty-ballot',ballot:{winner:'con'},speeches:[{side:'pro',text:'(no transcript)'},{side:'con',text:'(no transcript)'}]},
]},{now});
assert.equal(triage.counts.unjudgedWithTwoCapturedSides,10,'legacy count still includes all rooms without a winner ballot');
assert.deepEqual(triage.capturedWithoutBallotByStatus,{
  missing_participant:1,same_participant:1,not_submitted_for_judging:1,pending_judgment:2,incomplete_panel:1,
  legacy_unresolved_needs_review:2,recorded_no_winner:1,recorded_no_contest:1,
});
assert.deepEqual(triage.pendingByRecoveryWindow,{outside_default_recovery_window:1,missing_pending_stamp:1,within_default_recovery_window:1});
assert.equal(triage.reviewQueue.filter(r=>r.issue==='speech_without_ballot').length,9,'complete recorded split is not queued as a failure');
assert.deepEqual(triage.judgedMissingEvidenceByCoverage,{pro_only:1,neither_side:1});
assert.equal(triage.counts.judgedWithoutTwoCapturedSides,2);
assert.equal(triage.reviewQueue.find(r=>r.coverage==='pro_only').hasServerPanel,true);
assert.equal(triage.generatedAt,new Date(now).toISOString());
for(const value of ['private-pro','private-con','one-side-ballot','For argument','Against argument'])assert.ok(!JSON.stringify(triage).includes(value));
console.log('Round audit triage: missing seats, complete/legacy/partial splits, pending age and missing evidence remain distinct.');
