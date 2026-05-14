// Returns the visitor's country + the recommended payment provider.
// Used by pricing.html to swap USD→INR + Stripe→Razorpay for Indian
// traffic before the user clicks. No auth required — this is a hint,
// not a permission.

import { detectCountry, isIndia, RAZORPAY_INR_PRICES } from './lib/geo.mjs';
import { corsResponse, jsonResponse } from './lib/response.mjs';

export default async (request) => {
  if (request.method === 'OPTIONS') return corsResponse(request);

  const country = detectCountry(request);
  // Razorpay only switches on if BOTH conditions hold:
  //   1. visitor is in India
  //   2. RAZORPAY_KEY_ID is configured in Netlify env
  // The env-var gate means we can deploy the code before adding the
  // keys without breaking Indian checkout — they keep hitting Stripe
  // (their existing experience) until the keys land.
  const razorpayConfigured = !!process.env.RAZORPAY_KEY_ID;
  const useRazorpay = isIndia(request) && razorpayConfigured;

  return jsonResponse({
    country,
    currency: useRazorpay ? 'INR' : 'USD',
    provider: useRazorpay ? 'razorpay' : 'stripe',
    prices: useRazorpay
      ? Object.fromEntries(
          Object.entries(RAZORPAY_INR_PRICES).map(([k, v]) => [
            k,
            { display: v.label, cadence: v.cadence, recurring: v.recurring },
          ])
        )
      : null,
  }, 200, request);
};

export const config = {
  path: '/api/billing/region',
};
