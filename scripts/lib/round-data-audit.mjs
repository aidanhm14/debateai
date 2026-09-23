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
export function auditRoundData(data){
  const voice=data.voice_rounds||[];
  const live=data.live_rounds||[],async=data.async_rounds||[],gens=data.generations||[],signals=data.generation_signals||[];
  const changes=new Set((data.rating_changes||[]).map(d=>d.id));
  const issues=[],excluded={},counts={liveRooms:live.length,asyncRooms:async.length,savedVoiceRounds:voice.length,savedVoiceTurns:0,voiceRoundsLinkedToGeneration:0,voiceRoundsWithMissingGeneration:0,ballots:0,eligibleHumanRounds:0,missingRatingRounds:0,
    judgedWithoutTwoCapturedSides:0,unjudgedWithTwoCapturedSides:0,historicalSpeechCutoffs:0,transcriptCharacters:0,
    generations:gens.length,generationTranscripts:0,generationRatings:0,generationSignals:signals.length,
    contributableGenerations:0,liveGenerations:0,linkedLiveGenerations:0,legacyMixedLiveGenerations:0,duplicateGenerationTranscripts:0,
    blindDecisionReviews:(data.rfd_ratings||[]).length,distillations:(data.learning_distillations||[]).length,legacyFeedback:(data.feedback||[]).length};
  const byKind={},signalsByType={},productSignals={},duplicates=new Map();
  for(const [source,rows] of [['live',live],['async',async]])for(const d of rows){
    const e=eligibility(source,d);const r=ref(source,d.id);
    if(e.ok){counts.eligibleHumanRounds++;if(!changes.has(`${source}_${d.id}_${e.a.uid}`)||!changes.has(`${source}_${d.id}_${e.b.uid}`)){counts.missingRatingRounds++;issues.push({ref:r,issue:'missing_rating',priority:1});}}
    else bump(excluded,source+':'+e.reason);
    if(source!=='live')continue;
    const evidence=RoundEvidence.assess(d);const hasBallot=!!d.ballot;const text=(d.speeches||[]).filter(x=>x&&!x.skipped).map(x=>String(x.text||'')).join('\n');
    const at=ratingTime(d.completedAt)||ratingTime(d.createdAt);
    if(hasBallot){counts.ballots++;if(!evidence.ok){counts.judgedWithoutTwoCapturedSides++;issues.push({ref:r,issue:'historical_ballot_missing_captured_side',priority:1});}}
    else if(evidence.ok){counts.unjudgedWithTwoCapturedSides++;issues.push({ref:r,issue:'speech_without_ballot',priority:2});}
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
  return {schemaVersion:1,generatedAt:new Date().toISOString(),counts,byKind,excluded,signalsByType,productSignals,
    limitations:['Product-language matches are review leads, not verified faults.','Historical ballots are not human accuracy labels.','No fuzzy account/topic join: missing round references remain missing.','This report contains no transcript text, names, account IDs or emails.'],
    reviewQueue:issues.sort((a,b)=>a.priority-b.priority||a.ref.localeCompare(b.ref))};
}
