import { readFileSync } from 'node:fs';

const page = readFileSync(new URL('../app/live-round.html', import.meta.url), 'utf8');
let passed = 0;
let failed = 0;

function check(name, condition) {
  if (condition) {
    passed++;
    console.log('PASS ' + name);
  } else {
    failed++;
    console.error('FAIL ' + name);
  }
}

check('spectator controls use an in-flow grid',
  /\.spec-dock\{[\s\S]*?display:grid;[\s\S]*?grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/.test(page));
check('mobile spectator controls stack',
  /@media\(max-width:720px\)\{\.spec-dock\{grid-template-columns:1fr\}\}/.test(page));
check('dock follows the compact live status in the round panel',
  /round\.insertBefore\(d, liveStatus\.nextSibling\)/.test(page));
check('dock is no longer fixed over the video',
  !/specDock[^\n]*position:fixed/.test(page)
  && !/position:fixed;left:16px;bottom:16px;z-index:6000/.test(page));
check('broadcast view still hides spectator controls',
  /html\.stage-mode #specDock/.test(page));
check('spectator mode hides repeated control stacks',
  /body\.spectator-mode #roundGuide\[data-phase="round"\],[\s\S]*?body\.spectator-mode #judgeDraft,[\s\S]*?body\.spectator-mode #prepBanner,[\s\S]*?body\.spectator-mode \.round-roster/.test(page));
check('setup and ballot guides stay available to spectators',
  !/body\.spectator-mode #roundGuide,/.test(page));
check('spectator motion and clock use compact styles',
  /body\.spectator-mode \.round-motion-bar\{[\s\S]*?grid-template-columns:minmax\(0,1fr\) auto/.test(page)
  && /body\.spectator-mode \.timer-num\{font-size:clamp\(2\.45rem,4vw,3\.35rem\)\}/.test(page));
check('live header carries spectator context',
  /id="spectatorMatchup"/.test(page)
  && /id="spectatorJudge"/.test(page)
  && /id="spectatorPrep"/.test(page));
check('audience mode sets the spectator layout class',
  /document\.body\.classList\.add\('spectator-mode'\)/.test(page)
  && /document\.body\.classList\.toggle\('spectator-mode', spectator\)/.test(page));
check('spectator transcript copy describes read-only behavior',
  /The active speaker\\'s words appear here live\./.test(page));
check('spectator-only recording controls stay out of the transcript toolbar',
  /body\.spectator-mode #micBtn,[\s\S]*?body\.spectator-mode #autoMicLabel,[\s\S]*?body\.spectator-mode #speakXlLabel\{display:none!important\}/.test(page));
check('spectator speaker line does not repeat the side pill',
  /speakerName \+ \(spectator \? '' : ' \(' \+ sideLabel/.test(page));

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
