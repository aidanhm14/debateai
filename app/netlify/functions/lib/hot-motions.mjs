// hot-motions.mjs, the argument bank for people who are not debaters.
//
// WHY THIS EXISTS, AND WHY IT IS NOT THE OTHER BANK
//
// `daily-motion-bank.mjs` and `motion-library.mjs` hold competitive
// motions in tournament phrasing, with research briefs. They are built
// for someone who owns a flow pad. This bank is built for someone who
// has never heard the word motion and would still argue about the thing
// below at one in the morning.
//
// It exists for the betting surfaces, and that changes the design rule
// in a way worth stating plainly: A MARKET NEEDS A SPLIT. A motion
// everyone already agrees with is a dead book. Nobody takes the other
// side of "kicking dogs is wrong", so the pool never fills, the odds
// never move, and the card is a poster rather than a market. So every
// entry here is chosen for the property that a normal room divides on
// it, roughly down the middle, without anybody needing to look anything
// up first.
//
// THE LINE, and it is a business line as much as a taste one.
// These attack BEHAVIOUR, NORMS AND CHOICES. They never attack an
// identity: not race, religion, sexuality, gender, disability or
// nationality. That is not squeamishness. A book built on identity bait
// loses its payment processor, its app store listing and every brand
// deal, and it recruits the audience that kills the product for
// everyone else. Heat comes from the dilemma, never from the target.
//
// `split` is the honest guess at how a general audience divides, and it
// is the field to sort on when picking what to open. Anything outside
// roughly 35/65 makes a lopsided market and belongs lower in the queue.
// `heat` is how hard people argue, not how offensive it is.
//
// Schema matches MOTION_BANK in predict.mjs exactly ({ m, pro, con }),
// plus the two sort fields, so this drops straight into that pool.

export const HOT_MOTIONS = [
  // ── Loyalty, and who you owe ────────────────────────────────────
  { m:'You should tell your friend their partner is cheating.', split:55, heat:5, tag:'loyalty',
    pro:'Letting someone build a life on a lie to spare yourself an awkward hour is cowardice wearing the costume of kindness.',
    con:'You will be the villain in a story that survives you, the couple stays together, and you traded a friendship for information they mostly already suspected.' },
  { m:'Reading your partner\'s phone is sometimes justified.', split:48, heat:5, tag:'loyalty',
    pro:'A relationship where the truth is only available by asking a person with a motive to lie is not a relationship, it is a hostage situation.',
    con:'The moment you need to search is the moment the answer is already in. You did not find the truth, you found a reason to stop pretending.' },
  { m:'You owe your family nothing if they were bad to you.', split:52, heat:5, tag:'family',
    pro:'Obligation you did not consent to is not a debt, and biology is not a contract that survives what they did with it.',
    con:'Nothing is a big word. The people who raised you badly still carry the only memory of your childhood, and cutting that off costs you something you cannot buy back.' },
  { m:'Cutting off a parent is usually the right call when they will not change.', split:46, heat:5, tag:'family',
    pro:'Waiting for a person to become someone else is a way of spending your thirties on a bet that has already lost.',
    con:'People change at seventy for reasons nobody predicts, and the estrangement industry sells permanence to people in a bad month.' },
  { m:'Lending money to friends ruins friendships and you should never do it.', split:50, heat:4, tag:'money',
    pro:'The loan converts an equal into a debtor, and every dinner after it has a price tag sitting silently on the table.',
    con:'If your friendship cannot survive four hundred dollars, the money was never the fragile part, and refusing on principle is just wealth with a rule attached.' },

  // ── Money and status ────────────────────────────────────────────
  { m:'Telling people your salary should be normal.', split:52, heat:4, tag:'money',
    pro:'Pay secrecy is a policy your employer wrote for your employer, and you have been taught to defend it as manners.',
    con:'The person who finds out they are paid less does not get a raise, they get a year of resentment and a worse relationship with everyone in the room.' },
  { m:'Tipping culture should be abolished, even if service workers earn less at first.', split:49, heat:5, tag:'money',
    pro:'A wage that depends on whether a stranger liked your face is not a wage, it is a performance review conducted by drunk people.',
    con:'Easy to say when it is not your rent. Every abolition proposal ends with the restaurant keeping the difference and the server absorbing the experiment.' },
  { m:'Inheriting money is unearned and should be taxed close to nothing being passed on.', split:44, heat:5, tag:'money',
    pro:'Nothing about who your parents were is a thing you did, and a society that lets that compound stops being a race and becomes a seating chart.',
    con:'The money was already taxed when it was earned, and the people who actually get caught by this are families with one house, not families with a foundation.' },
  { m:'Splitting the bill evenly when you ordered less is a scam you should refuse to pay.', split:50, heat:4, tag:'etiquette',
    pro:'Subsidising someone else\'s steak because you did not want to seem difficult is how you end up resenting your own friends over eleven dollars.',
    con:'Itemising a group dinner is a way of announcing that you are keeping score, and the friendship costs more than the difference every single time.' },
  { m:'You should not have children if you cannot comfortably afford them.', split:47, heat:5, tag:'family',
    pro:'Choosing to make a person who will grow up watching their parents panic about money is a decision made for you and paid for by them.',
    con:'Comfortably is doing enormous work in that sentence, and by that standard most of the people reading it would never have been born.' },

  // ── Work ────────────────────────────────────────────────────────
  { m:'Quiet quitting is just doing your job and there is nothing wrong with it.', split:53, heat:4, tag:'work',
    pro:'You agreed to a job description and a wage. The extra was never in the contract, it was extracted by implication.',
    con:'Every career you admire was built in the hours nobody paid for up front, and doing the minimum is a strategy that works right up until the layoff list.' },
  { m:'Working for a company you find unethical is a personal moral failure.', split:45, heat:5, tag:'work',
    pro:'The ethics of an institution are made entirely of the choices of the people who agree to show up, and a paycheque is not a moral airlock.',
    con:'This is a tax on the poor. The person with savings gets to have principles, and the person with a visa and a sick parent gets called complicit.' },
  { m:'Bosses should be allowed to fire someone for what they post publicly.', split:49, heat:5, tag:'work',
    pro:'Speech has never meant freedom from other people reacting to it, and a company is other people.',
    con:'It hands a private employer the power to police the political opinions of anyone who needs to eat, which is a bigger power than most governments claim.' },
  { m:'Unpaid internships should be illegal.', split:58, heat:4, tag:'work',
    pro:'It is a straightforward sale of career access to whoever can afford to work for free, and it launders class into merit.',
    con:'Ban it and the roles do not become paid, they disappear, and the informal version returns as a favour for whoever the boss already knows.' },

  // ── The internet ────────────────────────────────────────────────
  { m:'Posting a stranger\'s bad behaviour online is vigilantism and you should not do it.', split:48, heat:5, tag:'internet',
    pro:'You appointed yourself judge over a ten second clip, and the sentence you handed down is permanent and served by everyone who knows them.',
    con:'Before phones, the powerful behaved badly in front of witnesses who could not prove anything. The camera is the only accountability some people will ever face.' },
  { m:'Cancelling people works and is a legitimate tool.', split:47, heat:5, tag:'internet',
    pro:'It is just consequences arriving at a class of person who spent centuries exempt from them, and the outrage is mostly about who is finally exposed.',
    con:'It is a system with no appeal, no proportionality and no way home, and it lands hardest on the people with the least distance from their next paycheque.' },
  { m:'Parents posting their kids online is a form of exploitation.', split:56, heat:5, tag:'internet',
    pro:'A child cannot consent to a permanent public record, and the ones monetised at four are only now old enough to say what it cost them.',
    con:'Every generation has photographed its children and shown them to everyone it knows. The internet changed the distance, not the act.' },
  { m:'Anonymous accounts do more harm than good and platforms should require real names.', split:45, heat:4, tag:'internet',
    pro:'Almost everything vile you have read online was written by someone who would never sign it, and the mask is the whole mechanism.',
    con:'Real names protect the already safe. Take anonymity away and the first people to go quiet are whistleblowers, abuse survivors and anyone with a boss.' },
  { m:'Using AI to write your wedding speech is fine.', split:50, heat:4, tag:'internet',
    pro:'Nobody objects when you use a template, hire a photographer, or steal a line from a film. The sentiment is yours, the phrasing was always borrowed.',
    con:'The entire value of the speech is that a specific person sat down and struggled to say what you mean to them. Outsource that and you have delivered a card.' },

  // ── Friendship and the social contract ──────────────────────────
  { m:'Cancelling plans last minute is disrespectful and the excuses do not matter.', split:51, heat:4, tag:'etiquette',
    pro:'You took a piece of someone\'s week, held it, and gave it back too late for them to use. Calling it self care does not refund the evening.',
    con:'The alternative is a culture where people drag themselves to dinners they cannot face, and everyone performs an obligation nobody is enjoying.' },
  { m:'You should always be honest with friends, even when the truth is useless to them.', split:44, heat:4, tag:'etiquette',
    pro:'A friend who only tells you what you can handle has quietly decided what you can handle, which is a strange thing to call respect.',
    con:'Honesty about a thing nobody can change is not courage, it is unloading your discomfort onto someone else and calling it a gift.' },
  { m:'Ghosting is sometimes the kindest option.', split:46, heat:4, tag:'loyalty',
    pro:'A closure conversation is usually a performance staged for the person leaving, so they can walk away feeling like they did it properly.',
    con:'It leaves someone alone with a question they will answer badly for months, and the discomfort you avoided was the cheapest part of the whole thing.' },
  { m:'Being late is a character flaw, not a habit.', split:53, heat:4, tag:'etiquette',
    pro:'Every time you are late you have decided your time is worth more than theirs and taken the difference without asking.',
    con:'Chronic lateness tracks with ADHD, caregiving and jobs you do not control, and calling it character is just class judgement with a watch on.' },

  // ── Moral dilemmas that split a room ────────────────────────────
  { m:'It is wrong to eat meat, and knowing what you know now makes it worse.', split:42, heat:5, tag:'ethics',
    pro:'You would not accept the conditions for a dog, and the only difference you can name is which animal your culture decided to love.',
    con:'A moral rule that most of humanity cannot afford to follow is a status marker, not an ethic, and the argument keeps being made by people with a choice.' },
  { m:'Having children is a selfish act.', split:44, heat:5, tag:'family',
    pro:'You created a person who did not ask to exist, to meet a need that was entirely yours, and every justification for it is written by the parent.',
    con:'By that logic every act is selfish, since nobody who does not exist can consent to anything, and the argument proves too much to mean anything.' },
  { m:'You should be allowed to end your own life and the state should help.', split:52, heat:5, tag:'ethics',
    pro:'If your body is not yours at the end then it was never yours at all, and forcing a person to finish a process they are begging to stop is cruelty with paperwork.',
    con:'Every system that has opened this door has widened it, and the pressure lands on the disabled, the poor and the old who already suspect they are a burden.' },
  { m:'Juries should be abolished and trials decided by professional judges.', split:41, heat:4, tag:'ethics',
    pro:'Twelve people selected for knowing nothing decide questions of forensic science, which is not democracy, it is a coin flip with ceremony.',
    con:'The jury is the last place an ordinary person can refuse to apply a law they think is unjust, and no professional has ever been able to do that.' },
  { m:'A person who commits a crime at seventeen should be tried as an adult if it is serious enough.', split:47, heat:5, tag:'ethics',
    pro:'Severity is the thing the victim experiences, and a line drawn on a birthday is arbitrary in a way the harm never is.',
    con:'The brain finishes in the mid twenties, which is a fact and not a mitigation, and a system that knows this and sentences anyway has stopped pretending to be about rehabilitation.' },

  // ── Everyday life, the ones that go longest ─────────────────────
  { m:'Reclining your seat on a plane is rude and you should not do it.', split:50, heat:4, tag:'etiquette',
    pro:'You are taking four inches that belong to a stranger\'s knees because the airline sold the same space twice and you decided to win it.',
    con:'The button exists, the seat is yours, and the person behind you bought the identical right that they are now asking you to give up for free.' },
  { m:'Giving up your seat on public transport should be expected, not optional.', split:55, heat:3, tag:'etiquette',
    pro:'A norm only works if it is a norm. Make it optional and it collapses to whoever feels least tired that morning.',
    con:'You cannot see who is ill, disabled, pregnant early or recovering, and an expectation enforced by staring punishes exactly the wrong people.' },
  { m:'Group projects should be graded individually, always.', split:57, heat:4, tag:'work',
    pro:'Grading a group is a lottery on your classmates, and everyone who has ever carried one knows the mark measured tolerance, not learning.',
    con:'The entire skill being taught is how to get work out of people you did not choose, which is most of every job you will ever have.' },
  { m:'Texting back within a day is a basic obligation.', split:48, heat:4, tag:'etiquette',
    pro:'Leaving a message unanswered for a week is a decision about someone\'s importance that you would never make to their face.',
    con:'The phone became a queue of demands nobody agreed to, and treating a response time as a duty is how people end up dreading their friends.' },
  { m:'You should never date a friend\'s ex.', split:49, heat:5, tag:'loyalty',
    pro:'The rule is ugly and it works. Every version of the story that ignores it ends with one friendship dead and a group choosing sides.',
    con:'It treats a person as property that stays claimed after the fact, and it asks two adults to be lonely to protect a third person\'s comfort.' },

  // ── Argument about argument ─────────────────────────────────────
  { m:'Debating someone you find repugnant gives them legitimacy and you should refuse.', split:47, heat:5, tag:'ethics',
    pro:'The invitation is the prize. You cannot beat a position whose only goal was to be seen standing on the same stage as a serious one.',
    con:'Refusing hands them the strongest line they have, that nobody will face them, and it leaves the audience with one side of an argument they were going to hear anyway.' },
  { m:'Changing your mind publicly should be admired more than being right.', split:56, heat:3, tag:'ethics',
    pro:'Almost every belief you hold arrived by inheritance, and the rarest thing a person can do is update in front of an audience that will punish it.',
    con:'Admire the process too much and you get people performing conversions for applause, which is the same certainty wearing humility as a costume.' },
  { m:'Most arguments are about status, not truth.', split:52, heat:4, tag:'ethics',
    pro:'Watch what happens when someone is offered a face saving exit from a losing position. They take it, every time, and the truth was never the currency.',
    con:'This is unfalsifiable and lazy. It lets you dismiss any argument you are losing by declaring that your opponent only wanted to win.' },

  // ── Politics, the charged tier ──────────────────────────────────
  //
  // Named public figures appear as the SUBJECT of a motion, never as
  // participants in a round. "THW rather have had Harris" is an argument
  // about a public record, which is ordinary debate and ordinary market
  // copy. A card showing Trump at 54% against Harris at 46% on a round
  // neither of them was in is a fabricated record for a real person, and
  // that is the line this repo already drew for the creator watchlist.
  // Motions here, never mock rounds.
  //
  // The identity line from the header holds harder in this tier, not
  // softer. Motions about a minority's standing are deliberately absent:
  // there is no shortage of genuinely 50/50 politics, and putting a
  // vulnerable group's status up for a public vote with money on it
  // recruits an audience that ends the product.
  { m:'America would be better off today if Kamala Harris had won in 2024.', split:49, heat:5, tag:'politics',
    pro:'Judge it on the record rather than the vibe: the tariffs, the institutional damage and the alliances spent are costs that land on people who never voted for either of them.',
    con:'The counterfactual is doing all the work, and every problem being charged to the winner was already in motion under the administration she served in.' },
  { m:'Donald Trump has been good for the American economy.', split:47, heat:5, tag:'politics',
    pro:'Deregulation and an energy posture the previous administration would not take are why the headline numbers held while Europe stalled.',
    con:'A tariff is a sales tax you do not get to vote on, and the bill arrives on the people with the least room to absorb it.' },
  { m:'The Electoral College should be abolished.', split:52, heat:4, tag:'politics',
    pro:'One person one vote is not a controversial principle anywhere else in the system, and twice this century it has produced a president most voters voted against.',
    con:'It forces a coalition across a continent instead of a campaign that only ever visits nine cities, and the small states never ratify their own irrelevance.' },
  { m:'Illegal border crossings should be met with immediate deportation, no hearing.', split:46, heat:5, tag:'politics',
    pro:'A queue only means something if jumping it fails, and a hearing backlog measured in years IS the incentive.',
    con:'Skipping the hearing is how you deport the person with a valid claim, and a country that will not check first has stopped being able to say it made a mistake.' },
  { m:'Universities should be legally required to host speakers most students find offensive.', split:48, heat:5, tag:'politics',
    pro:'A campus that only hears what it already believes is a very expensive echo, and the heckler stops needing an argument once he knows he can win with volume.',
    con:'Nobody is owed a lecture hall, and a legal requirement to platform hands the loudest bad-faith operator a permanent invitation nobody can withdraw.' },
  { m:'Billionaires should not exist.', split:50, heat:5, tag:'politics',
    pro:'A fortune that size is never earned in a lifetime of work, it is captured, and every one of them is a policy failure with a face on it.',
    con:'The sentence is about the person rather than the mechanism, and every state that has removed them ended up with the same concentration wearing a government badge.' },
  { m:'Social media should be banned for under sixteens.', split:53, heat:5, tag:'politics',
    pro:'We already draw this line for alcohol, driving and tattoos on far weaker evidence than we now have about adolescent mental health.',
    con:'It will be enforced by handing everyone\'s identity documents to the platforms, and the kids who most need the community online are the ones it cuts off first.' },
  { m:'Political leaders should face a maximum age limit.', split:57, heat:4, tag:'politics',
    pro:'Every other safety-critical job in the country has one, and the people voting on the next fifty years should have to live in some of them.',
    con:'It is an eligibility test nobody has to justify case by case, and the voters can already apply it and repeatedly choose not to.' },
  { m:'Your country should keep funding Ukraine at current levels.', split:49, heat:5, tag:'politics',
    pro:'It is the cheapest deterrence ever bought: no soldiers of yours, and the alternative is discovering what the next border costs.',
    con:'There is no stated end condition, and open-ended funding with no definition of winning is not a strategy, it is a subscription.' },
  { m:'Protest that blocks roads and disrupts ordinary people should be prosecuted harder.', split:51, heat:4, tag:'politics',
    pro:'Your cause does not entitle you to hold a stranger\'s ambulance, and the person missing work for your point never got a vote on it.',
    con:'Every protest now respectable was illegal and inconvenient at the time, and a protest that troubles nobody is a parade.' },
  { m:'Guns should be substantially harder to buy in the United States.', split:54, heat:5, tag:'politics',
    pro:'Every comparable country made the change and stopped having the problem, and the argument that it cannot work here is the only part that is uniquely American.',
    con:'The proposals mostly restrict the people who already follow the law, and the enforcement lands hardest in the places that trust the police least.' },
  { m:'Legacy admissions should be illegal.', split:61, heat:4, tag:'politics',
    pro:'It is affirmative action for people who already own the building, and it survives only because the beneficiaries write the cheques.',
    con:'A private institution choosing its own community is the thing making it private, and the donations it buys pay for the aid that admits everyone else.' },
];

// Sorted best-first for a market board: closest to an even split, then
// hottest. A lopsided motion is still a fine debate and a poor book.
export function marketReady(limit = 0) {
  const ranked = HOT_MOTIONS
    .slice()
    .sort((a, b) => (Math.abs(50 - a.split) - Math.abs(50 - b.split)) || (b.heat - a.heat));
  return limit > 0 ? ranked.slice(0, limit) : ranked;
}

// The shape predict.mjs's MOTION_BANK expects. The sort fields are
// dropped so the market document stays the size it already is.
export function asMarketBank() {
  return marketReady().map(({ m, pro, con }) => ({ m, pro, con }));
}

export const HOT_TAGS = [...new Set(HOT_MOTIONS.map((x) => x.tag))].sort();
