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
check('dock follows the resolution in the round panel',
  /round\.insertBefore\(d, motion\.nextSibling\)/.test(page));
check('dock is no longer fixed over the video',
  !/specDock[^\n]*position:fixed/.test(page)
  && !/position:fixed;left:16px;bottom:16px;z-index:6000/.test(page));
check('broadcast view still hides spectator controls',
  /html\.stage-mode #specDock/.test(page));

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
