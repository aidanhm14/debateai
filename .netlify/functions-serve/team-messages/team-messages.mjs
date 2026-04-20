
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

// ../../../netlify/functions/team-messages.mjs
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

// ../../../netlify/functions/team-messages.mjs
var BAD_WORDS = [
  // Short, non-exhaustive list — just enough to catch obvious slurs if
  // the moderation API is down. The real signal is OpenAI's response.
  "retard",
  "faggot",
  "tranny",
  "nigger",
  "chink",
  "spic",
  "kike"
];
var MAX_LEN = 2e3;
var MAX_PER_MIN = 10;
var rateMap = /* @__PURE__ */ new Map();
function rateLimit(teamId) {
  const now = Date.now();
  const e = rateMap.get(teamId);
  if (!e || now - e.start > 6e4) {
    rateMap.set(teamId, { start: now, count: 1 });
    return true;
  }
  e.count += 1;
  return e.count <= MAX_PER_MIN;
}
function containsBadWord(text) {
  const lower = (text || "").toLowerCase();
  return BAD_WORDS.some((w) => lower.includes(w));
}
function threadIdOf(a, b) {
  return [a, b].sort().join("|");
}
async function moderate(text) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return { flagged: containsBadWord(text), source: "wordlist" };
  try {
    const r = await fetch("https://api.openai.com/v1/moderations", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + key },
      body: JSON.stringify({ model: "text-moderation-latest", input: text.slice(0, 4e3) })
    });
    if (!r.ok) return { flagged: true, source: "api_error", err: r.status };
    const data = await r.json();
    const result = data.results && data.results[0];
    if (!result) return { flagged: true, source: "empty_response" };
    const flaggedCats = Object.entries(result.categories || {}).filter(([, v]) => v).map(([k]) => k);
    return {
      flagged: !!result.flagged || containsBadWord(text),
      categories: flaggedCats,
      source: result.flagged ? "openai" : containsBadWord(text) ? "wordlist" : "clean"
    };
  } catch {
    return { flagged: containsBadWord(text), source: "wordlist_fallback" };
  }
}
var team_messages_default = async (request) => {
  if (request.method === "OPTIONS") return corsResponse(request);
  const token = extractBearerToken(request);
  if (!token) return errorResponse("Sign in to message teams", 401, request);
  let decoded;
  try {
    decoded = await verifyIdToken(token);
  } catch {
    return errorResponse("Authentication failed. Please sign in again.", 401, request);
  }
  const callerUid = decoded.sub;
  const myTeam = await getUserTeam(callerUid);
  if (!myTeam) return errorResponse("You need a team to message other teams.", 404, request);
  const db2 = getDb();
  if (request.method === "GET") {
    const url = new URL(request.url);
    const withTeam = url.searchParams.get("with");
    if (!withTeam) return errorResponse("Missing ?with=<teamId>", 400, request);
    const threadId2 = threadIdOf(myTeam.team.id, withTeam);
    try {
      const snap = await db2.collection("team_messages").where("threadId", "==", threadId2).orderBy("createdAt", "asc").limit(200).get();
      const messages = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          fromTeamId: data.fromTeamId,
          fromUid: data.fromUid,
          fromName: data.fromName,
          text: data.text,
          createdAt: data.createdAt?.toDate?.()?.toISOString() || null
        };
      });
      return jsonResponse({ messages, threadId: threadId2 }, 200, request);
    } catch (err) {
      console.error("team-messages GET error:", err.message);
      return errorResponse("Could not load messages", 500, request);
    }
  }
  if (request.method !== "POST") return errorResponse("Method not allowed", 405, request);
  if (!rateLimit(myTeam.team.id)) {
    return errorResponse("Slow down \u2014 too many messages in a short window.", 429, request);
  }
  let body;
  try {
    body = await request.json();
  } catch {
    return errorResponse("Invalid JSON", 400, request);
  }
  const toTeamId = (body.toTeamId || "").trim();
  const text = (body.text || "").trim();
  if (!toTeamId) return errorResponse("Missing toTeamId", 400, request);
  if (!text) return errorResponse("Message cannot be empty", 400, request);
  if (text.length > MAX_LEN) return errorResponse("Message too long (" + MAX_LEN + " chars max)", 400, request);
  if (toTeamId === myTeam.team.id) return errorResponse("Cannot message your own team", 400, request);
  const modResult = await moderate(text);
  if (modResult.flagged) {
    console.warn("[team-messages] blocked flagged message from", callerUid, "categories:", modResult.categories);
    return errorResponse(
      "Message blocked: our moderation system flagged this as potentially offensive or abusive. Rephrase and try again.",
      422,
      request
    );
  }
  const toTeamDoc = await db2.collection("teams").doc(toTeamId).get();
  if (!toTeamDoc.exists) return errorResponse("Team not found", 404, request);
  const threadId = threadIdOf(myTeam.team.id, toTeamId);
  try {
    const fromName = (decoded.name || decoded.email || "Anonymous").slice(0, 80);
    const ref = await db2.collection("team_messages").add({
      threadId,
      fromTeamId: myTeam.team.id,
      toTeamId,
      fromUid: callerUid,
      fromName,
      text: text.slice(0, MAX_LEN),
      moderationSource: modResult.source || "unknown",
      createdAt: FieldValue.serverTimestamp()
    });
    await db2.collection("team_threads").doc(threadId).set({
      threadId,
      participantTeamIds: threadId.split("|"),
      lastMessage: text.slice(0, 140),
      lastMessageAt: FieldValue.serverTimestamp(),
      lastFromTeamId: myTeam.team.id
    }, { merge: true });
    return jsonResponse({ ok: true, id: ref.id, threadId }, 200, request);
  } catch (err) {
    console.error("team-messages POST error:", err.message);
    return errorResponse("Could not send message", 500, request);
  }
};
var config = {
  path: "/api/teams/messages"
};
export {
  config,
  team_messages_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vLi4vLi4vbmV0bGlmeS9mdW5jdGlvbnMvbGliL2ZpcmVzdG9yZS5tanMiLCAiLi4vLi4vLi4vbmV0bGlmeS9mdW5jdGlvbnMvbGliL2F1dGgubWpzIiwgIi4uLy4uLy4uL25ldGxpZnkvZnVuY3Rpb25zL3RlYW0tbWVzc2FnZXMubWpzIiwgIi4uLy4uLy4uL25ldGxpZnkvZnVuY3Rpb25zL2xpYi9yZXNwb25zZS5tanMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImltcG9ydCB7IEZpcmVzdG9yZSwgRmllbGRWYWx1ZSB9IGZyb20gJ0Bnb29nbGUtY2xvdWQvZmlyZXN0b3JlJztcblxubGV0IGRiID0gbnVsbDtcblxuZXhwb3J0IGZ1bmN0aW9uIGdldERiKCkge1xuICBpZiAoZGIpIHJldHVybiBkYjtcblxuICBjb25zdCBzZXJ2aWNlQWNjb3VudCA9IHByb2Nlc3MuZW52LkdPT0dMRV9TRVJWSUNFX0FDQ09VTlQ7XG4gIGlmICghc2VydmljZUFjY291bnQpIHRocm93IG5ldyBFcnJvcignR09PR0xFX1NFUlZJQ0VfQUNDT1VOVCBub3QgY29uZmlndXJlZCcpO1xuXG4gIGxldCBjcmVkcztcbiAgdHJ5IHtcbiAgICBjcmVkcyA9IEpTT04ucGFyc2Uoc2VydmljZUFjY291bnQpO1xuICB9IGNhdGNoIChlKSB7XG4gICAgY29uc29sZS5lcnJvcignR09PR0xFX1NFUlZJQ0VfQUNDT1VOVCBKU09OIHBhcnNlIGZhaWxlZC4gRmlyc3QgNTAgY2hhcnM6Jywgc2VydmljZUFjY291bnQuc2xpY2UoMCwgNTApLCAnLi4uIExhc3QgNTAgY2hhcnM6Jywgc2VydmljZUFjY291bnQuc2xpY2UoLTUwKSk7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdHT09HTEVfU0VSVklDRV9BQ0NPVU5UIGlzIG5vdCB2YWxpZCBKU09OLiBSZS1wYXN0ZSB0aGUgc2VydmljZSBhY2NvdW50IGtleS4nKTtcbiAgfVxuXG4gIGlmICghY3JlZHMucHJvamVjdF9pZCB8fCAhY3JlZHMuY2xpZW50X2VtYWlsIHx8ICFjcmVkcy5wcml2YXRlX2tleSkge1xuICAgIGNvbnNvbGUuZXJyb3IoJ0dPT0dMRV9TRVJWSUNFX0FDQ09VTlQgbWlzc2luZyBmaWVsZHMuIEtleXMgZm91bmQ6JywgT2JqZWN0LmtleXMoY3JlZHMpLmpvaW4oJywgJykpO1xuICAgIHRocm93IG5ldyBFcnJvcignR09PR0xFX1NFUlZJQ0VfQUNDT1VOVCBpcyBtaXNzaW5nIHJlcXVpcmVkIGZpZWxkcyAocHJvamVjdF9pZCwgY2xpZW50X2VtYWlsLCBvciBwcml2YXRlX2tleSkuJyk7XG4gIH1cblxuICBkYiA9IG5ldyBGaXJlc3RvcmUoe1xuICAgIHByb2plY3RJZDogY3JlZHMucHJvamVjdF9pZCxcbiAgICBjcmVkZW50aWFsczoge1xuICAgICAgY2xpZW50X2VtYWlsOiBjcmVkcy5jbGllbnRfZW1haWwsXG4gICAgICBwcml2YXRlX2tleTogY3JlZHMucHJpdmF0ZV9rZXksXG4gICAgfSxcbiAgfSk7XG4gIHJldHVybiBkYjtcbn1cblxuLy8gUGxhbiB0aWVyIGRlZmluaXRpb25zXG5leHBvcnQgY29uc3QgUExBTlMgPSB7XG4gIHRyaWFsOiAgeyByZXF1ZXN0czogMywgICAgbWVtYmVyczogMywgIHByaWNlTW9udGhseTogMCB9LFxuICBieW9rOiAgICAgICB7IHJlcXVlc3RzOiA5OTk5LCBtZW1iZXJzOiAxLCAgcHJpY2VNb250aGx5OiAxMDAgfSxcbiAgaW5kaXZpZHVhbDogeyByZXF1ZXN0czogMjUwLCAgbWVtYmVyczogMSwgIHByaWNlTW9udGhseTogNTAwIH0sXG4gIGxpZmV0aW1lOiAgIHsgcmVxdWVzdHM6IDI1MCwgIG1lbWJlcnM6IDMsICBwcmljZU1vbnRobHk6IDAgfSxcbiAgdGVhbTogICAgICAgeyByZXF1ZXN0czogMTUwMCwgbWVtYmVyczogNTAsIHByaWNlTW9udGhseTogMzAwMCB9LFxufTtcblxuLyoqXG4gKiBMb29rIHVwIGEgdXNlcidzIHRlYW0gZ2l2ZW4gdGhlaXIgRmlyZWJhc2UgVUlELlxuICogUmV0dXJucyB7IHRlYW0sIHRlYW1SZWYsIG1lbWJlcnNoaXAgfSBvciBudWxsIGlmIG5vIHRlYW0uXG4gKi9cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBnZXRVc2VyVGVhbSh1aWQpIHtcbiAgY29uc3QgZGIgPSBnZXREYigpO1xuXG4gIC8vIEZpbmQgbWVtYmVyc2hpcFxuICBjb25zdCBtZW1iZXJzaGlwcyA9IGF3YWl0IGRiLmNvbGxlY3Rpb24oJ3RlYW1fbWVtYmVycycpXG4gICAgLndoZXJlKCd1c2VySWQnLCAnPT0nLCB1aWQpXG4gICAgLmxpbWl0KDEpXG4gICAgLmdldCgpO1xuXG4gIGlmIChtZW1iZXJzaGlwcy5lbXB0eSkgcmV0dXJuIG51bGw7XG5cbiAgY29uc3QgbWVtYmVyc2hpcCA9IG1lbWJlcnNoaXBzLmRvY3NbMF0uZGF0YSgpO1xuICBjb25zdCB0ZWFtUmVmID0gZGIuY29sbGVjdGlvbigndGVhbXMnKS5kb2MobWVtYmVyc2hpcC50ZWFtSWQpO1xuICBjb25zdCB0ZWFtRG9jID0gYXdhaXQgdGVhbVJlZi5nZXQoKTtcblxuICBpZiAoIXRlYW1Eb2MuZXhpc3RzKSByZXR1cm4gbnVsbDtcblxuICByZXR1cm4ge1xuICAgIHRlYW06IHsgaWQ6IHRlYW1Eb2MuaWQsIC4uLnRlYW1Eb2MuZGF0YSgpIH0sXG4gICAgdGVhbVJlZixcbiAgICBtZW1iZXJzaGlwLFxuICB9O1xufVxuXG4vKipcbiAqIEluY3JlbWVudCB1c2FnZSBjb3VudGVyIGZvciBhIHRlYW0gYW5kIGxvZyB0aGUgcmVxdWVzdC5cbiAqL1xuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGxvZ1VzYWdlKHRlYW1JZCwgdXNlcklkLCBmZWF0dXJlLCBpbnB1dFRva2VucyA9IDAsIG91dHB1dFRva2VucyA9IDApIHtcbiAgY29uc3QgZGIgPSBnZXREYigpO1xuXG4gIC8vIEF0b21pYyBpbmNyZW1lbnQgb2YgdGhlIHRlYW0gdXNhZ2UgY291bnRlclxuICBhd2FpdCBkYi5jb2xsZWN0aW9uKCd0ZWFtcycpLmRvYyh0ZWFtSWQpLnVwZGF0ZSh7XG4gICAgdXNhZ2VUaGlzUGVyaW9kOiBGaWVsZFZhbHVlLmluY3JlbWVudCgxKSxcbiAgICB1cGRhdGVkQXQ6IEZpZWxkVmFsdWUuc2VydmVyVGltZXN0YW1wKCksXG4gIH0pO1xuXG4gIC8vIEFwcGVuZCBkZXRhaWxlZCB1c2FnZSBsb2dcbiAgYXdhaXQgZGIuY29sbGVjdGlvbigndXNhZ2VfbG9ncycpLmFkZCh7XG4gICAgdGVhbUlkLFxuICAgIHVzZXJJZCxcbiAgICBmZWF0dXJlLFxuICAgIGlucHV0VG9rZW5zLFxuICAgIG91dHB1dFRva2VucyxcbiAgICB0aW1lc3RhbXA6IEZpZWxkVmFsdWUuc2VydmVyVGltZXN0YW1wKCksXG4gIH0pO1xufVxuXG5leHBvcnQgeyBGaWVsZFZhbHVlIH07XG4iLCAiLy8gRmlyZWJhc2UgSUQgdG9rZW4gdmVyaWZpY2F0aW9uIHVzaW5nIEdvb2dsZSdzIEpXSyBrZXlzLlxuLy8gVXNlcyBjcnlwdG8uc3VidGxlIGZvciBzaWduYXR1cmUgdmVyaWZpY2F0aW9uLlxuXG5sZXQgY2FjaGVkS2V5cyA9IG51bGw7XG5sZXQgY2FjaGVkS2V5c0V4cGlyeSA9IDA7XG5cbmNvbnN0IEZJUkVCQVNFX1BST0pFQ1RfSUQgPSAnZGViYXRlb3MtNzhhYzUnO1xuY29uc3QgR09PR0xFX0pXS1NfVVJMID1cbiAgJ2h0dHBzOi8vd3d3Lmdvb2dsZWFwaXMuY29tL3NlcnZpY2VfYWNjb3VudHMvdjEvandrL3NlY3VyZXRva2VuQHN5c3RlbS5nc2VydmljZWFjY291bnQuY29tJztcblxuYXN5bmMgZnVuY3Rpb24gZ2V0SndrcygpIHtcbiAgaWYgKGNhY2hlZEtleXMgJiYgRGF0ZS5ub3coKSA8IGNhY2hlZEtleXNFeHBpcnkpIHJldHVybiBjYWNoZWRLZXlzO1xuXG4gIGNvbnN0IHJlcyA9IGF3YWl0IGZldGNoKEdPT0dMRV9KV0tTX1VSTCk7XG4gIGlmICghcmVzLm9rKSB0aHJvdyBuZXcgRXJyb3IoJ0ZhaWxlZCB0byBmZXRjaCBHb29nbGUgSldLcycpO1xuXG4gIGNvbnN0IGNhY2hlQ29udHJvbCA9IHJlcy5oZWFkZXJzLmdldCgnY2FjaGUtY29udHJvbCcpIHx8ICcnO1xuICBjb25zdCBtYXhBZ2VNYXRjaCA9IGNhY2hlQ29udHJvbC5tYXRjaCgvbWF4LWFnZT0oXFxkKykvKTtcbiAgY29uc3QgbWF4QWdlID0gbWF4QWdlTWF0Y2ggPyBwYXJzZUludChtYXhBZ2VNYXRjaFsxXSwgMTApICogMTAwMCA6IDM2MDAwMDA7XG4gIGNhY2hlZEtleXNFeHBpcnkgPSBEYXRlLm5vdygpICsgbWF4QWdlO1xuXG4gIGNvbnN0IGRhdGEgPSBhd2FpdCByZXMuanNvbigpO1xuICBjYWNoZWRLZXlzID0gZGF0YS5rZXlzO1xuICByZXR1cm4gY2FjaGVkS2V5cztcbn1cblxuZnVuY3Rpb24gYmFzZTY0dXJsRGVjb2RlKHN0cikge1xuICBzdHIgPSBzdHIucmVwbGFjZSgvLS9nLCAnKycpLnJlcGxhY2UoL18vZywgJy8nKTtcbiAgd2hpbGUgKHN0ci5sZW5ndGggJSA0KSBzdHIgKz0gJz0nO1xuICBpZiAodHlwZW9mIEJ1ZmZlciAhPT0gJ3VuZGVmaW5lZCcpIHtcbiAgICByZXR1cm4gQnVmZmVyLmZyb20oc3RyLCAnYmFzZTY0JykudG9TdHJpbmcoJ2JpbmFyeScpO1xuICB9XG4gIHJldHVybiBhdG9iKHN0cik7XG59XG5cbmZ1bmN0aW9uIGJhc2U2NHVybFRvVWludDhBcnJheShzdHIpIHtcbiAgY29uc3QgYmluYXJ5ID0gYmFzZTY0dXJsRGVjb2RlKHN0cik7XG4gIGNvbnN0IGJ5dGVzID0gbmV3IFVpbnQ4QXJyYXkoYmluYXJ5Lmxlbmd0aCk7XG4gIGZvciAobGV0IGkgPSAwOyBpIDwgYmluYXJ5Lmxlbmd0aDsgaSsrKSBieXRlc1tpXSA9IGJpbmFyeS5jaGFyQ29kZUF0KGkpO1xuICByZXR1cm4gYnl0ZXM7XG59XG5cbi8qKlxuICogVmVyaWZ5IGEgRmlyZWJhc2UgSUQgdG9rZW4gYW5kIHJldHVybiB0aGUgZGVjb2RlZCBwYXlsb2FkLlxuICogVGhyb3dzIG9uIGludmFsaWQvZXhwaXJlZCB0b2tlbnMuXG4gKi9cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiB2ZXJpZnlJZFRva2VuKGlkVG9rZW4pIHtcbiAgaWYgKCFpZFRva2VuKSB0aHJvdyBuZXcgRXJyb3IoJ05vIElEIHRva2VuIHByb3ZpZGVkJyk7XG5cbiAgY29uc3QgcGFydHMgPSBpZFRva2VuLnNwbGl0KCcuJyk7XG4gIGlmIChwYXJ0cy5sZW5ndGggIT09IDMpIHRocm93IG5ldyBFcnJvcignSW52YWxpZCB0b2tlbiBmb3JtYXQnKTtcblxuICBjb25zdCBoZWFkZXIgPSBKU09OLnBhcnNlKGJhc2U2NHVybERlY29kZShwYXJ0c1swXSkpO1xuICBjb25zdCBwYXlsb2FkID0gSlNPTi5wYXJzZShiYXNlNjR1cmxEZWNvZGUocGFydHNbMV0pKTtcblxuICAvLyBDaGVjayBjbGFpbXNcbiAgY29uc3Qgbm93ID0gTWF0aC5mbG9vcihEYXRlLm5vdygpIC8gMTAwMCk7XG4gIGlmIChwYXlsb2FkLmV4cCA8IG5vdykgdGhyb3cgbmV3IEVycm9yKCdUb2tlbiBleHBpcmVkJyk7XG4gIGlmIChwYXlsb2FkLmlhdCA+IG5vdyArIDMwMCkgdGhyb3cgbmV3IEVycm9yKCdUb2tlbiBpc3N1ZWQgaW4gdGhlIGZ1dHVyZScpO1xuICBpZiAocGF5bG9hZC5hdWQgIT09IEZJUkVCQVNFX1BST0pFQ1RfSUQpIHRocm93IG5ldyBFcnJvcignSW52YWxpZCBhdWRpZW5jZScpO1xuICBpZiAocGF5bG9hZC5pc3MgIT09IGBodHRwczovL3NlY3VyZXRva2VuLmdvb2dsZS5jb20vJHtGSVJFQkFTRV9QUk9KRUNUX0lEfWApXG4gICAgdGhyb3cgbmV3IEVycm9yKCdJbnZhbGlkIGlzc3VlcicpO1xuICBpZiAoIXBheWxvYWQuc3ViIHx8IHR5cGVvZiBwYXlsb2FkLnN1YiAhPT0gJ3N0cmluZycpXG4gICAgdGhyb3cgbmV3IEVycm9yKCdJbnZhbGlkIHN1YmplY3QnKTtcblxuICAvLyBHZXQgdGhlIG1hdGNoaW5nIEpXS1xuICBjb25zdCBqd2tzID0gYXdhaXQgZ2V0SndrcygpO1xuICBjb25zdCBqd2sgPSBqd2tzLmZpbmQoayA9PiBrLmtpZCA9PT0gaGVhZGVyLmtpZCk7XG4gIGlmICghandrKSB0aHJvdyBuZXcgRXJyb3IoJ1Vua25vd24gc2lnbmluZyBrZXknKTtcblxuICAvLyBJbXBvcnQgdGhlIEpXSyBhcyBhIENyeXB0b0tleVxuICBjb25zdCBjcnlwdG9LZXkgPSBhd2FpdCBjcnlwdG8uc3VidGxlLmltcG9ydEtleShcbiAgICAnandrJyxcbiAgICBqd2ssXG4gICAgeyBuYW1lOiAnUlNBU1NBLVBLQ1MxLXYxXzUnLCBoYXNoOiAnU0hBLTI1NicgfSxcbiAgICBmYWxzZSxcbiAgICBbJ3ZlcmlmeSddXG4gICk7XG5cbiAgLy8gVmVyaWZ5IHNpZ25hdHVyZVxuICBjb25zdCBzaWduYXR1cmVCdWZmZXIgPSBiYXNlNjR1cmxUb1VpbnQ4QXJyYXkocGFydHNbMl0pO1xuICBjb25zdCBkYXRhQnVmZmVyID0gbmV3IFRleHRFbmNvZGVyKCkuZW5jb2RlKHBhcnRzWzBdICsgJy4nICsgcGFydHNbMV0pO1xuXG4gIGNvbnN0IHZhbGlkID0gYXdhaXQgY3J5cHRvLnN1YnRsZS52ZXJpZnkoXG4gICAgJ1JTQVNTQS1QS0NTMS12MV81JyxcbiAgICBjcnlwdG9LZXksXG4gICAgc2lnbmF0dXJlQnVmZmVyLFxuICAgIGRhdGFCdWZmZXJcbiAgKTtcblxuICBpZiAoIXZhbGlkKSB0aHJvdyBuZXcgRXJyb3IoJ0ludmFsaWQgdG9rZW4gc2lnbmF0dXJlJyk7XG5cbiAgcmV0dXJuIHBheWxvYWQ7XG59XG5cbi8qKlxuICogRXh0cmFjdCB0aGUgQmVhcmVyIHRva2VuIGZyb20gYW4gQXV0aG9yaXphdGlvbiBoZWFkZXIuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBleHRyYWN0QmVhcmVyVG9rZW4ocmVxdWVzdCkge1xuICBjb25zdCBhdXRoID0gcmVxdWVzdC5oZWFkZXJzLmdldCgnYXV0aG9yaXphdGlvbicpIHx8ICcnO1xuICBpZiAoIWF1dGguc3RhcnRzV2l0aCgnQmVhcmVyICcpKSByZXR1cm4gbnVsbDtcbiAgcmV0dXJuIGF1dGguc2xpY2UoNyk7XG59XG5cbi8qKlxuICogRW5mb3JjZSB0aGF0IHRoZSBjYWxsZXIgaXMgc2lnbmVkIGluIEFORCBvbiBhIHBhaWQgcGxhbi5cbiAqIFJldHVybnMgeyBvazogdHJ1ZSwgdWlkLCBwbGFuIH0gb24gc3VjY2Vzcywgb3IgeyBvazogZmFsc2UsIHN0YXR1cywgZXJyb3IgfVxuICogb24gZmFpbHVyZSBcdTIwMTQgY2FsbCBzaXRlcyBzaG91bGQgcmV0dXJuIHRoZSBlcnJvciByZXNwb25zZSBhcy1pcy5cbiAqXG4gKiBVc2UgdGhpcyB0byBnYXRlIHByZW1pdW0gZW5kcG9pbnRzIChHZW1pbmksIEdyb2ssIE9wZW5BSSkgdGhhdCBmcmVlXG4gKiB1c2VycyBjYW4ndCBjYWxsLiBGcmVlIENsYXVkZSB1c2FnZSBnb2VzIHRocm91Z2ggL2FwaS9jbGF1ZGUgd2hpY2hcbiAqIGhhcyBpdHMgb3duIGFub255bW91cyt0cmlhbCBsYXllcnMgYW5kIHNob3VsZCBub3QgdXNlIHRoaXMgaGVscGVyLlxuICovXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gcmVxdWlyZVBhaWRQbGFuKHJlcXVlc3QsIGZlYXR1cmVOYW1lKSB7XG4gIGNvbnN0IHRva2VuID0gZXh0cmFjdEJlYXJlclRva2VuKHJlcXVlc3QpO1xuICBpZiAoIXRva2VuKSB7XG4gICAgcmV0dXJuIHtcbiAgICAgIG9rOiBmYWxzZSxcbiAgICAgIHN0YXR1czogNDAxLFxuICAgICAgZXJyb3I6ICdTaWduIGluIHJlcXVpcmVkLiAnICsgKGZlYXR1cmVOYW1lIHx8ICdUaGlzIG1vZGVsJykgKyAnIGlzIGEgcGFpZC1wbGFuIGZlYXR1cmUuJyxcbiAgICAgIGNvZGU6ICdBVVRIX1JFUVVJUkVEJyxcbiAgICB9O1xuICB9XG5cbiAgbGV0IGRlY29kZWQ7XG4gIHRyeSB7XG4gICAgZGVjb2RlZCA9IGF3YWl0IHZlcmlmeUlkVG9rZW4odG9rZW4pO1xuICB9IGNhdGNoIChlcnIpIHtcbiAgICByZXR1cm4ge1xuICAgICAgb2s6IGZhbHNlLFxuICAgICAgc3RhdHVzOiA0MDEsXG4gICAgICBlcnJvcjogJ0F1dGhlbnRpY2F0aW9uIGZhaWxlZC4gUGxlYXNlIHNpZ24gaW4gYWdhaW4uJyxcbiAgICAgIGNvZGU6ICdBVVRIX0lOVkFMSUQnLFxuICAgIH07XG4gIH1cblxuICAvLyBMYXp5LWltcG9ydCBmaXJlc3RvcmUgdG8gYXZvaWQgYSBjaXJjdWxhciBkZXAgKyBjb2xkLXN0YXJ0IGNvc3QgZm9yXG4gIC8vIGNhbGxlcnMgdGhhdCBoYXBwZW4gdG8gYmUgY2hlY2tpbmcgYXV0aCB3aXRob3V0IG5lZWRpbmcgcGFpZCBnYXRpbmcuXG4gIGNvbnN0IHsgZ2V0VXNlclRlYW0gfSA9IGF3YWl0IGltcG9ydCgnLi9maXJlc3RvcmUubWpzJyk7XG4gIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGdldFVzZXJUZWFtKGRlY29kZWQuc3ViKTtcbiAgY29uc3QgcGxhbiA9IHJlc3VsdD8udGVhbT8ucGxhbjtcbiAgY29uc3Qgc3RhdHVzID0gcmVzdWx0Py50ZWFtPy5zdGF0dXM7XG4gIGNvbnN0IGlzUGFpZCA9XG4gICAgcGxhbiAmJlxuICAgIHBsYW4gIT09ICd0cmlhbCcgJiZcbiAgICBbJ2luZGl2aWR1YWwnLCAndGVhbScsICdsaWZldGltZScsICdieW9rJ10uaW5jbHVkZXMocGxhbikgJiZcbiAgICAoIXN0YXR1cyB8fCBzdGF0dXMgPT09ICdhY3RpdmUnIHx8IHN0YXR1cyA9PT0gJ3RyaWFsaW5nJyk7XG5cbiAgaWYgKCFpc1BhaWQpIHtcbiAgICByZXR1cm4ge1xuICAgICAgb2s6IGZhbHNlLFxuICAgICAgc3RhdHVzOiA0MDIsIC8vIFBheW1lbnQgUmVxdWlyZWQgXHUyMDE0IHNlbWFudGljYWxseSBwcmVjaXNlIGZvciB0aGlzIGNhc2UuXG4gICAgICBlcnJvcjogKGZlYXR1cmVOYW1lIHx8ICdUaGlzIG1vZGVsJykgKyAnIGlzIGEgcGFpZCBmZWF0dXJlLiBVcGdyYWRlIHRvIEluZGl2aWR1YWwgKCQ1L21vKSB0byB1bmxvY2sgR2VtaW5pLCBHUFQsIGFuZCBHcm9rIGFsb25nc2lkZSBDbGF1ZGUgU29ubmV0LicsXG4gICAgICBjb2RlOiAnUEFZTUVOVF9SRVFVSVJFRCcsXG4gICAgICBjdXJyZW50UGxhbjogcGxhbiB8fCAndHJpYWwnLFxuICAgIH07XG4gIH1cblxuICByZXR1cm4geyBvazogdHJ1ZSwgdWlkOiBkZWNvZGVkLnN1YiwgcGxhbiB9O1xufVxuIiwgImltcG9ydCB7IHZlcmlmeUlkVG9rZW4sIGV4dHJhY3RCZWFyZXJUb2tlbiB9IGZyb20gJy4vbGliL2F1dGgubWpzJztcbmltcG9ydCB7IGdldERiLCBnZXRVc2VyVGVhbSwgRmllbGRWYWx1ZSB9IGZyb20gJy4vbGliL2ZpcmVzdG9yZS5tanMnO1xuaW1wb3J0IHsgY29yc1Jlc3BvbnNlLCBqc29uUmVzcG9uc2UsIGVycm9yUmVzcG9uc2UgfSBmcm9tICcuL2xpYi9yZXNwb25zZS5tanMnO1xuXG4vLyBUZWFtLXRvLXRlYW0gZGlyZWN0IG1lc3NhZ2luZyB3aXRoIE9wZW5BSSBNb2RlcmF0aW9uIG9uIGV2ZXJ5IHNlbmQuXG4vL1xuLy8gU3RvcmFnZSBtb2RlbDogb25lIGZsYXQgYHRlYW1fbWVzc2FnZXNgIGNvbGxlY3Rpb24uIEVhY2ggbWVzc2FnZSBoYXMgYVxuLy8gZGV0ZXJtaW5pc3RpYyBgdGhyZWFkSWRgIGJ1aWx0IGZyb20gdGhlIHR3byB0ZWFtIElEcyBzb3J0ZWQgKyBqb2luZWRcbi8vIHdpdGggJ3wnIHNvIGEgcGFpciBvZiB0ZWFtcyBhbHdheXMgc2hhcmUgdGhlIHNhbWUgdGhyZWFkIHJlZ2FyZGxlc3Mgb2Zcbi8vIHdobyBETXMgZmlyc3QuIFBhcnRpY2lwYW50cyBjYW4gcXVlcnkgbWVzc2FnZXMgd2l0aFxuLy8gICB3aGVyZSgndGhyZWFkSWQnLCAnPT0nLCAuLi4pIG9yZGVyIGJ5IGNyZWF0ZWRBdCBkZXNjXG4vLyBXaGljaCBpcyBhIHNpbmdsZSBGaXJlc3RvcmUgaW5kZXguXG4vL1xuLy8gTW9kZXJhdGlvbjogZXZlcnkgb3V0Z29pbmcgdGV4dCBpcyBjaGVja2VkIGJ5IC92MS9tb2RlcmF0aW9ucyBiZWZvcmVcbi8vIHRoZSB3cml0ZS4gSWYgZmxhZ2dlZCBmb3IgYW55IGNhdGVnb3J5LCB0aGUgbWVzc2FnZSBpcyByZWplY3RlZCB3aXRoXG4vLyBhIHN0cnVjdHVyZWQgZXJyb3IgXHUyMDE0IHdlIG5ldmVyIHdyaXRlIGZsYWdnZWQgY29udGVudCB0byBGaXJlc3RvcmUuXG4vLyBBZGRpdGlvbmFsbHkga2VlcCBhIGxhc3QtcmVzb3J0IHdvcmRsaXN0IGZhbGxiYWNrIGluIGNhc2UgdGhlIE9wZW5BSVxuLy8gY2FsbCBmYWlscyAod2UgZG9uJ3Qgd2FudCBtb2RlcmF0aW9uIG91dGFnZXMgdG8gc2lsZW50bHkgbGV0IGFidXNlXG4vLyB0aHJvdWdoOyB3ZSdkIHJhdGhlciByZWplY3QgZXZlcnl0aGluZyB1bnRpbCBpdCdzIGhlYWx0aHkpLlxuXG5jb25zdCBCQURfV09SRFMgPSBbXG4gIC8vIFNob3J0LCBub24tZXhoYXVzdGl2ZSBsaXN0IFx1MjAxNCBqdXN0IGVub3VnaCB0byBjYXRjaCBvYnZpb3VzIHNsdXJzIGlmXG4gIC8vIHRoZSBtb2RlcmF0aW9uIEFQSSBpcyBkb3duLiBUaGUgcmVhbCBzaWduYWwgaXMgT3BlbkFJJ3MgcmVzcG9uc2UuXG4gICdyZXRhcmQnLCAnZmFnZ290JywgJ3RyYW5ueScsICduaWdnZXInLCAnY2hpbmsnLCAnc3BpYycsICdraWtlJyxcbl07XG5cbmNvbnN0IE1BWF9MRU4gPSAyMDAwO1xuY29uc3QgTUFYX1BFUl9NSU4gPSAxMDsgLy8gcGVyIHRlYW0sIGFudGktc3BhbVxuY29uc3QgcmF0ZU1hcCA9IG5ldyBNYXAoKTtcblxuZnVuY3Rpb24gcmF0ZUxpbWl0KHRlYW1JZCkge1xuICBjb25zdCBub3cgPSBEYXRlLm5vdygpO1xuICBjb25zdCBlID0gcmF0ZU1hcC5nZXQodGVhbUlkKTtcbiAgaWYgKCFlIHx8IG5vdyAtIGUuc3RhcnQgPiA2MF8wMDApIHtcbiAgICByYXRlTWFwLnNldCh0ZWFtSWQsIHsgc3RhcnQ6IG5vdywgY291bnQ6IDEgfSk7XG4gICAgcmV0dXJuIHRydWU7XG4gIH1cbiAgZS5jb3VudCArPSAxO1xuICByZXR1cm4gZS5jb3VudCA8PSBNQVhfUEVSX01JTjtcbn1cblxuZnVuY3Rpb24gY29udGFpbnNCYWRXb3JkKHRleHQpIHtcbiAgY29uc3QgbG93ZXIgPSAodGV4dCB8fCAnJykudG9Mb3dlckNhc2UoKTtcbiAgcmV0dXJuIEJBRF9XT1JEUy5zb21lKHcgPT4gbG93ZXIuaW5jbHVkZXModykpO1xufVxuXG5mdW5jdGlvbiB0aHJlYWRJZE9mKGEsIGIpIHtcbiAgcmV0dXJuIFthLCBiXS5zb3J0KCkuam9pbignfCcpO1xufVxuXG4vLyBDYWxsIE9wZW5BSSBtb2RlcmF0aW9uLiBSZXR1cm5zIHsgZmxhZ2dlZDogYm9vbCwgY2F0ZWdvcmllcz86IFtdIH1cbi8vIEZhaWxzIGNsb3NlZCBcdTIwMTQgaWYgdGhlIEFQSSBlcnJvcnMsIHRyZWF0IGFzIGZsYWdnZWQgc28gd2UgZG9uJ3QgbGVhayBhYnVzZS5cbmFzeW5jIGZ1bmN0aW9uIG1vZGVyYXRlKHRleHQpIHtcbiAgY29uc3Qga2V5ID0gcHJvY2Vzcy5lbnYuT1BFTkFJX0FQSV9LRVk7XG4gIC8vIE5vIEFQSSBrZXkgc2V0IFx1MjAxNCBmYWxsIGJhY2sgdG8gYmFkLXdvcmQgY2hlY2suIERvbid0IGJsb2NrIHRoZSB3aG9sZVxuICAvLyBtZXNzYWdpbmcgZmVhdHVyZSBpbiBkZXYgZW52aXJvbm1lbnRzIHdpdGhvdXQgT3BlbkFJIGNvbmZpZ3VyZWQuXG4gIGlmICgha2V5KSByZXR1cm4geyBmbGFnZ2VkOiBjb250YWluc0JhZFdvcmQodGV4dCksIHNvdXJjZTogJ3dvcmRsaXN0JyB9O1xuXG4gIHRyeSB7XG4gICAgY29uc3QgciA9IGF3YWl0IGZldGNoKCdodHRwczovL2FwaS5vcGVuYWkuY29tL3YxL21vZGVyYXRpb25zJywge1xuICAgICAgbWV0aG9kOiAnUE9TVCcsXG4gICAgICBoZWFkZXJzOiB7ICdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicsIEF1dGhvcml6YXRpb246ICdCZWFyZXIgJyArIGtleSB9LFxuICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoeyBtb2RlbDogJ3RleHQtbW9kZXJhdGlvbi1sYXRlc3QnLCBpbnB1dDogdGV4dC5zbGljZSgwLCA0MDAwKSB9KSxcbiAgICB9KTtcbiAgICBpZiAoIXIub2spIHJldHVybiB7IGZsYWdnZWQ6IHRydWUsIHNvdXJjZTogJ2FwaV9lcnJvcicsIGVycjogci5zdGF0dXMgfTtcbiAgICBjb25zdCBkYXRhID0gYXdhaXQgci5qc29uKCk7XG4gICAgY29uc3QgcmVzdWx0ID0gZGF0YS5yZXN1bHRzICYmIGRhdGEucmVzdWx0c1swXTtcbiAgICBpZiAoIXJlc3VsdCkgcmV0dXJuIHsgZmxhZ2dlZDogdHJ1ZSwgc291cmNlOiAnZW1wdHlfcmVzcG9uc2UnIH07XG4gICAgY29uc3QgZmxhZ2dlZENhdHMgPSBPYmplY3QuZW50cmllcyhyZXN1bHQuY2F0ZWdvcmllcyB8fCB7fSlcbiAgICAgIC5maWx0ZXIoKFssIHZdKSA9PiB2KVxuICAgICAgLm1hcCgoW2tdKSA9PiBrKTtcbiAgICByZXR1cm4ge1xuICAgICAgZmxhZ2dlZDogISFyZXN1bHQuZmxhZ2dlZCB8fCBjb250YWluc0JhZFdvcmQodGV4dCksXG4gICAgICBjYXRlZ29yaWVzOiBmbGFnZ2VkQ2F0cyxcbiAgICAgIHNvdXJjZTogcmVzdWx0LmZsYWdnZWQgPyAnb3BlbmFpJyA6IChjb250YWluc0JhZFdvcmQodGV4dCkgPyAnd29yZGxpc3QnIDogJ2NsZWFuJyksXG4gICAgfTtcbiAgfSBjYXRjaCB7XG4gICAgcmV0dXJuIHsgZmxhZ2dlZDogY29udGFpbnNCYWRXb3JkKHRleHQpLCBzb3VyY2U6ICd3b3JkbGlzdF9mYWxsYmFjaycgfTtcbiAgfVxufVxuXG5leHBvcnQgZGVmYXVsdCBhc3luYyAocmVxdWVzdCkgPT4ge1xuICBpZiAocmVxdWVzdC5tZXRob2QgPT09ICdPUFRJT05TJykgcmV0dXJuIGNvcnNSZXNwb25zZShyZXF1ZXN0KTtcblxuICBjb25zdCB0b2tlbiA9IGV4dHJhY3RCZWFyZXJUb2tlbihyZXF1ZXN0KTtcbiAgaWYgKCF0b2tlbikgcmV0dXJuIGVycm9yUmVzcG9uc2UoJ1NpZ24gaW4gdG8gbWVzc2FnZSB0ZWFtcycsIDQwMSwgcmVxdWVzdCk7XG5cbiAgbGV0IGRlY29kZWQ7XG4gIHRyeSB7IGRlY29kZWQgPSBhd2FpdCB2ZXJpZnlJZFRva2VuKHRva2VuKTsgfVxuICBjYXRjaCB7IHJldHVybiBlcnJvclJlc3BvbnNlKCdBdXRoZW50aWNhdGlvbiBmYWlsZWQuIFBsZWFzZSBzaWduIGluIGFnYWluLicsIDQwMSwgcmVxdWVzdCk7IH1cblxuICBjb25zdCBjYWxsZXJVaWQgPSBkZWNvZGVkLnN1YjtcbiAgY29uc3QgbXlUZWFtID0gYXdhaXQgZ2V0VXNlclRlYW0oY2FsbGVyVWlkKTtcbiAgaWYgKCFteVRlYW0pIHJldHVybiBlcnJvclJlc3BvbnNlKCdZb3UgbmVlZCBhIHRlYW0gdG8gbWVzc2FnZSBvdGhlciB0ZWFtcy4nLCA0MDQsIHJlcXVlc3QpO1xuXG4gIGNvbnN0IGRiID0gZ2V0RGIoKTtcblxuICAvLyBcdTI1MDBcdTI1MDAgR0VUOiBsaXN0IGEgdGhyZWFkJ3MgbWVzc2FnZXMgXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXG4gIGlmIChyZXF1ZXN0Lm1ldGhvZCA9PT0gJ0dFVCcpIHtcbiAgICBjb25zdCB1cmwgPSBuZXcgVVJMKHJlcXVlc3QudXJsKTtcbiAgICBjb25zdCB3aXRoVGVhbSA9IHVybC5zZWFyY2hQYXJhbXMuZ2V0KCd3aXRoJyk7XG4gICAgaWYgKCF3aXRoVGVhbSkgcmV0dXJuIGVycm9yUmVzcG9uc2UoJ01pc3NpbmcgP3dpdGg9PHRlYW1JZD4nLCA0MDAsIHJlcXVlc3QpO1xuXG4gICAgY29uc3QgdGhyZWFkSWQgPSB0aHJlYWRJZE9mKG15VGVhbS50ZWFtLmlkLCB3aXRoVGVhbSk7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IHNuYXAgPSBhd2FpdCBkYi5jb2xsZWN0aW9uKCd0ZWFtX21lc3NhZ2VzJylcbiAgICAgICAgLndoZXJlKCd0aHJlYWRJZCcsICc9PScsIHRocmVhZElkKVxuICAgICAgICAub3JkZXJCeSgnY3JlYXRlZEF0JywgJ2FzYycpXG4gICAgICAgIC5saW1pdCgyMDApXG4gICAgICAgIC5nZXQoKTtcbiAgICAgIGNvbnN0IG1lc3NhZ2VzID0gc25hcC5kb2NzLm1hcChkID0+IHtcbiAgICAgICAgY29uc3QgZGF0YSA9IGQuZGF0YSgpO1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgIGlkOiBkLmlkLFxuICAgICAgICAgIGZyb21UZWFtSWQ6IGRhdGEuZnJvbVRlYW1JZCxcbiAgICAgICAgICBmcm9tVWlkOiBkYXRhLmZyb21VaWQsXG4gICAgICAgICAgZnJvbU5hbWU6IGRhdGEuZnJvbU5hbWUsXG4gICAgICAgICAgdGV4dDogZGF0YS50ZXh0LFxuICAgICAgICAgIGNyZWF0ZWRBdDogZGF0YS5jcmVhdGVkQXQ/LnRvRGF0ZT8uKCk/LnRvSVNPU3RyaW5nKCkgfHwgbnVsbCxcbiAgICAgICAgfTtcbiAgICAgIH0pO1xuICAgICAgcmV0dXJuIGpzb25SZXNwb25zZSh7IG1lc3NhZ2VzLCB0aHJlYWRJZCB9LCAyMDAsIHJlcXVlc3QpO1xuICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgY29uc29sZS5lcnJvcigndGVhbS1tZXNzYWdlcyBHRVQgZXJyb3I6JywgZXJyLm1lc3NhZ2UpO1xuICAgICAgcmV0dXJuIGVycm9yUmVzcG9uc2UoJ0NvdWxkIG5vdCBsb2FkIG1lc3NhZ2VzJywgNTAwLCByZXF1ZXN0KTtcbiAgICB9XG4gIH1cblxuICAvLyBcdTI1MDBcdTI1MDAgUE9TVDogc2VuZCBhIG5ldyBtZXNzYWdlIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFxuICBpZiAocmVxdWVzdC5tZXRob2QgIT09ICdQT1NUJykgcmV0dXJuIGVycm9yUmVzcG9uc2UoJ01ldGhvZCBub3QgYWxsb3dlZCcsIDQwNSwgcmVxdWVzdCk7XG5cbiAgaWYgKCFyYXRlTGltaXQobXlUZWFtLnRlYW0uaWQpKSB7XG4gICAgcmV0dXJuIGVycm9yUmVzcG9uc2UoJ1Nsb3cgZG93biBcdTIwMTQgdG9vIG1hbnkgbWVzc2FnZXMgaW4gYSBzaG9ydCB3aW5kb3cuJywgNDI5LCByZXF1ZXN0KTtcbiAgfVxuXG4gIGxldCBib2R5O1xuICB0cnkgeyBib2R5ID0gYXdhaXQgcmVxdWVzdC5qc29uKCk7IH0gY2F0Y2ggeyByZXR1cm4gZXJyb3JSZXNwb25zZSgnSW52YWxpZCBKU09OJywgNDAwLCByZXF1ZXN0KTsgfVxuXG4gIGNvbnN0IHRvVGVhbUlkID0gKGJvZHkudG9UZWFtSWQgfHwgJycpLnRyaW0oKTtcbiAgY29uc3QgdGV4dCA9IChib2R5LnRleHQgfHwgJycpLnRyaW0oKTtcbiAgaWYgKCF0b1RlYW1JZCkgcmV0dXJuIGVycm9yUmVzcG9uc2UoJ01pc3NpbmcgdG9UZWFtSWQnLCA0MDAsIHJlcXVlc3QpO1xuICBpZiAoIXRleHQpIHJldHVybiBlcnJvclJlc3BvbnNlKCdNZXNzYWdlIGNhbm5vdCBiZSBlbXB0eScsIDQwMCwgcmVxdWVzdCk7XG4gIGlmICh0ZXh0Lmxlbmd0aCA+IE1BWF9MRU4pIHJldHVybiBlcnJvclJlc3BvbnNlKCdNZXNzYWdlIHRvbyBsb25nICgnICsgTUFYX0xFTiArICcgY2hhcnMgbWF4KScsIDQwMCwgcmVxdWVzdCk7XG4gIGlmICh0b1RlYW1JZCA9PT0gbXlUZWFtLnRlYW0uaWQpIHJldHVybiBlcnJvclJlc3BvbnNlKCdDYW5ub3QgbWVzc2FnZSB5b3VyIG93biB0ZWFtJywgNDAwLCByZXF1ZXN0KTtcblxuICAvLyBNb2RlcmF0aW9uIFx1MjAxNCBydW5zIGJlZm9yZSBhbnkgd3JpdGUgc28gZmxhZ2dlZCBjb250ZW50IG5ldmVyIHRvdWNoZXNcbiAgLy8gRmlyZXN0b3JlLiBJZiB0aGUgbW9kZXJhdGlvbiBzZXJ2aWNlIGlzIGRvd24sIHdlIGZhaWwgY2xvc2VkLlxuICBjb25zdCBtb2RSZXN1bHQgPSBhd2FpdCBtb2RlcmF0ZSh0ZXh0KTtcbiAgaWYgKG1vZFJlc3VsdC5mbGFnZ2VkKSB7XG4gICAgY29uc29sZS53YXJuKCdbdGVhbS1tZXNzYWdlc10gYmxvY2tlZCBmbGFnZ2VkIG1lc3NhZ2UgZnJvbScsIGNhbGxlclVpZCwgJ2NhdGVnb3JpZXM6JywgbW9kUmVzdWx0LmNhdGVnb3JpZXMpO1xuICAgIHJldHVybiBlcnJvclJlc3BvbnNlKFxuICAgICAgJ01lc3NhZ2UgYmxvY2tlZDogb3VyIG1vZGVyYXRpb24gc3lzdGVtIGZsYWdnZWQgdGhpcyBhcyBwb3RlbnRpYWxseSAnICtcbiAgICAgICdvZmZlbnNpdmUgb3IgYWJ1c2l2ZS4gUmVwaHJhc2UgYW5kIHRyeSBhZ2Fpbi4nLFxuICAgICAgNDIyLFxuICAgICAgcmVxdWVzdCxcbiAgICApO1xuICB9XG5cbiAgLy8gVmVyaWZ5IHRoZSBkZXN0aW5hdGlvbiB0ZWFtIGV4aXN0cyAoYmFzaWMgaW50ZWdyaXR5IGNoZWNrKS5cbiAgY29uc3QgdG9UZWFtRG9jID0gYXdhaXQgZGIuY29sbGVjdGlvbigndGVhbXMnKS5kb2ModG9UZWFtSWQpLmdldCgpO1xuICBpZiAoIXRvVGVhbURvYy5leGlzdHMpIHJldHVybiBlcnJvclJlc3BvbnNlKCdUZWFtIG5vdCBmb3VuZCcsIDQwNCwgcmVxdWVzdCk7XG5cbiAgY29uc3QgdGhyZWFkSWQgPSB0aHJlYWRJZE9mKG15VGVhbS50ZWFtLmlkLCB0b1RlYW1JZCk7XG4gIHRyeSB7XG4gICAgY29uc3QgZnJvbU5hbWUgPSAoZGVjb2RlZC5uYW1lIHx8IGRlY29kZWQuZW1haWwgfHwgJ0Fub255bW91cycpLnNsaWNlKDAsIDgwKTtcbiAgICBjb25zdCByZWYgPSBhd2FpdCBkYi5jb2xsZWN0aW9uKCd0ZWFtX21lc3NhZ2VzJykuYWRkKHtcbiAgICAgIHRocmVhZElkLFxuICAgICAgZnJvbVRlYW1JZDogbXlUZWFtLnRlYW0uaWQsXG4gICAgICB0b1RlYW1JZCxcbiAgICAgIGZyb21VaWQ6IGNhbGxlclVpZCxcbiAgICAgIGZyb21OYW1lLFxuICAgICAgdGV4dDogdGV4dC5zbGljZSgwLCBNQVhfTEVOKSxcbiAgICAgIG1vZGVyYXRpb25Tb3VyY2U6IG1vZFJlc3VsdC5zb3VyY2UgfHwgJ3Vua25vd24nLFxuICAgICAgY3JlYXRlZEF0OiBGaWVsZFZhbHVlLnNlcnZlclRpbWVzdGFtcCgpLFxuICAgIH0pO1xuXG4gICAgLy8gRGVub3JtYWxpemUgdGhlIGxhc3QgbWVzc2FnZSBvbnRvIGEgdGhyZWFkLXN1bW1hcnkgZG9jIHNvIHRoZSBpbmJveFxuICAgIC8vIHZpZXcgY2FuIGxpc3QgdGhyZWFkcyB3aXRob3V0IHNjYW5uaW5nIGV2ZXJ5IG1lc3NhZ2UuIFVwc2VydCBieVxuICAgIC8vIHRocmVhZElkIHNvIGJvdGggdGVhbXMgc2VlIHRoZSBzYW1lIHByZXZpZXcuXG4gICAgYXdhaXQgZGIuY29sbGVjdGlvbigndGVhbV90aHJlYWRzJykuZG9jKHRocmVhZElkKS5zZXQoe1xuICAgICAgdGhyZWFkSWQsXG4gICAgICBwYXJ0aWNpcGFudFRlYW1JZHM6IHRocmVhZElkLnNwbGl0KCd8JyksXG4gICAgICBsYXN0TWVzc2FnZTogdGV4dC5zbGljZSgwLCAxNDApLFxuICAgICAgbGFzdE1lc3NhZ2VBdDogRmllbGRWYWx1ZS5zZXJ2ZXJUaW1lc3RhbXAoKSxcbiAgICAgIGxhc3RGcm9tVGVhbUlkOiBteVRlYW0udGVhbS5pZCxcbiAgICB9LCB7IG1lcmdlOiB0cnVlIH0pO1xuXG4gICAgcmV0dXJuIGpzb25SZXNwb25zZSh7IG9rOiB0cnVlLCBpZDogcmVmLmlkLCB0aHJlYWRJZCB9LCAyMDAsIHJlcXVlc3QpO1xuICB9IGNhdGNoIChlcnIpIHtcbiAgICBjb25zb2xlLmVycm9yKCd0ZWFtLW1lc3NhZ2VzIFBPU1QgZXJyb3I6JywgZXJyLm1lc3NhZ2UpO1xuICAgIHJldHVybiBlcnJvclJlc3BvbnNlKCdDb3VsZCBub3Qgc2VuZCBtZXNzYWdlJywgNTAwLCByZXF1ZXN0KTtcbiAgfVxufTtcblxuZXhwb3J0IGNvbnN0IGNvbmZpZyA9IHtcbiAgcGF0aDogJy9hcGkvdGVhbXMvbWVzc2FnZXMnLFxufTtcbiIsICJjb25zdCBQUk9EVUNUSU9OX09SSUdJTlMgPSBbXG4gICdodHRwczovL2RlYmF0ZW9zMS5uZXRsaWZ5LmFwcCcsXG4gICdodHRwczovL2Rldmlsc2Fkdm9jYXRlMS5uZXRsaWZ5LmFwcCcsXG4gICdodHRwczovL2RlYmF0ZW9zLmNvbScsXG4gICdodHRwczovL3d3dy5kZWJhdGVvcy5jb20nLFxuICAnaHR0cHM6Ly9kZWJhdGV0aGVkZXZpbC5jb20nLFxuICAnaHR0cHM6Ly93d3cuZGViYXRldGhlZGV2aWwuY29tJyxcbl07XG5cbmNvbnN0IERFVl9PUklHSU5TID0gW1xuICAnaHR0cDovL2xvY2FsaG9zdDo4ODg4JyxcbiAgJ2h0dHA6Ly9sb2NhbGhvc3Q6MzAwMCcsXG5dO1xuXG4vLyBPbmx5IGFsbG93IGxvY2FsaG9zdCBvcmlnaW5zIG91dHNpZGUgcHJvZHVjdGlvblxuY29uc3QgaXNQcm9kdWN0aW9uID0gcHJvY2Vzcy5lbnYuQ09OVEVYVCA9PT0gJ3Byb2R1Y3Rpb24nO1xuY29uc3QgQUxMT1dFRF9PUklHSU5TID0gaXNQcm9kdWN0aW9uXG4gID8gUFJPRFVDVElPTl9PUklHSU5TXG4gIDogWy4uLlBST0RVQ1RJT05fT1JJR0lOUywgLi4uREVWX09SSUdJTlNdO1xuXG4vLyBEZWZhdWx0IG9yaWdpbiBmb3IgcHJlZmxpZ2h0IC8gd2hlbiByZXF1ZXN0IGlzIG5vdCBhdmFpbGFibGVcbmNvbnN0IERFRkFVTFRfT1JJR0lOID0gQUxMT1dFRF9PUklHSU5TWzBdO1xuXG5mdW5jdGlvbiBnZXRPcmlnaW4ocmVxdWVzdCkge1xuICBpZiAoIXJlcXVlc3QpIHJldHVybiBERUZBVUxUX09SSUdJTjtcbiAgY29uc3Qgb3JpZ2luID0gcmVxdWVzdD8uaGVhZGVycz8uZ2V0Py4oJ29yaWdpbicpIHx8ICcnO1xuICByZXR1cm4gQUxMT1dFRF9PUklHSU5TLmluY2x1ZGVzKG9yaWdpbikgPyBvcmlnaW4gOiBERUZBVUxUX09SSUdJTjtcbn1cblxuZnVuY3Rpb24gY29yc0hlYWRlcnMocmVxdWVzdCkge1xuICByZXR1cm4ge1xuICAgICdBY2Nlc3MtQ29udHJvbC1BbGxvdy1PcmlnaW4nOiBnZXRPcmlnaW4ocmVxdWVzdCksXG4gICAgJ0FjY2Vzcy1Db250cm9sLUFsbG93LU1ldGhvZHMnOiAnR0VULCBQT1NULCBERUxFVEUsIE9QVElPTlMnLFxuICAgICdBY2Nlc3MtQ29udHJvbC1BbGxvdy1IZWFkZXJzJzogJ0NvbnRlbnQtVHlwZSwgQXV0aG9yaXphdGlvbicsXG4gIH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjb3JzUmVzcG9uc2UocmVxdWVzdCkge1xuICByZXR1cm4gbmV3IFJlc3BvbnNlKG51bGwsIHsgc3RhdHVzOiAyMDQsIGhlYWRlcnM6IGNvcnNIZWFkZXJzKHJlcXVlc3QpIH0pO1xufVxuXG5leHBvcnQgZnVuY3Rpb24ganNvblJlc3BvbnNlKGRhdGEsIHN0YXR1cyA9IDIwMCwgcmVxdWVzdCkge1xuICByZXR1cm4gbmV3IFJlc3BvbnNlKEpTT04uc3RyaW5naWZ5KGRhdGEpLCB7XG4gICAgc3RhdHVzLFxuICAgIGhlYWRlcnM6IHsgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJywgLi4uY29yc0hlYWRlcnMocmVxdWVzdCkgfSxcbiAgfSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBlcnJvclJlc3BvbnNlKG1lc3NhZ2UsIHN0YXR1cyA9IDQwMCwgcmVxdWVzdCkge1xuICByZXR1cm4ganNvblJlc3BvbnNlKHsgZXJyb3I6IG1lc3NhZ2UgfSwgc3RhdHVzLCByZXF1ZXN0KTtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7Ozs7O0FBQUEsU0FBUyxXQUFXLGtCQUFrQjtBQUkvQixTQUFTLFFBQVE7QUFDdEIsTUFBSSxHQUFJLFFBQU87QUFFZixRQUFNLGlCQUFpQixRQUFRLElBQUk7QUFDbkMsTUFBSSxDQUFDLGVBQWdCLE9BQU0sSUFBSSxNQUFNLHVDQUF1QztBQUU1RSxNQUFJO0FBQ0osTUFBSTtBQUNGLFlBQVEsS0FBSyxNQUFNLGNBQWM7QUFBQSxFQUNuQyxTQUFTLEdBQUc7QUFDVixZQUFRLE1BQU0sNkRBQTZELGVBQWUsTUFBTSxHQUFHLEVBQUUsR0FBRyxzQkFBc0IsZUFBZSxNQUFNLEdBQUcsQ0FBQztBQUN2SixVQUFNLElBQUksTUFBTSw2RUFBNkU7QUFBQSxFQUMvRjtBQUVBLE1BQUksQ0FBQyxNQUFNLGNBQWMsQ0FBQyxNQUFNLGdCQUFnQixDQUFDLE1BQU0sYUFBYTtBQUNsRSxZQUFRLE1BQU0sc0RBQXNELE9BQU8sS0FBSyxLQUFLLEVBQUUsS0FBSyxJQUFJLENBQUM7QUFDakcsVUFBTSxJQUFJLE1BQU0sK0ZBQStGO0FBQUEsRUFDakg7QUFFQSxPQUFLLElBQUksVUFBVTtBQUFBLElBQ2pCLFdBQVcsTUFBTTtBQUFBLElBQ2pCLGFBQWE7QUFBQSxNQUNYLGNBQWMsTUFBTTtBQUFBLE1BQ3BCLGFBQWEsTUFBTTtBQUFBLElBQ3JCO0FBQUEsRUFDRixDQUFDO0FBQ0QsU0FBTztBQUNUO0FBZUEsZUFBc0IsWUFBWSxL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S0FBSyxHQUFJLFFBQU8sY0FBYyxnQ0FBZ0MsS0FBSyxPQUFPO0FBSWxHLFFBQU0sWUFBWSxNQUFNLFNBQVMsSUFBSTtBQUNyQyxNQUFJLFVBQVUsU0FBUztBQUNyQixZQUFRLEtBQUssZ0RBQWdELFdBQVcsZUFBZSxVQUFVLFVBQVU7QUFDM0csV0FBTztBQUFBLE1BQ0w7QUFBQSxNQUVBO0FBQUEsTUFDQTtBQUFBLElBQ0Y7QUFBQSxFQUNGO0FBR0EsUUFBTSxZQUFZLE1BQU1ELElBQUcsV0FBVyxPQUFPLEVBQUUsSUFBSSxRQUFRLEVBQUUsSUFBSTtBQUNqRSxNQUFJLENBQUMsVUFBVSxPQUFRLFFBQU8sY0FBYyxrQkFBa0IsS0FBSyxPQUFPO0FBRTFFLFFBQU0sV0FBVyxXQUFXLE9BQU8sS0FBSyxJQUFJLFFBQVE7QUFDcEQsTUFBSTtBQUNGLFVBQU0sWUFBWSxRQUFRLFFBQVEsUUFBUSxTQUFTLGFBQWEsTUFBTSxHQUFHLEVBQUU7QUFDM0UsVUFBTSxNQUFNLE1BQU1BLElBQUcsV0FBVyxlQUFlLEVBQUUsSUFBSTtBQUFBLE1BQ25EO0FBQUEsTUFDQSxZQUFZLE9BQU8sS0FBSztBQUFBLE1BQ3hCO0FBQUEsTUFDQSxTQUFTO0FBQUEsTUFDVDtBQUFBLE1BQ0EsTUFBTSxLQUFLLE1BQU0sR0FBRyxPQUFPO0FBQUEsTUFDM0Isa0JBQWtCLFVBQVUsVUFBVTtBQUFBLE1BQ3RDLFdBQVcsV0FBVyxnQkFBZ0I7QUFBQSxJQUN4QyxDQUFDO0FBS0QsVUFBTUEsSUFBRyxXQUFXLGNBQWMsRUFBRSxJQUFJLFFBQVEsRUFBRSxJQUFJO0FBQUEsTUFDcEQ7QUFBQSxNQUNBLG9CQUFvQixTQUFTLE1BQU0sR0FBRztBQUFBLE1BQ3RDLGFBQWEsS0FBSyxNQUFNLEdBQUcsR0FBRztBQUFBLE1BQzlCLGVBQWUsV0FBVyxnQkFBZ0I7QUFBQSxNQUMxQyxnQkFBZ0IsT0FBTyxLQUFLO0FBQUEsSUFDOUIsR0FBRyxFQUFFLE9BQU8sS0FBSyxDQUFDO0FBRWxCLFdBQU8sYUFBYSxFQUFFLElBQUksTUFBTSxJQUFJLElBQUksSUFBSSxTQUFTLEdBQUcsS0FBSyxPQUFPO0FBQUEsRUFDdEUsU0FBUyxLQUFLO0FBQ1osWUFBUSxNQUFNLDZCQUE2QixJQUFJLE9BQU87QUFDdEQsV0FBTyxjQUFjLDBCQUEwQixLQUFLLE9BQU87QUFBQSxFQUM3RDtBQUNGO0FBRU8sSUFBTSxTQUFTO0FBQUEsRUFDcEIsTUFBTTtBQUNSOyIsCiAgIm5hbWVzIjogWyJkYiIsICJkYiIsICJ0aHJlYWRJZCJdCn0K
