// Guard for the homepage Highlights chatter (2026-09-25).
//
// The scripted lines in app/js/landing-chatter.js are shown to strangers
// as if they were people talking, so every rule the founder's decision
// kept is checked here rather than trusted to review:
//   - the same content bar as real chat (motion boundary, the highlight
//     filter, no em dashes, no banned phrases, no crowd-noun "debaters")
//   - no praise of the site, no claims about the judge, ranks, results,
//     prizes or money, no retired format jargon
//   - politics as issues, never individuals: no politician named, no war,
//     no election-fraud claim, no slur, nothing that turns on a group's
//     rights, and a line tied to a date retires on that date
//   - no name that could be taken for a real account's generated alias
//   - every episode opens on a line that stands on its own
//   - the schedule is a pure function of the clock and never interleaves
//   - the module never reaches the network or storage
//   - the landing renderer never puts a scripted line under a real one,
//     never re-types a real row, and runs real-only when the module is
//     missing
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { readPageSource } from './lib/page-source.mjs';
import { isSensitiveMotion, checkContent } from '../app/netlify/functions/lib/content-guard.mjs';
import { isChatPreviewEligible } from '../app/netlify/functions/lib/chat-preview.mjs';

const MODULE = readFileSync('app/js/landing-chatter.js', 'utf8');

function loadModule(extra = {}) {
  const ctx = vm.createContext({ ...extra });
  vm.runInContext(MODULE, ctx);
  return ctx.DBLandingChatter;
}

// ── 1. Purity: data and a clock, nothing else ─────────────────────────
for (const forbidden of [/\bfetch\s*\(/, /XMLHttpRequest/, /localStorage/, /sessionStorage/, /firebase/i, /\bdocument\./, /navigator\./, /sendBeacon/, /indexedDB/i]) {
  assert.doesNotMatch(MODULE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, ''), forbidden, 'landing-chatter.js must stay pure: ' + forbidden);
}

const C = loadModule();
const bank = C._bank();
assert.ok(bank.episodes.length >= 150, 'the bank needs real variety, found ' + bank.episodes.length);
assert.ok(bank.people.length >= 40, 'the cast needs real variety');

// ── 2. The cast cannot be mistaken for a real account's alias ─────────
const identity = readFileSync('app/js/public-identity.js', 'utf8');
function arr(name) {
  const m = identity.match(new RegExp('var ' + name + ' = \\[([\\s\\S]*?)\\];'));
  assert.ok(m, 'public-identity.js array ' + name + ' not found');
  return [...m[1].matchAll(/'([^']+)'/g)].map(x => x[1]);
}
const FIRST = arr('FIRST'), LAST = arr('LAST');
const norm = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
const firstTok = s => (String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().match(/[a-z0-9]+/) || [''])[0];
const aliasNames = new Set();
for (const f of FIRST) for (const l of LAST) aliasNames.add(norm(f + ' ' + l));
const firstNames = new Set(FIRST.map(f => f.toLowerCase()));
const seen = new Set();
for (const [handle, zone, city, region] of bank.people) {
  assert.ok(!seen.has(norm(handle)), 'duplicate persona ' + handle);
  seen.add(norm(handle));
  assert.ok(!aliasNames.has(norm(handle)), handle + ' equals a generated alias');
  assert.ok(!firstNames.has(firstTok(handle)), handle + ' starts with a generated-alias first name, so it can read as a real account');
  assert.doesNotMatch(handle, /^[a-z]+-[a-z]+$/, handle + ' has the generated @handle shape');
  assert.ok(handle.length <= 20 && city && zone && region, 'persona row incomplete: ' + handle);
  assert.doesNotThrow(() => new Intl.DateTimeFormat('en-US', { timeZone: zone }), 'bad zone ' + zone);
}

// ── 3. Content rules, on every string a visitor can be shown ──────────
const BANNED = [
  'free during beta', 'no sign-up required', 'pay nothing', 'holistic', 'robust framework',
  "let's dive in", 'lets dive in', "let's unpack", 'lets unpack', "let's break it down", 'lets break it down',
  'let me break this down', 'let me explain', 'hear me out', 'stay with me', 'bear with me',
  "in today's world", 'in todays world', 'ladies and gentlemen', "i'm here to argue", 'im here to argue',
  'at the end of the day', "it's important to note", 'its important to note', 'unlimited'
];
const PRODUCT = /\b(debatable|this (site|app|platform)|the (site|app|platform)|judge|ballot|leaderboard|ranking|ranked|rating|elo|xp|queue|spar|matchmak|ai judge|chatbot|chat ?gpt|claude)\b/i;
const MONEY = /\$\s?\d|\bprize|\bbount(y|ies)\b|\btournament|\bpurse\b|\bwinnings\b|\bcash prize|\bpaid tier|\bsubscription\b/i;
const JARGON = /\b(apda|pf|ld|bp|poi|pois|whip|pmr|lor|rebuttal speech|parli|worlds|policy debate|speaker points?|motion)\b/i;
const URLISH = /(https?:\/\/|www\.|\.com\b|\.org\b)/i;
// Politics (2026-09-25, second pass): issues, never individuals.
const POLITICIANS = /\b(trump|biden|harris|kamala|vance|obama|clinton|hillary|musk|elon|xi|putin|netanyahu|bibi|mamdani|newsom|desantis|ocasio|aoc|pelosi|schumer|mcconnell|sanders|bernie|rfk|kennedy|zelensky|modi|starmer|macron|massie|donalds|cruz|hawley|abbott|hochul|cuomo|trudeau|carney|milei|lula|orban|meloni|erdogan|farage|sunak|jeffries|thune|hegseth|rubio|leavitt|gabbard|bondi|vought|mike johnson|speaker johnson)\b/i;
const SLURS = /\b(libs|libtards?|maga|woke(?!\s+up)|commies?|fascists?|nazis?|groomers?|rinos?|snowflakes?|cucks?|leftists?|trumpers?|demonrats?|repugs?|sheeple)\b/i;
const WAR = /\b(wars?|warfare|bomb(s|ing|ed)?|missiles?|troops|soldiers?|invasions?|invade[ds]?|airstrikes?|nukes?|iran|israel|gaza|hamas|hezbollah|ukraine|russia|taiwan|venezuela|nato)\b/i;
const FRAUD = /\b(fraud|frauds|rigged|stolen|cheated)\b/i;
const GROUPS = /\b(immigra\w*|deport\w*|migrants?|refugees?|asylum|border wall|ice raids?|transgender|trans|gay|lesbian|lgbt\w*|queer|racial|racism|racist|affirmative action|dei|religio\w*|muslims?|christians?|jews?|jewish|hindus?|sikhs?|guns?|firearms?|second amendment)\b/i;
// Civic terms that share a word with the product list above.
const CIVIC = /\branked choice\b/gi;
// A line that only makes sense before a date must carry an until.
const TIMEBOUND = /\b(midterms?|this year|in october|this fall|election day is)\b|\{mdays\}/i;

function checkLine(text, where) {
  assert.ok(text && text.trim(), 'empty line at ' + where);
  assert.ok(text.length <= 220, 'line too long for the panel at ' + where + ': ' + text);
  assert.doesNotMatch(text, /[—–]/, 'em or en dash at ' + where + ': ' + text);
  assert.doesNotMatch(text, /[{}\[\]]/, 'unexpanded placeholder at ' + where + ': ' + text);
  const low = text.toLowerCase();
  for (const b of BANNED) assert.ok(!low.includes(b), 'banned phrase "' + b + '" at ' + where + ': ' + text);
  assert.doesNotMatch(text, /\bdebaters?\b/i, 'crowd noun "debaters" at ' + where + ': ' + text);
  assert.doesNotMatch(text.replace(CIVIC, ''), PRODUCT, 'product claim at ' + where + ': ' + text);
  assert.doesNotMatch(text, POLITICIANS, 'names a politician at ' + where + ': ' + text);
  assert.doesNotMatch(text, SLURS, 'partisan slur at ' + where + ': ' + text);
  assert.doesNotMatch(text, WAR, 'war at ' + where + ': ' + text);
  assert.doesNotMatch(text, FRAUD, 'fraud claim at ' + where + ': ' + text);
  assert.doesNotMatch(text, GROUPS, 'turns on a group at ' + where + ': ' + text);
  assert.doesNotMatch(text, MONEY, 'money or prize claim at ' + where + ': ' + text);
  assert.doesNotMatch(text, JARGON, 'retired format jargon at ' + where + ': ' + text);
  assert.doesNotMatch(text, URLISH, 'link at ' + where + ': ' + text);
  assert.doesNotMatch(text, /@/, 'mention at ' + where + ': ' + text);
  assert.equal(isSensitiveMotion(text), false, 'site motion boundary at ' + where + ': ' + text);
  const guard = checkContent({ text, kind: 'message' });
  assert.ok(guard.ok, 'content guard (' + guard.category + ') at ' + where + ': ' + text);
  assert.ok(isChatPreviewEligible(text), 'highlight filter would drop a real message like this, at ' + where + ': ' + text);
}

for (const [noun, q] of bank.topics) { checkLine(noun, 'topic'); checkLine(q, 'topic question'); }
for (const p of bank.people) { checkLine(p[0], 'persona name'); checkLine(p[2], 'persona city'); }

// Every alternation option of every line, with every placeholder filled
// by a representative value, so an option the schedule rarely picks is
// still checked.
function variants(text) {
  const out = [text];
  const re = /\[([^\[\]]*\|[^\[\]]*)\]/;
  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 0; i < out.length; i++) {
      const m = re.exec(out[i]);
      if (!m) continue;
      const opts = m[1].split('|');
      out.splice(i, 1, ...opts.map(o => out[i].replace(m[0], o)));
      changed = true;
      break;
    }
  }
  return out;
}
const FILL = { topic: 'tipping', topicQ: 'should tipping be replaced with higher wages', topic2: 'the filibuster', topic2Q: 'should the senate get rid of the filibuster',
  city: 'lisbon', time: '4pm', weekday: 'friday', mdays: '39', A: 'tiago', B: 'dele', C: 'mira', D: 'ayo' };
const fill = t => t.replace(/\{(\w+)\}/g, (_, k) => { assert.ok(k in FILL, 'unknown placeholder {' + k + '}'); return FILL[k]; });
for (const ep of bank.episodes) {
  assert.ok(ep.lines.length >= 1 && ep.lines.length <= 6, 'episode ' + ep.index + ' length');
  assert.equal(ep.lines[0].role, 'A', 'episode ' + ep.index + ' must open with role A');
  const bound = ep.lines.some(l => TIMEBOUND.test(l.text));
  if (bound) assert.ok(ep.until, 'episode ' + ep.index + ' only makes sense before a date and needs an until: ' + ep.lines[0].text);
  if (ep.until) assert.ok(ep.until > Date.UTC(2026, 0, 1) && ep.until < Date.UTC(2030, 0, 1), 'episode ' + ep.index + ' until is not a real date');
  if (ep.lines.some(l => /\{mdays\}/.test(l.text))) assert.ok(ep.until <= Date.UTC(2026, 10, 2), 'episode ' + ep.index + ' counts down and must retire before the count reaches 1');
  for (const [role, rule] of Object.entries(ep.rules)) {
    assert.ok(ep.roles.includes(role), 'episode ' + ep.index + ' constrains a role that never speaks');
    for (const alt of rule.split('|')) for (const tok of alt.split('+')) {
      assert.ok(['late', 'night', 'morning', 'day', 'evening', 'us', 'eu', 'nonus', 'es', 'pt', 'in'].includes(tok), 'unknown constraint ' + tok);
    }
  }
  ep.lines.forEach((line, i) => {
    for (const v of variants(line.text)) {
      const text = fill(v);
      checkLine(text, 'episode ' + ep.index + ' line ' + i);
      if (i === 0) assert.doesNotMatch(text, bank.replyShaped, 'episode ' + ep.index + ' opens on a reply-shaped line, which would read as answering whatever real message sits above it: ' + text);
    }
  });
}

// ── 4. The schedule: pure, ordered, human-paced ───────────────────────
const T0 = Date.UTC(2026, 8, 25, 18, 7, 13);
const lines = [];
for (let h = 0; h < 72; h++) lines.push(...C.between(T0 + h * 3600000, T0 + (h + 1) * 3600000));
const perHour = [];
for (let h = 0; h < 72; h++) perHour.push(lines.filter(l => l.at > T0 + h * 3600000 && l.at <= T0 + (h + 1) * 3600000).length);
const avg = perHour.reduce((a, b) => a + b, 0) / perHour.length;
assert.ok(avg >= 45 && avg <= 170, 'lines per hour should read as a lively room, not a machine: ' + avg.toFixed(1));
assert.ok(Math.min(...perHour) >= 10, 'no dead hours');
assert.ok(Math.max(...perHour) <= 230, 'no hour so busy it reads as a machine: ' + Math.max(...perHour));
for (const l of lines) checkLine(l.text, 'scheduled ' + l.id);
// Conversations never interleave: once a later episode starts, an
// earlier one has said its last line.
for (let i = 1; i < lines.length; i++) {
  assert.ok(lines[i].at >= lines[i - 1].at, 'between() must be ordered');
  if (lines[i].ep !== lines[i - 1].ep) assert.equal(lines[i].i, 0, 'episode ' + lines[i].ep + ' interleaves with ' + lines[i - 1].ep);
}
// Lines tied to a date: every until= tag parsed (a malformed date would
// parse as "forever"), the countdown is right on the line's own clock,
// they run before the date and never after it.
const untilTags = (MODULE.match(/`#[^`\n]*\buntil=/g) || []).length;
const dated = bank.episodes.filter(ep => ep.until);
assert.equal(dated.length, untilTags, 'every until= tag must parse to a date');
assert.ok(dated.length >= 3, 'the midterm lines are dated');
const MIDTERMS = Date.UTC(2026, 10, 3, 12);
let datedSeen = 0, countdowns = 0;
for (const l of lines) {
  if (bank.episodes[l.e].until) datedSeen++;
  const m = /^(\d+) days until the midterms/.exec(l.text);
  if (!m) continue;
  countdowns++;
  assert.equal(+m[1], Math.ceil((MIDTERMS - l.at) / 86400000), 'countdown is wrong: ' + l.text);
}
assert.ok(datedSeen > 0 && countdowns > 0, 'dated lines run before their date');
const LATE = Date.UTC(2026, 9, 31, 0, 0, 0);
let lateCountdown = 0;
for (let h = 0; h < 144; h++) {
  for (const l of C.between(LATE + h * 3600000, LATE + (h + 1) * 3600000)) {
    const ep = bank.episodes[l.e];
    if (!ep.until) continue;
    assert.ok(!(l.i === 0 && l.at >= ep.until + 60000), 'episode ' + l.e + ' opened after its date: ' + l.text);
    assert.ok(l.at < ep.until + 3600000, 'episode ' + l.e + ' still talking an hour after its date: ' + l.text);
    const m = /^(\d+) days until/.exec(l.text);
    if (m) { lateCountdown++; assert.ok(+m[1] >= 2, 'countdown reached ' + m[1] + ': ' + l.text); }
  }
}
assert.ok(lateCountdown > 0, 'the countdown still runs in the last days before it retires');
// Fresh module, same clock, same room: a reload must not reshuffle.
const C2 = loadModule();
for (const t of [T0, T0 + 3.7e6, T0 + 9.1e6, T0 + 86400000 * 2 + 1234567]) {
  const a = C.backlog(t, { minLines: 9 }), b = C2.backlog(t, { minLines: 9 });
  // Array.from: each module lives in its own realm, and deepStrictEqual
  // compares prototypes, so compare host arrays.
  const row = l => [l.id, l.handle, l.text, l.at];
  assert.deepEqual(Array.from(b, row), Array.from(a, row), 'backlog must be a pure function of the clock');
  assert.ok(a.length >= 9, 'backlog fills the panel');
  assert.equal(a[0].i, 0, 'backlog opens on an episode opener');
  assert.ok(a.every(l => l.at <= t), 'backlog never shows a line from the future');
}
// Every speaker is awake, and a line that says it is late, morning or
// evening is true on that person's own clock. Re-implemented here rather
// than read from the module, so a bug in the module cannot grade itself.
const WINDOW = {
  late: h => h >= 23 || h <= 3, night: h => h >= 21 || h <= 2, morning: h => h >= 6 && h <= 10,
  day: h => h >= 10 && h <= 17, evening: h => h >= 17 && h <= 22,
};
const awakeHour = h => h >= 7 || h <= 1;
const personOf = Object.fromEntries(bank.people.map(p => [p[0], p]));
let timedChecked = 0;
for (const l of lines) {
  const ep = bank.episodes[l.e];
  assert.ok(ep, 'every line names its episode');
  const role = ep.lines[l.i].role;
  const rule = ep.rules[role];
  const person = personOf[l.handle];
  assert.ok(person, 'speaker is a persona: ' + l.handle);
  if (!rule) { assert.ok(awakeHour(l.h), l.handle + ' speaks at ' + l.h + ':00 local'); continue; }
  const ok = rule.split('|').some(alt => {
    let timed = false;
    const all = alt.split('+').every(tok => {
      if (WINDOW[tok]) { timed = true; return WINDOW[tok](l.h); }
      if (tok === 'us' || tok === 'eu') return person[3] === tok;
      if (tok === 'nonus') return person[3] !== 'us';
      return person[4] === tok;
    });
    return all && (timed || awakeHour(l.h));
  });
  assert.ok(ok, 'episode ' + l.e + ' role ' + role + ' (' + rule + ') spoken by ' + l.handle + ' at ' + l.h + ':00 local: ' + l.text);
  if (/late|night|morning|day|evening/.test(rule)) timedChecked++;
}
assert.ok(timedChecked > 50, 'time-bound lines were actually exercised: ' + timedChecked);
// A real name that matches no persona must not reshuffle the room, or two
// visitors with different real rows would see different conversations.
{
  const D = loadModule();
  const before = Array.from(D.backlog(T0 + 7200000, { minLines: 12 }), l => l.id + l.handle + l.text);
  assert.equal(D.setAvoid(['Zzq Unmatched', 'another stranger']), false, 'no persona affected, no change');
  assert.deepEqual(Array.from(D.backlog(T0 + 7200000, { minLines: 12 }), l => l.id + l.handle + l.text), before, 'the room is unchanged');
  const persona = before.length && D.backlog(T0 + 7200000, { minLines: 12 })[0].handle;
  assert.equal(D.setAvoid([persona]), true, 'a matching real name changes the cast');
}

// Avoidance: a real handle takes its scripted namesake off the schedule.
const victim = C.backlog(T0, { minLines: 9 })[0].handle;
C.setAvoid([victim.toUpperCase()]);
assert.ok(C.avoids(victim), 'avoids() reads the same rule setAvoid wrote');
assert.ok(!C.between(T0 - 3600000, T0 + 3600000).some(l => l.handle === victim), 'an avoided persona never speaks');
C.setAvoid([]);

// ── 5. Landing wiring ──────────────────────────────────────────────────
const landing = readPageSource('app/landing.html', 'utf8');
assert.match(landing, /window\.__abAssignments\.landing_chatter_v1=forced\?\{variant:v,forced:true,deferImpression:true\}:\{variant:v,deferImpression:true\}/, 'the A/B registers with a deferred impression');
assert.match(landing, /Math\.random\(\)<0\.8\?'on':'off'/, 'the split is 80/20');
assert.match(landing, /data-ab-impression="landing_chatter_v1"/, 'the impression waits for the panel to be on screen');
assert.match(landing, /getAttribute\('data-chatter'\) !== 'on'\) return;/, 'only the on arm loads the module');
assert.match(landing, /s\.src = '\/js\/landing-chatter\.js/, 'the module is loaded async from /js');
assert.match(landing, /gtag\('set','user_properties',\{chatter_arm:v\}\)/, 'GA4 can split every event by arm');
const liveChats = readFileSync('app/netlify/functions/live-chats.mjs', 'utf8');
assert.doesNotMatch(liveChats, /landing-chatter|DBLandingChatter|scripted/i, 'the feed endpoint stays real-only');

// ── 6. The renderer, against a simulated clock and DOM ─────────────────
const renderer = landing.slice(landing.indexOf('  /* fsChats:'), landing.indexOf("    var canvas = document.getElementById('heroGlobeCanvas');"));
const code = renderer.slice(renderer.indexOf('(function(){'), renderer.lastIndexOf('  (function(){'));
function element(tag) {
  const classes = new Set();
  const attributes = new Map();
  const handlers = {};
  const el = { tag, children: [], parent: null, scrollTop: 0, clientHeight: 300, scrollHeight: 900, attributes, handlers, textContent: '',
    get innerHTML() { return ''; }, set innerHTML(v) { this.children.forEach(c => { c.parent = null; }); this.children = []; },
    appendChild(child) { if (child.parent) child.parent.children = child.parent.children.filter(c => c !== child); this.children.push(child); child.parent = this; return child; },
    remove() { if (this.parent) this.parent.children = this.parent.children.filter(c => c !== this); this.parent = null; },
    contains() { return false; },
    setAttribute(k, v) { attributes.set(k, String(v)); },
    getAttribute(k) { return attributes.has(k) ? attributes.get(k) : null; },
    addEventListener(name, fn) { handlers[name] = fn; },
    classList: { add: x => classes.add(x), remove: x => classes.delete(x), contains: x => classes.has(x),
      toggle: x => { if (classes.has(x)) { classes.delete(x); return false; } classes.add(x); return true; } } };
  return el;
}
function makeWorld({ withModule = true, payload = null } = {}) {
  let now = T0;
  const timers = new Map();
  let tid = 0;
  const fetches = [];
  const winHandlers = {};
  const panel = element('aside'), list = element('div');
  const reduced = { matches: false, addEventListener(name, fn) { reduced.change = fn; } };
  let nextPayload = payload;
  class FakeDate extends Date { static now() { return now; } }
  const ctx = {
    console, Intl, Array, JSON, Math, Object, String, Number, Promise,
    Date: FakeDate,
    setTimeout: (fn, ms) => { const id = ++tid; timers.set(id, { fn, at: now + (ms || 0) }); return id; },
    clearTimeout: id => { timers.delete(id); },
    setInterval: (fn, ms) => { const id = ++tid; timers.set(id, { fn, at: now + ms, every: ms }); return id; },
    sessionStorage: { getItem: () => null, setItem: () => {} },
    document: { hidden: false, activeElement: null, getElementById: id => id === 'fsChats' ? panel : id === 'fsChatsList' ? list : null, createElement: element },
    fetch: async url => {
      fetches.push(String(url));
      if (nextPayload instanceof Error) throw nextPayload;
      return { ok: true, json: async () => nextPayload };
    },
  };
  ctx.window = ctx;
  ctx.matchMedia = q => q.includes('reduced-motion') ? reduced : { matches: true, addEventListener() {} };
  ctx.addEventListener = (name, fn) => { winHandlers[name] = fn; };
  vm.createContext(ctx);
  if (withModule) {
    vm.runInContext(MODULE, ctx);
    ctx.__fsChatterLoading = true;
  }
  vm.runInContext(code, ctx);
  const flush = () => new Promise(r => setImmediate(r));
  async function advance(ms) {
    const end = now + ms;
    for (;;) {
      let pick = null;
      for (const [id, t] of timers) if (t.at <= end && (!pick || t.at < pick.t.at)) pick = { id, t };
      if (!pick) break;
      now = Math.max(now, pick.t.at);
      if (pick.t.every) pick.t.at += pick.t.every; else timers.delete(pick.id);
      pick.t.fn();
      await flush();
    }
    now = end;
    await flush();
  }
  return { ctx, panel, list, reduced, fetches, winHandlers, advance, flush,
    setPayload: p => { nextPayload = p; }, now: () => now, setNow: t => { now = t; } };
}
const rowsOf = g => g.children.map(r => ({ node: r, scripted: r.getAttribute('data-ab-target') === 'row_scripted',
  typing: r.classList.contains('is-typing'),
  handle: r.children[0].children[1].textContent, text: r.children[1].textContent }));

// Every scripted row maps back to its scheduled line, every reply sits
// below its own opener, and no conversation continues past a real row.
function assertConversationsWhole(w, rows, since) {
  const schedule = w.ctx.DBLandingChatter.between(since - 3600000, w.now() + 1);
  const used = new Set();
  const mapped = rows.map(r => {
    if (!r.scripted) return null;
    const line = schedule.find(l => !used.has(l.id) && l.handle === r.handle &&
      (l.text === r.text || (r.typing && l.text.startsWith(r.text))));
    assert.ok(line, 'scripted row maps to the schedule: ' + r.handle + ': ' + r.text);
    used.add(line.id);
    return line;
  });
  // The tail keeps 28 scripted rows; only a full tail can have lost an
  // opener off the top, and only the rows nearest the top can be missing one.
  const full = rows.filter(r => r.scripted).length >= 28;
  let lastReal = -1;
  mapped.forEach((line, pos) => {
    if (!line) { lastReal = pos; return; }
    if (line.i === 0) return;
    const opener = mapped.findIndex(m => m && m.ep === line.ep && m.i === 0);
    if (opener === -1) {
      assert.ok(full && pos < 6, 'a reply with no opener on screen: ' + line.text);
      return;
    }
    assert.ok(opener < pos, 'a reply sits below its own opener: ' + line.text);
    assert.ok(opener > lastReal, 'a scripted reply never lands under a real message: ' + line.text);
  });
}

// 6a. With the module: the room is there on the first frame, even while
// the real feed has not answered.
{
  const w = makeWorld({ payload: new Error('offline') });
  await w.flush();
  assert.equal(w.panel.classList.contains('is-live'), true, 'the on arm is live on the first frame');
  assert.equal(w.list.children.length, 2, 'real group above, scripted tail below');
  const [group, tail] = w.list.children;
  assert.equal(group.children.length, 0, 'no real rows invented while the feed is down');
  const first = rowsOf(tail);
  assert.ok(first.length >= 9 && first.every(r => r.scripted && r.text.length > 0), 'the backlog paints whole');
  assert.equal(w.list.scrollTop, w.list.scrollHeight, 'opens at the newest line');
  await w.advance(8 * 60000);
  const later = rowsOf(tail);
  assert.ok(later.length > first.length, 'new lines arrive on the schedule');
  assert.ok(later.every(r => r.text.length > 0), 'every arrival finishes typing');
  assertConversationsWhole(w, later, T0);
  assert.ok(w.fetches.every(u => u === '/api/live-chats'), 'the only request is the real feed: ' + w.fetches.join(', '));
}

// 6b. Real rows keep their words and their place, and a real arrival
// cuts the scripted conversation short.
{
  const past = T0 - 5 * 3600000;
  const payload = { messages: [
    { room: 'commons', label: 'The Commons', handle: 'Real Person One', text: 'anyone open for a round', at: past },
    { room: 'commons', label: 'The Commons', handle: 'Real Person Two', text: 'I would take the other side of that', at: past + 60000 },
  ] };
  const w = makeWorld({ payload });
  await w.flush();
  await w.advance(1500);
  const [group, tail] = w.list.children;
  assert.deepEqual(rowsOf(group).map(r => r.text), ['anyone open for a round', 'I would take the other side of that'], 'real history sits above, in order, whole');
  assert.ok(rowsOf(group).every(r => !r.scripted), 'no scripted row in the real group');
  const groupBefore = group.children.slice();
  await w.advance(6 * 60000);
  assert.deepEqual(group.children, groupBefore, 'real rows are never re-typed or moved in chatter mode');
  assert.ok(rowsOf(group).every(r => r.text.length > 0), 'real rows stay whole');

  // A real message that arrives now lands at the bottom.
  const arrivedAt = w.now() + 1000;
  w.setPayload({ messages: [...payload.messages, { room: 'commons', label: 'The Commons', handle: 'Real Person Three', text: 'is anyone around to argue about rent', at: arrivedAt }] });
  await w.advance(61000);
  const tailRows = rowsOf(tail);
  const idx = tailRows.findIndex(r => r.handle === 'Real Person Three');
  assert.ok(idx >= 0, 'a live real message arrives in the tail');
  assert.ok(tailRows[idx].text.length > 0);
  // No scripted conversation spans the real message: everything scripted
  // after it belongs to a conversation that opened after it.
  await w.advance(10 * 60000);
  const rows = rowsOf(tail);
  const at = rows.findIndex(r => r.handle === 'Real Person Three');
  assert.ok(rows.slice(at + 1).some(r => r.scripted), 'the room carries on after a real message');
  assertConversationsWhole(w, rows, arrivedAt - 600000);
}

// 6c. A scripted persona whose name matches a real person on screen
// leaves at once.
{
  const w = makeWorld({ payload: new Error('offline') });
  await w.flush();
  const tail = w.list.children[1];
  const victimRow = rowsOf(tail)[0];
  w.setPayload({ messages: [{ room: 'commons', label: 'The Commons', handle: victimRow.handle, text: 'I am a real person with this name', at: T0 - 3600000 }] });
  await w.advance(61000);
  assert.ok(!rowsOf(tail).some(r => r.scripted && r.handle === victimRow.handle), 'the namesake persona is removed');
  assert.ok(rowsOf(w.list.children[0]).some(r => r.handle === victimRow.handle && !r.scripted), 'the real person stays');
}

// 6d. A member's own post shows at once and quiets the room.
{
  const w = makeWorld({ payload: { messages: [] } });
  await w.flush();
  const tail = w.list.children[1];
  w.winHandlers['dblandingchat:sent']({ detail: { handle: 'Member Alias', text: 'anyone want to argue about tipping' } });
  const rows = rowsOf(tail);
  assert.equal(rows.at(-1).handle, 'Member Alias', 'the post is on screen at once');
  assert.equal(rows.at(-1).scripted, false);
  const count = rows.length;
  await w.advance(100000);
  const scriptedAfter = rowsOf(tail).slice(count).filter(r => r.scripted);
  assert.equal(scriptedAfter.length, 0, 'nothing scripted lands in the quiet after a member posts');
  // The feed later returns the same post; it must not appear twice.
  w.setPayload({ messages: [{ room: 'commons', label: 'The Commons', handle: 'Member Alias', text: 'anyone want to argue about tipping', at: w.now() - 5000 }] });
  await w.advance(61000);
  const copies = [...rowsOf(w.list.children[0]), ...rowsOf(tail)].filter(r => r.handle === 'Member Alias');
  assert.equal(copies.length, 1, 'the echoed post is adopted, not duplicated');
}

// 6e. Hover holds arrivals; reduced motion lands them whole.
{
  const w = makeWorld({ payload: new Error('offline') });
  await w.flush();
  const tail = w.list.children[1];
  w.panel.handlers.mouseenter();
  const held = rowsOf(tail).length;
  await w.advance(4 * 60000);
  assert.equal(rowsOf(tail).length, held, 'hovering the panel holds new arrivals for reading');
  w.panel.handlers.mouseleave();
  w.reduced.matches = true;
  await w.advance(4 * 60000);
  assert.ok(rowsOf(tail).length > held, 'arrivals resume after hover');
  assert.ok(rowsOf(tail).every(r => r.text.length > 0 && !r.node.classList.contains('is-typing')), 'reduced motion shows whole lines');
}

// The next three scenarios are built from the schedule itself, so each one
// is guaranteed to contain the situation it tests rather than hoping the
// clock happens to produce it.
const probe = loadModule();
const byEp = list => { const m = new Map(); for (const l of list) { if (!m.has(l.ep)) m.set(l.ep, []); m.get(l.ep).push(l); } return m; };
const schedRows = list => Array.from(list, l => l);

// 6e2. Back from a long hidden stretch, a reply whose opener fell outside
// the catch-up window must not land on its own.
{
  let m = null;
  for (let n = 420; n < 1400 && m === null; n++) {
    const x = T0 + n * 1000 - 300000;
    for (const lines of byEp(schedRows(probe.between(x - 150000, x + 150000))).values()) {
      const o = lines.find(l => l.i === 0), r = lines.find(l => l.i === 1);
      if (o && r && o.at > T0 + 1000 && o.at <= x && r.at > x) { m = n; break; }
    }
  }
  assert.ok(m !== null, 'found an episode straddling the catch-up edge');
  const w = makeWorld({ payload: new Error('offline') });
  await w.flush();
  w.ctx.document.hidden = true;
  await w.advance(m * 1000 - 500);
  w.ctx.document.hidden = false;
  await w.advance(3000);
  assertConversationsWhole(w, rowsOf(w.list.children[1]), T0);
  await w.advance(2 * 60000);
  assertConversationsWhole(w, rowsOf(w.list.children[1]), T0);
}

// 6b2. A real message that lands while scripted lines are still queued
// (the reader is hovering, so nothing types) ends those conversations too.
{
  let plan = null;
  for (let n = 3; n < 30 && !plan; n++) {
    const poll = T0 + n * 60000;
    for (const lines of byEp(schedRows(probe.between(poll - 90000, poll + 150000))).values()) {
      const o = lines.find(l => l.i === 0);
      if (o && o.at > poll - 50000 && o.at < poll - 3000 && lines.some(l => l.at > poll + 3000)) { plan = { poll, hoverFrom: poll - 55000 }; break; }
    }
  }
  assert.ok(plan, 'found a conversation queued across a poll');
  const w = makeWorld({ payload: new Error('offline') });
  await w.flush();
  await w.advance(plan.hoverFrom - T0);
  w.panel.handlers.mouseenter();
  w.setPayload({ messages: [{ room: 'commons', label: 'The Commons', handle: 'Real Person Four', text: 'anyone up for a round on bike lanes', at: plan.poll - 1000 }] });
  await w.advance(plan.poll - plan.hoverFrom + 5000);
  w.panel.handlers.mouseleave();
  await w.advance(4 * 60000);
  const rows = rowsOf(w.list.children[1]);
  assert.ok(rows.some(r => r.handle === 'Real Person Four'), 'the real message arrived');
  assertConversationsWhole(w, rows, T0);
}

// 6c2. A real name that recasts a conversation in flight ends it, rather
// than finishing it with other people and possibly another topic.
{
  let plan = null;
  for (let n = 2; n < 40 && !plan; n++) {
    const poll = T0 + n * 60000;
    for (const [ep, lines] of byEp(schedRows(probe.between(poll - 150000, poll + 150000)))) {
      const o = lines.find(l => l.i === 0);
      if (!o || o.at > poll - 3000) continue;
      const before = new Set(lines.filter(l => l.at <= poll).map(l => l.handle));
      const later = lines.find(l => l.at > poll + 3000 && !before.has(l.handle));
      if (!later) continue;
      const recast = loadModule();
      recast.setAvoid([later.handle]);
      const continues = Array.from(recast.between(poll + 5000, poll + 150000)).some(l => l.ep === ep && l.i > 0);
      if (continues) { plan = { poll, ep, victim: later.handle }; break; }
    }
  }
  assert.ok(plan, 'found a conversation a real name would recast');
  const w = makeWorld({ payload: new Error('offline') });
  await w.flush();
  await w.advance(plan.poll - 30000 - T0);
  w.setPayload({ messages: [{ room: 'commons', label: 'The Commons', handle: plan.victim, text: 'hello i am a real person', at: T0 - 7200000 }] });
  await w.advance(30000 + 2000);
  const tail = w.list.children[1];
  // By node, not by count: the tail is capped, so old rows leave the top
  // while new ones arrive and an index would point at nothing.
  const onScreenAtPoll = new Set(tail.children);
  await w.advance(4 * 60000);
  const fresh = rowsOf(tail).filter(r => !onScreenAtPoll.has(r.node));
  const after = fresh.filter(r => r.scripted);
  assert.ok(after.length > 0, 'the room carried on after the recast');
  const recastSchedule = Array.from(w.ctx.DBLandingChatter.between(plan.poll - 60000, w.now() + 1));
  for (const r of after) {
    const line = recastSchedule.find(l => l.handle === r.handle && (l.text === r.text || (r.typing && l.text.startsWith(r.text))));
    assert.ok(line, 'row maps to the recast schedule: ' + r.text);
    assert.notEqual(line.ep, plan.ep, 'a recast conversation does not continue: ' + r.handle + ': ' + r.text);
  }
  assertConversationsWhole(w, fresh, plan.poll);
}

// 6f. Without the module the renderer is the real-only panel.
{
  const w = makeWorld({ withModule: false, payload: { messages: [], curated: true } });
  await w.flush();
  assert.equal(w.panel.classList.contains('is-live'), false, 'the off arm stays blank on an empty feed');
  assert.equal(w.list.children.length, 0);
}

console.log('Landing chatter: ' + bank.episodes.length + ' episodes, ' + bank.people.length + ' people, ' + lines.length + ' scheduled lines over 72h (' + avg.toFixed(0) + '/hour); content, names, openers, schedule, wiring and renderer passed.');
