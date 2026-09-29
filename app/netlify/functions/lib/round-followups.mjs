import Teams from '../../../js/room-teams.js';
import {evidenceTurns} from './judge-evidence.mjs';
export function followupPair(round) {
  if (round.proUid2 || round.conUid2 || !['open','conversation','quick'].includes(round.format)) return null;
  const open=['open','conversation'].includes(round.format);
  const raw=open ? Teams.conversationRows(round) : evidenceTurns(round);
  const turns=[];
  for(const row of raw){const last=turns.at(-1);if(open&&last?.side===row.side)last.text+=' '+row.text;else turns.push({...row});}
  const questions=[];
  for (const side of ['pro','con']) {
    const opponent=side==='pro'?'con':'pro';
    const rows=turns.filter(t=>t.side===opponent && t.text.trim().split(/\s+/).length>=20);
    const source=rows.at(-1); if(!source)return null;
    // Same extraction and question for each seat. The excerpt is displayed
    // as an excerpt, with the full source available for context.
    const quote=source.text.trim().slice(0,280);
    questions.push({side,opponent,quote,context:source.text.slice(0,6000),
      question:'What is your answer to this point, and why is your position better?',
      speechIdx:source.speechIdx ?? 0});
  }
  return questions;
}
