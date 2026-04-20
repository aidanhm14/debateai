
import {createRequire as ___nfyCreateRequire} from "module";
import {fileURLToPath as ___nfyFileURLToPath} from "url";
import {dirname as ___nfyPathDirname} from "path";
let __filename=___nfyFileURLToPath(import.meta.url);
let __dirname=___nfyPathDirname(___nfyFileURLToPath(import.meta.url));
let require=___nfyCreateRequire(import.meta.url);

var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};

// ../../../netlify/functions/lib/firestore.mjs
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
var db;
var init_firestore = __esm({
  "../../../netlify/functions/lib/firestore.mjs"() {
    db = null;
  }
});

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

// ../../../netlify/functions/log-generation.mjs
init_firestore();

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

// ../../../netlify/functions/log-generation.mjs
var MAX_OUTPUT_CHARS = 4e4;
var MAX_PROMPT_CHARS = 8e3;
var VALID_KINDS = /* @__PURE__ */ new Set([
  "case",
  "tightblock",
  "sneaky",
  "opp_attack",
  "rebuttal",
  "poi",
  "philosophy",
  "judge_adapt",
  "other"
]);
var VALID_SIGNAL_TYPES = /* @__PURE__ */ new Set([
  "rate",
  // user gave a 1-5 star rating
  "save",
  // user saved the case to their cases
  "share",
  // user shared / exported
  "regenerate",
  // user hit generate again on same motion
  "edit",
  // user edited the output text
  "discard",
  // user cleared or walked away
  "copy"
  // user copied output
]);
var rateLimits = /* @__PURE__ */ new Map();
var RATE_LIMIT = 60;
var RATE_WINDOW_MS = 6e4;
function isRateLimited(uid) {
  const now = Date.now();
  const entry = rateLimits.get(uid);
  if (!entry || now - entry.windowStart > RATE_WINDOW_MS) {
    rateLimits.set(uid, { count: 1, windowStart: now });
    return false;
  }
  entry.count += 1;
  return entry.count > RATE_LIMIT;
}
setInterval(() => {
  const now = Date.now();
  for (const [uid, entry] of rateLimits) {
    if (now - entry.windowStart > RATE_WINDOW_MS * 2) rateLimits.delete(uid);
  }
}, 5 * 60 * 1e3);
function clamp(val, max) {
  if (typeof val !== "string") return "";
  return val.length > max ? val.slice(0, max) : val;
}
function sanitizeContext(ctx) {
  if (!ctx || typeof ctx !== "object" || Array.isArray(ctx)) return {};
  const out = {};
  const keys = Object.keys(ctx).slice(0, 30);
  for (const k of keys) {
    const v = ctx[k];
    if (typeof v === "string") out[k] = v.slice(0, 500);
    else if (typeof v === "number" || typeof v === "boolean") out[k] = v;
  }
  return out;
}
var log_generation_default = async (request) => {
  if (request.method === "OPTIONS") return corsResponse(request);
  if (request.method !== "POST") return errorResponse("Method not allowed", 405, request);
  const token = extractBearerToken(request);
  if (!token) return errorResponse("Authorization required", 401, request);
  let decoded;
  try {
    decoded = await verifyIdToken(token);
  } catch (err) {
    console.error("log-generation auth error:", err.message);
    return errorResponse("Authentication failed. Please sign in again.", 401, request);
  }
  const uid = decoded.sub;
  if (isRateLimited(uid)) {
    return errorResponse("Rate limit exceeded. Try again shortly.", 429, request);
  }
  let body;
  try {
    body = await request.json();
  } catch {
    return errorResponse("Invalid JSON body", 400, request);
  }
  const { action } = body;
  try {
    const db2 = getDb();
    if (action === "generation" || !action) {
      const {
        kind,
        motion,
        side,
        format,
        depth,
        model,
        promptId,
        systemPrompt,
        userPrompt,
        output,
        durationMs,
        inputTokens,
        outputTokens,
        context
      } = body;
      if (!kind || typeof kind !== "string" || !VALID_KINDS.has(kind)) {
        return errorResponse("Invalid or missing kind", 400, request);
      }
      if (!output || typeof output !== "string") {
        return errorResponse("Missing output", 400, request);
      }
      const doc = {
        uid,
        kind,
        motion: clamp(motion, 2e3),
        side: clamp(side, 40),
        format: clamp(format, 40),
        depth: clamp(depth, 40),
        model: clamp(model, 100),
        promptId: clamp(promptId, 100),
        systemPrompt: clamp(systemPrompt, MAX_PROMPT_CHARS),
        userPrompt: clamp(userPrompt, MAX_PROMPT_CHARS),
        output: clamp(output, MAX_OUTPUT_CHARS),
        outputLength: output.length,
        durationMs: typeof durationMs === "number" ? durationMs : null,
        inputTokens: typeof inputTokens === "number" ? inputTokens : null,
        outputTokens: typeof outputTokens === "number" ? outputTokens : null,
        context: sanitizeContext(context),
        createdAt: FieldValue.serverTimestamp()
      };
      const ref = await db2.collection("generations").add(doc);
      console.log("[log-generation]", kind, uid.slice(0, 6), "id=", ref.id, "len=", doc.outputLength);
      return jsonResponse({ ok: true, id: ref.id }, 200, request);
    }
    if (action === "signal") {
      const { generationId, signal, value, meta } = body;
      if (!generationId || typeof generationId !== "string") {
        return errorResponse("Missing generationId", 400, request);
      }
      if (!signal || !VALID_SIGNAL_TYPES.has(signal)) {
        return errorResponse("Invalid signal type", 400, request);
      }
      const genRef = db2.collection("generations").doc(generationId);
      const genDoc = await genRef.get();
      if (!genDoc.exists || genDoc.data().uid !== uid) {
        return errorResponse("Generation not found", 404, request);
      }
      await db2.collection("generation_signals").add({
        uid,
        generationId,
        signal,
        value: typeof value === "number" ? value : null,
        meta: sanitizeContext(meta),
        createdAt: FieldValue.serverTimestamp()
      });
      const update = { lastSignal: signal, lastSignalAt: FieldValue.serverTimestamp() };
      if (signal === "rate" && typeof value === "number") update.rating = value;
      if (signal === "save") update.saved = true;
      if (signal === "share") update.shared = true;
      if (signal === "regenerate") update.regenerated = true;
      if (signal === "edit") {
        update.edited = true;
        if (meta && typeof meta.editedOutput === "string") {
          update.editedOutput = clamp(meta.editedOutput, MAX_OUTPUT_CHARS);
        }
      }
      await genRef.update(update);
      return jsonResponse({ ok: true }, 200, request);
    }
    return errorResponse("Unknown action", 400, request);
  } catch (err) {
    console.error("log-generation error:", err.message, err.code || "");
    return errorResponse("Failed to log generation", 500, request);
  }
};
var config = {
  path: "/api/log-generation"
};
export {
  config,
  log_generation_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vLi4vLi4vbmV0bGlmeS9mdW5jdGlvbnMvbGliL2ZpcmVzdG9yZS5tanMiLCAiLi4vLi4vLi4vbmV0bGlmeS9mdW5jdGlvbnMvbGliL2F1dGgubWpzIiwgIi4uLy4uLy4uL25ldGxpZnkvZnVuY3Rpb25zL2xvZy1nZW5lcmF0aW9uLm1qcyIsICIuLi8uLi8uLi9uZXRsaWZ5L2Z1bmN0aW9ucy9saWIvcmVzcG9uc2UubWpzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyJpbXBvcnQgeyBGaXJlc3RvcmUsIEZpZWxkVmFsdWUgfSBmcm9tICdAZ29vZ2xlLWNsb3VkL2ZpcmVzdG9yZSc7XG5cbmxldCBkYiA9IG51bGw7XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXREYigpIHtcbiAgaWYgKGRiKSByZXR1cm4gZGI7XG5cbiAgY29uc3Qgc2VydmljZUFjY291bnQgPSBwcm9jZXNzLmVudi5HT09HTEVfU0VSVklDRV9BQ0NPVU5UO1xuICBpZiAoIXNlcnZpY2VBY2NvdW50KSB0aHJvdyBuZXcgRXJyb3IoJ0dPT0dMRV9TRVJWSUNFX0FDQ09VTlQgbm90IGNvbmZpZ3VyZWQnKTtcblxuICBsZXQgY3JlZHM7XG4gIHRyeSB7XG4gICAgY3JlZHMgPSBKU09OLnBhcnNlKHNlcnZpY2VBY2NvdW50KTtcbiAgfSBjYXRjaCAoZSkge1xuICAgIGNvbnNvbGUuZXJyb3IoJ0dPT0dMRV9TRVJWSUNFX0FDQ09VTlQgSlNPTiBwYXJzZSBmYWlsZWQuIEZpcnN0IDUwIGNoYXJzOicsIHNlcnZpY2VBY2NvdW50LnNsaWNlKDAsIDUwKSwgJy4uLiBMYXN0IDUwIGNoYXJzOicsIHNlcnZpY2VBY2NvdW50LnNsaWNlKC01MCkpO1xuICAgIHRocm93IG5ldyBFcnJvcignR09PR0xFX1NFUlZJQ0VfQUNDT1VOVCBpcyBub3QgdmFsaWQgSlNPTi4gUmUtcGFzdGUgdGhlIHNlcnZpY2UgYWNjb3VudCBrZXkuJyk7XG4gIH1cblxuICBpZiAoIWNyZWRzLnByb2plY3RfaWQgfHwgIWNyZWRzLmNsaWVudF9lbWFpbCB8fCAhY3JlZHMucHJpdmF0ZV9rZXkpIHtcbiAgICBjb25zb2xlLmVycm9yKCdHT09HTEVfU0VSVklDRV9BQ0NPVU5UIG1pc3NpbmcgZmllbGRzLiBLZXlzIGZvdW5kOicsIE9iamVjdC5rZXlzKGNyZWRzKS5qb2luKCcsICcpKTtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ0dPT0dMRV9TRVJWSUNFX0FDQ09VTlQgaXMgbWlzc2luZyByZXF1aXJlZCBmaWVsZHMgKHByb2plY3RfaWQsIGNsaWVudF9lbWFpbCwgb3IgcHJpdmF0ZV9rZXkpLicpO1xuICB9XG5cbiAgZGIgPSBuZXcgRmlyZXN0b3JlKHtcbiAgICBwcm9qZWN0SWQ6IGNyZWRzLnByb2plY3RfaWQsXG4gICAgY3JlZGVudGlhbHM6IHtcbiAgICAgIGNsaWVudF9lbWFpbDogY3JlZHMuY2xpZW50X2VtYWlsLFxuICAgICAgcHJpdmF0ZV9rZXk6IGNyZWRzLnByaXZhdGVfa2V5LFxuICAgIH0sXG4gIH0pO1xuICByZXR1cm4gZGI7XG59XG5cbi8vIFBsYW4gdGllciBkZWZpbml0aW9uc1xuZXhwb3J0IGNvbnN0IFBMQU5TID0ge1xuICB0cmlhbDogIHsgcmVxdWVzdHM6IDMsICAgIG1lbWJlcnM6IDMsICBwcmljZU1vbnRobHk6IDAgfSxcbiAgYnlvazogICAgICAgeyByZXF1ZXN0czogOTk5OSwgbWVtYmVyczogMSwgIHByaWNlTW9udGhseTogMTAwIH0sXG4gIGluZGl2aWR1YWw6IHsgcmVxdWVzdHM6IDI1MCwgIG1lbWJlcnM6IDEsICBwcmljZU1vbnRobHk6IDUwMCB9LFxuICBsaWZldGltZTogICB7IHJlcXVlc3RzOiAyNTAsICBtZW1iZXJzOiAzLCAgcHJpY2VNb250aGx5OiAwIH0sXG4gIHRlYW06ICAgICAgIHsgcmVxdWVzdHM6IDE1MDAsIG1lbWJlcnM6IDUwLCBwcmljZU1vbnRobHk6IDMwMDAgfSxcbn07XG5cbi8qKlxuICogTG9vayB1cCBhIHVzZXIncyB0ZWFtIGdpdmVuIHRoZWlyIEZpcmViYXNlIFVJRC5cbiAqIFJldHVybnMgeyB0ZWFtLCB0ZWFtUmVmLCBtZW1iZXJzaGlwIH0gb3IgbnVsbCBpZiBubyB0ZWFtLlxuICovXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gZ2V0VXNlclRlYW0odWlkKSB7XG4gIGNvbnN0IGRiID0gZ2V0RGIoKTtcblxuICAvLyBGaW5kIG1lbWJlcnNoaXBcbiAgY29uc3QgbWVtYmVyc2hpcHMgPSBhd2FpdCBkYi5jb2xsZWN0aW9uKCd0ZWFtX21lbWJlcnMnKVxuICAgIC53aGVyZSgndXNlcklkJywgJz09JywgdWlkKVxuICAgIC5saW1pdCgxKVxuICAgIC5nZXQoKTtcblxuICBpZiAobWVtYmVyc2hpcHMuZW1wdHkpIHJldHVybiBudWxsO1xuXG4gIGNvbnN0IG1lbWJlcnNoaXAgPSBtZW1iZXJzaGlwcy5kb2NzWzBdLmRhdGEoKTtcbiAgY29uc3QgdGVhbVJlZiA9IGRiLmNvbGxlY3Rpb24oJ3RlYW1zJykuZG9jKG1lbWJlcnNoaXAudGVhbUlkKTtcbiAgY29uc3QgdGVhbURvYyA9IGF3YWl0IHRlYW1SZWYuZ2V0KCk7XG5cbiAgaWYgKCF0ZWFtRG9jLmV4aXN0cykgcmV0dXJuIG51bGw7XG5cbiAgcmV0dXJuIHtcbiAgICB0ZWFtOiB7IGlkOiB0ZWFtRG9jLmlkLCAuLi50ZWFtRG9jLmRhdGEoKSB9LFxuICAgIHRlYW1SZWYsXG4gICAgbWVtYmVyc2hpcCxcbiAgfTtcbn1cblxuLyoqXG4gKiBJbmNyZW1lbnQgdXNhZ2UgY291bnRlciBmb3IgYSB0ZWFtIGFuZCBsb2cgdGhlIHJlcXVlc3QuXG4gKi9cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBsb2dVc2FnZSh0ZWFtSWQsIHVzZXJJZCwgZmVhdHVyZSwgaW5wdXRUb2tlbnMgPSAwLCBvdXRwdXRUb2tlbnMgPSAwKSB7XG4gIGNvbnN0IGRiID0gZ2V0RGIoKTtcblxuICAvLyBBdG9taWMgaW5jcmVtZW50IG9mIHRoZSB0ZWFtIHVzYWdlIGNvdW50ZXJcbiAgYXdhaXQgZGIuY29sbGVjdGlvbigndGVhbXMnKS5kb2ModGVhbUlkKS51cGRhdGUoe1xuICAgIHVzYWdlVGhpc1BlcmlvZDogRmllbGRWYWx1ZS5pbmNyZW1lbnQoMSksXG4gICAgdXBkYXRlZEF0OiBGaWVsZFZhbHVlLnNlcnZlclRpbWVzdGFtcCgpLFxuICB9KTtcblxuICAvLyBBcHBlbmQgZGV0YWlsZWQgdXNhZ2UgbG9nXG4gIGF3YWl0IGRiLmNvbGxlY3Rpb24oJ3VzYWdlX2xvZ3MnKS5hZGQoe1xuICAgIHRlYW1JZCxcbiAgICB1c2VySWQsXG4gICAgZmVhdHVyZSxcbiAgICBpbnB1dFRva2VucyxcbiAgICBvdXRwdXRUb2tlbnMsXG4gICAgdGltZXN0YW1wOiBGaWVsZFZhbHVlLnNlcnZlclRpbWVzdGFtcCgpLFxuICB9KTtcbn1cblxuZXhwb3J0IHsgRmllbGRWYWx1ZSB9O1xuIiwgIi8vIEZpcmViYXNlIElEIHRva2VuIHZlcmlmaWNhdGlvbiB1c2luZyBHb29nbGUncyBKV0sga2V5cy5cbi8vIFVzZXMgY3J5cHRvLnN1YnRsZSBmb3Igc2lnbmF0dXJlIHZlcmlmaWNhdGlvbi5cblxubGV0IGNhY2hlZEtleXMgPSBudWxsO1xubGV0IGNhY2hlZEtleXNFeHBpcnkgPSAwO1xuXG5jb25zdCBGSVJFQkFTRV9QUk9KRUNUX0lEID0gJ2RlYmF0ZW9zLTc4YWM1JztcbmNvbnN0IEdPT0dMRV9KV0tTX1VSTCA9XG4gICdodHRwczovL3d3dy5nb29nbGVhcGlzLmNvbS9zZXJ2aWNlX2FjY291bnRzL3YxL2p3ay9zZWN1cmV0b2tlbkBzeXN0ZW0uZ3NlcnZpY2VhY2NvdW50LmNvbSc7XG5cbmFzeW5jIGZ1bmN0aW9uIGdldEp3a3MoKSB7XG4gIGlmIChjYWNoZWRLZXlzICYmIERhdGUubm93KCkgPCBjYWNoZWRLZXlzRXhwaXJ5KSByZXR1cm4gY2FjaGVkS2V5cztcblxuICBjb25zdCByZXMgPSBhd2FpdCBmZXRjaChHT09HTEVfSldLU19VUkwpO1xuICBpZiAoIXJlcy5vaykgdGhyb3cgbmV3IEVycm9yKCdGYWlsZWQgdG8gZmV0Y2ggR29vZ2xlIEpXS3MnKTtcblxuICBjb25zdCBjYWNoZUNvbnRyb2wgPSByZXMuaGVhZGVycy5nZXQoJ2NhY2hlLWNvbnRyb2wnKSB8fCAnJztcbiAgY29uc3QgbWF4QWdlTWF0Y2ggPSBjYWNoZUNvbnRyb2wubWF0Y2goL21heC1hZ2U9KFxcZCspLyk7XG4gIGNvbnN0IG1heEFnZSA9IG1heEFnZU1hdGNoID8gcGFyc2VJbnQobWF4QWdlTWF0Y2hbMV0sIDEwKSAqIDEwMDAgOiAzNjAwMDAwO1xuICBjYWNoZWRLZXlzRXhwaXJ5ID0gRGF0ZS5ub3coKSArIG1heEFnZTtcblxuICBjb25zdCBkYXRhID0gYXdhaXQgcmVzLmpzb24oKTtcbiAgY2FjaGVkS2V5cyA9IGRhdGEua2V5cztcbiAgcmV0dXJuIGNhY2hlZEtleXM7XG59XG5cbmZ1bmN0aW9uIGJhc2U2NHVybERlY29kZShzdHIpIHtcbiAgc3RyID0gc3RyLnJlcGxhY2UoLy0vZywgJysnKS5yZXBsYWNlKC9fL2csICcvJyk7XG4gIHdoaWxlIChzdHIubGVuZ3RoICUgNCkgc3RyICs9ICc9JztcbiAgaWYgKHR5cGVvZiBCdWZmZXIgIT09ICd1bmRlZmluZWQnKSB7XG4gICAgcmV0dXJuIEJ1ZmZlci5mcm9tKHN0ciwgJ2Jhc2U2NCcpLnRvU3RyaW5nKCdiaW5hcnknKTtcbiAgfVxuICByZXR1cm4gYXRvYihzdHIpO1xufVxuXG5mdW5jdGlvbiBiYXNlNjR1cmxUb1VpbnQ4QXJyYXkoc3RyKSB7XG4gIGNvbnN0IGJpbmFyeSA9IGJhc2U2NHVybERlY29kZShzdHIpO1xuICBjb25zdCBieXRlcyA9IG5ldyBVaW50OEFycmF5KGJpbmFyeS5sZW5ndGgpO1xuICBmb3IgKGxldCBpID0gMDsgaSA8IGJpbmFyeS5sZW5ndGg7IGkrKykgYnl0ZXNbaV0gPSBiaW5hcnkuY2hhckNvZGVBdChpKTtcbiAgcmV0dXJuIGJ5dGVzO1xufVxuXG4vKipcbiAqIFZlcmlmeSBhIEZpcmViYXNlIElEIHRva2VuIGFuZCByZXR1cm4gdGhlIGRlY29kZWQgcGF5bG9hZC5cbiAqIFRocm93cyBvbiBpbnZhbGlkL2V4cGlyZWQgdG9rZW5zLlxuICovXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gdmVyaWZ5SWRUb2tlbihpZFRva2VuKSB7XG4gIGlmICghaWRUb2tlbikgdGhyb3cgbmV3IEVycm9yKCdObyBJRCB0b2tlbiBwcm92aWRlZCcpO1xuXG4gIGNvbnN0IHBhcnRzID0gaWRUb2tlbi5zcGxpdCgnLicpO1xuICBpZiAocGFydHMubGVuZ3RoICE9PSAzKSB0aHJvdyBuZXcgRXJyb3IoJ0ludmFsaWQgdG9rZW4gZm9ybWF0Jyk7XG5cbiAgY29uc3QgaGVhZGVyID0gSlNPTi5wYXJzZShiYXNlNjR1cmxEZWNvZGUocGFydHNbMF0pKTtcbiAgY29uc3QgcGF5bG9hZCA9IEpTT04ucGFyc2UoYmFzZTY0dXJsRGVjb2RlKHBhcnRzWzFdKSk7XG5cbiAgLy8gQ2hlY2sgY2xhaW1zXG4gIGNvbnN0IG5vdyA9IE1hdGguZmxvb3IoRGF0ZS5ub3coKSAvIDEwMDApO1xuICBpZiAocGF5bG9hZC5leHAgPCBub3cpIHRocm93IG5ldyBFcnJvcignVG9rZW4gZXhwaXJlZCcpO1xuICBpZiAocGF5bG9hZC5pYXQgPiBub3cgKyAzMDApIHRocm93IG5ldyBFcnJvcignVG9rZW4gaXNzdWVkIGluIHRoZSBmdXR1cmUnKTtcbiAgaWYgKHBheWxvYWQuYXVkICE9PSBGSVJFQkFTRV9QUk9KRUNUX0lEKSB0aHJvdyBuZXcgRXJyb3IoJ0ludmFsaWQgYXVkaWVuY2UnKTtcbiAgaWYgKHBheWxvYWQuaXNzICE9PSBgaHR0cHM6Ly9zZWN1cmV0b2tlbi5nb29nbGUuY29tLyR7RklSRUJBU0VfUFJPSkVDVF9JRH1gKVxuICAgIHRocm93IG5ldyBFcnJvcignSW52YWxpZCBpc3N1ZXInKTtcbiAgaWYgKCFwYXlsb2FkLnN1YiB8fCB0eXBlb2YgcGF5bG9hZC5zdWIgIT09ICdzdHJpbmcnKVxuICAgIHRocm93IG5ldyBFcnJvcignSW52YWxpZCBzdWJqZWN0Jyk7XG5cbiAgLy8gR2V0IHRoZSBtYXRjaGluZyBKV0tcbiAgY29uc3QgandrcyA9IGF3YWl0IGdldEp3a3MoKTtcbiAgY29uc3QgandrID0gandrcy5maW5kKGsgPT4gay5raWQgPT09IGhlYWRlci5raWQpO1xuICBpZiAoIWp3aykgdGhyb3cgbmV3IEVycm9yKCdVbmtub3duIHNpZ25pbmcga2V5Jyk7XG5cbiAgLy8gSW1wb3J0IHRoZSBKV0sgYXMgYSBDcnlwdG9LZXlcbiAgY29uc3QgY3J5cHRvS2V5ID0gYXdhaXQgY3J5cHRvLnN1YnRsZS5pbXBvcnRLZXkoXG4gICAgJ2p3aycsXG4gICAgandrLFxuICAgIHsgbmFtZTogJ1JTQVNTQS1QS0NTMS12MV81JywgaGFzaDogJ1NIQS0yNTYnIH0sXG4gICAgZmFsc2UsXG4gICAgWyd2ZXJpZnknXVxuICApO1xuXG4gIC8vIFZlcmlmeSBzaWduYXR1cmVcbiAgY29uc3Qgc2lnbmF0dXJlQnVmZmVyID0gYmFzZTY0dXJsVG9VaW50OEFycmF5KHBhcnRzWzJdKTtcbiAgY29uc3QgZGF0YUJ1ZmZlciA9IG5ldyBUZXh0RW5jb2RlcigpLmVuY29kZShwYXJ0c1swXSArICcuJyArIHBhcnRzWzFdKTtcblxuICBjb25zdCB2YWxpZCA9IGF3YWl0IGNyeXB0by5zdWJ0bGUudmVyaWZ5KFxuICAgICdSU0FTU0EtUEtDUzEtdjFfNScsXG4gICAgY3J5cHRvS2V5LFxuICAgIHNpZ25hdHVyZUJ1ZmZlcixcbiAgICBkYXRhQnVmZmVyXG4gICk7XG5cbiAgaWYgKCF2YWxpZCkgdGhyb3cgbmV3IEVycm9yKCdJbnZhbGlkIHRva2VuIHNpZ25hdHVyZScpO1xuXG4gIHJldHVybiBwYXlsb2FkO1xufVxuXG4vKipcbiAqIEV4dHJhY3QgdGhlIEJlYXJlciB0b2tlbiBmcm9tIGFuIEF1dGhvcml6YXRpb24gaGVhZGVyLlxuICovXG5leHBvcnQgZnVuY3Rpb24gZXh0cmFjdEJlYXJlclRva2VuKHJlcXVlc3QpIHtcbiAgY29uc3QgYXV0aCA9IHJlcXVlc3QuaGVhZGVycy5nZXQoJ2F1dGhvcml6YXRpb24nKSB8fCAnJztcbiAgaWYgKCFhdXRoLnN0YXJ0c1dpdGgoJ0JlYXJlciAnKSkgcmV0dXJuIG51bGw7XG4gIHJldHVybiBhdXRoLnNsaWNlKDcpO1xufVxuXG4vKipcbiAqIEVuZm9yY2UgdGhhdCB0aGUgY2FsbGVyIGlzIHNpZ25lZCBpbiBBTkQgb24gYSBwYWlkIHBsYW4uXG4gKiBSZXR1cm5zIHsgb2s6IHRydWUsIHVpZCwgcGxhbiB9IG9uIHN1Y2Nlc3MsIG9yIHsgb2s6IGZhbHNlLCBzdGF0dXMsIGVycm9yIH1cbiAqIG9uIGZhaWx1cmUgXHUyMDE0IGNhbGwgc2l0ZXMgc2hvdWxkIHJldHVybiB0aGUgZXJyb3IgcmVzcG9uc2UgYXMtaXMuXG4gKlxuICogVXNlIHRoaXMgdG8gZ2F0ZSBwcmVtaXVtIGVuZHBvaW50cyAoR2VtaW5pLCBHcm9rLCBPcGVuQUkpIHRoYXQgZnJlZVxuICogdXNlcnMgY2FuJ3QgY2FsbC4gRnJlZSBDbGF1ZGUgdXNhZ2UgZ29lcyB0aHJvdWdoIC9hcGkvY2xhdWRlIHdoaWNoXG4gKiBoYXMgaXRzIG93biBhbm9ueW1vdXMrdHJpYWwgbGF5ZXJzIGFuZCBzaG91bGQgbm90IHVzZSB0aGlzIGhlbHBlci5cbiAqL1xuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHJlcXVpcmVQYWlkUGxhbihyZXF1ZXN0LCBmZWF0dXJlTmFtZSkge1xuICBjb25zdCB0b2tlbiA9IGV4dHJhY3RCZWFyZXJUb2tlbihyZXF1ZXN0KTtcbiAgaWYgKCF0b2tlbikge1xuICAgIHJldHVybiB7XG4gICAgICBvazogZmFsc2UsXG4gICAgICBzdGF0dXM6IDQwMSxcbiAgICAgIGVycm9yOiAnU2lnbiBpbiByZXF1aXJlZC4gJyArIChmZWF0dXJlTmFtZSB8fCAnVGhpcyBtb2RlbCcpICsgJyBpcyBhIHBhaWQtcGxhbiBmZWF0dXJlLicsXG4gICAgICBjb2RlOiAnQVVUSF9SRVFVSVJFRCcsXG4gICAgfTtcbiAgfVxuXG4gIGxldCBkZWNvZGVkO1xuICB0cnkge1xuICAgIGRlY29kZWQgPSBhd2FpdCB2ZXJpZnlJZFRva2VuKHRva2VuKTtcbiAgfSBjYXRjaCAoZXJyKSB7XG4gICAgcmV0dXJuIHtcbiAgICAgIG9rOiBmYWxzZSxcbiAgICAgIHN0YXR1czogNDAxLFxuICAgICAgZXJyb3I6ICdBdXRoZW50aWNhdGlvbiBmYWlsZWQuIFBsZWFzZSBzaWduIGluIGFnYWluLicsXG4gICAgICBjb2RlOiAnQVVUSF9JTlZBTElEJyxcbiAgICB9O1xuICB9XG5cbiAgLy8gTGF6eS1pbXBvcnQgZmlyZXN0b3JlIHRvIGF2b2lkIGEgY2lyY3VsYXIgZGVwICsgY29sZC1zdGFydCBjb3N0IGZvclxuICAvLyBjYWxsZXJzIHRoYXQgaGFwcGVuIHRvIGJlIGNoZWNraW5nIGF1dGggd2l0aG91dCBuZWVkaW5nIHBhaWQgZ2F0aW5nLlxuICBjb25zdCB7IGdldFVzZXJUZWFtIH0gPSBhd2FpdCBpbXBvcnQoJy4vZmlyZXN0b3JlLm1qcycpO1xuICBjb25zdCByZXN1bHQgPSBhd2FpdCBnZXRVc2VyVGVhbShkZWNvZGVkLnN1Yik7XG4gIGNvbnN0IHBsYW4gPSByZXN1bHQ/LnRlYW0/LnBsYW47XG4gIGNvbnN0IHN0YXR1cyA9IHJlc3VsdD8udGVhbT8uc3RhdHVzO1xuICBjb25zdCBpc1BhaWQgPVxuICAgIHBsYW4gJiZcbiAgICBwbGFuICE9PSAndHJpYWwnICYmXG4gICAgWydpbmRpdmlkdWFsJywgJ3RlYW0nLCAnbGlmZXRpbWUnLCAnYnlvayddLmluY2x1ZGVzKHBsYW4pICYmXG4gICAgKCFzdGF0dXMgfHwgc3RhdHVzID09PSAnYWN0aXZlJyB8fCBzdGF0dXMgPT09ICd0cmlhbGluZycpO1xuXG4gIGlmICghaXNQYWlkKSB7XG4gICAgcmV0dXJuIHtcbiAgICAgIG9rOiBmYWxzZSxcbiAgICAgIHN0YXR1czogNDAyLCAvLyBQYXltZW50IFJlcXVpcmVkIFx1MjAxNCBzZW1hbnRpY2FsbHkgcHJlY2lzZSBmb3IgdGhpcyBjYXNlLlxuICAgICAgZXJyb3I6IChmZWF0dXJlTmFtZSB8fCAnVGhpcyBtb2RlbCcpICsgJyBpcyBhIHBhaWQgZmVhdHVyZS4gVXBncmFkZSB0byBJbmRpdmlkdWFsICgkNS9tbykgdG8gdW5sb2NrIEdlbWluaSwgR1BULCBhbmQgR3JvayBhbG9uZ3NpZGUgQ2xhdWRlIFNvbm5ldC4nLFxuICAgICAgY29kZTogJ1BBWU1FTlRfUkVRVUlSRUQnLFxuICAgICAgY3VycmVudFBsYW46IHBsYW4gfHwgJ3RyaWFsJyxcbiAgICB9O1xuICB9XG5cbiAgcmV0dXJuIHsgb2s6IHRydWUsIHVpZDogZGVjb2RlZC5zdWIsIHBsYW4gfTtcbn1cbiIsICJpbXBvcnQgeyB2ZXJpZnlJZFRva2VuLCBleHRyYWN0QmVhcmVyVG9rZW4gfSBmcm9tICcuL2xpYi9hdXRoLm1qcyc7XG5pbXBvcnQgeyBnZXREYiwgRmllbGRWYWx1ZSB9IGZyb20gJy4vbGliL2ZpcmVzdG9yZS5tanMnO1xuaW1wb3J0IHsgY29yc1Jlc3BvbnNlLCBqc29uUmVzcG9uc2UsIGVycm9yUmVzcG9uc2UgfSBmcm9tICcuL2xpYi9yZXNwb25zZS5tanMnO1xuXG4vLyBEZWVwIHRyYWluaW5nLXNpZ25hbCBjYXB0dXJlIFx1MjAxNCBzdG9yZXMgdGhlIGZ1bGwgcHJvbXB0IFx1MjE5MiBvdXRwdXQgXHUyMTkyIHVzZXItYWN0aW9uXG4vLyB0cmlwbGUgc28gd2UgY2FuIGZlZWQgcmVhbCB1c2FnZSBiYWNrIGludG8gcHJvbXB0IHR1bmluZyBhbmQgZmluZS10dW5lcy5cbi8vIFNlcGFyYXRlIGZyb20gL2FwaS9sb2ctZXZlbnQgKHdoaWNoIGlzIGxlYW4gdGVsZW1ldHJ5LCA1MDAtY2hhciBjYXBzKS5cbi8vXG4vLyBDb2xsZWN0aW9ucyB3cml0dGVuOlxuLy8gIC0gZ2VuZXJhdGlvbnM6IG9uZSBkb2MgcGVyIGdlbmVyYXRpb24gYXR0ZW1wdCAoZnVsbCB0ZXh0KVxuLy8gIC0gZ2VuZXJhdGlvbl9zaWduYWxzOiBzdWJzZXF1ZW50IHVzZXIgYWN0aW9ucyB0YWdnZWQgdG8gYSBnZW5lcmF0aW9uXG4vLyAgICAocmF0ZSwgc2F2ZSwgc2hhcmUsIHJlZ2VuZXJhdGUsIGVkaXQpLiBUaGlzIGlzIHRoZSBzdXBlcnZpc2VkIGxhYmVsLlxuXG5jb25zdCBNQVhfT1VUUFVUX0NIQVJTID0gNDBfMDAwOyAgLy8gfjZrIHdvcmRzIFx1MjAxNCBmaXRzIGNvbXAtZGVwdGggb3V0cHV0XG5jb25zdCBNQVhfUFJPTVBUX0NIQVJTID0gOF8wMDA7ICAgLy8gbW90aW9uICsgYmFja2dyb3VuZCArIHN5c3RlbVxuXG5jb25zdCBWQUxJRF9LSU5EUyA9IG5ldyBTZXQoW1xuICAnY2FzZScsXG4gICd0aWdodGJsb2NrJyxcbiAgJ3NuZWFreScsXG4gICdvcHBfYXR0YWNrJyxcbiAgJ3JlYnV0dGFsJyxcbiAgJ3BvaScsXG4gICdwaGlsb3NvcGh5JyxcbiAgJ2p1ZGdlX2FkYXB0JyxcbiAgJ290aGVyJyxcbl0pO1xuXG5jb25zdCBWQUxJRF9TSUdOQUxfVFlQRVMgPSBuZXcgU2V0KFtcbiAgJ3JhdGUnLCAgICAgICAgIC8vIHVzZXIgZ2F2ZSBhIDEtNSBzdGFyIHJhdGluZ1xuICAnc2F2ZScsICAgICAgICAgLy8gdXNlciBzYXZlZCB0aGUgY2FzZSB0byB0aGVpciBjYXNlc1xuICAnc2hhcmUnLCAgICAgICAgLy8gdXNlciBzaGFyZWQgLyBleHBvcnRlZFxuICAncmVnZW5lcmF0ZScsICAgLy8gdXNlciBoaXQgZ2VuZXJhdGUgYWdhaW4gb24gc2FtZSBtb3Rpb25cbiAgJ2VkaXQnLCAgICAgICAgIC8vIHVzZXIgZWRpdGVkIHRoZSBvdXRwdXQgdGV4dFxuICAnZGlzY2FyZCcsICAgICAgLy8gdXNlciBjbGVhcmVkIG9yIHdhbGtlZCBhd2F5XG4gICdjb3B5JywgICAgICAgICAvLyB1c2VyIGNvcGllZCBvdXRwdXRcbl0pO1xuXG4vLyBSYXRlIGxpbWl0aW5nOiBnZW5lcmF0aW9ucyBhcmUgZXhwZW5zaXZlIHBheWxvYWRzLCBjYXAgd3JpdGVzLlxuY29uc3QgcmF0ZUxpbWl0cyA9IG5ldyBNYXAoKTtcbmNvbnN0IFJBVEVfTElNSVQgPSA2MDsgLy8gNjAvbWluL3VzZXJcbmNvbnN0IFJBVEVfV0lORE9XX01TID0gNjBfMDAwO1xuXG5mdW5jdGlvbiBpc1JhdGVMaW1pdGVkKHVpZCkge1xuICBjb25zdCBub3cgPSBEYXRlLm5vdygpO1xuICBjb25zdCBlbnRyeSA9IHJhdGVMaW1pdHMuZ2V0KHVpZCk7XG4gIGlmICghZW50cnkgfHwgbm93IC0gZW50cnkud2luZG93U3RhcnQgPiBSQVRFX1dJTkRPV19NUykge1xuICAgIHJhdGVMaW1pdHMuc2V0KHVpZCwgeyBjb3VudDogMSwgd2luZG93U3RhcnQ6IG5vdyB9KTtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cbiAgZW50cnkuY291bnQgKz0gMTtcbiAgcmV0dXJuIGVudHJ5LmNvdW50ID4gUkFURV9MSU1JVDtcbn1cblxuc2V0SW50ZXJ2YWwoKCkgPT4ge1xuICBjb25zdCBub3cgPSBEYXRlLm5vdygpO1xuICBmb3IgKGNvbnN0IFt1aWQsIGVudHJ5XSBvZiByYXRlTGltaXRzKSB7XG4gICAgaWYgKG5vdyAtIGVudHJ5LndpbmRvd1N0YXJ0ID4gUkFURV9XSU5ET1dfTVMgKiAyKSByYXRlTGltaXRzLmRlbGV0ZSh1aWQpO1xuICB9XG59LCA1ICogNjAgKiAxMDAwKTtcblxuZnVuY3Rpb24gY2xhbXAodmFsLCBtYXgpIHtcbiAgaWYgKHR5cGVvZiB2YWwgIT09ICdzdHJpbmcnKSByZXR1cm4gJyc7XG4gIHJldHVybiB2YWwubGVuZ3RoID4gbWF4ID8gdmFsLnNsaWNlKDAsIG1heCkgOiB2YWw7XG59XG5cbmZ1bmN0aW9uIHNhbml0aXplQ29udGV4dChjdHgpIHtcbiAgaWYgKCFjdHggfHwgdHlwZW9mIGN0eCAhPT0gJ29iamVjdCcgfHwgQXJyYXkuaXNBcnJheShjdHgpKSByZXR1cm4ge307XG4gIGNvbnN0IG91dCA9IHt9O1xuICBjb25zdCBrZXlzID0gT2JqZWN0LmtleXMoY3R4KS5zbGljZSgwLCAzMCk7XG4gIGZvciAoY29uc3QgayBvZiBrZXlzKSB7XG4gICAgY29uc3QgdiA9IGN0eFtrXTtcbiAgICBpZiAodHlwZW9mIHYgPT09ICdzdHJpbmcnKSBvdXRba10gPSB2LnNsaWNlKDAsIDUwMCk7XG4gICAgZWxzZSBpZiAodHlwZW9mIHYgPT09ICdudW1iZXInIHx8IHR5cGVvZiB2ID09PSAnYm9vbGVhbicpIG91dFtrXSA9IHY7XG4gIH1cbiAgcmV0dXJuIG91dDtcbn1cblxuZXhwb3J0IGRlZmF1bHQgYXN5bmMgKHJlcXVlc3QpID0+IHtcbiAgaWYgKHJlcXVlc3QubWV0aG9kID09PSAnT1BUSU9OUycpIHJldHVybiBjb3JzUmVzcG9uc2UocmVxdWVzdCk7XG4gIGlmIChyZXF1ZXN0Lm1ldGhvZCAhPT0gJ1BPU1QnKSByZXR1cm4gZXJyb3JSZXNwb25zZSgnTWV0aG9kIG5vdCBhbGxvd2VkJywgNDA1LCByZXF1ZXN0KTtcblxuICBjb25zdCB0b2tlbiA9IGV4dHJhY3RCZWFyZXJUb2tlbihyZXF1ZXN0KTtcbiAgaWYgKCF0b2tlbikgcmV0dXJuIGVycm9yUmVzcG9uc2UoJ0F1dGhvcml6YXRpb24gcmVxdWlyZWQnLCA0MDEsIHJlcXVlc3QpO1xuXG4gIGxldCBkZWNvZGVkO1xuICB0cnkge1xuICAgIGRlY29kZWQgPSBhd2FpdCB2ZXJpZnlJZFRva2VuKHRva2VuKTtcbiAgfSBjYXRjaCAoZXJyKSB7XG4gICAgY29uc29sZS5lcnJvcignbG9nLWdlbmVyYXRpb24gYXV0aCBlcnJvcjonLCBlcnIubWVzc2FnZSk7XG4gICAgcmV0dXJuIGVycm9yUmVzcG9uc2UoJ0F1dGhlbnRpY2F0aW9uIGZhaWxlZC4gUGxlYXNlIHNpZ24gaW4gYWdhaW4uJywgNDAxLCByZXF1ZXN0KTtcbiAgfVxuXG4gIGNvbnN0IHVpZCA9IGRlY29kZWQuc3ViO1xuICBpZiAoaXNSYXRlTGltaXRlZCh1aWQpKSB7XG4gICAgcmV0dXJuIGVycm9yUmVzcG9uc2UoJ1JhdGUgbGltaXQgZXhjZWVkZWQuIFRyeSBhZ2FpbiBzaG9ydGx5LicsIDQyOSwgcmVxdWVzdCk7XG4gIH1cblxuICBsZXQgYm9keTtcbiAgdHJ5IHsgYm9keSA9IGF3YWl0IHJlcXVlc3QuanNvbigpOyB9IGNhdGNoIHsgcmV0dXJuIGVycm9yUmVzcG9uc2UoJ0ludmFsaWQgSlNPTiBib2R5JywgNDAwLCByZXF1ZXN0KTsgfVxuXG4gIGNvbnN0IHsgYWN0aW9uIH0gPSBib2R5O1xuXG4gIHRyeSB7XG4gICAgY29uc3QgZGIgPSBnZXREYigpO1xuXG4gICAgLy8gXHUyNTAwXHUyNTAwIE1vZGUgQTogbmV3IGdlbmVyYXRpb24gXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXG4gICAgaWYgKGFjdGlvbiA9PT0gJ2dlbmVyYXRpb24nIHx8ICFhY3Rpb24pIHtcbiAgICAgIGNvbnN0IHtcbiAgICAgICAga2luZCxcbiAgICAgICAgbW90aW9uLFxuICAgICAgICBzaWRlLFxuICAgICAgICBmb3JtYXQsXG4gICAgICAgIGRlcHRoLFxuICAgICAgICBtb2RlbCxcbiAgICAgICAgcHJvbXB0SWQsXG4gICAgICAgIHN5c3RlbVByb21wdCxcbiAgICAgICAgdXNlclByb21wdCxcbiAgICAgICAgb3V0cHV0LFxuICAgICAgICBkdXJhdGlvbk1zLFxuICAgICAgICBpbnB1dFRva2VucyxcbiAgICAgICAgb3V0cHV0VG9rZW5zLFxuICAgICAgICBjb250ZXh0LFxuICAgICAgfSA9IGJvZHk7XG5cbiAgICAgIGlmICgha2luZCB8fCB0eXBlb2Yga2luZCAhPT0gJ3N0cmluZycgfHwgIVZBTElEX0tJTkRTLmhhcyhraW5kKSkge1xuICAgICAgICByZXR1cm4gZXJyb3JSZXNwb25zZSgnSW52YWxpZCBvciBtaXNzaW5nIGtpbmQnLCA0MDAsIHJlcXVlc3QpO1xuICAgICAgfVxuICAgICAgaWYgKCFvdXRwdXQgfHwgdHlwZW9mIG91dHB1dCAhPT0gJ3N0cmluZycpIHtcbiAgICAgICAgcmV0dXJuIGVycm9yUmVzcG9uc2UoJ01pc3Npbmcgb3V0cHV0JywgNDAwLCByZXF1ZXN0KTtcbiAgICAgIH1cblxuICAgICAgY29uc3QgZG9jID0ge1xuICAgICAgICB1aWQsXG4gICAgICAgIGtpbmQsXG4gICAgICAgIG1vdGlvbjogY2xhbXAobW90aW9uLCAyMDAwKSxcbiAgICAgICAgc2lkZTogY2xhbXAoc2lkZSwgNDApLFxuICAgICAgICBmb3JtYXQ6IGNsYW1wKGZvcm1hdCwgNDApLFxuICAgICAgICBkZXB0aDogY2xhbXAoZGVwdGgsIDQwKSxcbiAgICAgICAgbW9kZWw6IGNsYW1wKG1vZGVsLCAxMDApLFxuICAgICAgICBwcm9tcHRJZDogY2xhbXAocHJvbXB0SWQsIDEwMCksXG4gICAgICAgIHN5c3RlbVByb21wdDogY2xhbXAoc3lzdGVtUHJvbXB0LCBNQVhfUFJPTVBUX0NIQVJTKSxcbiAgICAgICAgdXNlclByb21wdDogY2xhbXAodXNlclByb21wdCwgTUFYX1BST01QVF9DSEFSUyksXG4gICAgICAgIG91dHB1dDogY2xhbXAob3V0cHV0LCBNQVhfT1VUUFVUX0NIQVJTKSxcbiAgICAgICAgb3V0cHV0TGVuZ3RoOiBvdXRwdXQubGVuZ3RoLFxuICAgICAgICBkdXJhdGlvbk1zOiB0eXBlb2YgZHVyYXRpb25NcyA9PT0gJ251bWJlcicgPyBkdXJhdGlvbk1zIDogbnVsbCxcbiAgICAgICAgaW5wdXRUb2tlbnM6IHR5cGVvZiBpbnB1dFRva2VucyA9PT0gJ251bWJlcicgPyBpbnB1dFRva2VucyA6IG51bGwsXG4gICAgICAgIG91dHB1dFRva2VuczogdHlwZW9mIG91dHB1dFRva2VucyA9PT0gJ251bWJlcicgPyBvdXRwdXRUb2tlbnMgOiBudWxsLFxuICAgICAgICBjb250ZXh0OiBzYW5pdGl6ZUNvbnRleHQoY29udGV4dCksXG4gICAgICAgIGNyZWF0ZWRBdDogRmllbGRWYWx1ZS5zZXJ2ZXJUaW1lc3RhbXAoKSxcbiAgICAgIH07XG5cbiAgICAgIGNvbnN0IHJlZiA9IGF3YWl0IGRiLmNvbGxlY3Rpb24oJ2dlbmVyYXRpb25zJykuYWRkKGRvYyk7XG4gICAgICBjb25zb2xlLmxvZygnW2xvZy1nZW5lcmF0aW9uXScsIGtpbmQsIHVpZC5zbGljZSgwLCA2KSwgJ2lkPScsIHJlZi5pZCwgJ2xlbj0nLCBkb2Mub3V0cHV0TGVuZ3RoKTtcbiAgICAgIHJldHVybiBqc29uUmVzcG9uc2UoeyBvazogdHJ1ZSwgaWQ6IHJlZi5pZCB9LCAyMDAsIHJlcXVlc3QpO1xuICAgIH1cblxuICAgIC8vIFx1MjUwMFx1MjUwMCBNb2RlIEI6IHVzZXItYWN0aW9uIHNpZ25hbCBvbiBhIHByaW9yIGdlbmVyYXRpb24gXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXG4gICAgaWYgKGFjdGlvbiA9PT0gJ3NpZ25hbCcpIHtcbiAgICAgIGNvbnN0IHsgZ2VuZXJhdGlvbklkLCBzaWduYWwsIHZhbHVlLCBtZXRhIH0gPSBib2R5O1xuICAgICAgaWYgKCFnZW5lcmF0aW9uSWQgfHwgdHlwZW9mIGdlbmVyYXRpb25JZCAhPT0gJ3N0cmluZycpIHtcbiAgICAgICAgcmV0dXJuIGVycm9yUmVzcG9uc2UoJ01pc3NpbmcgZ2VuZXJhdGlvbklkJywgNDAwLCByZXF1ZXN0KTtcbiAgICAgIH1cbiAgICAgIGlmICghc2lnbmFsIHx8ICFWQUxJRF9TSUdOQUxfVFlQRVMuaGFzKHNpZ25hbCkpIHtcbiAgICAgICAgcmV0dXJuIGVycm9yUmVzcG9uc2UoJ0ludmFsaWQgc2lnbmFsIHR5cGUnLCA0MDAsIHJlcXVlc3QpO1xuICAgICAgfVxuXG4gICAgICAvLyBWZXJpZnkgdGhlIGdlbmVyYXRpb24gYmVsb25ncyB0byB0aGlzIHVzZXIgYmVmb3JlIGF0dGFjaGluZyBhIHNpZ25hbC5cbiAgICAgIGNvbnN0IGdlblJlZiA9IGRiLmNvbGxlY3Rpb24oJ2dlbmVyYXRpb25zJykuZG9jKGdlbmVyYXRpb25JZCk7XG4gICAgICBjb25zdCBnZW5Eb2MgPSBhd2FpdCBnZW5SZWYuZ2V0KCk7XG4gICAgICBpZiAoIWdlbkRvYy5leGlzdHMgfHwgZ2VuRG9jLmRhdGEoKS51aWQgIT09IHVpZCkge1xuICAgICAgICByZXR1cm4gZXJyb3JSZXNwb25zZSgnR2VuZXJhdGlvbiBub3QgZm91bmQnLCA0MDQsIHJlcXVlc3QpO1xuICAgICAgfVxuXG4gICAgICBhd2FpdCBkYi5jb2xsZWN0aW9uKCdnZW5lcmF0aW9uX3NpZ25hbHMnKS5hZGQoe1xuICAgICAgICB1aWQsXG4gICAgICAgIGdlbmVyYXRpb25JZCxcbiAgICAgICAgc2lnbmFsLFxuICAgICAgICB2YWx1ZTogdHlwZW9mIHZhbHVlID09PSAnbnVtYmVyJyA/IHZhbHVlIDogbnVsbCxcbiAgICAgICAgbWV0YTogc2FuaXRpemVDb250ZXh0KG1ldGEpLFxuICAgICAgICBjcmVhdGVkQXQ6IEZpZWxkVmFsdWUuc2VydmVyVGltZXN0YW1wKCksXG4gICAgICB9KTtcblxuICAgICAgLy8gRGVub3JtYWxpemUgdGhlIG1vc3QtcmVjZW50IHNpZ25hbCBvbnRvIHRoZSBnZW5lcmF0aW9uIGRvYyBzb1xuICAgICAgLy8gZG93bnN0cmVhbSBxdWVyeWluZyAoXCJzaG93IG1lIDUtc3RhciBjYXNlc1wiKSBkb2Vzbid0IHJlcXVpcmUgYSBqb2luLlxuICAgICAgY29uc3QgdXBkYXRlID0geyBsYXN0U2lnbmFsOiBzaWduYWwsIGxhc3RTaWduYWxBdDogRmllbGRWYWx1ZS5zZXJ2ZXJUaW1lc3RhbXAoKSB9O1xuICAgICAgaWYgKHNpZ25hbCA9PT0gJ3JhdGUnICYmIHR5cGVvZiB2YWx1ZSA9PT0gJ251bWJlcicpIHVwZGF0ZS5yYXRpbmcgPSB2YWx1ZTtcbiAgICAgIGlmIChzaWduYWwgPT09ICdzYXZlJykgdXBkYXRlLnNhdmVkID0gdHJ1ZTtcbiAgICAgIGlmIChzaWduYWwgPT09ICdzaGFyZScpIHVwZGF0ZS5zaGFyZWQgPSB0cnVlO1xuICAgICAgaWYgKHNpZ25hbCA9PT0gJ3JlZ2VuZXJhdGUnKSB1cGRhdGUucmVnZW5lcmF0ZWQgPSB0cnVlO1xuICAgICAgaWYgKHNpZ25hbCA9PT0gJ2VkaXQnKSB7XG4gICAgICAgIHVwZGF0ZS5lZGl0ZWQgPSB0cnVlO1xuICAgICAgICBpZiAobWV0YSAmJiB0eXBlb2YgbWV0YS5lZGl0ZWRPdXRwdXQgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgICAgdXBkYXRlLmVkaXRlZE91dHB1dCA9IGNsYW1wKG1ldGEuZWRpdGVkT3V0cHV0LCBNQVhfT1VUUFVUX0NIQVJTKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgYXdhaXQgZ2VuUmVmLnVwZGF0ZSh1cGRhdGUpO1xuXG4gICAgICByZXR1cm4ganNvblJlc3BvbnNlKHsgb2s6IHRydWUgfSwgMjAwLCByZXF1ZXN0KTtcbiAgICB9XG5cbiAgICByZXR1cm4gZXJyb3JSZXNwb25zZSgnVW5rbm93biBhY3Rpb24nLCA0MDAsIHJlcXVlc3QpO1xuICB9IGNhdGNoIChlcnIpIHtcbiAgICBjb25zb2xlLmVycm9yKCdsb2ctZ2VuZXJhdGlvbiBlcnJvcjonLCBlcnIubWVzc2FnZSwgZXJyLmNvZGUgfHwgJycpO1xuICAgIHJldHVybiBlcnJvclJlc3BvbnNlKCdGYWlsZWQgdG8gbG9nIGdlbmVyYXRpb24nLCA1MDAsIHJlcXVlc3QpO1xuICB9XG59O1xuXG5leHBvcnQgY29uc3QgY29uZmlnID0ge1xuICBwYXRoOiAnL2FwaS9sb2ctZ2VuZXJhdGlvbicsXG59O1xuIiwgImNvbnN0IFBST0RVQ1RJT05fT1JJR0lOUyA9IFtcbiAgJ2h0dHBzOi8vZGViYXRlb3MxLm5ldGxpZnkuYXBwJyxcbiAgJ2h0dHBzOi8vZGV2aWxzYWR2b2NhdGUxLm5ldGxpZnkuYXBwJyxcbiAgJ2h0dHBzOi8vZGViYXRlb3MuY29tJyxcbiAgJ2h0dHBzOi8vd3d3LmRlYmF0ZW9zLmNvbScsXG4gICdodHRwczovL2RlYmF0ZXRoZWRldmlsLmNvbScsXG4gICdodHRwczovL3d3dy5kZWJhdGV0aGVkZXZpbC5jb20nLFxuXTtcblxuY29uc3QgREVWX09SSUdJTlMgPSBbXG4gICdodHRwOi8vbG9jYWxob3N0Ojg4ODgnLFxuICAnaHR0cDovL2xvY2FsaG9zdDozMDAwJyxcbl07XG5cbi8vIE9ubHkgYWxsb3cgbG9jYWxob3N0IG9yaWdpbnMgb3V0c2lkZSBwcm9kdWN0aW9uXG5jb25zdCBpc1Byb2R1Y3Rpb24gPSBwcm9jZXNzLmVudi5DT05URVhUID09PSAncHJvZHVjdGlvbic7XG5jb25zdCBBTExPV0VEX09SSUdJTlMgPSBpc1Byb2R1Y3Rpb25cbiAgPyBQUk9EVUNUSU9OX09SSUdJTlNcbiAgOiBbLi4uUFJPRFVDVElPTl9PUklHSU5TLCAuLi5ERVZfT1JJR0lOU107XG5cbi8vIERlZmF1bHQgb3JpZ2luIGZvciBwcmVmbGlnaHQgLyB3aGVuIHJlcXVlc3QgaXMgbm90IGF2YWlsYWJsZVxuY29uc3QgREVGQVVMVF9PUklHSU4gPSBBTExPV0VEX09SSUdJTlNbMF07XG5cbmZ1bmN0aW9uIGdldE9yaWdpbihyZXF1ZXN0KSB7XG4gIGlmICghcmVxdWVzdCkgcmV0dXJuIERFRkFVTFRfT1JJR0lOO1xuICBjb25zdCBvcmlnaW4gPSByZXF1ZXN0Py5oZWFkZXJzPy5nZXQ/Lignb3JpZ2luJykgfHwgJyc7XG4gIHJldHVybiBBTExPV0VEX09SSUdJTlMuaW5jbHVkZXMob3JpZ2luKSA/IG9yaWdpbiA6IERFRkFVTFRfT1JJR0lOO1xufVxuXG5mdW5jdGlvbiBjb3JzSGVhZGVycyhyZXF1ZXN0KSB7XG4gIHJldHVybiB7XG4gICAgJ0FjY2Vzcy1Db250cm9sLUFsbG93LU9yaWdpbic6IGdldE9yaWdpbihyZXF1ZXN0KSxcbiAgICAnQWNjZXNzLUNvbnRyb2wtQWxsb3ctTWV0aG9kcyc6ICdHRVQsIFBPU1QsIERFTEVURSwgT1BUSU9OUycsXG4gICAgJ0FjY2Vzcy1Db250cm9sLUFsbG93LUhlYWRlcnMnOiAnQ29udGVudC1UeXBlLCBBdXRob3JpemF0aW9uJyxcbiAgfTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNvcnNSZXNwb25zZShyZXF1ZXN0KSB7XG4gIHJldHVybiBuZXcgUmVzcG9uc2UobnVsbCwgeyBzdGF0dXM6IDIwNCwgaGVhZGVyczogY29yc0hlYWRlcnMocmVxdWVzdCkgfSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBqc29uUmVzcG9uc2UoZGF0YSwgc3RhdHVzID0gMjAwLCByZXF1ZXN0KSB7XG4gIHJldHVybiBuZXcgUmVzcG9uc2UoSlNPTi5zdHJpbmdpZnkoZGF0YSksIHtcbiAgICBzdGF0dXMsXG4gICAgaGVhZGVyczogeyAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nLCAuLi5jb3JzSGVhZGVycyhyZXF1ZXN0KSB9LFxuICB9KTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGVycm9yUmVzcG9uc2UobWVzc2FnZSwgc3RhdHVzID0gNDAwLCByZXF1ZXN0KSB7XG4gIHJldHVybiBqc29uUmVzcG9uc2UoeyBlcnJvcjogbWVzc2FnZSB9LCBzdGF0dXMsIHJlcXVlc3QpO1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7Ozs7QUFBQSxTQUFTLFdBQVcsa0JBQWtCO0FBSS9CLFNBQVMsUUFBUTtBQUN0QixNQUFJLEdBQUksUUFBTztBQUVmLFFBQU0saUJBQWlCLFFBQVEsSUFBSTtBQUNuQyxNQUFJLENBQUMsZUFBZ0IsT0FBTSxJQUFJLE1BQU0sdUNBQXVDO0FBRTVFLE1BQUk7QUFDSixNQUFJO0FBQ0YsWUFBUSxLQUFLLE1BQU0sY0FBYztBQUFBLEVBQ25DLFNBQVMsR0FBRztBQUNWLFlBQVEsTUFBTSw2REFBNkQsZUFBZSxNQUFNLEdBQUcsRUFBRSxHQUFHLHNCQUFzQixlQUFlLE1BQU0sR0FBRyxDQUFDO0FBQ3ZKLFVBQU0sSUFBSSxNQUFNLDZFQUE2RTtBQUFBLEVBQy9GO0FBRUEsTUFBSSxDQUFDLE1BQU0sY0FBYyxDQUFDLE1BQU0sZ0JBQWdCLENBQUMsTUFBTSxhQUFhO0FBQ2xFLFlBQVEsTUFBTSxzREFBc0QsT0FBTyxLQUFLLEtBQUssRUFBRSxLQUFLLElB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
