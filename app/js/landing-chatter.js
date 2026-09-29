/* landing-chatter.js: sparse conversation starters in the homepage Highlights panel.
 *
 * 2026-09-29: short typing previews linking to Discord / The Commons,
 * no stored posts, complaints, critiques or scripted reply chains.
 * The previous conversation bank is preserved in graveyard/.
 *
 * 2026-09-25, Aidan: "add more random fake chats under fake names but make
 * them really human ... so when ppl see it there is a feeling of liveliness".
 * He was shown the 2026-08-31 real-only rule ("get rid of the bots on the
 * open group chat") and the practical risk (real regulars reply to names
 * that are not there), and chose untagged personas over an AI-tagged
 * version. The soul.md decision log carries the reversal.
 *
 * This file is DATA AND A CLOCK. It draws nothing and sends nothing: the
 * renderer in landing.html asks it which lines exist at a given instant.
 * The limits below are enforced here and by scripts/test-landing-chatter.mjs,
 * and they are not a style preference:
 *
 *  - Browser only. Nothing here is written to The Commons, Firestore, or any
 *    endpoint. A scripted line in a real room is a record other people read
 *    and answer; that line stays where it was drawn in 2026-08-29.
 *  - Every person here is invented, and no name matches a real account.
 *    Checked against every public name on the site when written; the
 *    renderer also drops any persona that matches a real handle in the feed.
 *  - Scripted people never reply to, name, or quote a real person. Every
 *    episode opens with a standalone line and is answered only by other
 *    scripted people, and the renderer never lets a scripted reply land
 *    directly under a real message.
 *  - No praise of the site, no claims about the judge, ranks, results,
 *    prizes, or money. People chat about topics and about arguing. That is
 *    the line between atmosphere and a fake testimonial.
 *  - Same content bar as real chat: the site's motion boundary, the
 *    highlight filter, no em dashes, no retired brand language.
 *
 * Historical topic selection (2026-09-25, second pass). Aidan: "make the comment section
 * better and more absurd but not dumb/cringe talk rather pertinent
 * politics etc". Topics were picked from what X was trending and what the
 * week's political news covered, and then written fresh: no post is
 * copied. The rules for political lines are enforced by the guard too:
 * issues, never individuals (no politician is named); no war and no
 * election-fraud claims; nothing that turns on a group's rights; no fact
 * about a current event that could be false next week; both sides get a
 * real argument; and a line tied to a date (the midterms) carries an
 * `until` and retires on its own.
 *
 * DETERMINISTIC BY WALL CLOCK. Time is cut into three-minute slots and each
 * slot's episode is a pure function of the slot number, so two visitors at
 * the same moment see the same room, and a reload shows the same history
 * plus whatever "arrived" since. A room that reshuffled on every reload
 * would give itself away in one refresh.
 */
(function (root) {
  'use strict';

  var VERSION = 'chatter-2026-09-29';
  var SLOT_MS = 180000;
  var DAY_MS = 86400000;
  // Polls open 2026-11-03; midday UTC keeps the count right across zones.
  var MIDTERMS = Date.UTC(2026, 10, 3, 12);

  /* People: [handle, IANA zone, city as they would type it, region, language].
     Region and language let an episode ask for a speaker who fits the line
     ("any europeans on?", "bom dia"). Local times are real: {time} and
     {weekday} are computed in the speaker's own zone, and an episode that
     says it is late only runs when it is actually late where they are. */
  var PEOPLE = [
    ['tiago r', 'Europe/Lisbon', 'lisbon', 'eu', 'pt'],
    ['shreya_p', 'America/Toronto', 'toronto', 'ca', 'in'],
    ['dele_o', 'Africa/Lagos', 'lagos', 'af', ''],
    ['taiga.k', 'Asia/Tokyo', 'osaka', 'as', ''],
    ['Marisol', 'America/Mexico_City', 'cdmx', 'la', 'es'],
    ['bethan', 'Europe/London', 'leeds', 'eu', ''],
    ['ayo', 'Africa/Accra', 'accra', 'af', ''],
    ['rhys_', 'Europe/London', 'cardiff', 'eu', ''],
    ['rawan', 'Asia/Amman', 'amman', 'me', ''],
    ['jojo m', 'Asia/Manila', 'manila', 'as', ''],
    ['sven', 'Europe/Stockholm', 'stockholm', 'eu', ''],
    ['agus_', 'America/Argentina/Buenos_Aires', 'buenos aires', 'la', 'es'],
    ['Callum P', 'Australia/Melbourne', 'melbourne', 'oc', ''],
    ['wanjiru', 'Africa/Nairobi', 'nairobi', 'af', ''],
    ['Mateus', 'America/Sao_Paulo', 'são paulo', 'la', 'pt'],
    ['fenna', 'Europe/Amsterdam', 'amsterdam', 'eu', ''],
    ['coop', 'America/Denver', 'denver', 'us', ''],
    ['fer', 'Europe/Madrid', 'madrid', 'eu', 'es'],
    ['yuki_t', 'Asia/Tokyo', 'tokyo', 'as', ''],
    ['arjun07', 'Asia/Kolkata', 'pune', 'as', 'in'],
    ['wenjie', 'Asia/Singapore', 'singapore', 'as', ''],
    ['Marek', 'Europe/Warsaw', 'kraków', 'eu', ''],
    ['esi', 'Africa/Accra', 'kumasi', 'af', ''],
    ['gabe', 'America/Chicago', 'chicago', 'us', ''],
    ['laila m', 'Asia/Dubai', 'dubai', 'me', ''],
    ['conor', 'Europe/Dublin', 'dublin', 'eu', ''],
    ['Varun M', 'Asia/Kolkata', 'bangalore', 'as', 'in'],
    ['thabo', 'Africa/Johannesburg', 'joburg', 'af', ''],
    ['clémence', 'Europe/Paris', 'lyon', 'eu', ''],
    ['d.nguyen', 'Asia/Ho_Chi_Minh', 'hanoi', 'as', ''],
    ['sam w', 'America/Chicago', 'austin', 'us', ''],
    ['mira', 'Europe/Berlin', 'berlin', 'eu', ''],
    ['femi', 'Europe/London', 'london', 'eu', ''],
    ['ruslan', 'Asia/Almaty', 'almaty', 'as', ''],
    ['ana l', 'America/Bogota', 'bogotá', 'la', 'es'],
    ['wes', 'America/Los_Angeles', 'seattle', 'us', ''],
    ['hamza_', 'Asia/Karachi', 'karachi', 'as', ''],
    ['bex', 'Pacific/Auckland', 'auckland', 'oc', ''],
    ['Dom', 'America/New_York', 'philly', 'us', ''],
    ['yasmine_', 'Africa/Casablanca', 'casablanca', 'af', ''],
    ['ike', 'Africa/Lagos', 'abuja', 'af', ''],
    ['sol', 'America/Santiago', 'santiago', 'la', 'es'],
    ['jiwoo', 'Asia/Seoul', 'seoul', 'as', ''],
    ['salma', 'Africa/Cairo', 'cairo', 'me', ''],
    ['ishita', 'Asia/Kolkata', 'mumbai', 'as', 'in'],
    ['eirik', 'Europe/Oslo', 'oslo', 'eu', ''],
    ['yuting', 'Asia/Taipei', 'taipei', 'as', ''],
    ['dre.w', 'America/New_York', 'atlanta', 'us', ''],
    ['rosie', 'Europe/London', 'glasgow', 'eu', ''],
    ['hollis', 'America/New_York', 'nyc', 'us', ''],
    ['pablo', 'Europe/Madrid', 'valencia', 'eu', 'es'],
    ['saki', 'Asia/Tokyo', 'kyoto', 'as', ''],
    ['olu', 'Europe/London', 'manchester', 'eu', ''],
    ['keira', 'Australia/Sydney', 'sydney', 'oc', ''],
    ['facu', 'America/Argentina/Buenos_Aires', 'rosario', 'la', 'es'],
    ['kels', 'America/Los_Angeles', 'los angeles', 'us', ''],
    ['giulia', 'Europe/Rome', 'milan', 'eu', ''],
    ['margaux', 'America/Toronto', 'montreal', 'ca', '']
  ];

  // How a name is written when someone else mentions it in a line.
  var SHORT = { 'd.nguyen': 'nguyen', 'taiga.k': 'taiga', 'dre.w': 'dre', 'Callum P': 'callum', 'Varun M': 'varun' };

  /* Live political questions first, everyday clashes after, all meeting
     the bar suggested topics meet (soul.md, 2026-09-14 and 2026-09-19): a
     real choice with a cost or a competing value on each side. Policies
     and institutions, never politicians. No taste rankings of food, pets
     or entertainment, nothing that turns on a group's rights, and the
     site-wide motion boundary applies the same way it applies to real
     rooms. [noun as people say it, the yes-or-no version]. */
  var TOPICS = [
    ['term limits', 'should congress have term limits'],
    ['age limits for politicians', 'should there be a maximum age to run for office'],
    ['congress trading stocks', 'should members of congress be banned from trading stocks'],
    ['the electoral college', 'should the us get rid of the electoral college'],
    ['ranked choice voting', 'should the us switch to ranked choice voting'],
    ['third parties', 'is voting third party a wasted vote'],
    ['gerrymandering', 'should independent commissions draw every district'],
    ['mid decade redistricting', 'should states be allowed to redraw maps between censuses'],
    ['the filibuster', 'should the senate get rid of the filibuster'],
    ['supreme court term limits', 'should supreme court justices have term limits'],
    ['voter id', 'should you need a photo id to vote'],
    ['election day as a holiday', 'should election day be a national holiday'],
    ['compulsory voting', 'should voting be compulsory'],
    ['voting at 16', 'should the voting age be 16'],
    ['open primaries', 'should primaries be open to every voter'],
    ['online voting', 'should people be able to vote on their phones'],
    ['campaign spending caps', 'should there be a limit on spending in a single race'],
    ['lobbying bans', 'should former members of congress be banned from lobbying'],
    ['press access', 'should the white house get to pick which reporters come in'],
    ['tariffs', 'do tariffs protect jobs or just raise prices'],
    ['the gas tax', 'should the us suspend the federal gas tax'],
    ['the minimum wage', 'should the federal minimum wage go up'],
    ['tax free tips', 'should tips be tax free'],
    ['tipping', 'should tipping be replaced with higher wages'],
    ['student loans', 'should student loans be forgiven'],
    ['free college', 'should public college be free'],
    ['the national debt', 'should the us cut spending to pay down the debt'],
    ['public health insurance', 'should the us have public health insurance for everyone'],
    ['universal basic income', 'should there be a universal basic income'],
    ['the four day work week', 'should the four day work week be normal'],
    ['ai and jobs', 'should companies pay a tax when ai replaces workers'],
    ['ai liability', 'should ai companies be liable for what their models do'],
    ['data centers', 'should data centers pay more for electricity'],
    ['nuclear power', 'should we build more nuclear plants'],
    ['electric cars', 'should new petrol cars be phased out'],
    ['rent control', 'does rent control actually help renters'],
    ['zoning', 'should cities allow apartments on every residential street'],
    ['free buses', 'should city buses be free'],
    ['city grocery stores', 'should cities run their own grocery stores'],
    ['bike lanes', 'should cities turn car lanes into bike lanes'],
    ['car free city centers', 'should city centers ban cars'],
    ['recycled drinking water', 'should cities turn wastewater into drinking water'],
    ['social media age limits', 'should social media be 16 and up'],
    ['phones in school', 'should phones be banned during school hours'],
    ['ai for homework', 'should students be allowed to use ai for homework'],
    ['daylight saving time', 'should daylight saving time end'],
    ['unions', 'should it be easier to form a union'],
    ['federal job cuts', 'should the federal government have fewer workers'],
    ['sugar taxes', 'should sugary drinks be taxed'],
    ['the drinking age', 'should the us drinking age be 18'],
    ['sunset clauses', 'should every new government program come with an end date'],
    ['remote work', 'is remote work better than the office'],
    ['college', 'is college still worth it'],
    ['splitting the bill', 'should you always split the bill evenly'],
    ['going through your partners phone', 'is it ever ok to go through your partners phone'],
    ['dating a friends ex', 'is it ever ok to date a friends ex'],
    ['ghosting', 'is ghosting ever ok'],
    ['white lies', 'is it ok to lie to spare someones feelings'],
    ['lending money to friends', 'should you ever lend money to friends'],
    ['living with your parents', 'is living with your parents at 25 fine'],
    ['unpaid internships', 'should unpaid internships be banned'],
    ['work emails after hours', 'should work emails after hours be banned']
  ];

  // Short invitations only. These previews never claim someone is waiting.
  var EPISODES = [
    `A: anyone up for a round on {topic}? pick a side`,
    `A: who wants to take the other side on {topic}`,
    `A: quick round on {topic}? either side works`,
    `A: pick one: {topic} or {topic2}. then pick your side`,
    `A: open question: {topicQ}? make your case`,
    `A: bring a topic and take the first turn`,
    `A: got a different take on {topic}? start with your strongest reason`,
    `A: choose a side on {topic} and give one reason`,
    `A: round idea: {topicQ}? who takes yes`,
    `A: round idea: {topicQ}? who takes no`,
    `A: take a side you usually disagree with: {topicQ}`,
    `A: drop a question you would like to argue out`,
    `A: one question, two sides: {topicQ}`,
    `A: pick a topic for a quick back and forth`,
    `A: start a round on {topic}. you choose the side`,
    `A: what is your strongest argument on {topic}`
  ];

  /* Lines that cannot open an episode: each reads as an answer to whatever
     sits above it, and above an opener there may be a real person. */
  var REPLY_SHAPED = /^(ok\b|okay|sure|yes\b|yeah|yea\b|yep|no\b|nah|same|lol|lmao|haha|fair|true|wait|which|what\??$|how\??$|me\b|this\b|facts|exactly|agreed|also|and\b|but\b|so\b|@)/i;

  function hash32(str) {
    var h = 2166136261;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }
  function makeRng(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function pick(rng, list) { return list[Math.floor(rng() * list.length) % list.length]; }
  function norm(value) {
    return String(value || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
  }
  function firstToken(value) {
    return (String(value || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().match(/[a-z0-9]+/) || [''])[0];
  }
  function shortName(handle) {
    if (SHORT[handle]) return SHORT[handle];
    return handle.replace(/[_\d]+$/, '').replace(/\s+[a-z]$/i, '').toLowerCase();
  }

  // ── Speaker-local time. Intl knows every zone's daylight saving, so a
  // line that says "its 1am here" is true where that person lives.
  var formatters = {};
  var timeCache = {};
  var WEEKDAYS = { Sun: 'sunday', Mon: 'monday', Tue: 'tuesday', Wed: 'wednesday', Thu: 'thursday', Fri: 'friday', Sat: 'saturday' };
  function localTime(zone, ms) {
    var key = zone + '|' + Math.floor(ms / 60000);
    if (timeCache[key]) return timeCache[key];
    var out = null;
    try {
      var f = formatters[zone] || (formatters[zone] = new Intl.DateTimeFormat('en-US', {
        timeZone: zone, hour: 'numeric', minute: 'numeric', weekday: 'short', hourCycle: 'h23'
      }));
      var parts = f.formatToParts(new Date(ms));
      var h = 0, m = 0, wd = 'Sun';
      for (var i = 0; i < parts.length; i++) {
        if (parts[i].type === 'hour') h = parseInt(parts[i].value, 10) % 24;
        else if (parts[i].type === 'minute') m = parseInt(parts[i].value, 10);
        else if (parts[i].type === 'weekday') wd = parts[i].value;
      }
      out = { h: h, m: m, weekday: WEEKDAYS[wd] || 'sunday' };
    } catch (e) {
      var d = new Date(ms);
      out = { h: d.getUTCHours(), m: d.getUTCMinutes(), weekday: ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][d.getUTCDay()] };
    }
    var keys = Object.keys(timeCache);
    if (keys.length > 4000) timeCache = {};
    timeCache[key] = out;
    return out;
  }
  function timeLabel(t, rng) {
    if (t.h === 0 && t.m < 20) return 'midnight';
    if (t.h === 12 && t.m < 20) return 'noon';
    var h12 = t.h % 12 === 0 ? 12 : t.h % 12;
    var suffix = t.h < 12 ? 'am' : 'pm';
    if (rng() < 0.3) return h12 + ':' + (t.m < 10 ? '0' : '') + t.m + suffix;
    return h12 + suffix;
  }

  var WINDOWS = {
    late: function (h) { return h >= 23 || h <= 3; },
    night: function (h) { return h >= 21 || h <= 2; },
    morning: function (h) { return h >= 6 && h <= 10; },
    day: function (h) { return h >= 10 && h <= 17; },
    evening: function (h) { return h >= 17 && h <= 22; }
  };
  function awake(h) { return h >= 7 || h <= 1; }
  function fits(person, expr, ms) {
    var h = localTime(person[1], ms).h;
    if (!expr) return awake(h);
    var alternatives = expr.split('|');
    for (var i = 0; i < alternatives.length; i++) {
      var tokens = alternatives[i].split('+');
      var ok = true, timed = false;
      for (var j = 0; j < tokens.length && ok; j++) {
        var tok = tokens[j];
        if (WINDOWS[tok]) { timed = true; ok = WINDOWS[tok](h); }
        else if (tok === 'us' || tok === 'eu') ok = person[3] === tok;
        else if (tok === 'nonus') ok = person[3] !== 'us';
        else if (tok === 'es' || tok === 'pt' || tok === 'in') ok = person[4] === tok;
        else ok = false;
      }
      if (ok && (timed || awake(h))) return true;
    }
    return false;
  }

  // ── Parse the bank once.
  var PARSED = EPISODES.map(function (raw, index) {
    var rows = raw.split('\n');
    var rules = {};
    var until = 0;
    if (rows[0].charAt(0) === '#') {
      rows.shift().slice(1).trim().split(/\s+/).forEach(function (pair) {
        var bits = pair.split('=');
        if (bits[0] === 'until') {
          var d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(bits[1] || '');
          until = d ? Date.UTC(+d[1], +d[2] - 1, +d[3]) : 0;
        } else rules[bits[0]] = bits[1];
      });
    }
    var lines = [];
    rows.forEach(function (row) {
      var match = /^([A-D]):\s(.+)$/.exec(row);
      if (match) lines.push({ role: match[1], text: match[2] });
    });
    var roles = [];
    lines.forEach(function (line) { if (roles.indexOf(line.role) === -1) roles.push(line.role); });
    return { index: index, rules: rules, until: until, lines: lines, roles: roles };
  });

  function expand(text, rng, ctx, speaker, at) {
    var out = text.replace(/\[([^\[\]]*\|[^\[\]]*)\]/g, function (_, body) {
      return pick(rng, body.split('|'));
    });
    return out.replace(/\{(topic2Q|topicQ|topic2|topic|city|time|weekday|mdays|A|B|C|D)\}/g, function (_, key) {
      if (key === 'topic') return ctx.topic[0];
      if (key === 'topicQ') return ctx.topic[1];
      if (key === 'topic2') return ctx.topic2[0];
      if (key === 'topic2Q') return ctx.topic2[1];
      if (key === 'city') return speaker[2];
      if (key === 'time') return timeLabel(localTime(speaker[1], at), rng);
      if (key === 'weekday') return localTime(speaker[1], at).weekday;
      if (key === 'mdays') return String(Math.max(1, Math.ceil((MIDTERMS - at) / DAY_MS)));
      var other = ctx.cast[key];
      return other ? shortName(other[0]) : '';
    });
  }

  // ── The clock.
  var avoid = {};
  var avoidKey = '';
  var cache = {};
  var cacheSize = 0;
  var permCache = {};

  function permutation(day, cycle) {
    var key = day + '|' + cycle;
    if (permCache[key]) return permCache[key];
    var rng = makeRng(hash32('perm|' + key));
    var order = PARSED.map(function (p) { return p.index; });
    for (var i = order.length - 1; i > 0; i--) {
      var j = Math.floor(rng() * (i + 1));
      var tmp = order[i]; order[i] = order[j]; order[j] = tmp;
    }
    if (Object.keys(permCache).length > 12) permCache = {};
    permCache[key] = order;
    return order;
  }

  // One short starter per three-minute slot, instead of a busy conversation.
  function activity() { return 1; }

  function castFor(ep, rng, at) {
    var cast = {};
    var used = {};
    for (var r = 0; r < ep.roles.length; r++) {
      var role = ep.roles[r];
      var chosen = null;
      for (var tries = 0; tries < 30 && !chosen; tries++) {
        var person = pick(rng, PEOPLE);
        if (used[person[0]] || avoided(avoid, person)) continue;
        // An episode runs up to two slots, so the person has to fit at
        // both ends of it, or someone cast at 1:59 speaks at 2:00.
        if (fits(person, ep.rules[role], at) && fits(person, ep.rules[role], at + 2 * SLOT_MS)) chosen = person;
      }
      if (!chosen) return null;
      cast[role] = chosen;
      used[chosen[0]] = true;
    }
    return cast;
  }

  // One slot's episode, ignoring its neighbours. Pure in k.
  function rawSlot(k) {
    var key = String(k);
    if (Object.prototype.hasOwnProperty.call(cache, key)) return cache[key];
    var result = null;
    var rng = makeRng(hash32('slot|' + k));
    if (rng() < activity(k)) {
      var slotStart = k * SLOT_MS;
      var start = slotStart + 1000 + Math.floor(rng() * 44000);
      var day = Math.floor(slotStart / DAY_MS);
      var sod = k - day * (DAY_MS / SLOT_MS);
      var n = PARSED.length;
      var order = permutation(day, Math.floor(sod / n));
      for (var attempt = 0; attempt < 8 && !result; attempt++) {
        var ep = PARSED[order[(sod + attempt * 17) % n]];
        if (ep.until && slotStart >= ep.until) continue;
        var cast = castFor(ep, rng, start);
        if (!cast) continue;
        var ctx = { cast: cast, topic: pick(rng, TOPICS), topic2: null };
        do { ctx.topic2 = pick(rng, TOPICS); } while (ctx.topic2 === ctx.topic);
        var at = start;
        var lines = [];
        var prev = null;
        for (var i = 0; i < ep.lines.length; i++) {
          var line = ep.lines[i];
          var speaker = cast[line.role];
          if (i > 0) {
            var len = ep.lines[i].text.length;
            var gap = line.role === prev
              ? 1200 + rng() * 2500 + len * 50
              : 2500 + rng() * 7000 + len * 130 + (rng() < 0.12 ? 8000 + rng() * 17000 : 0);
            at += Math.round(gap);
          }
          lines.push({ role: line.role, speaker: speaker, text: line.text, at: at });
          prev = line.role;
        }
        // Keep the whole episode inside two slots so the one after it can
        // start cleanly: squeeze the gaps rather than drop a line.
        var limit = slotStart + 2 * SLOT_MS - 4000;
        var last = lines[lines.length - 1].at;
        if (last > limit && lines.length > 1) {
          var span = last - start;
          var room = limit - start;
          lines.forEach(function (l) { l.at = start + Math.round((l.at - start) * room / span); });
        }
        result = {
          k: k,
          start: start,
          end: lines[lines.length - 1].at,
          episode: ep.index,
          lines: lines.map(function (l, idx) {
            var t = localTime(l.speaker[1], l.at);
            return {
              id: k + '.' + idx,
              ep: k,
              e: ep.index,
              i: idx,
              handle: l.speaker[0],
              text: expand(l.text, rng, ctx, l.speaker, l.at),
              at: l.at,
              h: t.h
            };
          })
        };
      }
    }
    if (cacheSize > 600) { cache = {}; cacheSize = 0; }
    cache[key] = result;
    cacheSize++;
    return result;
  }

  // A slot plays only when the episode before it has finished, with a
  // breath between them, so conversations never interleave.
  function slot(k) {
    var mine = rawSlot(k);
    if (!mine) return null;
    var before = rawSlot(k - 1);
    if (before && before.end + 3000 > mine.start) return null;
    return mine;
  }

  function between(fromMs, toMs) {
    var out = [];
    var first = Math.floor(fromMs / SLOT_MS) - 2;
    var last = Math.floor(toMs / SLOT_MS);
    for (var k = first; k <= last; k++) {
      var ep = slot(k);
      if (!ep) continue;
      for (var i = 0; i < ep.lines.length; i++) {
        var line = ep.lines[i];
        if (line.at > fromMs && line.at <= toMs) out.push(line);
      }
    }
    out.sort(function (a, b) { return a.at - b.at; });
    return out;
  }

  // Whole episodes, newest last, until at least minLines have been sent by
  // now. Always starts on an episode's first line.
  function backlog(now, opts) {
    var minLines = (opts && opts.minLines) || 1;
    var episodes = [];
    var count = 0;
    var k = Math.floor(now / SLOT_MS);
    for (var steps = 0; steps < 60 && count < minLines; steps++, k--) {
      var ep = slot(k);
      if (!ep || ep.start > now) continue;
      var sent = ep.lines.filter(function (line) { return line.at <= now; });
      episodes.unshift(sent);
      count += sent.length;
    }
    return [].concat.apply([], episodes);
  }

  // The renderer passes the real handles on screen. A persona whose name or
  // first name matches one of them sits out, so a scripted line can never
  // be mistaken for a real person who is in the same feed.
  function avoided(set, person) {
    return !!(set[norm(person[0])] || set['#' + firstToken(person[0])]);
  }
  // Returns true only when a persona actually joins or leaves the bench.
  // Real names that match nobody leave the schedule untouched, so two
  // visitors looking at different real rows still see the same room.
  function setAvoid(handles) {
    var next = {};
    (handles || []).forEach(function (handle) {
      var n = norm(handle);
      if (!n) return;
      next[n] = true;
      var f = firstToken(handle);
      if (f && f.length > 2) next['#' + f] = true;
    });
    var key = Object.keys(next).sort().join(',');
    if (key === avoidKey) return false;
    var changed = PEOPLE.some(function (person) { return avoided(next, person) !== avoided(avoid, person); });
    avoidKey = key;
    avoid = next;
    if (!changed) return false;
    cache = {};
    cacheSize = 0;
    return true;
  }

  // For the guard only: the raw bank, so the test can check every line.
  function bank() {
    return { people: PEOPLE.slice(), topics: TOPICS.slice(), episodes: PARSED, replyShaped: REPLY_SHAPED };
  }

  root.DBLandingChatter = {
    version: VERSION,
    slotMs: SLOT_MS,
    backlog: backlog,
    between: between,
    setAvoid: setAvoid,
    avoids: function (handle) {
      return avoided(avoid, [handle]);
    },
    isScripted: function (handle) {
      return PEOPLE.some(function (p) { return p[0] === handle; });
    },
    _bank: bank
  };
  if (typeof root.__fsChatterReady === 'function') {
    try { root.__fsChatterReady(); } catch (e) {}
  }
})(typeof window !== 'undefined' ? window : globalThis);
