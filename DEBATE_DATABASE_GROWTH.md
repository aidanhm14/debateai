# Growing the DebateIt database by email

> How we turn the Debate Atlas from a map of programs into a network of
> partnered teams, one honest email at a time. This is the plan the atlas
> outreach flow (the "Compose to…" buttons on `/atlas`) is built around,
> and it's why those emails read the way they do.

## The goal

Grow two linked databases:

1. **The Atlas** — every debate program on Earth as a pin (schools with a
   program, and, via the community layer, schools without one yet).
2. **Partnered teams** — programs actually using DebateIt to drill.

Email is the bridge: a program is a *pin* until a coach says yes, then
it's a *partner*. The whole pipeline is one field on each pin:
**Prospect (red) → Reached out (blue) → Partnered (green).**

## The unit of growth is the coach, never the student

We email **coaches and program leads**, not minors. A coach can opt a
whole squad in with one reply; students never get cold-emailed. Every
address we use is a **public, professional** one (school directory,
Tabroom paradigm, league listing), not scraped personal contacts.

## Where the emails come from

In priority order, all public sources:

1. **Tabroom** — coach paradigms and school pages list program contacts.
   (`~/debateit-outreach/pull_tabroom.py` already pulls program/coach
   research.)
2. **NSDA school map / league rosters** — member schools + program type.
3. **State/national league directories** (NSDA, NDCA, urban leagues,
   WSDC national bodies, APDA/BP circuit lists).
4. **School staff directories** — the debate/speech coach's work email.
5. **Community submissions** — the `/atlas` "Add your program" flow (now
   with a has-program vs no-program-yet flag).

Emails live admin-only in Firestore (`atlas_contacts/emails`), keyed by
normalized school name, surfaced on the pin card when signed in as admin.

> **Never fabricate or guess an address.** A wrong send burns sender
> reputation and the recipient's trust. If a school has no verified email,
> the card shows a "find email" search link instead — a human confirms it
> before it enters the database.

## Sequencing the outreach

Work highest-leverage first so early wins seed social proof:

1. **Tier-1 flagship programs** (national circuit, big squads) — one
   partnered flagship per region is a reference for the rest.
2. **By region / circuit**, so a coach who bites can point peers on the
   same circuit (word-of-mouth compounds within a league).
3. **Gap schools** (community "no program yet" pins) — a different email:
   "here's a free way to start a program," routed to the interested
   student/parent/teacher who added the pin.

## The email design (and why)

Every outreach email carries five beats, in this order:

1. **Who + credibility** — Aidan, national APDA champion at UChicago,
   founder. One line. Real person, real credential.
2. **How a round works** — motion → side → timed speeches out loud →
   AI opponent that takes POIs and interrupts → a full judge ballot
   (winner, why, speaker points), format-accurate to their circuit.
3. **The idea** — practice needs an opponent, a clock, and a judge, and
   most teams can't get all three on demand. DebateIt gives every squad
   all three. Free while in beta.
4. **The community / why now** — this is the network beat. We're building
   a community, not just a solo tool. The more teams that join, the better
   the live human-vs-human rounds and the global leaderboard get: real
   opponents on demand and a genuine cross-circuit ranking. Joining early
   helps seed that for their region, which is the honest "why now." No
   traction numbers, ever.
5. **Data purpose + transparency** — *why they're getting this*: we're
   mapping every program into a free public Atlas so debaters find teams
   and coaches find each other; their school is already a pin; the
   address is only used for this note, never sold or shared, and one
   "stop" reply opts them out.

Beats 4 and 5 are what this plan adds to the templates. The community beat
gives a reason to join *now* (the network gets better as it grows); the
data beat sets context (not spam), states the mission, and handles
consent/compliance up front.

House rules: no em-dashes, no hype words, value-first not feature-dump,
one clear ask. Subject leads with the benefit: *"Free timed-round
practice for [school]'s debaters."*

## Consent, compliance, and honesty

- **Public addresses only**, professional/coach contacts, opt-out in the
  first email (one-reply unsubscribe), honor it immediately.
- **CAN-SPAM basics**: identify the sender, be truthful, provide a way to
  stop. (For volume, add a physical mailing address footer.)
- **AI only surfaces public leads.** The tool proposes candidates; a
  human reviews and decides every send. No faked intimacy, no
  overclaiming a relationship that doesn't exist.

## Cadence, follow-up, tracking

- **Compose auto-marks a pin "Reached out" (blue).** Partnered is set by
  hand when a coach says yes.
- **Follow-up guardrail** (mirror the investor-outreach rule): a cooldown
  between touches and a hard touch cap; only a genuinely new reason
  (a feature they asked about, a new season) earns a second email.
- **Track**: emails sent, reply rate, prospect→reached-out→partnered
  conversion, and net new pins per week. The `/admin` and the atlas
  legend already surface the pipeline counts.

## Multi-model consult (Gemini, Grok, GPT-5.5) — 2026-07-01

Ran the plan past three models. Where they converged, it's folded in above
or listed here as next moves:

- **Tiered, low-friction ask.** Don't open with "opt your whole squad in."
  Offer the small pilot instead: "could two or three debaters try one round
  this week and tell me what breaks?" (Now the CTA in both templates.) A
  second, even-lower-friction ask is Atlas listing verification, which grows
  the database even on a no.
- **Personalize with one sourced detail** — format, a recent tournament
  (Tabroom), league, or novice program. One concrete line lifts replies
  more than anything else. No fabricated familiarity.
- **Segment by format + season** — a PF coach, an APDA captain, and a new
  program sponsor should not get the same pitch.
- **Short follow-up sequence, not a hard stop.** One value-add follow-up
  (a motion pack, a peer coach who joined) around day 7-10, then stop unless
  they reply. Two touches total.
- **Pilot → testimonial → light social proof.** Recruit 3-5 pilot programs,
  ask for a quote at onboarding, then (only once real) add "programs on the
  [circuit] are already using it." Never invent numbers.
- **Deliverability + compliance before volume**: SPF, DKIM, DMARC, bounce
  handling, a suppression list, a daily send cap, a physical mailing address
  in the footer, and honoring opt-outs within 10 business days
  (FTC CAN-SPAM guide).

**Open tension (founder decides).** All three models advised *shortening*
the email and moving the community / leaderboard / live-human-rounds pitch
*out of the first touch* — a cold coach may read "global leaderboard for my
minors" as a moderation/safety/distraction flag before they trust the tool.
That conflicts with the current direction (community beat kept in every
email). It stays in for now; revisit if reply rates lag. GPT also flagged
"your school is already a pin" as faintly surveillance-y, so the data line
was softened to "I found a public listing for [school] while building a
free Atlas."

## What "done" looks like

A coach opens the email, understands in ten seconds what DebateIt is and
why they got the note, tries a round, and opts their squad in — turning a
red pin blue, then green. Repeat across circuits until the map fills in.
