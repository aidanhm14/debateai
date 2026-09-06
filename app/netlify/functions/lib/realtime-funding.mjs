import { isNamedAccount } from './auth.mjs';
import { planBypassesVoiceCap } from './plans.mjs';

const refused = (status, code, message) => Object.assign(new Error(message), { status, code });

// Consume the credential before any prompt builder sees the request body.
// A BYOK failure never falls back to the platform's key or minute balance.
export async function realtimeFunding(body, decoded, { platformKey, membership }) {
  const supplied = Object.hasOwn(body, 'openaiApiKey');
  const key = body.openaiApiKey;
  delete body.openaiApiKey;
  if (!supplied) {
    if (!platformKey) throw refused(503, 'VOICE_UNAVAILABLE', 'Voice is temporarily unavailable.');
    return { byok: false, apiKey: platformKey };
  }
  if (!isNamedAccount(decoded)) throw refused(401, 'SIGN_IN_REQUIRED', 'Sign in to use your OpenAI key.');
  if (typeof key !== 'string' || /^sk-ant-/.test(key.trim()) || !/^sk-[A-Za-z0-9_-]{17,497}$/.test(key.trim())) {
    throw refused(400, 'OPENAI_BYOK_INVALID', 'Enter an OpenAI API key. Anthropic keys work in typed Claude debates.');
  }
  let team;
  try { team = (await membership(decoded.sub))?.team; }
  catch { throw refused(503, 'OPENAI_BYOK_PLAN_UNAVAILABLE', 'Could not check your plan. Retry in a moment.'); }
  if (!planBypassesVoiceCap(team)) throw refused(402, 'OPENAI_BYOK_PAID_REQUIRED', 'OpenAI voice BYOK is included with any paid plan, including BYOK at $1/month.');
  return { byok: true, apiKey: key.trim() };
}

// Separate signing domains stop a user-funded continuation being replayed
// without the key to obtain a platform-funded session past its allowance.
export const fundingSecret = (secret, byok) => secret ? secret + (byok ? ':openai-byok' : '') : '';
export const byokVoiceUsage = () => ({
  unit: 'minutes', period: null, used: 0, limit: null, minutesLeft: null,
  reserveMinutes: null, sessionId: null, isPro: false, hasPlan: true,
  byok: true, tokenFunded: false, tokensSpent: 0, tokensBalance: null,
});
