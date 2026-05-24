// Firebase Auth admin helper. Used by features that need to read the
// raw Auth user list (the source of truth for all sign-ups, including
// Google / email-password accounts that never created a user_profiles
// doc).
//
// Reuses the same service-account credentials as ./firestore.mjs, in
// the same preference order (baked → split env vars → legacy JSON
// blob). Singleton-initialized so multiple call sites in one Lambda
// instance share one Firebase Admin app.
//
// The Firebase Admin SDK pulls in ~1.4MB unpacked. We only import the
// /app and /auth sub-paths to avoid the full RTDB / messaging bundle.

import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import {
  PROJECT_ID as BAKED_PROJECT_ID,
  CLIENT_EMAIL as BAKED_CLIENT_EMAIL,
  PRIVATE_KEY_B64 as BAKED_PRIVATE_KEY_B64,
} from './_firestore-creds.mjs';

const APP_NAME = 'debateos-admin';
let app = null;

function resolveCreds() {
  // Preferred: build-baked (same as firestore.mjs).
  if (BAKED_PROJECT_ID && BAKED_CLIENT_EMAIL && BAKED_PRIVATE_KEY_B64) {
    return {
      projectId: BAKED_PROJECT_ID,
      clientEmail: BAKED_CLIENT_EMAIL,
      privateKey: Buffer.from(BAKED_PRIVATE_KEY_B64, 'base64').toString('utf-8'),
    };
  }
  // Split env vars.
  const projectId = process.env.GOOGLE_PROJECT_ID;
  const clientEmail = process.env.GOOGLE_CLIENT_EMAIL;
  const rawKey = process.env.GOOGLE_PRIVATE_KEY;
  if (projectId && clientEmail && rawKey) {
    return { projectId, clientEmail, privateKey: rawKey.replace(/\\n/g, '\n') };
  }
  // Legacy JSON blob.
  const sa = process.env.GOOGLE_SERVICE_ACCOUNT;
  if (sa) {
    const creds = JSON.parse(sa);
    if (creds.project_id && creds.client_email && creds.private_key) {
      return {
        projectId: creds.project_id,
        clientEmail: creds.client_email,
        privateKey: creds.private_key,
      };
    }
  }
  throw new Error('Firebase Admin credentials not configured.');
}

function getAdminApp() {
  if (app) return app;
  const existing = getApps().find(a => a.name === APP_NAME);
  if (existing) { app = existing; return app; }
  const { projectId, clientEmail, privateKey } = resolveCreds();
  app = initializeApp({
    credential: cert({ projectId, clientEmail, privateKey }),
    projectId,
  }, APP_NAME);
  return app;
}

export function getAdminAuth() {
  return getAuth(getAdminApp());
}

/**
 * Paginate through every Firebase Auth user and return them.
 * Caller decides how to bucket / filter / count.
 *
 * Returns: Array<UserRecord> (see firebase-admin/auth UserRecord shape).
 * Each record has: uid, email, providerData[], metadata.creationTime,
 *                  metadata.lastSignInTime, ...
 *
 * NOTE: at scale this becomes expensive. Cache aggressively at the
 * call site. The hard ceiling here (50 pages × 1000) is 50K users —
 * past that we're throwing a guard error so we notice before it
 * silently truncates.
 */
export async function listAllAuthUsers({ pageSize = 1000, maxPages = 50 } = {}) {
  const out = [];
  let pageToken;
  let pages = 0;
  do {
    const res = await getAdminAuth().listUsers(pageSize, pageToken);
    for (const u of res.users) out.push(u);
    pageToken = res.pageToken;
    pages += 1;
    if (pages >= maxPages && pageToken) {
      throw new Error(`listAllAuthUsers exceeded ${maxPages} pages — raise the cap or paginate explicitly`);
    }
  } while (pageToken);
  return out;
}
