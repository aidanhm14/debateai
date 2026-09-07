#!/usr/bin/env node
// Guard for the site-language layer (js/locale.js + lib/prompts.mjs).
//
// Three things it pins, because each one was the failure this layer was
// built to close (2026-09-07, a Spanish round judged in English):
//   1. The detector calls clear text correctly, in both directions, and
//      stays silent on the noise that must never flip a site language
//      ("Hi.", a name, a number, a mixed fragment).
//   2. Every round surface feeds the detector and every judge prompt
//      carries the language block, so the three halves (UI, judging,
//      voice) cannot drift apart again.
//   3. The server block keeps the parsed labels English and returns ''
//      for English, so an English round is byte-identical to before.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
let fails = 0, passes = 0;
function ok(cond, msg) { if (cond) passes++; else { fails++; console.error('FAIL', msg); } }

// ── 1. Load the browser module in a stub window ─────────────────────
const store = {};
const sandbox = {
  console,
  localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } },
  navigator: { language: 'en-US', languages: ['en-US'] },
  location: { hostname: 'localhost', pathname: '/', reload() {} },
  document: {
    readyState: 'complete', cookie: '',
    documentElement: { setAttribute() {}, getAttribute() { return null; }, className: '', appendChild() {} },
    head: { appendChild() {} }, body: { appendChild() {} },
    getElementById() { return null; }, querySelector() { return null; },
    createElement() { return { style: {}, setAttribute() {}, appendChild() {}, addEventListener() {}, remove() {} }; },
    addEventListener() {},
  },
  setTimeout: (fn) => fn(), clearInterval() {}, setInterval() { return 0; },
  CustomEvent: class { constructor(t, o) { this.type = t; this.detail = o && o.detail; } },
  Event: class { constructor(t) { this.type = t; } },
};
sandbox.window = sandbox;
sandbox.window.dispatchEvent = () => true;
sandbox.window.addEventListener = () => {};
vm.createContext(sandbox);
vm.runInContext(read('app/js/locale.js'), sandbox);
const L = sandbox.window.DBLocale;
ok(L && typeof L.detect === 'function', 'DBLocale loads in a bare window');

const cases = [
  ['Los estudiantes deberían poder usar teléfonos en la escuela, pero con reglas claras y límites de horario.', 'es'],
  ['Claro, lo hacemos en español. Para encauzar bien el debate, te propongo una frase.', 'es'],
  ['Je pense que les écoles doivent interdire les téléphones parce que cela nuit à la concentration des élèves.', 'fr'],
  ['Ich glaube, dass Schüler ihre Handys nicht in der Schule benutzen sollten, weil sie sich sonst nicht konzentrieren können.', 'de'],
  ['Eu acho que os alunos não deveriam usar o telefone na escola porque isso atrapalha muito a atenção.', 'pt'],
  ['Penso che gli studenti non dovrebbero usare il telefono a scuola perché distrae molto durante le lezioni.', 'it'],
  ['Ik denk dat leerlingen hun telefoon niet moeten gebruiken op school omdat het afleidt van de les.', 'nl'],
  ['Bence öğrenciler okulda telefon kullanmamalı çünkü bu dikkatlerini dağıtıyor ve dersi bölüyor.', 'tr'],
  ['Я думаю, что ученики не должны пользоваться телефонами в школе, потому что это отвлекает.', 'ru'],
  ['أعتقد أن الطلاب لا يجب أن يستخدموا الهواتف في المدرسة لأنها تشتت الانتباه.', 'ar'],
  ['मुझे लगता है कि छात्रों को स्कूल में फोन का इस्तेमाल नहीं करना चाहिए क्योंकि इससे ध्यान भटकता है।', 'hi'],
  ['我认为学生不应该在学校使用手机，因为这会分散注意力。', 'zh'],
  ['学生は学校でスマートフォンを使うべきではないと思います。集中力が落ちるからです。', 'ja'],
  ['학생들은 학교에서 휴대폰을 사용하면 안 된다고 생각합니다. 집중력이 떨어지기 때문입니다.', 'ko'],
  ['I think students should be allowed to keep their phones because the rules would be impossible to enforce anyway.', 'en'],
];
for (const [text, want] of cases) {
  const d = L.detect(text);
  ok(d && d.code === want, `detect: expected ${want}, got ${d && d.code} for "${text.slice(0, 40)}"`);
}
// Silence on the noise that must never move a site language.
for (const text of ['Hi.', 'Hello', 'Marita Calvo', '58 / 100', 'ok', 'Lili León CIT', 'the', 'sí', 'Marita Calvo and Lili', 'CIT classroom Lili León']) {
  const d = L.detect(text);
  ok(!d, `no call at all on "${text}" (got ${d && d.code})`);
}

// observe(): "Hi." switches nothing; a clear Spanish turn switches; a
// clear English turn later switches back (the stale-locale self-heal).
store['debateos-locale'] = 'en'; store['debateos-ai-lang'] = 'en';
L.observe('Hi.', { ui: false });
ok(L.get() === 'en', 'observe: "Hi." leaves the locale alone');
// A detectable fragment is still not a switch: four words of Spanish is
// a name, a quote or a mixed sentence far more often than a change of
// language, so one short fragment must not move the site.
L.observe('sí, es que no', { ui: false });
ok(L.get() === 'en', 'observe: one short fragment does not switch');
L.observe('Claro, lo hacemos en español. Para encauzar bien el debate, te propongo una frase sobre los teléfonos en la escuela.', { ui: false });
ok(L.get() === 'es', 'observe: a full Spanish turn switches to es');
ok(store['debateos-ai-lang'] === 'es' && store['debateos-locale'] === 'es', 'both storage keys move together');
ok(L.roundLang('Hi.') === 'es', 'roundLang falls back to the stored locale on a thin transcript');
ok(L.roundLang('I actually think the rule would never be enforced, and the teachers already have too many tasks to police it.') === 'en', 'roundLang trusts a clear English transcript over the stored es');
ok(L.promptBlock('en') === '', 'promptBlock is empty for English');
ok(/Spanish/.test(L.promptBlock('es')) && /DECISION/.test(L.promptBlock('es')), 'promptBlock names the language and protects the parsed labels');

// ── 2. Wiring: every surface feeds the detector, every judge carries the block ──
const vd = read('app/voice-debate.html');
ok(vd.includes("input_audio_transcription.completed") && /DBLocale\.observe\(evt\.transcript/.test(vd), 'voice-debate feeds the detector from transcripts');
ok(/DBLocale\.roundLang\(_userSaid\)/.test(vd) && /DBLocale\.promptBlock\(rfdLang\) \+ sys/.test(vd), 'voice-debate ballot prompt carries the language block');
ok(/lang: rfdLang \|\| 'en'/.test(vd), 'voice-debate payload carries the round language');
ok(/addEventListener\('debatable:locale'/.test(vd) && /transcription: \{ model: 'gpt-4o-transcribe', language: code \}/.test(vd), 'voice-debate re-hints the transcriber on a mid-round switch');
ok(/data-locale-ui="off"/.test(vd), 'voice-debate keeps the React DOM out of the translation pass');

const nv = read('app/newvoice.html');
ok(/DBLocale\.observe\(text, \{ ui: 'defer' \}\)/.test(nv), 'newvoice feeds the detector and defers the page pass');
ok(/personaBlock \+ rfdLangBlock;/.test(nv), 'newvoice ballot carries the language block');
ok(/DBLocale\.flushUI\(\)/.test(nv), 'newvoice flushes the page pass once the ballot is on screen');
ok(/pill\.getAttribute\('data-verdict'\)/.test(nv), 'newvoice reads the verdict from the untranslated attribute');
ok(/src="\/js\/locale\.js"/.test(nv), 'newvoice includes locale.js by hand (no topbar)');

const pr = read('app/practice.html');
ok(/body\._language = _pl/.test(pr), 'practice sends _language beside a ballot promptId');
ok(/DBLocale\.observe\(text \|\| '', \{ ui: 'defer' \}\)/.test(pr), 'practice feeds typed speeches to the detector');
ok(/LANGUAGES\[code\]\) setAiLanguage\(code\)/.test(pr), 'practice AI language follows the shared locale');

const lr = read('app/live-round.html');
ok(/src="\/js\/locale\.js"/.test(lr), 'live-round includes locale.js by hand (no topbar)');
ok(/DBLocale\.observe\(txt, \{ ui: 'defer' \}\)/.test(lr), 'live-round feeds mic finals to the detector');
ok(/function setDebateLang\(code, force\)/.test(lr) && /setDebateLang\(d\.code, true\)/.test(lr), 'live-round re-arms the mic when the shared locale moves');

const rfd = read('app/voice-rfd.html');
ok(/src="\/js\/locale\.js"/.test(rfd) && /language: \(payload\.lang/.test(rfd), 'voice-rfd renders and reads aloud in the round language');

const tb = read('app/js/topbar.js');
ok(/ensureLocaleLoaded/.test(tb) && /mountPicker\(right/.test(tb), 'topbar injects locale.js and mounts the picker');
ok(/translate: 'no'/.test(tb), 'wordmark is marked untranslatable');
for (const f of ['app/landing.html', 'app/practice.html']) {
  ok(read(f).includes("localStorage.setItem('debateos-ai-lang',lang)"), `${f} picker writes both keys`);
}

// ── 3. Server block ──────────────────────────────────────────────────
const prompts = await import(path.join(ROOT, 'app/netlify/functions/lib/prompts.mjs'));
ok(prompts.languageBlock('en') === '' && prompts.languageBlock('xx') === '' && prompts.languageBlock('') === '', 'languageBlock is empty for English and unknown codes');
ok(/Spanish/.test(prompts.languageBlock('es')) && /JSON keys/.test(prompts.languageBlock('es')), 'languageBlock names Spanish and protects JSON keys');
{
  const body = { _promptId: 'singleJudgeBallot', _promptVars: { motion: 'm', sideLabel: 'Pro', fmtName: 'Casual', audienceRegister: '', formatJudgingCriteria: '' }, _language: 'es', system: '' };
  prompts.applyPromptLibrary(body);
  ok(!('_language' in body), '_language never reaches the provider');
  ok(/argued in Spanish/.test(body.system), 'ballot system carries the Spanish block');
  const en = { _promptId: 'singleJudgeBallot', _promptVars: { motion: 'm', sideLabel: 'Pro', fmtName: 'Casual', audienceRegister: '', formatJudgingCriteria: '' }, system: '' };
  prompts.applyPromptLibrary(en);
  ok(!/LANGUAGE:/.test(en.system), 'English ballot is unchanged');
  const stray = { _language: 'es', system: 'x', messages: [] };
  prompts.applyPromptLibrary(stray);
  ok(!('_language' in stray), '_language is stripped even without a promptId');
}
for (const code of Object.keys(L.LANGS)) {
  ok(code === 'en' || prompts.PROMPT_LANG_NAMES[code], `server knows ${code}`);
}
const rt = read('app/netlify/functions/realtime-session.mjs');
for (const code of Object.keys(L.LANGS)) ok(new RegExp('\\b' + code + ': ').test(rt.slice(rt.indexOf('REALTIME_LANG_NAMES'), rt.indexOf('REALTIME_LANG_NAMES') + 400)), `realtime minter knows ${code}`);

console.log(`locale guard: ${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
