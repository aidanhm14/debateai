import fs from 'node:fs';

const source = fs.readFileSync(new URL('../app/js/auth-modal.js', import.meta.url), 'utf8');
const landing = fs.readFileSync(new URL('../app/landing.html', import.meta.url), 'utf8');
const signupNudge = fs.readFileSync(new URL('../app/js/signup-nudge.js', import.meta.url), 'utf8');
const experienceAsk = fs.readFileSync(new URL('../app/js/experience-ask.js', import.meta.url), 'utf8');
const audienceMode = fs.readFileSync(new URL('../app/js/audience-mode.js', import.meta.url), 'utf8');
const livePull = fs.readFileSync(new URL('../app/js/live-pull.js', import.meta.url), 'utf8');
let failures = 0;

function check(condition, label) {
  if (condition) {
    console.log('PASS', label);
    return;
  }
  failures += 1;
  console.error('FAIL', label);
}

function functionBody(name, nextName) {
  const start = source.indexOf(`  function ${name}(`);
  const end = source.indexOf(`\n  function ${nextName}(`, start + 1);
  return start >= 0 && end > start ? source.slice(start, end) : '';
}

const finish = functionBody('finishSignIn', 'handOff');
const handoffAt = finish.indexOf('if (handOff(method)) return;');
const closeAt = finish.indexOf('forceClose();', handoffAt);
const navigateAt = finish.indexOf('window.location.href', handoffAt);

check(!!finish, 'finishSignIn is present');
check(
  handoffAt >= 0 && closeAt > handoffAt && navigateAt > closeAt,
  'ordinary sign-in closes the modal before same-page navigation',
);
check(
  finish.indexOf('var nextDestination', handoffAt) > handoffAt
    && finish.indexOf('var nextDestination', handoffAt) < closeAt
    && /window\.location\.href\s*=\s*nextDestination/.test(finish),
  'gated sign-in captures its destination before modal cleanup',
);
check(
  source.includes("destinationOverride = safeDestination(opts && opts.destination);")
    && source.includes('if (parsed.origin !== window.location.origin) return'),
  'gated sign-in accepts only a same-origin destination',
);

const google = functionBody('doGoogle', 'doAppleSignIn');
check(
  /attempt\.then\(function \(\) \{[\s\S]*?finishSignIn\('google'\);/.test(google),
  'successful Google popup sign-in uses the guarded completion path',
);

// Phone sign-in was retired 2026-09-03 (Aidan: Google plus whatever else is
// quick, not text and not phone). The check that used to pin its reCAPTCHA
// and link-collision recovery now pins its absence, so a stale branch
// cannot rebase it back in.
check(
  !/PhoneAuthProvider|RecaptchaVerifier|function doPhoneStart|function doPhoneCode/.test(source),
  'phone sign-in stays retired from the shared chooser',
);
check(
  source.includes('var noEmail = true;')
    && source.includes('var providerButtons = googleBtn + appleBtn + discordBtn;')
    && source.includes('var DISCORD_SIGNIN_READY = false;')
    && !source.includes("Use email below, or open the site in Safari or Chrome."),
  'the public web chooser offers Google and Apple, Discord behind its ready flag, and no email door (2026-09-04)',
);
check(
  source.includes('#ditAuth{position:fixed;inset:0;z-index:2147483600;display:none;align-items:center;justify-content:center')
    && source.includes("'Sign in to Debatable'")
    && source.includes('The same button signs you in or creates your account. No password to remember.'),
  'the shared web sign-in is a centered Google dialog for new and returning accounts',
);
check(
  source.includes('var appleBtn = !googleOnly')
    && source.includes('Continue with Apple'),
  'Apple renders on web and in the iOS shell (2026-09-04); the App Store option is intact',
);
check(
  experienceAsk.includes('Are you a competitive debater or new?')
    && experienceAsk.includes('Either is fine. This only helps us explain ideas clearly.')
    && experienceAsk.includes('Competitive debater')
    && experienceAsk.includes('New to debate'),
  'the experience ask states its plain-language purpose',
);
check(
  experienceAsk.includes('var ASK_AFTER_MS = 60000;')
    && experienceAsk.includes("sessionStorage.getItem(SPENT)")
    && experienceAsk.includes('if (document.hidden) return;')
    && !experienceAsk.includes('}, 2200);'),
  'the experience ask waits for one cumulative visible minute',
);
check(
  /function plainActive\(\) \{\s*return read\(\) !== 'competitive';\s*\}/.test(audienceMode),
  'unanswered visitors get the accessible plain-language mode by default',
);

const communityJoinLinks = landing.match(/<a[^>]+data-community-join[^>]*>/g) || [];
check(
  communityJoinLinks.length === 2
    && communityJoinLinks.every((link) => /href="\/community"/.test(link)),
  'landing community join CTAs are marked for the sign-in gate',
);
check(
  landing.includes("closest('[data-community-join]')")
    && landing.includes("window.openAuthModal('signin', destination ? { destination: destination } : undefined)"),
  'landing community join gate opens auth and resumes at Community',
);
check(
  signupNudge.includes("if (device !== 'desktop')")
    && /iPhone\|iPad\|iPod/.test(signupNudge)
    && signupNudge.includes("navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1"),
  'proactive Google One Tap is desktop-only and excludes iOS and iPadOS',
);
check(
  livePull.includes("window.addEventListener('debatable:authmodal-open'")
    && livePull.includes('if (card.parentNode) card.remove();'),
  'the landing live nudge yields to the centered sign-in dialog',
);

if (failures) process.exit(1);
