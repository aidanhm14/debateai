// /api/sms-inbound — Twilio posts here when someone texts our number back.
//
// The only messages that matter are the carrier keywords: STOP means never
// text me again, START means you may resume, HELP means tell me who you are.
// Honoring STOP is not a nicety, it is the condition under which carriers
// keep delivering our messages at all, and it has to work on the first try
// with no account lookup on the sender's part.
//
// SIGNATURE VERIFICATION IS LOAD-BEARING, not hygiene. This endpoint mutates
// somebody's notification settings keyed on a phone number supplied in the
// request body. Unsigned, anyone who learned the URL could silence any
// number they can guess is on the platform, or re-subscribe a number that
// deliberately opted out. So an unverified POST is refused outright, and if
// no auth token is configured we refuse everything rather than fail open.
import { getDb, FieldValue } from './lib/firestore.mjs';
import { verifyTwilioSignature, keywordFor, findByPhone, normalizePhone } from './lib/sms.mjs';

// Twilio wants TwiML or an empty 204. An empty <Response/> means "I handled
// it, send nothing back" — the carrier's own STOP confirmation still goes
// out, which is required and which we must not duplicate.
function twiml(message) {
  const body = message
    ? `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${message}</Message></Response>`
    : `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`;
  return new Response(body, { status: 200, headers: { 'Content-Type': 'text/xml' } });
}

export default async (request) => {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  let raw = '';
  try { raw = await request.text(); } catch (e) { return twiml(''); }

  const params = {};
  try {
    const usp = new URLSearchParams(raw);
    for (const [k, v] of usp.entries()) params[k] = v;
  } catch (e) { return twiml(''); }

  // Twilio signs the URL it was configured with. Behind Netlify the
  // forwarded proto/host are what the outside world used, so rebuild from
  // those rather than from the internal request URL.
  const url = new URL(request.url);
  const proto = request.headers.get('x-forwarded-proto') || 'https';
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || url.host;
  const publicUrl = `${proto}://${host}${url.pathname}`;

  const sig = request.headers.get('x-twilio-signature') || '';
  if (!verifyTwilioSignature(publicUrl, params, sig)) {
    console.warn('[sms-inbound] rejected unsigned or mis-signed request');
    return new Response('Forbidden', { status: 403 });
  }

  const from = normalizePhone(params.From || '');
  const keyword = keywordFor(params.Body || '');
  if (!from || !keyword) return twiml('');

  const rec = await findByPhone(from);
  if (!rec) return twiml('');

  const db = getDb();
  const ref = db.collection('phone_numbers').doc(rec.id);

  if (keyword === 'stop') {
    await ref.set({
      optedOut: true,
      optedOutAt: FieldValue.serverTimestamp(),
      optedOutVia: 'sms',
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true }).catch(() => {});
    // Silent: the carrier sends its own confirmation for STOP, and a second
    // message from us to a number that just asked us to stop is exactly the
    // thing STOP is about.
    return twiml('');
  }

  if (keyword === 'start') {
    await ref.set({
      optedOut: false,
      optedOutAt: FieldValue.delete(),
      optedOutVia: FieldValue.delete(),
      resubscribedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true }).catch(() => {});
    return twiml('You are subscribed to Debatable alerts again. Reply STOP to stop.');
  }

  // help
  return twiml('Debatable: alerts for live rounds, challenges and messages. Manage them at itsdebatable.com/settings. Reply STOP to stop. Msg&data rates may apply.');
};

export const config = { path: '/api/sms-inbound' };
