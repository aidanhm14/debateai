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

// 2026-09-02: app/tokens.html was DELETED by 3b73f2c5 ("merge /tokens
// into the page") and this guard kept reading it, so it threw ENOENT on
// every run and blocked every commit in the repo for everyone. A red
// guard on main is worse than no guard, because the next person reads
// the failure as noise. The two promises that still mean something moved
// to /predict, which is where the token surface now lives; the third
// ("no duplicate page-local auth control") was specific to tokens.html
// sprouting its own button beside the topbar, and /predict owns a full
// page bar with a sign-in control in it by design, so it does not port.
const tokensSurface = read('app/predict.html');
check(tokensSurface.includes("openAuthModal('signup',{onDone:function(u)"), 'token checkout resumes after sign-in');
check(tokensSurface.includes("d.error==='NAMED_ACCOUNT_REQUIRED'"), 'token surface handles a server-side anonymous-account rejection');

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
  'app/predict.html',
  'app/native.html',
  'app/voice-debate.html',
  'app/newvoice.html',
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
  !landing.includes('fs-board-debate')
    && !landing.includes('Choose what you argue about. Press this card to debate.'),
  'landing example board keeps the instruction line retired',
);
check(!landing.includes('class="fb-floating"'), 'landing keeps the floating feedback button retired');
check(
  landing.includes('href="https://discord.gg/WMHZW9BKvJ"')
    && landing.includes('data-cta="landing-quick-discord"')
    && landing.includes('/img/landing/discord-community-800.jpg'),
  'landing quick row uses the large Discord community card',
);
check(!landing.includes('data-cta="landing-quick-board"'), 'landing quick row does not duplicate the leaderboard below it');

const watch = read('app/watch.html');
check(
  (watch.match(/data-pan-shelf role=/g) || []).length === 2
    && watch.includes("window.matchMedia('(prefers-reduced-motion: reduce)')")
    && watch.includes("['pointerdown','touchstart','wheel','keydown','focusin','mouseenter']")
    && watch.includes("new IntersectionObserver(function(entries)")
    && watch.includes('animateTo(target, 2800')
    && watch.includes("shelf.id === 'replaysGrid' ? 1300 : 6500"),
  'watch shelves preview their overflow smoothly and yield to human control',
);
check(
  watch.includes('<span class="cue-scroll">Scroll</span><span class="cue-swipe">Swipe</span>')
    && watch.includes('.watch-shelf.no-overflow .watch-shelf-cue'),
  'watch shelves visibly explain horizontal browsing only when content overflows',
);
check(
  watch.includes('href="/watch/youtube" aria-label="See the full YouTube debates gallery"')
    && watch.includes('href="/watch/debatable" aria-label="See the full Debatable debates gallery"')
    && watch.includes("path === '/watch/youtube' ? 'youtube'")
    && watch.includes("data-watch-gallery=\"youtube\"")
    && watch.includes("data-watch-gallery=\"debatable\""),
  'each Watch source opens its own full gallery view',
);
check(
  watch.includes('body.social-watch .rail-list{display:grid;grid-template-columns:repeat(3,minmax(0,1fr))')
    && watch.includes('html[data-watch-gallery="debatable"] .watch-main{display:none}')
    && watch.includes('html[data-watch-gallery="youtube"] .watch-rail{display:none}'),
  'gallery views expand the selected source into a responsive grid',
);
for (const path of ['netlify.toml', 'app/netlify.toml']) {
  const redirects = read(path);
  check(
    /from = "\/watch\/youtube"[\s\S]{0,60}to = "\/watch\.html"[\s\S]{0,40}status = 200/.test(redirects)
      && /from = "\/watch\/debatable"[\s\S]{0,60}to = "\/watch\.html"[\s\S]{0,40}status = 200/.test(redirects),
    `${path} serves both Watch gallery routes`,
  );
}
check(inlineScriptsParse('app/watch.html'), 'app/watch.html inline scripts parse');

const liveRound = read('app/live-round.html');
check(
  (liveRound.match(/data-aud-tab=/g) || []).length === 2
    && liveRound.includes('data-aud-tab="comments"')
    && liveRound.includes('data-aud-tab="judge"')
    && !liveRound.includes('data-aud-tab="topics"')
    && !liveRound.includes('data-aud-tab="groups"'),
  'live-round audience deck only offers comments and judge notes',
);

const practice = read('app/practice.html');
check(
  practice.includes("if (!SR) {\n      if (canServer()) return startServer")
    && practice.includes("fetch('/api/transcribe'")
    && !practice.includes('Speech recognition not supported in this browser'),
  'practice records and transcribes when the browser has no SpeechRecognition API',
);
check(
  practice.includes('await rec.start(orb.getStream())')
    && practice.includes('text = await rec.stop()'),
  'practice reuses its open mic and waits for the final transcription segment',
);
check(
  practice.includes('Audio goes to OpenAI for transcription and is not saved by Debatable.'),
  'practice discloses server transcription while it is active',
);

const signupNudge = read('app/js/signup-nudge.js');
check(
  signupNudge.includes('(watch|leaderboard|messages|profile|tokens)') && signupNudge.includes('skip: true'),
  'read-only and account pages skip the timed signup overlay',
);

const notifications = read('app/js/notifications.js');
const friendsPage = read('app/friends.html');
const friendRequestSend = friendsPage.slice(friendsPage.indexOf('function sendRequest'), friendsPage.indexOf('function row'));
const ballotFriendFlow = liveRound.slice(liveRound.indexOf('function fillFriendSlot'), liveRound.indexOf('function renderBallotBody'));
const friendNotify = read('app/netlify/functions/notify-friend-request.mjs');
check(
  notifications.includes("db.collection('friendships')")
    && notifications.includes('data-friend-request-action="accept"')
    && notifications.includes('data-friend-request-action="deny"')
    && notifications.includes("filter === 'friends'")
    && notifications.includes('friendRows.length + dmUnread'),
  'friend requests are first-class actionable notifications with accept and deny controls',
);
check(
  !friendRequestSend.includes('dmPing(')
    && !ballotFriendFlow.includes('friendPing(')
    && !friendsPage.includes('They will see it on their friends page and in messages.'),
  'sending a friend request never manufactures a direct message',
);
check(
  friendNotify.includes("friendship.requestedBy !== callerUid")
    && friendNotify.includes("state[recipientUid] === 'accepted'")
    && friendNotify.includes("url: '/notifications?filter=friends'")
    && friendNotify.includes("path: '/api/notify-friend-request'"),
  'friend-request push verifies the pending relationship and opens the independent notification flow',
);
const socialDepth = read('app/css/social-depth.css');
check(
  friendsPage.includes('<h1 class="fr-head">Your friends</h1>')
    && !friendsPage.includes('People worth arguing with.')
    && !friendsPage.includes('Keep the people you meet')
    && !socialDepth.includes('.social-friends .fr-hero::after'),
  'friends opens with a compact utility header instead of a marketing hero',
);
check(inlineScriptsParse('app/friends.html'), 'app/friends.html inline scripts parse');
check(inlineScriptsParse('app/notifications.html'), 'app/notifications.html inline scripts parse');
check(
  notifications.includes("var DA_IOS_INSTALL_OFFER_KEY = 'da-ios-live-install-offer-v1'")
    && notifications.includes("var DA_IOS_ENABLE_OFFER_KEY = 'da-ios-live-enable-offer-v1'")
    && notifications.includes('DA_IOS_OFFER_SNOOZE_MS = 30 * 24 * 60 * 60 * 1000'),
  'signed-in iPhone live-alert offers are device-state-specific and snoozeable',
);
check(
  notifications.includes('if (!user || user.isAnonymous || daIsNative() || DA_ON_ROUND_PAGE) return;')
    && notifications.includes("var state = standalone ? 'enable' : 'install'"),
  'iPhone alert offer only targets named web users outside active rounds',
);
check(
  notifications.includes('Add Debatable to your Home Screen')
    && notifications.includes('Choose <b>Add to Home Screen</b>.')
    && notifications.includes('Notification.requestPermission()'),
  'iPhone alert offer teaches the Home Screen requirement and asks permission on a tap',
);
check(
  notifications.includes("navigator.serviceWorker.register('/sw.js', { scope: '/' })")
    && notifications.includes('return reg.pushManager.getSubscription()')
    && notifications.includes('daRegisterPush().then(function (saved)'),
  'iPhone alert setup registers a worker and verifies a saved push subscription before enabling',
);
check(
  notifications.includes("body: JSON.stringify({ format: format || 'casual'")
    && notifications.includes("if (standalone && (!window.Notification || !('PushManager' in window))) return;"),
  'iPhone alert setup defaults to casual rounds and hides on unsupported Home Screen apps',
);
const goLive = read('app/netlify/functions/go-live.mjs');
check(
  goLive.includes("body: 'Looking for someone to debate. Tap to jump in.'")
    && !/FORMAT_LABEL|APDA|Asian Parli|Public Forum/.test(goLive),
  'live-alert notification copy stays casual and format-free',
);
const manifest = JSON.parse(read('app/manifest.json'));
check(
  manifest.display === 'standalone' && manifest.scope === '/' && !/formats|debater|ballot/i.test(manifest.description),
  'installable app metadata supports iPhone push without retired product language',
);

const sharedUi = read('app/css/ui.css');
check(sharedUi.includes('height:44px;'), 'shared mobile topbar controls expose a 44px hit area');
// 2026-09-03: the header pager ("1 of 24" plus two small arrows) came off
// earlier today; later the same day the founder asked for buttons to step
// between the example rounds, so arrows ride the tiles instead, with no
// counter and no header row. Both halves are asserted.
check(
  !landing.includes('id="fsCount"')
    && !landing.includes('class="fs-board-top"')
    && landing.includes('id="fsPrev"')
    && landing.includes('id="fsNext"')
    && landing.indexOf('id="fsPrev"') > landing.indexOf('class="fs-board-hit"')
    && landing.indexOf('id="fsNext"') < landing.indexOf('<div class="fs-stage"')
    && landing.includes('function manual(dir)'),
  'landing steps the example rounds with on-tile arrows and no counter',
);
// 2026-09-03, the founder: "now add the 'watch' button". The first-screen
// Watch doors are always rendered (no [hidden]); the poll only upgrades them.
check(
  (landing.match(/<a class="fs-cta fs-cta--ghost fs-cta--watch" href="\/watch" data-fs-watch-live/g) || []).length === 2
    && !/data-fs-watch-live[^>]*\shidden/.test(landing)
    && landing.includes("b.classList.remove('is-live')"),
  'landing keeps a Watch door beside Join a debate',
);

const topbar = read('app/js/topbar.js');
const openRetiredAt = topbar.indexOf('RETIRED 2026-09-03');
const openReturnAt = topbar.indexOf('return;', openRetiredAt);
const openTimerAt = topbar.indexOf('var DWELL_MS', openRetiredAt);
check(
  openRetiredAt >= 0
    && openReturnAt > openRetiredAt
    && openReturnAt < openTimerAt
    && !topbar.includes("{ href: '/tournaments', label: 'Tournaments'")
    && !topbar.includes("['/tournaments',    'strong']"),
  'the Open popup and its shared navigation promotion stay retired',
);
check(
  !landing.includes('data-cta="open-strip"')
    && !landing.includes('Can I win money debating here?')
    && !landing.includes('>The Debatable Open</a>'),
  'landing does not advertise the Open',
);
for (const path of ['app/debate-online.html', 'app/debate-strangers.html', 'app/omegle-alternative.html']) {
  check(!read(path).includes('data-open-event-band'), `${path} has no Open campaign band`);
}
check(!read('app/community.html').includes('id="sideOpen"'), 'community has no Open campaign card');
check(!read('app/spar.html').includes('data-cta="spar-rail-tournaments"'), 'matchmaking rail has no cash-tournament promotion');
check(
  !read('app/netlify/functions/sitemap.mjs').includes("path: '/get-paid-to-debate'")
    && /from = "\/get-paid-to-debate"[\s\S]{0,100}to = "\/spar"[\s\S]{0,60}status = 301/.test(read('netlify.toml'))
    && /from = "\/get-paid-to-debate"[\s\S]{0,100}to = "\/spar"[\s\S]{0,60}status = 301/.test(read('app/netlify.toml')),
  'the prize-event SEO page is retired from discovery and redirects to the live product',
);
check(
  !landing.includes('landingSignOutBtn')
    && !landing.includes('renderUserChip')
    && topbar.includes("nameLink.href = '/profile'")
    && topbar.includes("ss.textContent = realUser ? 'Sign out'"),
  'landing profile chip leaves sign out inside the account sheet',
);
check(
  topbar.includes("{ href: '/friends', label: 'Friends'")
    && topbar.includes("{ href: '/', label: 'Debate', primary: true")
    && topbar.includes('var friends = nav.firstChild;')
    && !topbar.includes("{ href: '/', label: 'Home', match:"),
  'phone tabs put Friends in the old Home slot and make Debate the home control',
);
const nativeBridge = read('app/js/native-bridge.js');
check(
  nativeBridge.includes("{ href: '/friends', label: 'Friends'")
    && nativeBridge.includes("{ href: '/native', label: 'Debate', primary: true")
    && read('app/friends.html').includes('<script src="/js/native-bridge.js"></script>')
    && read('app/messages.html').includes('<script src="/js/native-bridge.js"></script>'),
  'native tabs expose Friends and use the raised Debate control as app home',
);
check(
  topbar.includes("{ href: '/challenges',  label: 'Claims & challenges', big: true }")
    && topbar.includes("['/challenges',     'big']")
    && !topbar.includes("['/live',           'big']")
    && !topbar.includes("{ href: '/live',          label: 'Schedule', strong: true }"),
  'navigation renders Claims & challenges as the Debate flagship',
);
check(
  topbar.includes("var AB_KEY = 'da-dark-nudge-ab-v2'")
    && topbar.includes("Math.random() < .5 ? 'prompt' : 'control'")
    && topbar.includes('dark_nudge_experiment_view')
    && topbar.includes('Change to dark mode?')
    && topbar.includes('}, 60000)')
    && topbar.includes("#daExpAsk,.signup-pill,.ditHP-card,.lpull,.da-livepop")
    && read('app/js/live-popup.js').includes("'.da-dark-nudge'"),
  'dark-mode prompt waits one minute and defers to other cards',
);
const matchDesk = read('app/spar.html');
check(
  matchDesk.includes('font-size:clamp(36px,4.5vw,68px);font-weight:750')
    && matchDesk.includes('font-size:21px;font-weight:750')
    && !matchDesk.includes('.mp-panel--hot')
    && !matchDesk.includes('.mp-opt--vsr')
    && !read('app/js/arcade-flow.js').includes('opt.kicker'),
  'Match Desk makes questions prominent and has no fight labels',
);
check(
  watch.includes('data-default-theme="crimson"')
    && watch.includes('data-theme-storage="da-watch-theme"')
    && watch.includes("localStorage.getItem('da-watch-theme') || 'crimson'")
    && topbar.includes("getAttribute('data-theme-storage')")
    && topbar.includes('localStorage.setItem(themeStorageKey, next)'),
  'Watch defaults dark and its shared toggle remembers an explicit Watch choice',
);
check(
  !watch.includes('/css/social-depth.css')
    && !watch.includes('id="uiNeuralCanvas"')
    && watch.includes("--font-body:'DM Sans'")
    && watch.includes("font-family:'Source Serif 4',Georgia,serif !important"),
  'Watch keeps the restrained editorial surface without decorative depth assets',
);
check(inlineScriptsParse('app/watch.html'), 'app/watch.html inline scripts parse');
const challenges = read('app/challenges.html');
check(
  !challenges.includes('data-force-theme="light"')
    && challenges.includes("localStorage.getItem('da-theme')")
    && challenges.includes('--paper:var(--bg'),
  'challenges supports the shared dark-mode preference',
);
const live = read('app/live.html');
check(
  challenges.indexOf('href="/challenges" aria-current="page">Challenges</a>') < challenges.indexOf('href="/live">Schedule</a>')
    && live.indexOf('href="/challenges">Challenges</a>') < live.indexOf('href="/live" aria-current="page">Schedule</a>'),
  'both paired page switches put Challenges before Schedule',
);
check(
  challenges.includes("var TABS = [")
    && !challenges.includes("label:'Live now'")
    && !challenges.includes("fetch('/api/async/feed'")
    && !challenges.includes("fetch('/api/recent-activity'")
    && challenges.includes("format: 'quick'")
    && challenges.includes('Need a date and time? Use the <a href="/live">Schedule tab</a> instead.'),
  'Challenges is a focused casual challenge board and Schedule owns dated rounds',
);
check(
  challenges.includes('.field input,.field textarea,.field select{font-size:16px}')
    && live.includes('.field input,.field textarea,.field select{font-size:16px}'),
  'challenge and schedule forms stay above the iOS auto-zoom threshold',
);
check(inlineScriptsParse('app/challenges.html'), 'app/challenges.html inline scripts parse');

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

for (const path of ['app/practice.html', 'app/pricing.html', 'app/predict.html', 'app/profile.html', 'app/native.html', 'app/spar.html']) {
  check(inlineScriptsParse(path), `${path} inline scripts parse`);
}

if (failures) process.exit(1);
