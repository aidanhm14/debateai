import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const appRoot = fileURLToPath(new URL('../../app/', import.meta.url));
export const readApp = name => readFileSync(path.join(appRoot, name), 'utf8');

export function between(source, start, end) {
  const from = source.indexOf(start), to = source.indexOf(end, from + start.length);
  if (from < 0 || to < 0) throw new Error('Missing source boundary: ' + start);
  return source.slice(from, to);
}

// All network traffic is intercepted, including SDKs, analytics and API
// writes. A fixture can never create accounts, match people or buy a plan.
export async function offlineSite(page, { api, document } = {}) {
  const errors = [], requests = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== 'https://debatable.test') {
      const react = url.pathname.match(/\/(react(?:-dom)?)\/[^/]+\/umd\/(react(?:-dom)?\.(?:production\.min|development)\.js)$/);
      if (react) return route.fulfill({ path: path.join(appRoot, 'node_modules', react[1], 'umd', react[2]) });
      return route.fulfill({ contentType: request.resourceType() === 'stylesheet' ? 'text/css' : 'application/javascript', body: '' });
    }
    if (url.pathname.startsWith('/api/')) {
      requests.push({ path: url.pathname, method: request.method(), body: request.postData() });
      const response = api && await api(url, request);
      return route.fulfill(response || { json: { ok: true, waiting: 0, count: 0, debaters: [], rounds: [], users: [], entries: [] } });
    }
    let name = url.pathname === '/' ? '/landing.html' : url.pathname;
    if (!path.extname(name)) name += '.html';
    const file = path.resolve(appRoot, '.' + name);
    if (!file.startsWith(appRoot) || !existsSync(file)) return route.fulfill({ status: 404, body: '' });
    if (document && request.isNavigationRequest()) return route.fulfill({ contentType: 'text/html', body: document(readFileSync(file, 'utf8')) });
    return route.fulfill({ path: file });
  });
  return { errors, requests };
}
