import assert from 'node:assert/strict';
import {auditRoundData} from './lib/round-data-audit.mjs';
const g={id:'private-record',uid:'private-account',kind:'live_round',context:{fullTranscript:'Sam (For): An argument.\nLee (Against): Another argument.'}};
const report=auditRoundData({generations:[g,{...g,id:'duplicate'}],voice_rounds:[{id:'saved',generationId:g.id,transcript:[{who:'user',text:'hello'}]},{id:'dangling',generationId:'missing'}],feedback:[{data:{feedbackText:'hello'}}]});
assert.equal(report.counts.legacyMixedLiveGenerations,2);assert.equal(report.counts.duplicateGenerationTranscripts,1);assert.equal(report.counts.savedVoiceTurns,1);assert.equal(report.counts.voiceRoundsLinkedToGeneration,1);assert.equal(report.counts.voiceRoundsWithMissingGeneration,1);assert.equal(report.counts.legacyFeedback,1);
for(const privateValue of ['private-record','private-account','Sam (For)','Lee (Against)'])assert.ok(!JSON.stringify(report).includes(privateValue));
console.log('Round audit: duplicate/speaker flags, saved-voice lineage, absent collections and identifier-free reports passed.');

const complete=auditRoundData({live_rounds:[{id:"new",ballot:{transcriptVersion:2},speeches:[{text:"x".repeat(13000)}]}]});assert.equal(complete.counts.historicalSpeechCutoffs,0);
