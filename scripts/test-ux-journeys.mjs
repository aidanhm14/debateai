import fs from 'node:fs';

const root = new URL('../', import.meta.url);
const read = (path) => fs.readFileSync(new URL(path, root), 'utf8');
let failures = 0;

function check(condition, label) {
  if (condition) {
    console.log('PASS', label);
    return;
  }
  failures += 1;
  console.error('FAIL', label);
}

function hasNamedGate(path) {
  const source = read(path);
  return source.includes('isNamedAccount') && /if \(!isNamedAccount\(decoded\)\)/.test(source);
}

function inlineScriptsParse(path) {
  const source = read(path);
  const scripts = source.matchAll(/<script(?![^>]*\bsrc=)(?![^>]*application\/ld\+json)[^>]*>([\s\S]*?)<\/script>/gi);
  try {
    for (const match of scripts) new Function(match[1]);
    return true;
  } catch (error) {
    console.error(`INLINE SCRIPT ERROR ${path}:`, error.message);
    return false;
  }
}

const pricing = read('app/pricing.html');
for (const plan of ['byok', 'individual', 'voice', 'team']) {
  check(pricing.includes(`data-checkout="${plan}"`), `${plan} has a live checkout action`);
}
check(!pricing.includes('/app?upgrade='), 'pricing never sends plan intent through the retired app route');
check(!pricing.includes('intended_plan'), 'pricing does not strand plan intent in session storage');
check(pricing.includes('src="/js/auth-modal.js"'), 'pricing loads the sign-in modal needed to resume checkout');
check(
  /openAuthModal\('signup', \{ onDone: function \(signedInUser\)/.test(pricing),
  'signed-out checkout resumes on the pricing page after authentication',
);
check(
  pricing.includes("data.error === 'NEEDS_TEAM'") && pricing.includes('openBillingSetup(plan, button, user)'),
  'missing workspaces open an in-place setup instead of dead-ending',
);

const checkout = read('app/netlify/functions/create-checkout.mjs');
check(
  checkout.includes('/pricing?billing=success&plan='),
  'Stripe returns to the pricing success state',
);
for (const path of [
  'app/netlify/functions/create-checkout.mjs',
  'app/netlify/functions/create-team.mjs',
  'app/netlify/functions/razorpay-order.mjs',
  'app/netlify/functions/tokens-checkout.mjs',
  'app/netlify/functions/tokens.mjs',
  'app/netlify/functions/tokens-portal.mjs',
]) {
  check(hasNamedGate(path), `${path} rejects anonymous Firebase identities`);
}

const tokens = read('app/tokens.html');
check(!tokens.includes('id="authBtn"'), 'tokens has no duplicate page-local auth control');
check(tokens.includes("openAuthModal('signup',{onDone:function(u)"), 'tokens checkout resumes after sign-in');
check(tokens.includes("d.error==='NAMED_ACCOUNT_REQUIRED'"), 'tokens handles a server-side anonymous-account rejection');

const profile = read('app/profile.html');
check(!profile.includes('Format hopper'), 'profile no longer offers the impossible format quest');
check(!profile.includes('two different formats'), 'profile has no cross-format completion condition');
check(profile.includes("title:'Run it back'") && profile.includes('today.length >= 2'), 'replacement daily quest is achievable in casual rounds');
check(/onAuthStateChanged\(u\s*=>\s*\{[\s\S]{0,300}if\(!u\s*\|\|\s*u\.isAnonymous\)\{\s*renderSignedOut\(\)/.test(profile), 'anonymous Firebase identities see the signed-out profile state');

const onboarding = read('app/js/onboarding.js');
const native = read('app/native.html');
check(!/key:\s*['"]formats?['"]/.test(onboarding), 'web onboarding has no retired format picker');
check(!/key:\s*['"]format['"]/.test(native), 'native onboarding has no retired format picker');
check(onboarding.includes('Build my confidence'), 'web onboarding offers a newcomer goal');

const activeNavigationFiles = [
  'app/landing.html',
  'app/practice.html',
  'app/pricing.html',
  'app/profile.html',
  'app/tokens.html',
  'app/native.html',
  'app/voice-debate.html',
  'app/tournaments.html',
  'app/js/auth-prompt.js',
  'app/js/upgrade-cta.js',
  'app/js/usage-banner.js',
];
for (const path of activeNavigationFiles) {
  const source = read(path);
  check(!/href=["']\/app#/.test(source), `${path} has no dead app-fragment link`);
  check(!/href=["']\/#(?:pricing|story|waitlist)/.test(source), `${path} has no dead landing fragment link`);
}

const landing = read('app/landing.html');
check(
  landing.includes('href="https://discord.gg/WMHZW9BKvJ"')
    && landing.includes('data-cta="landing-quick-discord"')
    && landing.includes('/img/landing/discord-community.png'),
  'landing quick row uses the large Discord community card',
);
check(!landing.includes('data-cta="landing-quick-board"'), 'landing quick row does not duplicate the leaderboard below it');

const liveRound = read('app/live-round.html');
check(
  (liveRound.match(/data-aud-tab=/g) || []).length === 2
    && liveRound.includes('data-aud-tab="comments"')
    && liveRound.includes('data-aud-tab="judge"')
    && !liveRound.includes('data-aud-tab="topics"')
    && !liveRound.includes('data-aud-tab="groups"'),
  'live-round audience deck only offers comments and judge notes',
);

const signupNudge = read('app/js/signup-nudge.js');
check(
  signupNudge.includes('(watch|leaderboard|messages|profile|tokens)') && signupNudge.includes('skip: true'),
  'read-only and account pages skip the timed signup overlay',
);

const sharedUi = read('app/css/ui.css');
check(sharedUi.includes('height:44px;'), 'shared mobile topbar controls expose a 44px hit area');
check(read('app/landing.html').includes('width:44px;height:44px;border-radius:50%'), 'landing carousel controls expose a 44px hit area');

for (const path of ['netlify.toml', 'app/netlify.toml']) {
  const source = read(path);
  check(
    source.includes('from = "/prep"') && source.includes('from = "/compare/debatable-vs-chatgpt"'),
    `${path} retires stale format and comparison entry points`,
  );
}

for (const path of [
  'app/languages/index.html',
  'app/languages/es.html',
  'app/languages/fr.html',
  'app/languages/de.html',
  'app/languages/hi.html',
  'app/languages/zh.html',
  'app/languages/ko.html',
  'app/compare/index.html',
  'app/coach.html',
]) {
  const source = read(path);
  check(
    !/APDA|Public Forum|Lincoln-Douglas|British Parliamentary|15 (?:competitive |debate )?formats/i.test(source),
    `${path} does not advertise retired public formats`,
  );
}

for (const path of ['app/pricing.html', 'app/tokens.html', 'app/profile.html', 'app/native.html']) {
  check(inlineScriptsParse(path), `${path} inline scripts parse`);
}

if (failures) process.exit(1);
