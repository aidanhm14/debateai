import { getDb } from './lib/firestore.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';

// Public read of a certificate by id. No auth. Powers the /verify/{id}
// landing page that anyone can open from a resume link.
//
// We return a deliberately narrow subset of fields — enough to render
// the cert visually and check it's genuine, but not the raw RFD body,
// raw transcript, or other internal stuff. The rfdExcerpt is shown so
// the cert links back to a real round (anti-pattern: hand out certs
// for empty rounds), but we cap it at ~600 chars and never show the
// raw judge prompt.

function sanitizeId(raw) {
  if (typeof raw !== 'string') return '';
  const cleaned = raw.toLowerCase().replace(/[^a-z2-9]/g, '');
  return cleaned.slice(0, 32);
}

export default async (request) => {
  if (request.method === 'OPTIONS') return corsResponse(request);
  if (request.method !== 'GET') return errorResponse('Method not allowed', 405, request);

  const url = new URL(request.url);
  const id = sanitizeId(url.searchParams.get('id'));
  if (!id) return errorResponse('Missing certificate id', 400, request);

  try {
    const db = getDb();
    const snap = await db.collection('certificates').doc(id).get();
    if (!snap.exists) {
      return jsonResponse({ ok: false, reason: 'not_found' }, 404, request);
    }
    const data = snap.data() || {};

    const issuedAtMs =
      typeof data.issuedAtMs === 'number'
        ? data.issuedAtMs
        : data.issuedAt && typeof data.issuedAt.toMillis === 'function'
        ? data.issuedAt.toMillis()
        : null;

    const cert = {
      certId: data.certId || id,
      displayName: data.displayName || 'Anonymous',
      tier: data.tier || 'novice',
      tierName: data.tierName || 'Novice',
      score: typeof data.score === 'number' ? data.score : null,
      motion: data.motion || '',
      side: data.side || '',
      sideLabel: data.sideLabel || '',
      format: data.format || '',
      formatLabel: data.formatLabel || '',
      personaLabel: data.personaLabel || '',
      aiLanguage: data.aiLanguage || 'en',
      won: data.won === true,
      // Practice vs certified. Legacy certs predate the field; treat the
      // absence as 'practice' since every round to date was solo-vs-AI.
      certClass: data.certClass === 'certified' ? 'certified' : 'practice',
      rfdExcerpt: (data.rfdExcerpt || '').slice(0, 600),
      issuedAtMs,
    };

    return jsonResponse({ ok: true, cert }, 200, request);
  } catch (err) {
    console.error('verify-cert error:', err.message, err.code || '');
    return errorResponse('Failed to verify certificate', 500, request);
  }
};

export const config = {
  path: '/api/verify-cert',
};
