/* Daily at 9 PM in each host city, per the founder on 2026-09-08.
 * One dependency-free schedule for the browser, RSVP and email senders.
 * Each city keeps its wall-clock time through its own daylight saving.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.DBClashSchedule = factory();
}(typeof window !== 'undefined' ? window : this, function () {
  var LIVE_MS = 90 * 60 * 1000;
  var SESSIONS = [
    { hour: 21, city: 'Sydney', name: 'Asia-Pacific evening', tz: 'Australia/Sydney',
      zones: [['Sydney', 'Australia/Sydney'], ['Tokyo', 'Asia/Tokyo'], ['Delhi', 'Asia/Kolkata']] },
    { hour: 21, city: 'Berlin', name: 'Europe evening', tz: 'Europe/Berlin',
      zones: [['Berlin', 'Europe/Berlin'], ['London', 'Europe/London'], ['Lagos', 'Africa/Lagos']] },
    { hour: 21, city: 'New York', name: 'US evening', tz: 'America/New_York',
      zones: [['New York', 'America/New_York'], ['Chicago', 'America/Chicago'], ['Los Angeles', 'America/Los_Angeles']] }
  ];
  function parts(ms, tz) {
    var out = {};
    new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short', year: 'numeric',
      month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
    }).formatToParts(new Date(ms)).forEach(function (p) { out[p.type] = p.value; });
    return out;
  }
  function wallToUtc(y, mo, d, hour, minute, tz) {
    var want = Date.UTC(y, mo - 1, d, hour, minute), guess = want;
    for (var i = 0; i < 3; i++) {
      var p = parts(guess, tz);
      guess += want - Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute);
    }
    return guess;
  }
  function nextFor(session, now) {
    var p = parts(now, session.tz);
    for (var i = 0; i < 3; i++) {
      // Advance calendar dates, not 24-hour instants, across DST boundaries.
      var day = new Date(Date.UTC(+p.year, +p.month - 1, +p.day + i));
      var start = wallToUtc(day.getUTCFullYear(), day.getUTCMonth() + 1,
        day.getUTCDate(), session.hour, 0, session.tz);
      if (start + LIVE_MS > now) return { start: start, session: session };
    }
    throw new Error('No upcoming Clash Hour');
  }
  function nextSession(now) {
    return SESSIONS.map(function (s) { return nextFor(s, now); })
      .sort(function (a, b) { return a.start - b.start; })[0];
  }
  function calendarUrl(st) {
    var p = parts(st.start, st.session.tz), day = p.year + p.month + p.day;
    return 'https://calendar.google.com/calendar/render?action=TEMPLATE'
      + '&text=' + encodeURIComponent('Clash Hour (' + st.session.city + ') · Debatable')
      + '&details=' + encodeURIComponent('Daily at 9 PM New York, 9 PM Berlin and 9 PM Sydney, each in local time. Join at itsdebatable.com/spar')
      + '&location=' + encodeURIComponent('https://itsdebatable.com/spar')
      + '&dates=' + day + 'T210000/' + day + 'T223000'
      + '&ctz=' + encodeURIComponent(st.session.tz)
      + '&recur=' + encodeURIComponent('RRULE:FREQ=DAILY');
  }
  return { LIVE_MS: LIVE_MS, SESSIONS: SESSIONS, parts: parts,
    wallToUtc: wallToUtc, nextFor: nextFor, nextSession: nextSession, calendarUrl: calendarUrl };
}));
