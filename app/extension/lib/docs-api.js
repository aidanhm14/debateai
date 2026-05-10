// Google Docs API client. Runs in the extension's background service
// worker (which is exempt from page CSP and has access to chrome.identity).
//
// Stage 1 scope (current): read-only.
//   getAuthToken({ interactive }) -> Bearer token via chrome.identity
//   getUserEmail(token)           -> /oauth2/v3/userinfo
//   readDoc(docId, token)         -> /v1/documents/{docId}
//   docToPlainText(doc)           -> walk the Docs body, return plain text
//   parseDocId(url)               -> extract docId from a Docs URL
//
// Stage 2 (future): adds proposeSuggestion(...) which calls
//   /v1/documents/{docId}:batchUpdate with insertText + writeControl set
//   to track-changes mode (Suggesting). Not exported yet — keep the
//   surface minimal until the Stage 1 read path is verified working.

const DOCS_API_BASE = 'https://docs.googleapis.com/v1';
const OAUTH_USERINFO = 'https://www.googleapis.com/oauth2/v3/userinfo';

/**
 * Get a Google OAuth access token via chrome.identity.
 * @param {{interactive?: boolean}} opts
 * @returns {Promise<string>}
 */
export function getAuthToken({ interactive = false } = {}) {
  return new Promise((resolve, reject) => {
    if (!chrome?.identity?.getAuthToken) {
      reject(new Error('chrome.identity.getAuthToken is not available — confirm "identity" is in manifest.permissions'));
      return;
    }
    chrome.identity.getAuthToken({ interactive }, (token) => {
      if (chrome.runtime.lastError || !token) {
        reject(new Error(chrome.runtime.lastError?.message || 'no token returned'));
        return;
      }
      resolve(token);
    });
  });
}

/**
 * Revoke the cached token so the next getAuthToken() call re-prompts.
 * Use on disconnect / sign-out.
 * @param {string} token
 */
export function clearAuthToken(token) {
  return new Promise((resolve) => {
    if (!token) { resolve(); return; }
    chrome.identity.removeCachedAuthToken({ token }, () => resolve());
  });
}

/**
 * Get the email of the signed-in Google account. Used for the
 * "Connected as foo@gmail.com" pill in the side panel.
 */
export async function getUserEmail(token) {
  const res = await fetch(OAUTH_USERINFO, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`userinfo ${res.status}`);
  const data = await res.json();
  return data.email || '';
}

/**
 * Read a Google Doc by its document ID.
 * @param {string} docId
 * @param {string} token  Bearer token from getAuthToken
 */
export async function readDoc(docId, token) {
  if (!docId) throw new Error('docId is required');
  const res = await fetch(`${DOCS_API_BASE}/documents/${encodeURIComponent(docId)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`docs.get ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

/**
 * Walk a Docs API document body and return plain text. The body is a
 * tree of structural elements (paragraphs, tables, etc.); within
 * paragraphs there are runs of text. We only care about text content
 * for Stage 1 — formatting, lists, tables, equations are flattened to
 * their visible characters.
 *
 * Rough mapping:
 *   body.content[]          -> structural elements
 *     .paragraph.elements[] -> paragraph elements (textRun, inlineObject, etc.)
 *       .textRun.content    -> the actual characters
 *     .table.tableRows[]    -> rows
 *       .tableCells[]       -> cells (each is a recursive document)
 */
export function docToPlainText(doc) {
  if (!doc?.body?.content) return '';
  const out = [];
  walkContent(doc.body.content, out);
  return out.join('').replace(//g, '\n').trim();
}

function walkContent(content, out) {
  for (const el of content) {
    if (el.paragraph) {
      for (const e of el.paragraph.elements || []) {
        if (e.textRun?.content) out.push(e.textRun.content);
      }
    } else if (el.table) {
      for (const row of el.table.tableRows || []) {
        for (const cell of row.tableCells || []) {
          if (cell.content) walkContent(cell.content, out);
          out.push('\t');
        }
        out.push('\n');
      }
    } else if (el.tableOfContents?.content) {
      walkContent(el.tableOfContents.content, out);
    }
  }
}

/**
 * Extract a Google Docs document ID from a URL like
 *   https://docs.google.com/document/d/<DOC_ID>/edit
 * Returns '' if the URL doesn't look like a Doc URL.
 */
export function parseDocId(url) {
  if (!url) return '';
  const m = String(url).match(/docs\.google\.com\/document\/d\/([^/?#]+)/);
  return m ? m[1] : '';
}

/**
 * Pretty title fallback. Docs API returns title as document.title; if
 * empty (untitled doc), surface "Untitled document" rather than ''.
 */
export function getDocTitle(doc) {
  return doc?.title?.trim() || 'Untitled document';
}
