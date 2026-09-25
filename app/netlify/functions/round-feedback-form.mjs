// Public, read-only configuration. Never exposes any other environment value.
export const handler = async event => {
  if (event.httpMethod !== 'GET') return { statusCode: 405, headers: { Allow: 'GET' }, body: '' };
  const candidate = process.env.ROUND_FEEDBACK_FORM_URL || '';
  let url = null;
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol === 'https:' && !parsed.username && !parsed.password &&
      ((parsed.hostname === 'docs.google.com' && /^\/forms\/d\/(?:e\/)?[\w-]+\/viewform$/.test(parsed.pathname)) ||
       (parsed.hostname === 'forms.gle' && /^\/[\w-]+$/.test(parsed.pathname)))) url = parsed.href;
  } catch {}
  return { statusCode: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=60' }, body: JSON.stringify({ url }) };
};
