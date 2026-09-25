import { readPageSource } from './lib/page-source.mjs';

const root = new URL('../', import.meta.url);
const read = (path) => readPageSource(new URL(path, root), 'utf8');
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
  !pricing.includes('NEEDS_TEAM') && !pricing.includes('billingSetup'),
  'pricing has no workspace-naming step between the button and Stripe',
);
check(
  pricing.includes('data-checkout="tokens"') && pricing.includes("'/api/tokens/checkout'"),
  'tokens buttons on pricing open Stripe directly',
);
check(
  pricing.includes('data.portal'),
  'an existing subscriber is routed to the billing portal, not a second checkout',
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

// Paid voice-token checkout stays available while betting is paused.
const tokensSurface = read('app/voice-tokens.html');
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
// The label is copy and changes (2026-09-05: the questions went funny); the
// guard is that a `learn` goal is still offered to newcomers.
check(/v:\s*'learn',\s*label:\s*'[^']{4,}'/.test(onboarding), 'web onboarding offers a newcomer goal');

const activeNavigationFiles = [
  'app/landing.html',
  'app/practice.html',
  'app/pricing.html',
  'app/profile.html',
  'app/voice-tokens.html',
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
    && landing.includes('data-community-join')
    && !landing.includes('id="lmQuick"'),
  'homepage keeps its community path without repeating the large door cards',
);
check(!landing.includes('data-cta="landing-quick-board"'), 'landing quick row does not duplicate the leaderboard below it');

const watch = read('app/watch.html');
const watchCss = read('app/css/watch-library.css');
const watchBrowse = read('app/js/watch-library.js');
check(
  (watch.match(/class="yt-card"/g) || []).length >= 27
    && (watch.match(/data-duration="[0-9]+" data-channel=/g) || []).length >= 27
    && !watch.includes('data-pan-shelf')
    && watchCss.includes('@media(prefers-reduced-motion:reduce)'),
  'Watch exposes a larger attributed example library without moving the browsing grid',
);
check(
  watch.includes('role="search"')
    && watch.includes('id="watchQuery"')
    && watch.includes('id="watchTopics"')
    && watch.includes('id="watchReset"')
    && watchBrowse.includes("query.addEventListener('input'")
    && watchBrowse.includes("document.addEventListener('watch:feed-updated', applyFilters)"),
  'Watch search and topic filters also apply when community recordings arrive',
);
check(
  watch.includes('href="/watch/youtube" data-watch-nav="youtube"')
    && watch.includes('href="/watch/debatable" data-watch-nav="debatable"')
    && watch.includes("path === '/watch/youtube' ? 'youtube'")
    && watch.includes("setAttribute('data-watch-view', mode || 'all')"),
  'each Watch source keeps its address and chooses its view before first paint',
);
check(
  watchCss.includes('grid-template-columns:repeat(3,minmax(0,1fr))')
    && watchCss.includes('html[data-watch-view="debatable"] .watch-main')
    && watchCss.includes('html[data-watch-view="youtube"] .watch-rail')
    && watchCss.includes('@media(max-width:520px)')
    && watchCss.includes('grid-template-columns:minmax(0,1fr)'),
  'Watch source views share a responsive video grid',
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
// Desktop, Android, native apps and installed iPhones share this opt-in.
// test-live-alert-setup.mjs exercises permission, registration and save
// failures; these checks keep the journey and platform doors discoverable.
const liveAlertOffer = notifications.slice(
  notifications.indexOf('function maybeOfferDeviceLiveAlerts(user)'),
  notifications.indexOf('// Broadcast side:'),
);
check(
  notifications.includes("var DA_IOS_INSTALL_OFFER_KEY = 'da-ios-live-install-offer-v1'")
    && notifications.includes("var DA_IOS_ENABLE_OFFER_KEY = 'da-live-enable-offer-v2'")
    && notifications.includes('DA_IOS_OFFER_SNOOZE_MS = 30 * 24 * 60 * 60 * 1000')
    && liveAlertOffer.includes('if (daOfferSnoozed(key)) return;'),
  'phone and desktop live-alert offers distinguish installation from enabling and respect snooze',
);
check(
  liveAlertOffer.includes('if (!user || user.isAnonymous || DA_ON_ROUND_PAGE || document.hidden || daVisibleModalUp()) return;')
    && liveAlertOffer.includes("native ? 'phone' : 'computer'")
    && liveAlertOffer.includes("var state = install ? 'install' : 'enable'")
    && liveAlertOffer.includes('!daBusyRound() && !daVisibleModalUp()'),
  'live-alert offers reach named phone and desktop users while deferring during rounds and other dialogs',
);
check(
  notifications.includes('Add Debatable to your Home Screen')
    && notifications.includes('Choose <b>Add to Home Screen</b>.')
    && notifications.includes('Notification.requestPermission()'),
  'iPhone alert offer teaches the Home Screen requirement and asks permission on a tap',
);
check(
  notifications.includes("navigator.serviceWorker.register('/sw.js', { scope: '/' })")
    && notifications.includes('return reg.pushManager.getSubscription().then(')
    && notifications.includes("if (!r || !r.ok) throw new Error('subscription_save_failed')")
    && notifications.includes('var setup = on ? daAskNotify() : Promise.resolve(true)')
    && notifications.includes('return setup.then(function (saved)'),
  'alert setup verifies device registration before saving the account opt-in',
);
check(
  notifications.includes("body: JSON.stringify({ format: format || 'casual'")
    && liveAlertOffer.includes('var install = !!(ios && !daStandalone() && !native)')
    && liveAlertOffer.includes("if (!install && !native && (!window.Notification || !('PushManager' in window) || !('serviceWorker' in navigator))) return;"),
  'alerts default to casual rounds, keep iPhone installation help and skip unsupported browser setup',
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
// Watch stays in the top menu, leaving the AI door beneath Meet someone.
check(
  !/<a\b[^>]*data-cta="(?:first-screen-watch|mhome-watch)"/.test(landing)
    && read('app/js/topbar.js').includes("{ href: '/watch',         label: 'Watch & clips', big: true }"),
  'landing keeps Watch in the top menu instead of the action rows',
);
// 2026-09-03, the founder: the live-right-now count is one plain red line
// with a blinking dot directly above the example board, not a pill in the
// CTA column.
check(
  // 2026-09-07: a visible pitch block lived between the wrap and the live
  // line for an hour and the founder cut it ("straight bad"). Comments may
  // sit there; no copy may.
  // Checked on a bounded slice with the comments stripped, not a file-wide
  // lazy regex: the nested `(?:<!--[\s\S]*?-->\s*)*` form backtracked for
  // ninety minutes the first time the structure changed (2026-09-07) and
  // hung every commit on the site.
  (function () {
    const wrapAt = landing.indexOf('<div class="fs-board-wrap">');
    const boardAt = landing.indexOf('<div class="fs-board" id="fsBoard"', wrapAt);
    if (wrapAt < 0 || boardAt < 0) return false;
    const above = landing.slice(wrapAt, boardAt).replace(/<!--[\s\S]*?-->/g, '');
    return /^<div class="fs-board-wrap">\s*<div class="fs-live-line"[^>]* data-live-now-wrap>/.test(above);
  })()
    && !landing.includes('class="fs-pitch"')
    && !landing.includes('fs-live-now--signed')
    && !landing.includes('class="fs-live-now"'),
  'landing puts the live count above the example board as a plain red line',
);
// The board leads, with Meet someone and Debate the AI below it.
check(
  /<div class="fs-board" id="fsBoard"[^>]*>[\s\S]*?<div class="fs-actions">\s*<a class="fs-cta fs-cta--primary"[^>]* href="\/spar"[\s\S]*?<div class="fs-actions-row">[\s\S]*?fs-cta--ai[\s\S]*?<\/div><!-- \/\.fs-board-wrap -->/.test(landing)
    && !landing.includes('<div class="fs-ctas">')
    && landing.includes('.fscreen-copy{display:none}')
    && !landing.includes('class="home-intro"')
    && landing.includes('<h1 class="fs-h1--sr">Debatable</h1>')
    && !/data-cta="first-screen-bet"/.test(landing)
    && /href="\/newvoice\?handoff=landing-quick-ai" data-cta="first-screen-ai" data-ai-invite><span class="ai-invite-label">Debate the AI<\/span><\/a>/.test(landing)
    && /href="\/newvoice\?handoff=landing-mobile-ai" data-cta="mhome-ai" data-ai-invite/.test(landing)
    && landing.includes('<link rel="stylesheet" href="/css/ai-invite.css">')
    && landing.includes('<script defer src="/js/ai-invite.js"></script>')
    && !landing.includes('mh-pitch'),
  'homepage keeps live debate and the original animated AI invitation',
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
  nativeBridge.includes("{ href: '/native', label: 'Home'")
    && nativeBridge.includes("{ href: '/friends', label: 'People'")
    && nativeBridge.includes("{ href: '/watch', label: 'Watch'")
    && nativeBridge.includes("{ href: '/profile', label: 'You'")
    && nativeBridge.includes("{ href: '/leaderboard', label: 'Leaderboard'")
    && nativeBridge.indexOf("label: 'Leaderboard'") > nativeBridge.indexOf("label: 'You'")
    && read('app/friends.html').includes('<script src="/js/native-bridge.js"></script>')
    && read('app/messages.html').includes('<script src="/js/native-bridge.js"></script>'),
  'native tabs expose Home, People, Watch, You, then Leaderboard with social pages connected',
);
check(
  topbar.includes("label: 'Debate live'")
    && topbar.includes("{ href: '/leaderboard', label: 'Leaderboard'")
    && !topbar.includes("['/live',           'big']")
    && !topbar.includes("{ href: '/live',          label: 'Schedule', strong: true }"),
  'navigation keeps live debate and rankings as core destinations',
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
    && watch.includes('/css/watch-library.css')
    && watchCss.includes("font-family:'Inter',Arial,sans-serif"),
  'Watch keeps its video-first surface without decorative depth assets',
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
    && challenges.includes("mode: 'live'")
    && challenges.includes('id="cTiming"')
    && challenges.includes('id="cWhen"'),
  'Challenges keeps a casual board with live or scheduled 1v1 creation',
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

for (const path of ['app/practice.html', 'app/pricing.html', 'app/voice-tokens.html', 'app/profile.html', 'app/native.html', 'app/spar.html']) {
  check(inlineScriptsParse(path), `${path} inline scripts parse`);
}

if (failures) process.exit(1);
