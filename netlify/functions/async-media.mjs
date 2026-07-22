// /api/async/media/:id — streams a stored recording.
//
// Public read; ids are 18-char random capabilities. Range requests are
// honored because Safari's <video> refuses to play sources that answer a
// Range probe with a bare 200. Bodies are ≤24MB by upload cap, so the
// concat-then-slice approach stays inside function memory comfortably.
import { corsResponse, errorResponse } from './lib/response.mjs';
import { mediaStore, readMediaMeta, readMediaBuffer } from './lib/async-rounds.mjs';

export default async (request) => {
  if (request.method === 'OPTIONS') return corsResponse(request);
  if (request.method !== 'GET') return errorResponse('Method not allowed', 405, request);

  const m = new URL(request.url).pathname.match(/\/api\/async\/media\/([A-Za-z0-9:_-]+)$/);
  const id = m ? m[1] : '';
  if (!id) return errorResponse('Missing media id', 400, request);

  const store = mediaStore();
  const meta = await readMediaMeta(store, id);
  if (!meta) return errorResponse('Not found', 404, request);
  const buf = await readMediaBuffer(store, id, meta);
  if (!buf) return errorResponse('Not found', 404, request);

  const headers = {
    'Content-Type': meta.mime || 'application/octet-stream',
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'public, max-age=31536000, immutable',
    'Netlify-CDN-Cache-Control': 'public, durable, max-age=31536000, immutable',
  };

  const range = request.headers.get('range');
  if (range) {
    const rm = range.match(/bytes=(\d*)-(\d*)/);
    let start = rm && rm[1] ? parseInt(rm[1], 10) : 0;
    let end = rm && rm[2] ? parseInt(rm[2], 10) : buf.length - 1;
    if (!Number.isFinite(start) || start < 0) start = 0;
    if (!Number.isFinite(end) || end >= buf.length) end = buf.length - 1;
    if (start > end || start >= buf.length) {
      return new Response(null, { status: 416, headers: { ...headers, 'Content-Range': `bytes */${buf.length}` } });
    }
    return new Response(buf.subarray(start, end + 1), {
      status: 206,
      headers: { ...headers, 'Content-Range': `bytes ${start}-${end}/${buf.length}`, 'Content-Length': String(end - start + 1) },
    });
  }

  return new Response(buf, { status: 200, headers: { ...headers, 'Content-Length': String(buf.length) } });
};

export const config = { path: '/api/async/media/:id' };
