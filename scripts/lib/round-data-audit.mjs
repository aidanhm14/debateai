import { createHash } from 'node:crypto';
import RoundEvidence from '../../app/js/round-evidence.js';
import { eligibility } from '../../app/netlify/functions/lib/rating-apply.mjs';
import { ratingTime } from '../../app/netlify/functions/lib/rating-reconcile.mjs';
const ref=(type,id)=>type+'_'+createHash('sha256').update(type+':'+id).digest('hex').slice(0,16);
const bump=(o,k)=>{o[k]=(o[k]||0)+1;};
const words=s=>(String(s||'').match(/[\p{L}\p{N}]+/gu)||[]).length;
const flagRules={audio:/\b(can(?:not|'t) hear|you(?:'re| are) muted|audio echo|camera (?:glitch|working)|connection (?:issue|problem))\b/i,
  finish:/\b(press(?:ed)? (?:the )?(?:end|finish)|finish request|ask to finish|agree to end|nothing (?:exactly )?happened)\b/i,
  judging:/\b(hopefully it grades|judge (?:didn(?:'t|’t)|doesn(?:'t|’t))|judge (?:is|was) (?:wrong|broken))\b/i,
  sides:/\b(what side are we on|what side am I|which side am I)\b/i};
const DEFAULT_RECOVERY_WINDOW_MS=24*60*60*1000;

// A missing winner ballot does not by itself mean a failed judgment.
// Preserve the raw count, then separate final records, missing seats and
// actual pending work. Never infer a valid draw from a legacy marker.
function capturedRoundStatus(d,now){
  const marker=d.ballotUnresolved;
  if(marker?.outcome==='no_contest')return {category:'recorded_no_contest',reviewAction:'inspect_evidence_conflict'};
  if(marker&&d.serverJudgeState==='unresolved'){
    const votes=Number(marker.votesCast),size=Number(marker.panelSize);
    const pro=Number(marker.tally?.pro),con=Number(marker.tally?.con);
    const verified=marker.outcome==='no_winner'&&votes>0&&votes===size&&Number(marker.missing)===0
      &&Number.isInteger(pro)&&pro>0&&pro===con&&pro+con===votes;
    return {category:verified?'recorded_no_winner':'legacy_unresolved_needs_review',reviewAction:verified?'none':'inspect_saved_panel'};
  }
  if(!d.proUid||!d.conUid)return {category:'missing_participant',reviewAction:'inspect_seat_provenance'};
  if(d.proUid===d.conUid)return {category:'same_participant',reviewAction:'inspect_seat_provenance'};
  if(d.ballotPending!==true)return {category:'not_submitted_for_judging',reviewAction:'inspect_finish_state'};
  const pendingAt=ratingTime(d.ballotPendingAt);
  const recoveryWindow=!pendingAt?'missing_pending_stamp':now-pendingAt>DEFAULT_RECOVERY_WINDOW_MS?'outside_default_recovery_window':'within_default_recovery_window';
  return {category:d.serverJudgeState==='incomplete'?'incomplete_panel':'pending_judgment',recoveryWindow,
    reviewAction:'inspect_saved_judge_attempt',...(pendingAt?{pendingSince:new Date(pendingAt).toISOString()}: {})};
}

export function auditRoundData(data,{now=Date.now()}={}){
  const voice=data.voice_rounds||[];
  const roundFeedback=data.round_feedback||[];
  const live=data.live_rounds||[],async=data.async_rounds||[],gens=data.generations||[],signals=data.generation_signals||[];
  const changes=new Set((data.rating_changes||[]).map(d=>d.id));
  const issues=[],excluded={},counts={liveRooms:live.length,asyncRooms:async.length,savedVoiceRounds:voice.length,savedVoiceTurns:0,voiceRoundsLinkedToGeneration:0,voiceRoundsWithMissingGeneration:0,ballots:0,eligibleHumanRounds:0,missingRatingRounds:0,
    judgedWithoutTwoCapturedSides:0,unjudgedWithTwoCapturedSides:0,historicalSpeechCutoffs:0,transcriptCharacters:0,
    generations:gens.length,generationTranscripts:0,generationRatings:0,generationSignals:signals.length,
    contributableGenerations:0,liveGenerations:0,linkedLiveGenerations:0,legacyMixedLiveGenerations:0,duplicateGenerationTranscripts:0,
    blindDecisionReviews:(data.rfd_ratings||[]).length,distillations:(data.learning_distillations||[]).length,legacyFeedback:(data.feedback||[]).length,
    roundFeedback:roundFeedback.length,roundFeedbackReviewed:0,roundFeedbackPending:0};
  const byKind={},signalsByType={},productSignals={},duplicates=new Map();
  const capturedWithoutBallotByStatus={},judgedMissingEvidenceByCoverage={},pendingByRecoveryWindow={};
  for(const [source,rows] of [['live',live],['async',async]])for(const d of rows){
    const e=eligibility(source,d);const r=ref(source,d.id);
    if(e.ok){counts.eligibleHumanRounds++;if(!changes.has(`${source}_${d.id}_${e.a.uid}`)||!changes.has(`${source}_${d.id}_${e.b.uid}`)){counts.missingRatingRounds++;issues.push({ref:r,issue:'missing_rating',priority:1});}}
    else bump(excluded,source+':'+e.reason);
    if(source!=='live')continue;
    const evidence=RoundEvidence.assess(d);const hasBallot=!!d.ballot;const text=(d.speeches||[]).filter(x=>x&&!x.skipped).map(x=>String(x.text||'')).join('\n');
    const at=ratingTime(d.completedAt)||ratingTime(d.createdAt);
    if(hasBallot){counts.ballots++;if(!evidence.ok){
      counts.judgedWithoutTwoCapturedSides++;
      const coverage=evidence.pro?'pro_only':evidence.con?'con_only':'neither_side';
      bump(judgedMissingEvidenceByCoverage,coverage);
      issues.push({ref:r,issue:'historical_ballot_missing_captured_side',priority:1,coverage,hasServerPanel:!!d.ballot.panel,
        date:at?new Date(at).toISOString():null,reviewAction:'human_review_original_evidence'});
    }}
    else if(evidence.ok){
      counts.unjudgedWithTwoCapturedSides++;
      const status=capturedRoundStatus(d,now);
      bump(capturedWithoutBallotByStatus,status.category);
      if(status.recoveryWindow)bump(pendingByRecoveryWindow,status.recoveryWindow);
      if(status.reviewAction!=='none')issues.push({ref:r,issue:'speech_without_ballot',priority:2,...status});
    }
    if(hasBallot&&d.ballot.transcriptVersion!==2&&(d.speeches||[]).some(x=>!x.skipped&&String(x.text||'').length>12000)){
      counts.historicalSpeechCutoffs++;issues.push({ref:r,issue:'historical_judge_prefix_cutoff',priority:1,transcriptChars:text.length,date:at?new Date(at).toISOString():null});
    }
    for(const [key,re] of Object.entries(flagRules))if(re.test(text)){bump(productSignals,key);issues.push({ref:r,issue:'possible_'+key+'_feedback',priority:2});}
  }
  for(const d of gens){
    bump(byKind,d.kind||'unknown');const text=String(d.context?.fullTranscript||'');
    if(text){counts.generationTranscripts++;counts.transcriptCharacters+=text.length;const key=d.uid+':'+d.kind+':'+ref('text',text);if(duplicates.has(key)){counts.duplicateGenerationTranscripts++;issues.push({ref:ref('generation',d.id),issue:'exact_duplicate_transcript',priority:2,duplicateOf:duplicates.get(key)});}else duplicates.set(key,ref('generation',d.id));}
    if(Number.isInteger(d.rating)&&d.rating>=1&&d.rating<=5)counts.generationRatings++;
    if(d.contributable===true)counts.contributableGenerations++;
    if(d.kind==='live_round'){
      counts.liveGenerations++;if(d.context?.roundId)counts.linkedLiveGenerations++;
      if(/\((?:For|Pro|Gov)\):/i.test(text)&&/\((?:Against|Con|Opp)\):/i.test(text)){counts.legacyMixedLiveGenerations++;issues.push({ref:ref('generation',d.id),issue:'legacy_mixed_speakers',priority:1,words:words(text)});}
    }
  }
  const generationIds=new Set(gens.map(d=>d.id));
  for(const d of voice){
    const turns=Array.isArray(d.transcript)?d.transcript:[];
    counts.savedVoiceTurns+=turns.filter(t=>t&&typeof t.text==='string'&&t.text.trim()).length;
    if(d.generationId&&generationIds.has(d.generationId))counts.voiceRoundsLinkedToGeneration++;
    else if(d.generationId){counts.voiceRoundsWithMissingGeneration++;issues.push({ref:ref('voice',d.id),issue:'missing_generation_reference',priority:2});}
  }
  for(const d of signals)bump(signalsByType,d.signal||'unknown');
  for(const d of roundFeedback){
    if(d.reviewStatus==='reviewed')counts.roundFeedbackReviewed++;
    else counts.roundFeedbackPending++;
  }
  return {schemaVersion:2,generatedAt:new Date(now).toISOString(),counts,byKind,excluded,signalsByType,productSignals,
    capturedWithoutBallotByStatus,judgedMissingEvidenceByCoverage,pendingByRecoveryWindow,
    limitations:['Product-language matches are review leads, not verified faults.','Historical ballots and product-feedback ratings are not human winner labels.','unjudgedWithTwoCapturedSides is the legacy raw count of captured rooms without a winner ballot; use capturedWithoutBallotByStatus to distinguish recorded results, missing seats and pending work.','The recovery-window breakdown uses the default 24-hour age limit, not deployment environment overrides or live queue state.','No fuzzy account/topic join: missing round references remain missing.','This report contains no transcript text, names, account IDs or emails.'],
    reviewQueue:issues.sort((a,b)=>a.priority-b.priority||a.ref.localeCompare(b.ref))};
}
