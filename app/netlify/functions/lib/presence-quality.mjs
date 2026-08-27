// Quality gates for the public presence map.
//
// The write path is anonymous by design, so no single client-side signal is
// proof of a person. Keep the public read conservative: obvious automated
// user agents never write, synchronized city-cell bursts never publish, and
// retained pins represent locations rather than advertising exact local
// session totals. The raw Firestore rows remain available to admin tooling.

const AUTOMATED_UA = /(?:googlebot|bingbot|yandexbot|baiduspider|duckduckbot|applebot|bytespider|petalbot|facebookexternalhit|twitterbot|discordbot|bingpreview|google-inspectiontool|\bcrawler\b|\bspider\b|headless(?:chrome)?|chrome-lighthouse|pagespeed|prerender|rendertron|selenium|playwright|puppeteer|phantomjs|python-requests|python-urllib|\bcurl\/|\bwget\/|go-http-client|node-fetch|\bundici\b)/i;

export function isAutomatedUserAgent(raw) {
  return typeof raw === 'string' && AUTOMATED_UA.test(raw.slice(0, 500));
}

function count(value) {
  return Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0;
}

// An 11 km cell reaching twelve distinct tabs in one day is outside this
// product's present human traffic envelope. The shorter windows catch a
// synchronized renderer burst before it reaches twelve. Revisit these
// thresholds explicitly when ordinary traffic starts tripping them.
export function isSuspiciousPresenceCell(raw) {
  const n = count(raw?.n);
  const n30 = Math.min(n, count(raw?.n30));
  const n5 = Math.min(n30, count(raw?.n5));

  if (n >= 12) return true;
  if (n5 >= 5 && n5 / Math.max(1, n) >= 0.4) return true;
  if (n30 >= 8 && n30 / Math.max(1, n) >= 0.5) return true;
  return false;
}

// Public dots answer "which places had a trusted visit?" Exact city totals
// produced the misleading ranked bubbles that prompted this guard. Counts
// remain available only as aggregate, quality-filtered session totals.
export function publicPresencePin(cell) {
  if (isSuspiciousPresenceCell(cell)) return null;
  return {
    lat: cell.lat,
    lng: cell.lng,
    city: cell.city || '',
    country: cell.country || '',
    n: 1,
    lastSeen: count(cell.lastSeen),
  };
}
