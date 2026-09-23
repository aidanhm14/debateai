// Read-only. Input is a private JSON snapshot of named collections.
// node scripts/audit-round-data.mjs /private/snapshot.json [report.json]
import fs from 'node:fs';
import {auditRoundData} from './lib/round-data-audit.mjs';
const input=process.argv[2];if(!input)throw Error('Pass a private snapshot JSON path');
const report=auditRoundData(JSON.parse(fs.readFileSync(input,'utf8')));
if(process.argv[3])fs.writeFileSync(process.argv[3],JSON.stringify(report,null,2)+'\n',{mode:0o600});
console.log(JSON.stringify({...report,reviewQueue:undefined},null,2));
