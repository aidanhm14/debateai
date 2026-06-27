// Country detection + payment-provider routing.
//
// Netlify Edge sets `x-country` (ISO-3166-1 alpha-2) on every request.
// `x-nf-geo` is a base64-encoded JSON blob with more detail. We prefer
// `x-country` for speed and fall back to `x-nf-geo` if present.
// `accept-language` and `?country=` (query override) are last-ditch
// fallbacks so dev + manual QA work even off Netlify infra.

const INDIA_ISO = 'IN';

function readNetlifyGeo(request) {
  const direct = request.headers.get('x-country');
  if (direct && direct.length === 2) return direct.toUpperCase();

  const blob = request.headers.get('x-nf-geo');
  if (!blob) return null;
  try {
    const decoded = JSON.parse(
      typeof Buffer !== 'undefined'
        ? Buffer.from(blob, 'base64').toString('utf8')
        : atob(blob)
    );
    const code = decoded?.country?.code;
    if (code && typeof code === 'string') return code.toUpperCase();
  } catch (_) { /* fall through */ }
  return null;
}

function readLanguageHint(request) {
  const al = (request.headers.get('accept-language') || '').toLowerCase();
  if (!al) return null;
  if (al.includes('en-in') || al.includes('hi') || al.includes('-in,')) return INDIA_ISO;
  return null;
}

function readQueryOverride(request) {
  try {
    const url = new URL(request.url);
    const q = url.searchParams.get('country');
    if (q && q.length === 2) return q.toUpperCase();
  } catch (_) { /* ignore */ }
  return null;
}

export function detectCountry(request) {
  return (
    readQueryOverride(request) ||
    readNetlifyGeo(request) ||
    readLanguageHint(request) ||
    null
  );
}

// India is the only Razorpay country for now. Other regions stay on Stripe.
export function isIndia(request) {
  return detectCountry(request) === INDIA_ISO;
}

// Canonical INR price map. Paise = 1/100 of a rupee — Razorpay's Order
// API takes amounts in paise, so everything downstream stays in integers.
// USD equivalents shown for grep-ability; do not change one without the
// other (canonical USD lives in soul.md §7).
export const RAZORPAY_INR_PRICES = {
  byok:       { amountPaise:   8500, label: '₹85',    cadence: 'month',  recurring: true  }, // $1/mo
  individual: { amountPaise:  83800, label: '₹838',   cadence: 'year',   recurring: true  }, // $10/year (2026-06-27)
  lifetime:   { amountPaise: 124900, label: '₹1,249', cadence: 'once',   recurring: false }, // $14.99 once
  team:       { amountPaise: 419000, label: '₹4,190', cadence: 'year',   recurring: true  }, // $50/year (2026-06-27)
};

export function razorpayPlanAmount(plan) {
  return RAZORPAY_INR_PRICES[plan] || null;
}
