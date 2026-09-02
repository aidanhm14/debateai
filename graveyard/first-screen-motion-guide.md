# First-screen motion guide ("What would this look like?")

Removed from `app/landing.html` on 2026-09-02, per the founder: *"this is for when
users are in the actual debate not for advertising on the landing page get rid of
it."*

It was a small chip under the example-round motion on the first screen. Pressing it
opened a panel with two lines: **In practice** (what the policy would concretely do)
and **The clash** (the real disagreement). It rode 40 of the 24-card board's motions
via a `ROUND_GUIDES` lookup keyed on the motion string, and never showed on a
challenge card.

**Why it came out, and where it should go instead.** The read is genuinely useful,
but the audience for it is somebody who has to argue the motion in the next two
minutes, not a stranger deciding whether this site is worth a click. On the first
screen it asked a cold visitor to open a second thing before they had understood the
first. The natural home is the round itself (`/live-round`, `/practice`), beside the
resolution once the motion is settled.

**Restore notes.** Four pieces, all in `app/landing.html`, all inside the first-screen
board block: the CSS, the markup under `<h2 id="fsMotion">`, the `ROUND_GUIDES` map
plus its assignment loop, and three JS touchpoints (the `el` id list, the two click
handlers after the `tileA`/`tileB` guard, and the `guide` block at the top of
`paintRound`). If the copy is reused in-round instead, only the `ROUND_GUIDES` data
below matters; the chrome should be rebuilt against that page's tokens rather than
pasted, since this CSS hardcodes the board's warm-white-on-dark palette.

---

## Markup

```html
      <div class="fs-guide" id="fsGuide" hidden>
        <button type="button" class="fs-guide-btn" id="fsGuideBtn" aria-expanded="false" aria-controls="fsGuidePanel">
          What would this look like? <i aria-hidden="true">+</i>
        </button>
        <div class="fs-guide-panel" id="fsGuidePanel" role="note" hidden>
          <p><b>In practice</b><span id="fsGuidePractice"></span></p>
          <p><b>The clash</b><span id="fsGuideClash"></span></p>
        </div>
      </div>
```

## CSS

```css
  .fs-guide{position:relative;z-index:5;margin:-5px 0 13px;width:max-content;max-width:100%;cursor:default}
  .fs-guide[hidden],.fs-guide-panel[hidden]{display:none}
  .fs-guide-btn{
    display:inline-flex;align-items:center;gap:7px;padding:6px 9px;border-radius:8px;
    border:1px solid rgba(245,239,231,.23);background:rgba(245,239,231,.06);color:rgba(245,239,231,.82);
    font:700 .68rem/1.2 'Archivo',var(--font-body);cursor:pointer;letter-spacing:.01em
  }
  .fs-guide-btn:hover,.fs-guide-btn[aria-expanded="true"]{border-color:#f87171;color:#fff;background:rgba(248,113,113,.10)}
  .fs-guide-btn i{font-style:normal;font-size:.8rem;transition:transform .15s ease}
  .fs-guide-btn[aria-expanded="true"] i{transform:rotate(45deg)}
  [data-theme="light"] .fs-guide-btn{border-color:rgba(26,26,31,.2);background:rgba(26,26,31,.035);color:rgba(26,26,31,.74)}
  [data-theme="light"] .fs-guide-btn:hover,[data-theme="light"] .fs-guide-btn[aria-expanded="true"]{border-color:#dc2626;color:#991b1b;background:rgba(220,38,38,.06)}
  .fs-guide-panel{
    position:absolute;left:0;top:calc(100% + 8px);z-index:6;width:min(540px,calc(100vw - 56px));box-sizing:border-box;
    padding:12px 13px;border:1px solid rgba(248,113,113,.42);border-radius:11px;
    background:#201f24;color:#f5efe7;box-shadow:0 18px 42px rgba(0,0,0,.48);text-align:left
  }
  [data-theme="light"] .fs-guide-panel{background:#fffdf9;color:#1a1a1f;border-color:rgba(220,38,38,.3);box-shadow:0 18px 42px rgba(24,22,28,.18)}
  .fs-guide-panel p{display:grid;grid-template-columns:70px 1fr;gap:9px;margin:0;font-size:.72rem;line-height:1.45}
  .fs-guide-panel p + p{margin-top:8px;padding-top:8px;border-top:1px solid rgba(127,127,127,.24)}
  .fs-guide-panel b{font-size:.59rem;line-height:1.7;letter-spacing:.08em;text-transform:uppercase;color:#f87171}
  [data-theme="light"] .fs-guide-panel b{color:#dc2626}
  @media(max-width:560px){
    .fs-guide-panel{width:calc(100vw - 48px)}
    .fs-guide-panel p{grid-template-columns:1fr;gap:2px}
  }
```

## JS

In the `el` id list:

```js
   'fsChalLine','fsChalAlt','fsChalNote','fsGuide','fsGuideBtn','fsGuidePanel',
   'fsGuidePractice','fsGuideClash']
```

Handlers, immediately after the `if (!tileA || !tileB) return;` guard:

```js
  if (el.fsGuideBtn){
    el.fsGuideBtn.addEventListener('click', function(ev){
      ev.preventDefault(); ev.stopPropagation();
      var open = el.fsGuideBtn.getAttribute('aria-expanded') !== 'true';
      el.fsGuideBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (el.fsGuidePanel) el.fsGuidePanel.hidden = !open;
    });
  }
  if (el.fsGuidePanel){
    el.fsGuidePanel.addEventListener('click', function(ev){ ev.preventDefault(); ev.stopPropagation(); });
  }
```

In `paintRound(i)`, right after `el.fsMotion.textContent = r.motion;`:

```js
    var guide = r.kind !== 'challenge' && r.guide;
    if (el.fsGuide){
      el.fsGuide.hidden = !guide;
      el.fsGuideBtn.setAttribute('aria-expanded', 'false');
      el.fsGuidePanel.hidden = true;
      if (guide){
        el.fsGuidePractice.textContent = guide.practice;
        el.fsGuideClash.textContent = guide.clash;
      }
    }
```

## The guide copy (`ROUND_GUIDES`) and its assignment loop

```js
  /* Some policies need one concrete picture before their two sides become
     obvious. The board exposes these as an optional explainer, never as a
     change to the motion itself. */
  var ROUND_GUIDES = {
    'In the US, social media algorithms should be regulated like tobacco.': {
      practice:'Platforms would face warning, disclosure, marketing and age rules built around the harms of addictive distribution. The motion does not require banning social media.',
      clash:'Whether the addiction and public-health comparison is strong enough to justify tobacco-style controls, or too blunt for a speech platform with useful functions.'
    },
    'In the US, every member of Congress should pass a public cognitive test to stay in office.': {
      practice:'Members would take the same independently administered test on a published schedule. Failing the agreed threshold would make them ineligible to continue serving.',
      clash:'Voter information and fitness for power versus test bias, medical privacy and the risk that whoever controls the test controls eligibility.'
    },
    'Globally, nobody should be allowed to become a billionaire.': {
      practice:'Wealth above one billion dollars would be taxed or transferred so no person could keep assets beyond the cap. It limits ownership, not the size of a company.',
      clash:'Concentrated power and redistribution versus investment incentives, valuation problems and ways people could route ownership around the ceiling.'
    },
    'In your country, owning more than five homes should be illegal.': {
      practice:'A person or company could own up to five residential properties and would have to sell any above the cap after a transition period.',
      clash:'Putting scarce homes back on the market versus rental supply, enforcement and whether large owners are the real cause of high prices.'
    },
    'In the US, healthcare should never depend on who your employer is.': {
      practice:'Changing or losing a job would not change whether someone has health coverage. Insurance could be public or private, but it would follow the person rather than the employer.',
      clash:'Job freedom and continuous coverage versus the bargaining power, financing and disruption involved in replacing employer plans.'
    },
    'Governments should ban anonymous social media accounts.': {
      practice:'Platforms would verify a real identity before an account could post. The motion can still allow a public screen name, but the platform would know who owns it.',
      clash:'Accountability and enforcement versus privacy, whistleblowing, vulnerable speakers and the security risk of identity databases.'
    },
    'Globally, AI companies should pay the creators whose work trains their models.': {
      practice:'Commercial AI training would require a licensing or collective-payment system for copyrighted writing, images, music and other creative work used in the dataset.',
      clash:'Payment for value taken from creators versus the cost of tracing inputs, access to knowledge and whether learning from public work should require a license.'
    },
    'In the US, the federal government should keep funding Ukraine at current levels.': {
      practice:'Congress would maintain the present scale of American military, financial and humanitarian support rather than materially raise or cut it.',
      clash:'Deterrence, alliance credibility and Ukrainian defense versus cost, escalation risk, oversight and what endpoint continued support is meant to reach.'
    },
    'In the US, billionaires should be barred from owning news outlets.': {
      practice:'A person with at least one billion dollars in wealth could not hold controlling ownership of a newspaper, television news network or major digital newsroom.',
      clash:'Editorial independence and concentrated power versus property rights, newsroom financing and whether ownership rules would reduce the number of outlets.'
    },
    'Companies that replace workers with AI should pay to retrain them.': {
      practice:'When automation eliminates a job, the company receiving the savings would fund approved training or transition support for the displaced worker.',
      clash:'Putting transition costs where productivity gains land versus defining replacement, choosing useful training and discouraging adoption or hiring.'
    },
    'Your country should build nuclear power instead of more wind and solar.': {
      practice:'New public support and grid investment would prioritize nuclear plants over adding more wind and solar capacity. Existing renewable projects would not automatically close.',
      clash:'Reliable low-carbon power and land use versus build time, cost, waste, flexibility and the speed of renewable deployment.'
    },
    'Rich countries should take in people displaced by climate change.': {
      practice:'Wealthy, high-emitting countries would create legal visas and resettlement places for people forced to leave homes by rising seas, drought or climate disasters.',
      clash:'Responsibility and protection versus capacity, proof of climate displacement, cost and how places would be allocated among countries.'
    },
    'In the US, political leaders should face a maximum age limit.': {
      practice:'Federal elected offices would carry a fixed age ceiling applied at the start of a term, regardless of an individual candidate\'s health or election result.',
      clash:'Predictable fitness safeguards and generational turnover versus voter choice, arbitrary cutoffs and the difference between age and ability.'
    },
    'Rich countries should pay reparations to countries they colonized.': {
      practice:'Former colonial governments would fund negotiated state-to-state payments, debt relief or infrastructure in countries they ruled. The program would need a defined amount and endpoint.',
      clash:'Historical responsibility and compounding extraction versus present-day taxpayers, which governments receive funds and how a debt is fairly settled.'
    },
    'In the US, every law should expire after ten years unless Congress passes it again.': {
      practice:'Federal laws would carry a ten-year sunset date. Congress would have to vote again before each law could stay in force.',
      clash:'Clearing obsolete law and forcing review versus legislative overload, instability and essential rules expiring because the calendar ran out.'
    },
    'Globally, cash should be abolished.': {
      practice:'Physical notes and coins would stop being legal payment after a transition, leaving cards, bank transfers and other digital methods.',
      clash:'Tax enforcement, theft and payment efficiency versus privacy, access without a bank or signal, resilience and government control over transactions.'
    },
    'In the US, voting should require passing the citizenship test.': {
      practice:'Eligible voters would have to pass the same civics test used in naturalization before registering or renewing their registration.',
      clash:'A minimum of civic knowledge versus discriminatory administration, unequal access and whether political rights can depend on passing a test.'
    },
    'In the US, federal elections should use ranked-choice voting.': {
      practice:'Voters would rank candidates. If nobody won a majority, the lowest candidate would be eliminated and those ballots would move to each voter\'s next choice until someone won.',
      clash:'Broader support and fewer spoiler effects versus ballot complexity, counting trust and whether exhausted rankings distort the final result.'
    },
    'In the US, all drugs should be decriminalised.': {
      practice:'Possessing a small amount for personal use would no longer bring criminal punishment. Production and sale could remain regulated or illegal, so this is not automatic legalization.',
      clash:'Reducing incarceration and treating use as health policy versus deterrence, public disorder and where possession ends and distribution begins.'
    },
    'In the US, the Electoral College should be abolished.': {
      practice:'The presidency would go to the candidate who receives the most votes nationwide, replacing state-by-state electoral votes.',
      clash:'Equal weight for every vote versus federalism, regional coalition building, recount scale and the political power of smaller states.'
    },
    'In your country, the state should stop funding religious schools.': {
      practice:'Public money, including direct grants and tuition vouchers, would no longer support schools run by religious organizations. Families could still attend them privately.',
      clash:'State neutrality and public accountability versus parental choice, equal treatment and the cost of moving pupils into state schools.'
    },
    'In the US, the federal government should impose a 10 percent tariff on all imported goods.': {
      practice:'A ten percent border tax would apply to nearly every imported product, regardless of its country of origin, with the revenue collected by the federal government.',
      clash:'Domestic production and bargaining leverage versus higher consumer prices, retaliation, supply chains and whether protected firms become competitive.'
    },
    'In the US, Supreme Court justices should serve eighteen-year terms instead of life.': {
      practice:'Each justice would leave active service after eighteen years, with appointments staggered so a vacancy normally opens every two years.',
      clash:'Regular democratic turnover and less strategic retirement versus judicial independence, constitutional change and appointments becoming more political.'
    },
    'In the US, families should be allowed to use public education funding for private-school tuition.': {
      practice:'A state would let a family redirect part of the public funding attached to their child toward tuition at an eligible private school.',
      clash:'Choice and an exit from a failing school versus public-school budgets, unequal access, admissions rules and accountability for public money.'
    },
    'In the US, presidential and congressional campaigns should be publicly funded, with private donations banned.': {
      practice:'Qualifying candidates would receive public campaign money under the same formula and could not accept donations from individuals, companies or political committees.',
      clash:'Equal access and less donor influence versus political speech, taxpayer support for disliked candidates and independent spending outside campaigns.'
    },
    'In your country, every young adult should complete one year of national or community service.': {
      practice:'After school, each young adult would spend one paid year in military, emergency, care, environmental or community work, with narrow medical exemptions.',
      clash:'Shared civic duty, skills and social mixing versus forced labor, delayed education or work, unequal burdens and the quality of placements.'
    },
    'In your country, annual rent increases should be capped at the rate of inflation.': {
      practice:'For an existing tenancy, a landlord could raise rent no faster than the official inflation rate each year, with rules for major renovations and new construction.',
      clash:'Stability and protection from displacement versus housing supply, maintenance, financing costs and landlords leaving the rental market.'
    },
    'In your country, homes left vacant for most of the year should face a special tax.': {
      practice:'Residential property that is unoccupied beyond a set number of months would pay an additional annual tax, with exemptions for renovation, sale and temporary absence.',
      clash:'Returning scarce homes to use versus privacy, measurement, legitimate second homes and whether vacancy is a major cause of high prices.'
    },
    'Cities should charge cars to enter crowded downtown areas.': {
      practice:'Drivers would pay a daily fee to enter a defined central zone at busy times. Revenue would normally support transit and street improvements.',
      clash:'Less traffic, cleaner air and faster travel versus fairness to workers, business effects, surveillance and the quality of alternatives to driving.'
    },
    'Public schools should group students into classes by academic ability.': {
      practice:'Students would take some core classes in different groups based on current attainment, with regular reviews and a path to move between groups.',
      clash:'Teaching at an appropriate pace versus labeling, biased placement, weaker instruction in lower groups and lost benefits from mixed classrooms.'
    },
    'Public schools should be allowed to replace some classroom lessons with AI tutors.': {
      practice:'Schools could assign supervised AI-led lessons or practice for part of the timetable while teachers monitor progress and remain responsible for the course.',
      clash:'Personalized pace and immediate help versus unreliable answers, privacy, weaker human relationships and pressure to replace teachers for cost.'
    },
    'Social media platforms should be required to verify every user\'s age.': {
      practice:'Before an account could post or view age-limited material, the platform would have to confirm age through an ID, trusted third party or another reliable check.',
      clash:'Real child-safety enforcement versus identity collection, privacy, exclusion and whether verification tools can be both accurate and anonymous.'
    },
    'Social media platforms should ban paid political advertising.': {
      practice:'Candidates, parties and outside groups could post ordinary content but could not pay a platform to distribute a political message to selected users.',
      clash:'Hidden targeting and misinformation versus challenger access, political speech, enforcement and the advantage retained by famous candidates.'
    },
    'Governments should ban companies from selling precise location data.': {
      practice:'Apps, data brokers and advertisers could not sell or transfer a person\'s detailed movement history for money. Narrow operational and emergency uses could remain.',
      clash:'Safety and meaningful privacy versus ad-funded services, consent, useful research and where precise location ends and ordinary analytics begin.'
    },
    'Governments should be forbidden from requiring encrypted messaging services to create backdoors.': {
      practice:'A government could use warrants and device searches, but it could not force a messaging provider to build a special technical route around end-to-end encryption.',
      clash:'Security for every user versus access to evidence, whether exceptional access can stay controlled and who bears the harm when investigations fail.'
    }
  };
  for (var guideI = 0; guideI < ROUNDS.length; guideI++) {
    if (ROUND_GUIDES[ROUNDS[guideI].motion]) ROUNDS[guideI].guide = ROUND_GUIDES[ROUNDS[guideI].motion];
  }
```
