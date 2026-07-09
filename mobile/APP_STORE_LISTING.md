# DebateIt — App Store Listing (draft, ready to paste)

Copy for App Store Connect. Brand voice: punchy, debater-register, no
em-dashes, no banned phrases (see soul.md). Edit freely before submitting.

---

## Identity
- **App name:** DebateIt
- **Subtitle (30 char max):** Voice debate coach + rounds
- **Bundle ID:** com.debateai.debateit
- **Primary category:** Education
- **Secondary category:** Productivity
- **Age rating:** 4+ (no objectionable content)

## Promotional text (170 char, updatable anytime)
Argue out loud against an AI that pushes back, takes POIs, and grades you like
a real judge. Fifteen formats, six brains, a live coach in your pocket.

## Description
DebateIt is a voice-first debate trainer. Pick a motion, take a side, and
argue out loud against an opponent that actually fights back, takes your
points, interrupts, and writes the judge ballot when the round ends.

Built by a national debate champion, and format-accurate where it counts:
Asian Parliamentary, WSDC, BP, APDA, Policy, LD, PF, Congress, MUN, Karl
Popper, and Quick Clash, plus courtroom, negotiation, and pitch-defense
drills for professionals.

What you get:
- A live AI coach you can talk to any hour. It runs targeted drills, hears
  your speeches against a clock, and tells you exactly what to fix.
- Real speeches against a real timer, with pushback and POIs.
- A judge that flows the round and gives you a written ballot with reasons.
- Six AI brains and HD voices so no two opponents sound the same.
- A style profile that learns how you argue and sharpens every round.

Whether you compete, coach, or just want to think faster on your feet,
DebateIt gives you reps you cannot get anywhere else.

## Keywords (100 char, comma-separated, no spaces)
debate,speech,coach,APDA,parliamentary,argument,forensics,public speaking,LD,PF,MUN,rebuttal

## URLs
- **Support URL:** https://debateai.com/coach
- **Marketing URL:** https://debateai.com
- **Privacy Policy URL:** https://debateai.com/privacy

## What's New (v1.0)
First release. Your voice debate coach, live rounds, and AI judge, now on
your phone.

---

## App Privacy answers (App Store Connect questionnaire)

Data the app collects (be truthful; the site already discloses these in
/privacy — GA4, Firebase, Clarity behind a flag):

| Data type | Collected | Linked to user | Used for | Notes |
|---|---|---|---|---|
| Email address | Yes | Yes | App Functionality | Google / Apple sign-in |
| Name | Yes | Yes | App Functionality | display name from sign-in |
| User ID | Yes | Yes | App Functionality, Analytics | Firebase uid |
| Audio data | Yes | No | App Functionality | voice rounds; processed via OpenAI Realtime, not stored as raw audio for ads |
| Product interaction | Yes | Yes | Analytics, Product Personalization | rounds, features used |
| Crash data | Yes | No | App Functionality | |
| Performance data | Yes | No | Analytics | |

- **Tracking (IDFA / cross-app):** No. Do not enable App Tracking
  Transparency unless you add an ad SDK.
- **Third parties:** Google/Firebase (auth, analytics, messaging), OpenAI
  (voice), Google Analytics 4. All disclosed in /privacy.

Encryption: `ITSAppUsesNonExemptEncryption = NO` is set in Info.plist
(standard HTTPS only), so the export-compliance step is answered.

---

## Submit checklist (does the Xcode/ASC dance in order)
1. Paid Developer Program team selected in Xcode signing (Personal Team can't submit).
2. App Store Connect → New App → bundle `com.debateai.debateit`, name DebateIt.
3. Paste the copy above; add screenshots (6.9" iPhone; generate from the
   simulator with `xcrun simctl io booted screenshot`, then polish/frame).
4. Fill App Privacy with the table above.
5. Xcode → Product > Archive (Release, device target) → Distribute > App Store Connect.
6. In ASC, attach the build, answer export compliance (No), submit for review.
7. Sign in with Apple must be live before review (Apple 4.8) — see handover §5.
