
import {createRequire as ___nfyCreateRequire} from "module";
import {fileURLToPath as ___nfyFileURLToPath} from "url";
import {dirname as ___nfyPathDirname} from "path";
let __filename=___nfyFileURLToPath(import.meta.url);
let __dirname=___nfyPathDirname(___nfyFileURLToPath(import.meta.url));
let require=___nfyCreateRequire(import.meta.url);

var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// ../../../netlify/functions/lib/firestore.mjs
var firestore_exports = {};
__export(firestore_exports, {
  FieldValue: () => FieldValue,
  PLANS: () => PLANS,
  getDb: () => getDb,
  getUserTeam: () => getUserTeam,
  logUsage: () => logUsage
});
import { Firestore, FieldValue } from "@google-cloud/firestore";
function getDb() {
  if (db) return db;
  const serviceAccount = process.env.GOOGLE_SERVICE_ACCOUNT;
  if (!serviceAccount) throw new Error("GOOGLE_SERVICE_ACCOUNT not configured");
  let creds;
  try {
    creds = JSON.parse(serviceAccount);
  } catch (e) {
    console.error("GOOGLE_SERVICE_ACCOUNT JSON parse failed. First 50 chars:", serviceAccount.slice(0, 50), "... Last 50 chars:", serviceAccount.slice(-50));
    throw new Error("GOOGLE_SERVICE_ACCOUNT is not valid JSON. Re-paste the service account key.");
  }
  if (!creds.project_id || !creds.client_email || !creds.private_key) {
    console.error("GOOGLE_SERVICE_ACCOUNT missing fields. Keys found:", Object.keys(creds).join(", "));
    throw new Error("GOOGLE_SERVICE_ACCOUNT is missing required fields (project_id, client_email, or private_key).");
  }
  db = new Firestore({
    projectId: creds.project_id,
    credentials: {
      client_email: creds.client_email,
      private_key: creds.private_key
    }
  });
  return db;
}
async function getUserTeam(uid) {
  const db2 = getDb();
  const memberships = await db2.collection("team_members").where("userId", "==", uid).limit(1).get();
  if (memberships.empty) return null;
  const membership = memberships.docs[0].data();
  const teamRef = db2.collection("teams").doc(membership.teamId);
  const teamDoc = await teamRef.get();
  if (!teamDoc.exists) return null;
  return {
    team: { id: teamDoc.id, ...teamDoc.data() },
    teamRef,
    membership
  };
}
async function logUsage(teamId, userId, feature, inputTokens = 0, outputTokens = 0) {
  const db2 = getDb();
  await db2.collection("teams").doc(teamId).update({
    usageThisPeriod: FieldValue.increment(1),
    updatedAt: FieldValue.serverTimestamp()
  });
  await db2.collection("usage_logs").add({
    teamId,
    userId,
    feature,
    inputTokens,
    outputTokens,
    timestamp: FieldValue.serverTimestamp()
  });
}
var db, PLANS;
var init_firestore = __esm({
  "../../../netlify/functions/lib/firestore.mjs"() {
    db = null;
    PLANS = {
      trial: { requests: 3, members: 3, priceMonthly: 0 },
      byok: { requests: 9999, members: 1, priceMonthly: 100 },
      individual: { requests: 250, members: 1, priceMonthly: 500 },
      lifetime: { requests: 250, members: 3, priceMonthly: 0 },
      team: { requests: 1500, members: 50, priceMonthly: 3e3 }
    };
  }
});

// ../../../netlify/functions/save-profile.mjs
init_firestore();

// ../../../netlify/functions/lib/auth.mjs
var cachedKeys = null;
var cachedKeysExpiry = 0;
var FIREBASE_PROJECT_ID = "debateos-78ac5";
var GOOGLE_JWKS_URL = "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";
async function getJwks() {
  if (cachedKeys && Date.now() < cachedKeysExpiry) return cachedKeys;
  const res = await fetch(GOOGLE_JWKS_URL);
  if (!res.ok) throw new Error("Failed to fetch Google JWKs");
  const cacheControl = res.headers.get("cache-control") || "";
  const maxAgeMatch = cacheControl.match(/max-age=(\d+)/);
  const maxAge = maxAgeMatch ? parseInt(maxAgeMatch[1], 10) * 1e3 : 36e5;
  cachedKeysExpiry = Date.now() + maxAge;
  const data = await res.json();
  cachedKeys = data.keys;
  return cachedKeys;
}
function base64urlDecode(str) {
  str = str.replace(/-/g, "+").replace(/_/g, "/");
  while (str.length % 4) str += "=";
  if (typeof Buffer !== "undefined") {
    return Buffer.from(str, "base64").toString("binary");
  }
  return atob(str);
}
function base64urlToUint8Array(str) {
  const binary = base64urlDecode(str);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
async function verifyIdToken(idToken) {
  if (!idToken) throw new Error("No ID token provided");
  const parts = idToken.split(".");
  if (parts.length !== 3) throw new Error("Invalid token format");
  const header = JSON.parse(base64urlDecode(parts[0]));
  const payload = JSON.parse(base64urlDecode(parts[1]));
  const now = Math.floor(Date.now() / 1e3);
  if (payload.exp < now) throw new Error("Token expired");
  if (payload.iat > now + 300) throw new Error("Token issued in the future");
  if (payload.aud !== FIREBASE_PROJECT_ID) throw new Error("Invalid audience");
  if (payload.iss !== `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`)
    throw new Error("Invalid issuer");
  if (!payload.sub || typeof payload.sub !== "string")
    throw new Error("Invalid subject");
  const jwks = await getJwks();
  const jwk = jwks.find((k) => k.kid === header.kid);
  if (!jwk) throw new Error("Unknown signing key");
  const cryptoKey = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"]
  );
  const signatureBuffer = base64urlToUint8Array(parts[2]);
  const dataBuffer = new TextEncoder().encode(parts[0] + "." + parts[1]);
  const valid = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    signatureBuffer,
    dataBuffer
  );
  if (!valid) throw new Error("Invalid token signature");
  return payload;
}
function extractBearerToken(request) {
  const auth = request.headers.get("authorization") || "";
  if (!auth.startsWith("Bearer ")) return null;
  return auth.slice(7);
}

// ../../../netlify/functions/lib/response.mjs
var PRODUCTION_ORIGINS = [
  "https://debateos1.netlify.app",
  "https://devilsadvocate1.netlify.app",
  "https://debateos.com",
  "https://www.debateos.com",
  "https://debatethedevil.com",
  "https://www.debatethedevil.com"
];
var DEV_ORIGINS = [
  "http://localhost:8888",
  "http://localhost:3000"
];
var isProduction = process.env.CONTEXT === "production";
var ALLOWED_ORIGINS = isProduction ? PRODUCTION_ORIGINS : [...PRODUCTION_ORIGINS, ...DEV_ORIGINS];
var DEFAULT_ORIGIN = ALLOWED_ORIGINS[0];
function getOrigin(request) {
  if (!request) return DEFAULT_ORIGIN;
  const origin = request?.headers?.get?.("origin") || "";
  return ALLOWED_ORIGINS.includes(origin) ? origin : DEFAULT_ORIGIN;
}
function corsHeaders(request) {
  return {
    "Access-Control-Allow-Origin": getOrigin(request),
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization"
  };
}
function corsResponse(request) {
  return new Response(null, { status: 204, headers: corsHeaders(request) });
}
function jsonResponse(data, status = 200, request) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(request) }
  });
}
function errorResponse(message, status = 400, request) {
  return jsonResponse({ error: message }, status, request);
}

// ../../../netlify/functions/save-profile.mjs
var rateLimitMap = /* @__PURE__ */ new Map();
var RATE_LIMIT_WINDOW = 6e4;
var RATE_LIMIT_MAX = 10;
function checkRateLimit(userId) {
  const now = Date.now();
  const key = userId || "anon";
  const entry = rateLimitMap.get(key);
  if (!entry || now - entry.start > RATE_LIMIT_WINDOW) {
    rateLimitMap.set(key, { start: now, count: 1 });
    return true;
  }
  entry.count++;
  if (entry.count > RATE_LIMIT_MAX) return false;
  return true;
}
var save_profile_default = async (request) => {
  if (request.method === "OPTIONS") return corsResponse(request);
  if (request.method !== "POST") return errorResponse("Method not allowed", 405, request);
  try {
    const token = extractBearerToken(request);
    if (!token) return errorResponse("Authorization required", 401, request);
    const decoded = await verifyIdToken(token);
    const uid = decoded.sub;
    if (!checkRateLimit(uid)) {
      return errorResponse("Too many requests. Please wait a moment and try again.", 429, request);
    }
    const body = await request.json();
    const db2 = getDb();
    if (body.type === "debater_profile") {
      await db2.collection("user_profiles").doc(uid).set({
        debaterProfile: {
          analysis: body.analysis || "",
          strengths: body.strengths || [],
          weaknesses: body.weaknesses || [],
          updatedAt: FieldValue.serverTimestamp()
        }
      }, { merge: true });
      return jsonResponse({ ok: true, type: "debater_profile" }, 200, request);
    }
    if (body.type === "style_profile") {
      await db2.collection("user_profiles").doc(uid).set({
        styleProfile: body.profile || {}
      }, { merge: true });
      return jsonResponse({ ok: true, type: "style_profile" }, 200, request);
    }
    if (body.type === "referral_credit") {
      const referrerUid = body.referrerUid;
      if (!referrerUid) return errorResponse("Missing referrer UID", 400, request);
      if (referrerUid === uid) return errorResponse("Cannot refer yourself", 400, request);
      const accountCreatedAt = decoded.auth_time || decoded.iat || 0;
      const twentyFourHoursAgo = Math.floor(Date.now() / 1e3) - 86400;
      if (accountCreatedAt < twentyFourHoursAgo) {
        return errorResponse(
          "Referral credits are only available for accounts created in the last 24 hours",
          403,
          request
        );
      }
      const existing = await db2.collection("referral_credits").where("referredUid", "==", uid).where("referrerUid", "==", referrerUid).limit(1).get();
      if (!existing.empty) return jsonResponse({ ok: true, alreadyCredited: true }, 200, request);
      const oneMinuteAgo = new Date(Date.now() - 6e4);
      const recentCredits = await db2.collection("referral_credits").where("referredUid", "==", uid).where("creditedAt", ">=", oneMinuteAgo).limit(1).get();
      if (!recentCredits.empty) {
        return errorResponse("Too many referral requests. Please wait a moment.", 429, request);
      }
      const referrerCredits = await db2.collection("referral_credits").where("referrerUid", "==", referrerUid).get();
      const totalBonusGranted = referrerCredits.docs.reduce(
        (sum, doc) => sum + (doc.data().bonusRequests || 0),
        0
      );
      if (totalBonusGranted >= 15) {
        return errorResponse(
          "This referrer has reached the maximum referral bonus (15 requests)",
          403,
          request
        );
      }
      const bonusRequests = Math.min(3, 15 - totalBonusGranted);
      await db2.collection("referral_credits").add({
        referrerUid,
        referredUid: uid,
        bonusRequests,
        creditedAt: FieldValue.serverTimestamp()
      });
      const { getUserTeam: getUserTeam2 } = await Promise.resolve().then(() => (init_firestore(), firestore_exports));
      const referrerTeam = await getUserTeam2(referrerUid);
      if (referrerTeam) {
        await referrerTeam.teamRef.update({
          usageLimit: FieldValue.increment(bonusRequests)
        });
      }
      return jsonResponse({ ok: true, credited: true, bonusRequests }, 200, request);
    }
    return errorResponse("Unknown profile type", 400, request);
  } catch (e) {
    return errorResponse("Server error", 500, request);
  }
};
var config = { path: "/api/save-profile" };
export {
  config,
  save_profile_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vLi4vLi4vbmV0bGlmeS9mdW5jdGlvbnMvbGliL2ZpcmVzdG9yZS5tanMiLCAiLi4vLi4vLi4vbmV0bGlmeS9mdW5jdGlvbnMvc2F2ZS1wcm9maWxlLm1qcyIsICIuLi8uLi8uLi9uZXRsaWZ5L2Z1bmN0aW9ucy9saWIvYXV0aC5tanMiLCAiLi4vLi4vLi4vbmV0bGlmeS9mdW5jdGlvbnMvbGliL3Jlc3BvbnNlLm1qcyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiaW1wb3J0IHsgRmlyZXN0b3JlLCBGaWVsZFZhbHVlIH0gZnJvbSAnQGdvb2dsZS1jbG91ZC9maXJlc3RvcmUnO1xuXG5sZXQgZGIgPSBudWxsO1xuXG5leHBvcnQgZnVuY3Rpb24gZ2V0RGIoKSB7XG4gIGlmIChkYikgcmV0dXJuIGRiO1xuXG4gIGNvbnN0IHNlcnZpY2VBY2NvdW50ID0gcHJvY2Vzcy5lbnYuR09PR0xFX1NFUlZJQ0VfQUNDT1VOVDtcbiAgaWYgKCFzZXJ2aWNlQWNjb3VudCkgdGhyb3cgbmV3IEVycm9yKCdHT09HTEVfU0VSVklDRV9BQ0NPVU5UIG5vdCBjb25maWd1cmVkJyk7XG5cbiAgbGV0IGNyZWRzO1xuICB0cnkge1xuICAgIGNyZWRzID0gSlNPTi5wYXJzZShzZXJ2aWNlQWNjb3VudCk7XG4gIH0gY2F0Y2ggKGUpIHtcbiAgICBjb25zb2xlLmVycm9yKCdHT09HTEVfU0VSVklDRV9BQ0NPVU5UIEpTT04gcGFyc2UgZmFpbGVkLiBGaXJzdCA1MCBjaGFyczonLCBzZXJ2aWNlQWNjb3VudC5zbGljZSgwLCA1MCksICcuLi4gTGFzdCA1MCBjaGFyczonLCBzZXJ2aWNlQWNjb3VudC5zbGljZSgtNTApKTtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ0dPT0dMRV9TRVJWSUNFX0FDQ09VTlQgaXMgbm90IHZhbGlkIEpTT04uIFJlLXBhc3RlIHRoZSBzZXJ2aWNlIGFjY291bnQga2V5LicpO1xuICB9XG5cbiAgaWYgKCFjcmVkcy5wcm9qZWN0X2lkIHx8ICFjcmVkcy5jbGllbnRfZW1haWwgfHwgIWNyZWRzLnByaXZhdGVfa2V5KSB7XG4gICAgY29uc29sZS5lcnJvcignR09PR0xFX1NFUlZJQ0VfQUNDT1VOVCBtaXNzaW5nIGZpZWxkcy4gS2V5cyBmb3VuZDonLCBPYmplY3Qua2V5cyhjcmVkcykuam9pbignLCAnKSk7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdHT09HTEVfU0VSVklDRV9BQ0NPVU5UIGlzIG1pc3NpbmcgcmVxdWlyZWQgZmllbGRzIChwcm9qZWN0X2lkLCBjbGllbnRfZW1haWwsIG9yIHByaXZhdGVfa2V5KS4nKTtcbiAgfVxuXG4gIGRiID0gbmV3IEZpcmVzdG9yZSh7XG4gICAgcHJvamVjdElkOiBjcmVkcy5wcm9qZWN0X2lkLFxuICAgIGNyZWRlbnRpYWxzOiB7XG4gICAgICBjbGllbnRfZW1haWw6IGNyZWRzLmNsaWVudF9lbWFpbCxcbiAgICAgIHByaXZhdGVfa2V5OiBjcmVkcy5wcml2YXRlX2tleSxcbiAgICB9LFxuICB9KTtcbiAgcmV0dXJuIGRiO1xufVxuXG4vLyBQbGFuIHRpZXIgZGVmaW5pdGlvbnNcbmV4cG9ydCBjb25zdCBQTEFOUyA9IHtcbiAgdHJpYWw6ICB7IHJlcXVlc3RzOiAzLCAgICBtZW1iZXJzOiAzLCAgcHJpY2VNb250aGx5OiAwIH0sXG4gIGJ5b2s6ICAgICAgIHsgcmVxdWVzdHM6IDk5OTksIG1lbWJlcnM6IDEsICBwcmljZU1vbnRobHk6IDEwMCB9LFxuICBpbmRpdmlkdWFsOiB7IHJlcXVlc3RzOiAyNTAsICBtZW1iZXJzOiAxLCAgcHJpY2VNb250aGx5OiA1MDAgfSxcbiAgbGlmZXRpbWU6ICAgeyByZXF1ZXN0czogMjUwLCAgbWVtYmVyczogMywgIHByaWNlTW9udGhseTogMCB9LFxuICB0ZWFtOiAgICAgICB7IHJlcXVlc3RzOiAxNTAwLCBtZW1iZXJzOiA1MCwgcHJpY2VNb250aGx5OiAzMDAwIH0sXG59O1xuXG4vKipcbiAqIExvb2sgdXAgYSB1c2VyJ3MgdGVhbSBnaXZlbiB0aGVpciBGaXJlYmFzZSBVSUQuXG4gKiBSZXR1cm5zIHsgdGVhbSwgdGVhbVJlZiwgbWVtYmVyc2hpcCB9IG9yIG51bGwgaWYgbm8gdGVhbS5cbiAqL1xuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGdldFVzZXJUZWFtKHVpZCkge1xuICBjb25zdCBkYiA9IGdldERiKCk7XG5cbiAgLy8gRmluZCBtZW1iZXJzaGlwXG4gIGNvbnN0IG1lbWJlcnNoaXBzID0gYXdhaXQgZGIuY29sbGVjdGlvbigndGVhbV9tZW1iZXJzJylcbiAgICAud2hlcmUoJ3VzZXJJZCcsICc9PScsIHVpZClcbiAgICAubGltaXQoMSlcbiAgICAuZ2V0KCk7XG5cbiAgaWYgKG1lbWJlcnNoaXBzLmVtcHR5KSByZXR1cm4gbnVsbDtcblxuICBjb25zdCBtZW1iZXJzaGlwID0gbWVtYmVyc2hpcHMuZG9jc1swXS5kYXRhKCk7XG4gIGNvbnN0IHRlYW1SZWYgPSBkYi5jb2xsZWN0aW9uKCd0ZWFtcycpLmRvYyhtZW1iZXJzaGlwLnRlYW1JZCk7XG4gIGNvbnN0IHRlYW1Eb2MgPSBhd2FpdCB0ZWFtUmVmLmdldCgpO1xuXG4gIGlmICghdGVhbURvYy5leGlzdHMpIHJldHVybiBudWxsO1xuXG4gIHJldHVybiB7XG4gICAgdGVhbTogeyBpZDogdGVhbURvYy5pZCwgLi4udGVhbURvYy5kYXRhKCkgfSxcbiAgICB0ZWFtUmVmLFxuICAgIG1lbWJlcnNoaXAsXG4gIH07XG59XG5cbi8qKlxuICogSW5jcmVtZW50IHVzYWdlIGNvdW50ZXIgZm9yIGEgdGVhbSBhbmQgbG9nIHRoZSByZXF1ZXN0LlxuICovXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gbG9nVXNhZ2UodGVhbUlkLCB1c2VySWQsIGZlYXR1cmUsIGlucHV0VG9rZW5zID0gMCwgb3V0cHV0VG9rZW5zID0gMCkge1xuICBjb25zdCBkYiA9IGdldERiKCk7XG5cbiAgLy8gQXRvbWljIGluY3JlbWVudCBvZiB0aGUgdGVhbSB1c2FnZSBjb3VudGVyXG4gIGF3YWl0IGRiLmNvbGxlY3Rpb24oJ3RlYW1zJykuZG9jKHRlYW1JZCkudXBkYXRlKHtcbiAgICB1c2FnZVRoaXNQZXJpb2Q6IEZpZWxkVmFsdWUuaW5jcmVtZW50KDEpLFxuICAgIHVwZGF0ZWRBdDogRmllbGRWYWx1ZS5zZXJ2ZXJUaW1lc3RhbXAoKSxcbiAgfSk7XG5cbiAgLy8gQXBwZW5kIGRldGFpbGVkIHVzYWdlIGxvZ1xuICBhd2FpdCBkYi5jb2xsZWN0aW9uKCd1c2FnZV9sb2dzJykuYWRkKHtcbiAgICB0ZWFtSWQsXG4gICAgdXNlcklkLFxuICAgIGZlYXR1cmUsXG4gICAgaW5wdXRUb2tlbnMsXG4gICAgb3V0cHV0VG9rZW5zLFxuICAgIHRpbWVzdGFtcDogRmllbGRWYWx1ZS5zZXJ2ZXJUaW1lc3RhbXAoKSxcbiAgfSk7XG59XG5cbmV4cG9ydCB7IEZpZWxkVmFsdWUgfTtcbiIsICJpbXBvcnQgeyBnZXREYiwgRmllbGRWYWx1ZSB9IGZyb20gJy4vbGliL2ZpcmVzdG9yZS5tanMnO1xuaW1wb3J0IHsgdmVyaWZ5SWRUb2tlbiwgZXh0cmFjdEJlYXJlclRva2VuIH0gZnJvbSAnLi9saWIvYXV0aC5tanMnO1xuaW1wb3J0IHsgY29yc1Jlc3BvbnNlLCBqc29uUmVzcG9uc2UsIGVycm9yUmVzcG9uc2UgfSBmcm9tICcuL2xpYi9yZXNwb25zZS5tanMnO1xuXG4vLyBJbi1tZW1vcnkgcmF0ZSBsaW1pdGVyIChyZXNldHMgb24gY29sZCBzdGFydCBcdTIwMTQgYSBwZXJzaXN0ZW50IHN0b3JlIHdvdWxkIGJlIGJldHRlcilcbmNvbnN0IHJhdGVMaW1pdE1hcCA9IG5ldyBNYXAoKTtcbmNvbnN0IFJBVEVfTElNSVRfV0lORE9XID0gNjBfMDAwOyAvLyAxIG1pbnV0ZVxuY29uc3QgUkFURV9MSU1JVF9NQVggPSAxMDsgLy8gbWF4IHJlcXVlc3RzIHBlciBtaW51dGUgcGVyIHVzZXJcblxuZnVuY3Rpb24gY2hlY2tSYXRlTGltaXQodXNlcklkKSB7XG4gIGNvbnN0IG5vdyA9IERhdGUubm93KCk7XG4gIGNvbnN0IGtleSA9IHVzZXJJZCB8fCAnYW5vbic7XG4gIGNvbnN0IGVudHJ5ID0gcmF0ZUxpbWl0TWFwLmdldChrZXkpO1xuICBpZiAoIWVudHJ5IHx8IG5vdyAtIGVudHJ5LnN0YXJ0ID4gUkFURV9MSU1JVF9XSU5ET1cpIHtcbiAgICByYXRlTGltaXRNYXAuc2V0KGtleSwgeyBzdGFydDogbm93LCBjb3VudDogMSB9KTtcbiAgICByZXR1cm4gdHJ1ZTtcbiAgfVxuICBlbnRyeS5jb3VudCsrO1xuICBpZiAoZW50cnkuY291bnQgPiBSQVRFX0xJTUlUX01BWCkgcmV0dXJuIGZhbHNlO1xuICByZXR1cm4gdHJ1ZTtcbn1cblxuZXhwb3J0IGRlZmF1bHQgYXN5bmMgKHJlcXVlc3QpID0+IHtcbiAgaWYgKHJlcXVlc3QubWV0aG9kID09PSAnT1BUSU9OUycpIHJldHVybiBjb3JzUmVzcG9uc2UocmVxdWVzdCk7XG4gIGlmIChyZXF1ZXN0Lm1ldGhvZCAhPT0gJ1BPU1QnKSByZXR1cm4gZXJyb3JSZXNwb25zZSgnTWV0aG9kIG5vdCBhbGxvd2VkJywgNDA1LCByZXF1ZXN0KTtcblxuICB0cnkge1xuICAgIGNvbnN0IHRva2VuID0gZXh0cmFjdEJlYXJlclRva2VuKHJlcXVlc3QpO1xuICAgIGlmICghdG9rZW4pIHJldHVybiBlcnJvclJlc3BvbnNlKCdBdXRob3JpemF0aW9uIHJlcXVpcmVkJywgNDAxLCByZXF1ZXN0KTtcbiAgICBjb25zdCBkZWNvZGVkID0gYXdhaXQgdmVyaWZ5SWRUb2tlbih0b2tlbik7XG4gICAgY29uc3QgdWlkID0gZGVjb2RlZC5zdWI7XG5cbiAgICBpZiAoIWNoZWNrUmF0ZUxpbWl0KHVpZCkpIHtcbiAgICAgIHJldHVybiBlcnJvclJlc3BvbnNlKCdUb28gbWFueSByZXF1ZXN0cy4gUGxlYXNlIHdhaXQgYSBtb21lbnQgYW5kIHRyeSBhZ2Fpbi4nLCA0MjksIHJlcXVlc3QpO1xuICAgIH1cbiAgICBjb25zdCBib2R5ID0gYXdhaXQgcmVxdWVzdC5qc29uKCk7XG4gICAgY29uc3QgZGIgPSBnZXREYigpO1xuXG4gICAgLy8gRGViYXRlciB0aGlua2luZyBwcm9maWxlXG4gICAgaWYgKGJvZHkudHlwZSA9PT0gJ2RlYmF0ZXJfcHJvZmlsZScpIHtcbiAgICAgIGF3YWl0IGRiLmNvbGxlY3Rpb24oJ3VzZXJfcHJvZmlsZXMnKS5kb2ModWlkKS5zZXQoe1xuICAgICAgICBkZWJhdGVyUHJvZmlsZToge1xuICAgICAgICAgIGFuYWx5c2lzOiBib2R5LmFuYWx5c2lzIHx8ICcnLFxuICAgICAgICAgIHN0cmVuZ3RoczogYm9keS5zdHJlbmd0aHMgfHwgW10sXG4gICAgICAgICAgd2Vha25lc3NlczogYm9keS53ZWFrbmVzc2VzIHx8IFtdLFxuICAgICAgICAgIHVwZGF0ZWRBdDogRmllbGRWYWx1ZS5zZXJ2ZXJUaW1lc3RhbXAoKSxcbiAgICAgICAgfVxuICAgICAgfSwgeyBtZXJnZTogdHJ1ZSB9KTtcbiAgICAgIHJldHVybiBqc29uUmVzcG9uc2UoeyBvazogdHJ1ZSwgdHlwZTogJ2RlYmF0ZXJfcHJvZmlsZScgfSwgMjAwLCByZXF1ZXN0KTtcbiAgICB9XG5cbiAgICAvLyBXcml0aW5nIHN0eWxlIHByb2ZpbGVcbiAgICBpZiAoYm9keS50eXBlID09PSAnc3R5bGVfcHJvZmlsZScpIHtcbiAgICAgIGF3YWl0IGRiLmNvbGxlY3Rpb24oJ3VzZXJfcHJvZmlsZXMnKS5kb2ModWlkKS5zZXQoe1xuICAgICAgICBzdHlsZVByb2ZpbGU6IGJvZHkucHJvZmlsZSB8fCB7fSxcbiAgICAgIH0sIHsgbWVyZ2U6IHRydWUgfSk7XG4gICAgICByZXR1cm4ganNvblJlc3BvbnNlKHsgb2s6IHRydWUsIHR5cGU6ICdzdHlsZV9wcm9maWxlJyB9LCAyMDAsIHJlcXVlc3QpO1xuICAgIH1cblxuICAgIC8vIFJlZmVycmFsIHRyYWNraW5nXG4gICAgaWYgKGJvZHkudHlwZSA9PT0gJ3JlZmVycmFsX2NyZWRpdCcpIHtcbiAgICAgIGNvbnN0IHJlZmVycmVyVWlkID0gYm9keS5yZWZlcnJlclVpZDtcbiAgICAgIGlmICghcmVmZXJyZXJVaWQpIHJldHVybiBlcnJvclJlc3BvbnNlKCdNaXNzaW5nIHJlZmVycmVyIFVJRCcsIDQwMCwgcmVxdWVzdCk7XG5cbiAgICAgIC8vIEJsb2NrIHNlbGYtcmVmZXJyYWxcbiAgICAgIGlmIChyZWZlcnJlclVpZCA9PT0gdWlkKSByZXR1cm4gZXJyb3JSZXNwb25zZSgnQ2Fubm90IHJlZmVyIHlvdXJzZWxmJywgNDAwLCByZXF1ZXN0KTtcblxuICAgICAgLy8gQ2hlY2sgdGhhdCB0aGUgcmVmZXJyZWQgdXNlcidzIGFjY291bnQgd2FzIGNyZWF0ZWQgd2l0aGluIHRoZSBsYXN0IDI0IGhvdXJzLlxuICAgICAgLy8gZGVjb2RlZC5hdXRoX3RpbWUgaXMgdGhlIEZpcmViYXNlIHRva2VuJ3MgYXV0aF90aW1lIChzZWNvbmRzIHNpbmNlIGVwb2NoKS5cbiAgICAgIC8vIGRlY29kZWQuaWF0IChpc3N1ZWQtYXQpIGlzIGEgZmFsbGJhY2sgcHJveHkgZm9yIGFjY291bnQgYWdlLlxuICAgICAgY29uc3QgYWNjb3VudENyZWF0ZWRBdCA9IGRlY29kZWQuYXV0aF90aW1lIHx8IGRlY29kZWQuaWF0IHx8IDA7XG4gICAgICBjb25zdCB0d2VudHlGb3VySG91cnNBZ28gPSBNYXRoLmZsb29yKERhdGUubm93KCkgLyAxMDAwKSAtIDg2NDAwO1xuICAgICAgaWYgKGFjY291bnRDcmVhdGVkQXQgPCB0d2VudHlGb3VySG91cnNBZ28pIHtcbiAgICAgICAgcmV0dXJuIGVycm9yUmVzcG9uc2UoXG4gICAgICAgICAgJ1JlZmVycmFsIGNyZWRpdHMgYXJlIG9ubHkgYXZhaWxhYmxlIGZvciBhY2NvdW50cyBjcmVhdGVkIGluIHRoZSBsYXN0IDI0IGhvdXJzJyxcbiAgICAgICAgICA0MDMsXG4gICAgICAgICAgcmVxdWVzdFxuICAgICAgICApO1xuICAgICAgfVxuXG4gICAgICAvLyBDaGVjayBpZiBhbHJlYWR5IGNyZWRpdGVkICh0aGlzIHJlZmVycmVkIHVzZXIgKyB0aGlzIHJlZmVycmVyKVxuICAgICAgY29uc3QgZXhpc3RpbmcgPSBhd2FpdCBkYi5jb2xsZWN0aW9uKCdyZWZlcnJhbF9jcmVkaXRzJylcbiAgICAgICAgLndoZXJlKCdyZWZlcnJlZFVpZCcsICc9PScsIHVpZClcbiAgICAgICAgLndoZXJlKCdyZWZlcnJlclVpZCcsICc9PScsIHJlZmVycmVyVWlkKVxuICAgICAgICAubGltaXQoMSlcbiAgICAgICAgLmdldCgpO1xuXG4gICAgICBpZiAoIWV4aXN0aW5nLmVtcHR5KSByZXR1cm4ganNvblJlc3BvbnNlKHsgb2s6IHRydWUsIGFscmVhZHlDcmVkaXRlZDogdHJ1ZSB9LCAyMDAsIHJlcXVlc3QpO1xuXG4gICAgICAvLyBSYXRlIGxpbWl0OiBtYXggMSByZWZlcnJhbCBjcmVkaXQgcGVyIG1pbnV0ZSBwZXIgcmVmZXJyZWQgdXNlci5cbiAgICAgIC8vIENoZWNrIGlmIHRoaXMgcmVmZXJyZWQgdXNlciBoYXMgYW55IGNyZWRpdCBpbiB0aGUgbGFzdCA2MCBzZWNvbmRzLlxuICAgICAgY29uc3Qgb25lTWludXRlQWdvID0gbmV3IERhdGUoRGF0ZS5ub3coKSAtIDYwMDAwKTtcbiAgICAgIGNvbnN0IHJlY2VudENyZWRpdHMgPSBhd2FpdCBkYi5jb2xsZWN0aW9uKCdyZWZlcnJhbF9jcmVkaXRzJylcbiAgICAgICAgLndoZXJlKCdyZWZlcnJlZFVpZCcsICc9PScsIHVpZClcbiAgICAgICAgLndoZXJlKCdjcmVkaXRlZEF0JywgJz49Jywgb25lTWludXRlQWdvKVxuICAgICAgICAubGltaXQoMSlcbiAgICAgICAgLmdldCgpO1xuXG4gICAgICBpZiAoIXJlY2VudENyZWRpdHMuZW1wdHkpIHtcbiAgICAgICAgcmV0dXJuIGVycm9yUmVzcG9uc2UoJ1RvbyBtYW55IHJlZmVycmFsIHJlcXVlc3RzLiBQbGVhc2Ugd2FpdCBhIG1vbWVudC4nLCA0MjksIHJlcXVlc3QpO1xuICAgICAgfVxuXG4gICAgICAvLyBHbG9iYWwgY2FwOiBlYWNoIHJlZmVycmVyIGNhbiByZWNlaXZlIG1heCAxNSBib251cyByZXF1ZXN0cyB0b3RhbFxuICAgICAgLy8gKDUgcmVmZXJyYWxzIHggMyBib251cyBlYWNoKS5cbiAgICAgIGNvbnN0IHJlZmVycmVyQ3JlZGl0cyA9IGF3YWl0IGRiLmNvbGxlY3Rpb24oJ3JlZmVycmFsX2NyZWRpdHMnKVxuICAgICAgICAud2hlcmUoJ3JlZmVycmVyVWlkJywgJz09JywgcmVmZXJyZXJVaWQpXG4gICAgICAgIC5nZXQoKTtcblxuICAgICAgY29uc3QgdG90YWxCb251c0dyYW50ZWQgPSByZWZlcnJlckNyZWRpdHMuZG9jcy5yZWR1Y2UoXG4gICAgICAgIChzdW0sIGRvYykgPT4gc3VtICsgKGRvYy5kYXRhKCkuYm9udXNSZXF1ZXN0cyB8fCAwKSxcbiAgICAgICAgMFxuICAgICAgKTtcblxuICAgICAgaWYgKHRvdGFsQm9udXNHcmFudGVkID49IDE1KSB7XG4gICAgICAgIHJldHVybiBlcnJvclJlc3BvbnNlKFxuICAgICAgICAgICdUaGlzIHJlZmVycmVyIGhhcyByZWFjaGVkIHRoZSBtYXhpbXVtIHJlZmVycmFsIGJvbnVzICgxNSByZXF1ZXN0cyknLFxuICAgICAgICAgIDQwMyxcbiAgICAgICAgICByZXF1ZXN0XG4gICAgICAgICk7XG4gICAgICB9XG5cbiAgICAgIC8vIENhcCB0aGUgYm9udXMgc28gaXQgbmV2ZXIgZXhjZWVkcyB0aGUgMTUtcmVxdWVzdCBjZWlsaW5nXG4gICAgICBjb25zdCBib251c1JlcXVlc3RzID0gTWF0aC5taW4oMywgMTUgLSB0b3RhbEJvbnVzR3JhbnRlZCk7XG5cbiAgICAgIC8vIENyZWRpdCB0aGUgcmVmZXJyZXJcbiAgICAgIGF3YWl0IGRiLmNvbGxlY3Rpb24oJ3JlZmVycmFsX2NyZWRpdHMnKS5hZGQoe1xuICAgICAgICByZWZlcnJlclVpZCxcbiAgICAgICAgcmVmZXJyZWRVaWQ6IHVpZCxcbiAgICAgICAgYm9udXNSZXF1ZXN0cyxcbiAgICAgICAgY3JlZGl0ZWRBdDogRmllbGRWYWx1ZS5zZXJ2ZXJUaW1lc3RhbXAoKSxcbiAgICAgIH0pO1xuXG4gICAgICAvLyBVcGRhdGUgdGhlIHJlZmVycmVyJ3MgdGVhbSB1c2FnZSBsaW1pdFxuICAgICAgY29uc3QgeyBnZXRVc2VyVGVhbSB9ID0gYXdhaXQgaW1wb3J0KCcuL2xpYi9maXJlc3RvcmUubWpzJyk7XG4gICAgICBjb25zdCByZWZlcnJlclRlYW0gPSBhd2FpdCBnZXRVc2VyVGVhbShyZWZlcnJlclVpZCk7XG4gICAgICBpZiAocmVmZXJyZXJUZWFtKSB7XG4gICAgICAgIGF3YWl0IHJlZmVycmVyVGVhbS50ZWFtUmVmLnVwZGF0ZSh7XG4gICAgICAgICAgdXNhZ2VMaW1pdDogRmllbGRWYWx1ZS5pbmNyZW1lbnQoYm9udXNSZXF1ZXN0cyksXG4gICAgICAgIH0pO1xuICAgICAgfVxuXG4gICAgICByZXR1cm4ganNvblJlc3BvbnNlKHsgb2s6IHRydWUsIGNyZWRpdGVkOiB0cnVlLCBib251c1JlcXVlc3RzIH0sIDIwMCwgcmVxdWVzdCk7XG4gICAgfVxuXG4gICAgcmV0dXJuIGVycm9yUmVzcG9uc2UoJ1Vua25vd24gcHJvZmlsZSB0eXBlJywgNDAwLCByZXF1ZXN0KTtcbiAgfSBjYXRjaCAoZSkge1xuICAgIHJldHVybiBlcnJvclJlc3BvbnNlKCdTZXJ2ZXIgZXJyb3InLCA1MDAsIHJlcXVlc3QpO1xuICB9XG59O1xuXG5leHBvcnQgY29uc3QgY29uZmlnID0geyBwYXRoOiAnL2FwaS9zYXZlLXByb2ZpbGUnIH07XG4iLCAiLy8gRmlyZWJhc2UgSUQgdG9rZW4gdmVyaWZpY2F0aW9uIHVzaW5nIEdvb2dsZSdzIEpXSyBrZXlzLlxuLy8gVXNlcyBjcnlwdG8uc3VidGxlIGZvciBzaWduYXR1cmUgdmVyaWZpY2F0aW9uLlxuXG5sZXQgY2FjaGVkS2V5cyA9IG51bGw7XG5sZXQgY2FjaGVkS2V5c0V4cGlyeSA9IDA7XG5cbmNvbnN0IEZJUkVCQVNFX1BST0pFQ1RfSUQgPSAnZGViYXRlb3MtNzhhYzUnO1xuY29uc3QgR09PR0xFX0pXS1NfVVJMID1cbiAgJ2h0dHBzOi8vd3d3Lmdvb2dsZWFwaXMuY29tL3NlcnZpY2VfYWNjb3VudHMvdjEvandrL3NlY3VyZXRva2VuQHN5c3RlbS5nc2VydmljZWFjY291bnQuY29tJztcblxuYXN5bmMgZnVuY3Rpb24gZ2V0SndrcygpIHtcbiAgaWYgKGNhY2hlZEtleXMgJiYgRGF0ZS5ub3coKSA8IGNhY2hlZEtleXNFeHBpcnkpIHJldHVybiBjYWNoZWRLZXlzO1xuXG4gIGNvbnN0IHJlcyA9IGF3YWl0IGZldGNoKEdPT0dMRV9KV0tTX1VSTCk7XG4gIGlmICghcmVzLm9rKSB0aHJvdyBuZXcgRXJyb3IoJ0ZhaWxlZCB0byBmZXRjaCBHb29nbGUgSldLcycpO1xuXG4gIGNvbnN0IGNhY2hlQ29udHJvbCA9IHJlcy5oZWFkZXJzLmdldCgnY2FjaGUtY29udHJvbCcpIHx8ICcnO1xuICBjb25zdCBtYXhBZ2VNYXRjaCA9IGNhY2hlQ29udHJvbC5tYXRjaCgvbWF4LWFnZT0oXFxkKykvKTtcbiAgY29uc3QgbWF4QWdlID0gbWF4QWdlTWF0Y2ggPyBwYXJzZUludChtYXhBZ2VNYXRjaFsxXSwgMTApICogMTAwMCA6IDM2MDAwMDA7XG4gIGNhY2hlZEtleXNFeHBpcnkgPSBEYXRlLm5vdygpICsgbWF4QWdlO1xuXG4gIGNvbnN0IGRhdGEgPSBhd2FpdCByZXMuanNvbigpO1xuICBjYWNoZWRLZXlzID0gZGF0YS5rZXlzO1xuICByZXR1cm4gY2FjaGVkS2V5cztcbn1cblxuZnVuY3Rpb24gYmFzZTY0dXJsRGVjb2RlKHN0cikge1xuICBzdHIgPSBzdHIucmVwbGFjZSgvLS9nLCAnKycpLnJlcGxhY2UoL18vZywgJy8nKTtcbiAgd2hpbGUgKHN0ci5sZW5ndGggJSA0KSBzdHIgKz0gJz0nO1xuICBpZiAodHlwZW9mIEJ1ZmZlciAhPT0gJ3VuZGVmaW5lZCcpIHtcbiAgICByZXR1cm4gQnVmZmVyLmZyb20oc3RyLCAnYmFzZTY0JykudG9TdHJpbmcoJ2JpbmFyeScpO1xuICB9XG4gIHJldHVybiBhdG9iKHN0cik7XG59XG5cbmZ1bmN0aW9uIGJhc2U2NHVybFRvVWludDhBcnJheShzdHIpIHtcbiAgY29uc3QgYmluYXJ5ID0gYmFzZTY0dXJsRGVjb2RlKHN0cik7XG4gIGNvbnN0IGJ5dGVzID0gbmV3IFVpbnQ4QXJyYXkoYmluYXJ5Lmxlbmd0aCk7XG4gIGZvciAobGV0IGkgPSAwOyBpIDwgYmluYXJ5Lmxlbmd0aDsgaSsrKSBieXRlc1tpXSA9IGJpbmFyeS5jaGFyQ29kZUF0KGkpO1xuICByZXR1cm4gYnl0ZXM7XG59XG5cbi8qKlxuICogVmVyaWZ5IGEgRmlyZWJhc2UgSUQgdG9rZW4gYW5kIHJldHVybiB0aGUgZGVjb2RlZCBwYXlsb2FkLlxuICogVGhyb3dzIG9uIGludmFsaWQvZXhwaXJlZCB0b2tlbnMuXG4gKi9cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiB2ZXJpZnlJZFRva2VuKGlkVG9rZW4pIHtcbiAgaWYgKCFpZFRva2VuKSB0aHJvdyBuZXcgRXJyb3IoJ05vIElEIHRva2VuIHByb3ZpZGVkJyk7XG5cbiAgY29uc3QgcGFydHMgPSBpZFRva2VuLnNwbGl0KCcuJyk7XG4gIGlmIChwYXJ0cy5sZW5ndGggIT09IDMpIHRocm93IG5ldyBFcnJvcignSW52YWxpZCB0b2tlbiBmb3JtYXQnKTtcblxuICBjb25zdCBoZWFkZXIgPSBKU09OLnBhcnNlKGJhc2U2NHVybERlY29kZShwYXJ0c1swXSkpO1xuICBjb25zdCBwYXlsb2FkID0gSlNPTi5wYXJzZShiYXNlNjR1cmxEZWNvZGUocGFydHNbMV0pKTtcblxuICAvLyBDaGVjayBjbGFpbXNcbiAgY29uc3Qgbm93ID0gTWF0aC5mbG9vcihEYXRlLm5vdygpIC8gMTAwMCk7XG4gIGlmIChwYXlsb2FkLmV4cCA8IG5vdykgdGhyb3cgbmV3IEVycm9yKCdUb2tlbiBleHBpcmVkJyk7XG4gIGlmIChwYXlsb2FkLmlhdCA+IG5vdyArIDMwMCkgdGhyb3cgbmV3IEVycm9yKCdUb2tlbiBpc3N1ZWQgaW4gdGhlIGZ1dHVyZScpO1xuICBpZiAocGF5bG9hZC5hdWQgIT09IEZJUkVCQVNFX1BST0pFQ1RfSUQpIHRocm93IG5ldyBFcnJvcignSW52YWxpZCBhdWRpZW5jZScpO1xuICBpZiAocGF5bG9hZC5pc3MgIT09IGBodHRwczovL3NlY3VyZXRva2VuLmdvb2dsZS5jb20vJHtGSVJFQkFTRV9QUk9KRUNUX0lEfWApXG4gICAgdGhyb3cgbmV3IEVycm9yKCdJbnZhbGlkIGlzc3VlcicpO1xuICBpZiAoIXBheWxvYWQuc3ViIHx8IHR5cGVvZiBwYXlsb2FkLnN1YiAhPT0gJ3N0cmluZycpXG4gICAgdGhyb3cgbmV3IEVycm9yKCdJbnZhbGlkIHN1YmplY3QnKTtcblxuICAvLyBHZXQgdGhlIG1hdGNoaW5nIEpXS1xuICBjb25zdCBqd2tzID0gYXdhaXQgZ2V0SndrcygpO1xuICBjb25zdCBqd2sgPSBqd2tzLmZpbmQoayA9PiBrLmtpZCA9PT0gaGVhZGVyLmtpZCk7XG4gIGlmICghandrKSB0aHJvdyBuZXcgRXJyb3IoJ1Vua25vd24gc2lnbmluZyBrZXknKTtcblxuICAvLyBJbXBvcnQgdGhlIEpXSyBhcyBhIENyeXB0b0tleVxuICBjb25zdCBjcnlwdG9LZXkgPSBhd2FpdCBjcnlwdG8uc3VidGxlLmltcG9ydEtleShcbiAgICAnandrJyxcbiAgICBqd2ssXG4gICAgeyBuYW1lOiAnUlNBU1NBLVBLQ1MxLXYxXzUnLCBoYXNoOiAnU0hBLTI1NicgfSxcbiAgICBmYWxzZSxcbiAgICBbJ3ZlcmlmeSddXG4gICk7XG5cbiAgLy8gVmVyaWZ5IHNpZ25hdHVyZVxuICBjb25zdCBzaWduYXR1cmVCdWZmZXIgPSBiYXNlNjR1cmxUb1VpbnQ4QXJyYXkocGFydHNbMl0pO1xuICBjb25zdCBkYXRhQnVmZmVyID0gbmV3IFRleHRFbmNvZGVyKCkuZW5jb2RlKHBhcnRzWzBdICsgJy4nICsgcGFydHNbMV0pO1xuXG4gIGNvbnN0IHZhbGlkID0gYXdhaXQgY3J5cHRvLnN1YnRsZS52ZXJpZnkoXG4gICAgJ1JTQVNTQS1QS0NTMS12MV81JyxcbiAgICBjcnlwdG9LZXksXG4gICAgc2lnbmF0dXJlQnVmZmVyLFxuICAgIGRhdGFCdWZmZXJcbiAgKTtcblxuICBpZiAoIXZhbGlkKSB0aHJvdyBuZXcgRXJyb3IoJ0ludmFsaWQgdG9rZW4gc2lnbmF0dXJlJyk7XG5cbiAgcmV0dXJuIHBheWxvYWQ7XG59XG5cbi8qKlxuICogRXh0cmFjdCB0aGUgQmVhcmVyIHRva2VuIGZyb20gYW4gQXV0aG9yaXphdGlvbiBoZWFkZXIuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBleHRyYWN0QmVhcmVyVG9rZW4ocmVxdWVzdCkge1xuICBjb25zdCBhdXRoID0gcmVxdWVzdC5oZWFkZXJzLmdldCgnYXV0aG9yaXphdGlvbicpIHx8ICcnO1xuICBpZiAoIWF1dGguc3RhcnRzV2l0aCgnQmVhcmVyICcpKSByZXR1cm4gbnVsbDtcbiAgcmV0dXJuIGF1dGguc2xpY2UoNyk7XG59XG5cbi8qKlxuICogRW5mb3JjZSB0aGF0IHRoZSBjYWxsZXIgaXMgc2lnbmVkIGluIEFORCBvbiBhIHBhaWQgcGxhbi5cbiAqIFJldHVybnMgeyBvazogdHJ1ZSwgdWlkLCBwbGFuIH0gb24gc3VjY2Vzcywgb3IgeyBvazogZmFsc2UsIHN0YXR1cywgZXJyb3IgfVxuICogb24gZmFpbHVyZSBcdTIwMTQgY2FsbCBzaXRlcyBzaG91bGQgcmV0dXJuIHRoZSBlcnJvciByZXNwb25zZSBhcy1pcy5cbiAqXG4gKiBVc2UgdGhpcyB0byBnYXRlIHByZW1pdW0gZW5kcG9pbnRzIChHZW1pbmksIEdyb2ssIE9wZW5BSSkgdGhhdCBmcmVlXG4gKiB1c2VycyBjYW4ndCBjYWxsLiBGcmVlIENsYXVkZSB1c2FnZSBnb2VzIHRocm91Z2ggL2FwaS9jbGF1ZGUgd2hpY2hcbiAqIGhhcyBpdHMgb3duIGFub255bW91cyt0cmlhbCBsYXllcnMgYW5kIHNob3VsZCBub3QgdXNlIHRoaXMgaGVscGVyLlxuICovXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gcmVxdWlyZVBhaWRQbGFuKHJlcXVlc3QsIGZlYXR1cmVOYW1lKSB7XG4gIGNvbnN0IHRva2VuID0gZXh0cmFjdEJlYXJlclRva2VuKHJlcXVlc3QpO1xuICBpZiAoIXRva2VuKSB7XG4gICAgcmV0dXJuIHtcbiAgICAgIG9rOiBmYWxzZSxcbiAgICAgIHN0YXR1czogNDAxLFxuICAgICAgZXJyb3I6ICdTaWduIGluIHJlcXVpcmVkLiAnICsgKGZlYXR1cmVOYW1lIHx8ICdUaGlzIG1vZGVsJykgKyAnIGlzIGEgcGFpZC1wbGFuIGZlYXR1cmUuJyxcbiAgICAgIGNvZGU6ICdBVVRIX1JFUVVJUkVEJyxcbiAgICB9O1xuICB9XG5cbiAgbGV0IGRlY29kZWQ7XG4gIHRyeSB7XG4gICAgZGVjb2RlZCA9IGF3YWl0IHZlcmlmeUlkVG9rZW4odG9rZW4pO1xuICB9IGNhdGNoIChlcnIpIHtcbiAgICByZXR1cm4ge1xuICAgICAgb2s6IGZhbHNlLFxuICAgICAgc3RhdHVzOiA0MDEsXG4gICAgICBlcnJvcjogJ0F1dGhlbnRpY2F0aW9uIGZhaWxlZC4gUGxlYXNlIHNpZ24gaW4gYWdhaW4uJyxcbiAgICAgIGNvZGU6ICdBVVRIX0lOVkFMSUQnLFxuICAgIH07XG4gIH1cblxuICAvLyBMYXp5LWltcG9ydCBmaXJlc3RvcmUgdG8gYXZvaWQgYSBjaXJjdWxhciBkZXAgKyBjb2xkLXN0YXJ0IGNvc3QgZm9yXG4gIC8vIGNhbGxlcnMgdGhhdCBoYXBwZW4gdG8gYmUgY2hlY2tpbmcgYXV0aCB3aXRob3V0IG5lZWRpbmcgcGFpZCBnYXRpbmcuXG4gIGNvbnN0IHsgZ2V0VXNlclRlYW0gfSA9IGF3YWl0IGltcG9ydCgnLi9maXJlc3RvcmUubWpzJyk7XG4gIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGdldFVzZXJUZWFtKGRlY29kZWQuc3ViKTtcbiAgY29uc3QgcGxhbiA9IHJlc3VsdD8udGVhbT8ucGxhbjtcbiAgY29uc3Qgc3RhdHVzID0gcmVzdWx0Py50ZWFtPy5zdGF0dXM7XG4gIGNvbnN0IGlzUGFpZCA9XG4gICAgcGxhbiAmJlxuICAgIHBsYW4gIT09ICd0cmlhbCcgJiZcbiAgICBbJ2luZGl2aWR1YWwnLCAndGVhbScsICdsaWZldGltZScsICdieW9rJ10uaW5jbHVkZXMocGxhbikgJiZcbiAgICAoIXN0YXR1cyB8fCBzdGF0dXMgPT09ICdhY3RpdmUnIHx8IHN0YXR1cyA9PT0gJ3RyaWFsaW5nJyk7XG5cbiAgaWYgKCFpc1BhaWQpIHtcbiAgICByZXR1cm4ge1xuICAgICAgb2s6IGZhbHNlLFxuICAgICAgc3RhdHVzOiA0MDIsIC8vIFBheW1lbnQgUmVxdWlyZWQgXHUyMDE0IHNlbWFudGljYWxseSBwcmVjaXNlIGZvciB0aGlzIGNhc2UuXG4gICAgICBlcnJvcjogKGZlYXR1cmVOYW1lIHx8ICdUaGlzIG1vZGVsJykgKyAnIGlzIGEgcGFpZCBmZWF0dXJlLiBVcGdyYWRlIHRvIEluZGl2aWR1YWwgKCQ1L21vKSB0byB1bmxvY2sgR2VtaW5pLCBHUFQsIGFuZCBHcm9rIGFsb25nc2lkZSBDbGF1ZGUgU29ubmV0LicsXG4gICAgICBjb2RlOiAnUEFZTUVOVF9SRVFVSVJFRCcsXG4gICAgICBjdXJyZW50UGxhbjogcGxhbiB8fCAndHJpYWwnLFxuICAgIH07XG4gIH1cblxuICByZXR1cm4geyBvazogdHJ1ZSwgdWlkOiBkZWNvZGVkLnN1YiwgcGxhbiB9O1xufVxuIiwgImNvbnN0IFBST0RVQ1RJT05fT1JJR0lOUyA9IFtcbiAgJ2h0dHBzOi8vZGViYXRlb3MxLm5ldGxpZnkuYXBwJyxcbiAgJ2h0dHBzOi8vZGV2aWxzYWR2b2NhdGUxLm5ldGxpZnkuYXBwJyxcbiAgJ2h0dHBzOi8vZGViYXRlb3MuY29tJyxcbiAgJ2h0dHBzOi8vd3d3LmRlYmF0ZW9zLmNvbScsXG4gICdodHRwczovL2RlYmF0ZXRoZWRldmlsLmNvbScsXG4gICdodHRwczovL3d3dy5kZWJhdGV0aGVkZXZpbC5jb20nLFxuXTtcblxuY29uc3QgREVWX09SSUdJTlMgPSBbXG4gICdodHRwOi8vbG9jYWxob3N0Ojg4ODgnLFxuICAnaHR0cDovL2xvY2FsaG9zdDozMDAwJyxcbl07XG5cbi8vIE9ubHkgYWxsb3cgbG9jYWxob3N0IG9yaWdpbnMgb3V0c2lkZSBwcm9kdWN0aW9uXG5jb25zdCBpc1Byb2R1Y3Rpb24gPSBwcm9jZXNzLmVudi5DT05URVhUID09PSAncHJvZHVjdGlvbic7XG5jb25zdCBBTExPV0VEX09SSUdJTlMgPSBpc1Byb2R1Y3Rpb25cbiAgPyBQUk9EVUNUSU9OX09SSUdJTlNcbiAgOiBbLi4uUFJPRFVDVElPTl9PUklHSU5TLCAuLi5ERVZfT1JJR0lOU107XG5cbi8vIERlZmF1bHQgb3JpZ2luIGZvciBwcmVmbGlnaHQgLyB3aGVuIHJlcXVlc3QgaXMgbm90IGF2YWlsYWJsZVxuY29uc3QgREVGQVVMVF9PUklHSU4gPSBBTExPV0VEX09SSUdJTlNbMF07XG5cbmZ1bmN0aW9uIGdldE9yaWdpbihyZXF1ZXN0KSB7XG4gIGlmICghcmVxdWVzdCkgcmV0dXJuIERFRkFVTFRfT1JJR0lOO1xuICBjb25zdCBvcmlnaW4gPSByZXF1ZXN0Py5oZWFkZXJzPy5nZXQ/Lignb3JpZ2luJykgfHwgJyc7XG4gIHJldHVybiBBTExPV0VEX09SSUdJTlMuaW5jbHVkZXMob3JpZ2luKSA/IG9yaWdpbiA6IERFRkFVTFRfT1JJR0lOO1xufVxuXG5mdW5jdGlvbiBjb3JzSGVhZGVycyhyZXF1ZXN0KSB7XG4gIHJldHVybiB7XG4gICAgJ0FjY2Vzcy1Db250cm9sLUFsbG93LU9yaWdpbic6IGdldE9yaWdpbihyZXF1ZXN0KSxcbiAgICAnQWNjZXNzLUNvbnRyb2wtQWxsb3ctTWV0aG9kcyc6ICdHRVQsIFBPU1QsIERFTEVURSwgT1BUSU9OUycsXG4gICAgJ0FjY2Vzcy1Db250cm9sLUFsbG93LUhlYWRlcnMnOiAnQ29udGVudC1UeXBlLCBBdXRob3JpemF0aW9uJyxcbiAgfTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNvcnNSZXNwb25zZShyZXF1ZXN0KSB7XG4gIHJldHVybiBuZXcgUmVzcG9uc2UobnVsbCwgeyBzdGF0dXM6IDIwNCwgaGVhZGVyczogY29yc0hlYWRlcnMocmVxdWVzdCkgfSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBqc29uUmVzcG9uc2UoZGF0YSwgc3RhdHVzID0gMjAwLCByZXF1ZXN0KSB7XG4gIHJldHVybiBuZXcgUmVzcG9uc2UoSlNPTi5zdHJpbmdpZnkoZGF0YSksIHtcbiAgICBzdGF0dXMsXG4gICAgaGVhZGVyczogeyAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nLCAuLi5jb3JzSGVhZGVycyhyZXF1ZXN0KSB9LFxuICB9KTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGVycm9yUmVzcG9uc2UobWVzc2FnZSwgc3RhdHVzID0gNDAwLCByZXF1ZXN0KSB7XG4gIHJldHVybiBqc29uUmVzcG9uc2UoeyBlcnJvcjogbWVzc2FnZSB9LCBzdGF0dXMsIHJlcXVlc3QpO1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxTQUFTLFdBQVcsa0JBQWtCO0FBSS9CLFNBQVMsUUFBUTtBQUN0QixNQUFJLEdBQUksUUFBTztBQUVmLFFBQU0saUJBQWlCLFFBQVEsSUFBSTtBQUNuQyxNQUFJLENBQUMsZUFBZ0IsT0FBTSxJQUFJLE1BQU0sdUNBQXVDO0FBRTVFLE1BQUk7QUFDSixNQUFJO0FBQ0YsWUFBUSxLQUFLLE1BQU0sY0FBYztBQUFBLEVBQ25DLFNBQVMsR0FBRztBQUNWLFlBQVEsTUFBTSw2REFBNkQsZUFBZSxNQUFNLEdBQUcsRUFBRSxHQUFHLHNCQUFzQixlQUFlLE1BQU0sR0FBRyxDQUFDO0FBQ3ZKLFVBQU0sSUFBSSxNQUFNLDZFQUE2RTtBQUFBLEVBQy9GO0FBRUEsTUFBSSxDQUFDLE1BQU0sY0FBYyxDQUFDLE1BQU0sZ0JBQWdCLENBQUMsTUFBTSxhQUFhO0FBQ2xFLFlBQVEsTUFBTSxzREFBc0QsT0FBTyxLQUFLLEtBQUssRUFBRSxLQUFLLElBQUksQ0FBQztBQUNqRyxVQUFNLElBQUksTUFBTSwrRkFBK0Y7QUFBQSxFQUNqSDtBQUVBLE9BQUssSUFBSSxVQUFVO0FBQUEsSUFDakIsV0FBVyxNQUFNO0FBQUEsSUFDakIsYUFBYTtBQUFBLE1BQ1gsY0FBYyxNQUFNO0FBQUEsTUFD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
