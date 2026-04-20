
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

// ../../../netlify/functions/admin-analytics.mjs
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

// ../../../netlify/functions/admin-analytics.mjs
var ADMIN_UID = process.env.ADMIN_UID || "REPLACE_WITH_YOUR_FIREBASE_UID";
var admin_analytics_default = async (request) => {
  if (request.method === "OPTIONS") return corsResponse(request);
  if (request.method !== "GET") return errorResponse("Method not allowed", 405, request);
  const token = extractBearerToken(request);
  if (!token) return errorResponse("Authorization required", 401, request);
  let decoded;
  try {
    decoded = await verifyIdToken(token);
  } catch (err) {
    console.error("admin-analytics auth error:", err.message);
    return errorResponse("Authentication failed. Please sign in again.", 401, request);
  }
  const uid = decoded.sub;
  const db2 = getDb();
  let isAdmin = uid === ADMIN_UID;
  if (!isAdmin) {
    try {
      const profileDoc = await db2.collection("user_profiles").doc(uid).get();
      if (profileDoc.exists && profileDoc.data().isAdmin === true) {
        isAdmin = true;
      }
    } catch (err) {
      console.error("admin-analytics profile check error:", err.message);
    }
  }
  if (!isAdmin) return errorResponse("Forbidden: admin access required", 403, request);
  try {
    const [
      usersSnap,
      casesSnap,
      sharedCasesSnap,
      forumPostsSnap,
      debatesSnap,
      teamsSnap,
      referralsSnap,
      eventsSnap,
      feedbackSnap
    ] = await Promise.all([
      db2.collection("user_profiles").count().get(),
      db2.collection("user_cases").count().get(),
      db2.collection("shared_cases").count().get(),
      db2.collection("forum_posts").count().get(),
      db2.collection("live_debates").count().get(),
      db2.collection("teams").get(),
      db2.collection("referral_credits").count().get(),
      db2.collection("events").count().get(),
      db2.collection("feedback").count().get().catch(() => ({ data: () => ({ count: 0 }) }))
    ]);
    const totalUsers = usersSnap.data().count;
    const totalCases = casesSnap.data().count;
    const totalSharedCases = sharedCasesSnap.data().count;
    const totalForumPosts = forumPostsSnap.data().count;
    const totalDebates = debatesSnap.data().count;
    const totalReferrals = referralsSnap.data().count;
    const totalEvents = eventsSnap.data().count;
    const totalFeedback = feedbackSnap.data().count;
    const teamDocs = teamsSnap.docs.map((d) => d.data());
    const totalTeams = teamDocs.length;
    const activeTeams = teamDocs.filter((t) => (t.usageThisPeriod || 0) > 0).length;
    const paidTeams = teamDocs.filter((t) => t.plan && t.plan !== "trial").length;
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1e3);
    let recentSignups = 0;
    try {
      const recentSnap = await db2.collection("user_profiles").where("createdAt", ">=", sevenDaysAgo).count().get();
      recentSignups = recentSnap.data().count;
    } catch (err) {
      console.warn("Could not count recent signups:", err.message);
    }
    const now = /* @__PURE__ */ new Date();
    const countQ = (col, start, end) => db2.collection(col).where("createdAt", ">=", start).where("createdAt", "<", end).count().get().then((s) => s.data().count).catch(() => 0);
    const dailyPromises = [];
    for (let d = 0; d < 30; d++) {
      const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - d);
      const dayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() - d + 1);
      const label = dayStart.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      dailyPromises.push(
        Promise.all([countQ("events", dayStart, dayEnd), countQ("user_profiles", dayStart, dayEnd)]).then(([events, newUsers]) => ({ date: label, dateISO: dayStart.toISOString().slice(0, 10), events, newUsers }))
      );
    }
    const daily = await Promise.all(dailyPromises);
    const weeklyPromises = [];
    for (let w = 0; w < 26; w++) {
      const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (w + 1) * 7);
      const weekEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() - w * 7);
      const label = "W" + (26 - w) + " " + weekStart.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      weeklyPromises.push(
        Promise.all([countQ("events", weekStart, weekEnd), countQ("user_profiles", weekStart, weekEnd), countQ("teams", weekStart, weekEnd)]).then(([events, newUsers, newTeams]) => ({ week: label, weekStart: weekStart.toISOString().slice(0, 10), events, newUsers, newTeams }))
      );
    }
    const weekly = await Promise.all(weeklyPromises);
    const monthlyPromises = [];
    for (let m = 0; m < 24; m++) {
      const monthStart = new Date(now.getFullYear(), now.getMonth() - m, 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() - m + 1, 1);
      const label = monthStart.toLocaleString("en-US", { month: "short", year: "numeric" });
      monthlyPromises.push(
        Promise.all([countQ("events", monthStart, monthEnd), countQ("user_profiles", monthStart, monthEnd), countQ("teams", monthStart, monthEnd)]).then(([events, newUsers, newTeams]) => ({ month: label, monthStart: monthStart.toISOString().slice(0, 10), events, newUsers, newTeams }))
      );
    }
    const monthly = await Promise.all(monthlyPromises);
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1e3);
    let eventBreakdown = {};
    try {
      const recentEvents = await db2.collection("events").where("createdAt", ">=", thirtyDaysAgo).limit(5e3).get();
      recentEvents.docs.forEach((doc) => {
        const ev = doc.data().event || "unknown";
        eventBreakdown[ev] = (eventBreakdown[ev] || 0) + 1;
      });
    } catch (err) {
      console.warn("Could not aggregate events:", err.message);
    }
    let topFeatures = [];
    try {
      const countersSnap = await db2.collection("learning_counters").limit(100).get();
      const featureTotals = {};
      const SKIP_KEYS = /* @__PURE__ */ new Set(["count", "createdAt", "updatedAt", "uid", "timestamp", "lastUpdated", "version", "ts", "id"]);
      countersSnap.docs.forEach((doc) => {
        const data = doc.data();
        for (const [key, val] of Object.entries(data)) {
          if (typeof val === "number" && !SKIP_KEYS.has(key)) {
            featureTotals[key] = (featureTotals[key] || 0) + val;
          }
        }
      });
      topFeatures = Object.entries(featureTotals).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([feature, count]) => ({ feature, count }));
    } catch (err) {
      console.warn("Could not aggregate learning_counters:", err.message);
    }
    let recentFeedback = [];
    const mapFb = (d) => {
      const data = d.data();
      return {
        category: data.category,
        description: (data.description || "").slice(0, 200),
        currentTab: data.currentTab,
        email: data.email,
        createdAt: data.createdAt?.toDate?.()?.toISOString() || null
      };
    };
    try {
      const fbSnap = await db2.collection("feedback").orderBy("createdAt", "desc").limit(5).get();
      recentFeedback = fbSnap.docs.map(mapFb);
    } catch (err) {
      console.warn("Could not fetch ordered feedback:", err.message);
    }
    if (recentFeedback.length === 0) {
      try {
        const fbSnap = await db2.collection("feedback").limit(10).get();
        recentFeedback = fbSnap.docs.map(mapFb);
      } catch (err) {
        console.warn("Could not fetch fallback feedback:", err.message);
      }
    }
    return jsonResponse({
      // Totals
      totalUsers,
      totalCases,
      totalSharedCases,
      totalForumPosts,
      totalDebates,
      totalTeams,
      activeTeams,
      paidTeams,
      totalReferrals,
      totalEvents,
      totalFeedback,
      recentSignups,
      // Time-series (newest first)
      daily: daily.reverse(),
      weekly: weekly.reverse(),
      monthly: monthly.reverse(),
      // Event breakdown (last 30 days)
      eventBreakdown,
      // Top features
      topFeatures,
      // Recent feedback
      recentFeedback,
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    }, 200, request);
  } catch (err) {
    console.error("admin-analytics error:", err);
    return errorResponse("Something went wrong. Please try again.", 500, request);
  }
};
var config = {
  path: "/api/admin/analytics"
};
export {
  config,
  admin_analytics_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vLi4vLi4vbmV0bGlmeS9mdW5jdGlvbnMvbGliL2ZpcmVzdG9yZS5tanMiLCAiLi4vLi4vLi4vbmV0bGlmeS9mdW5jdGlvbnMvbGliL2F1dGgubWpzIiwgIi4uLy4uLy4uL25ldGxpZnkvZnVuY3Rpb25zL2FkbWluLWFuYWx5dGljcy5tanMiLCAiLi4vLi4vLi4vbmV0bGlmeS9mdW5jdGlvbnMvbGliL3Jlc3BvbnNlLm1qcyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiaW1wb3J0IHsgRmlyZXN0b3JlLCBGaWVsZFZhbHVlIH0gZnJvbSAnQGdvb2dsZS1jbG91ZC9maXJlc3RvcmUnO1xuXG5sZXQgZGIgPSBudWxsO1xuXG5leHBvcnQgZnVuY3Rpb24gZ2V0RGIoKSB7XG4gIGlmIChkYikgcmV0dXJuIGRiO1xuXG4gIGNvbnN0IHNlcnZpY2VBY2NvdW50ID0gcHJvY2Vzcy5lbnYuR09PR0xFX1NFUlZJQ0VfQUNDT1VOVDtcbiAgaWYgKCFzZXJ2aWNlQWNjb3VudCkgdGhyb3cgbmV3IEVycm9yKCdHT09HTEVfU0VSVklDRV9BQ0NPVU5UIG5vdCBjb25maWd1cmVkJyk7XG5cbiAgbGV0IGNyZWRzO1xuICB0cnkge1xuICAgIGNyZWRzID0gSlNPTi5wYXJzZShzZXJ2aWNlQWNjb3VudCk7XG4gIH0gY2F0Y2ggKGUpIHtcbiAgICBjb25zb2xlLmVycm9yKCdHT09HTEVfU0VSVklDRV9BQ0NPVU5UIEpTT04gcGFyc2UgZmFpbGVkLiBGaXJzdCA1MCBjaGFyczonLCBzZXJ2aWNlQWNjb3VudC5zbGljZSgwLCA1MCksICcuLi4gTGFzdCA1MCBjaGFyczonLCBzZXJ2aWNlQWNjb3VudC5zbGljZSgtNTApKTtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ0dPT0dMRV9TRVJWSUNFX0FDQ09VTlQgaXMgbm90IHZhbGlkIEpTT04uIFJlLXBhc3RlIHRoZSBzZXJ2aWNlIGFjY291bnQga2V5LicpO1xuICB9XG5cbiAgaWYgKCFjcmVkcy5wcm9qZWN0X2lkIHx8ICFjcmVkcy5jbGllbnRfZW1haWwgfHwgIWNyZWRzLnByaXZhdGVfa2V5KSB7XG4gICAgY29uc29sZS5lcnJvcignR09PR0xFX1NFUlZJQ0VfQUNDT1VOVCBtaXNzaW5nIGZpZWxkcy4gS2V5cyBmb3VuZDonLCBPYmplY3Qua2V5cyhjcmVkcykuam9pbignLCAnKSk7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdHT09HTEVfU0VSVklDRV9BQ0NPVU5UIGlzIG1pc3NpbmcgcmVxdWlyZWQgZmllbGRzIChwcm9qZWN0X2lkLCBjbGllbnRfZW1haWwsIG9yIHByaXZhdGVfa2V5KS4nKTtcbiAgfVxuXG4gIGRiID0gbmV3IEZpcmVzdG9yZSh7XG4gICAgcHJvamVjdElkOiBjcmVkcy5wcm9qZWN0X2lkLFxuICAgIGNyZWRlbnRpYWxzOiB7XG4gICAgICBjbGllbnRfZW1haWw6IGNyZWRzLmNsaWVudF9lbWFpbCxcbiAgICAgIHByaXZhdGVfa2V5OiBjcmVkcy5wcml2YXRlX2tleSxcbiAgICB9LFxuICB9KTtcbiAgcmV0dXJuIGRiO1xufVxuXG4vLyBQbGFuIHRpZXIgZGVmaW5pdGlvbnNcbmV4cG9ydCBjb25zdCBQTEFOUyA9IHtcbiAgdHJpYWw6ICB7IHJlcXVlc3RzOiAzLCAgICBtZW1iZXJzOiAzLCAgcHJpY2VNb250aGx5OiAwIH0sXG4gIGJ5b2s6ICAgICAgIHsgcmVxdWVzdHM6IDk5OTksIG1lbWJlcnM6IDEsICBwcmljZU1vbnRobHk6IDEwMCB9LFxuICBpbmRpdmlkdWFsOiB7IHJlcXVlc3RzOiAyNTAsICBtZW1iZXJzOiAxLCAgcHJpY2VNb250aGx5OiA1MDAgfSxcbiAgbGlmZXRpbWU6ICAgeyByZXF1ZXN0czogMjUwLCAgbWVtYmVyczogMywgIHByaWNlTW9udGhseTogMCB9LFxuICB0ZWFtOiAgICAgICB7IHJlcXVlc3RzOiAxNTAwLCBtZW1iZXJzOiA1MCwgcHJpY2VNb250aGx5OiAzMDAwIH0sXG59O1xuXG4vKipcbiAqIExvb2sgdXAgYSB1c2VyJ3MgdGVhbSBnaXZlbiB0aGVpciBGaXJlYmFzZSBVSUQuXG4gKiBSZXR1cm5zIHsgdGVhbSwgdGVhbVJlZiwgbWVtYmVyc2hpcCB9IG9yIG51bGwgaWYgbm8gdGVhbS5cbiAqL1xuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGdldFVzZXJUZWFtKHVpZCkge1xuICBjb25zdCBkYiA9IGdldERiKCk7XG5cbiAgLy8gRmluZCBtZW1iZXJzaGlwXG4gIGNvbnN0IG1lbWJlcnNoaXBzID0gYXdhaXQgZGIuY29sbGVjdGlvbigndGVhbV9tZW1iZXJzJylcbiAgICAud2hlcmUoJ3VzZXJJZCcsICc9PScsIHVpZClcbiAgICAubGltaXQoMSlcbiAgICAuZ2V0KCk7XG5cbiAgaWYgKG1lbWJlcnNoaXBzLmVtcHR5KSByZXR1cm4gbnVsbDtcblxuICBjb25zdCBtZW1iZXJzaGlwID0gbWVtYmVyc2hpcHMuZG9jc1swXS5kYXRhKCk7XG4gIGNvbnN0IHRlYW1SZWYgPSBkYi5jb2xsZWN0aW9uKCd0ZWFtcycpLmRvYyhtZW1iZXJzaGlwLnRlYW1JZCk7XG4gIGNvbnN0IHRlYW1Eb2MgPSBhd2FpdCB0ZWFtUmVmLmdldCgpO1xuXG4gIGlmICghdGVhbURvYy5leGlzdHMpIHJldHVybiBudWxsO1xuXG4gIHJldHVybiB7XG4gICAgdGVhbTogeyBpZDogdGVhbURvYy5pZCwgLi4udGVhbURvYy5kYXRhKCkgfSxcbiAgICB0ZWFtUmVmLFxuICAgIG1lbWJlcnNoaXAsXG4gIH07XG59XG5cbi8qKlxuICogSW5jcmVtZW50IHVzYWdlIGNvdW50ZXIgZm9yIGEgdGVhbSBhbmQgbG9nIHRoZSByZXF1ZXN0LlxuICovXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gbG9nVXNhZ2UodGVhbUlkLCB1c2VySWQsIGZlYXR1cmUsIGlucHV0VG9rZW5zID0gMCwgb3V0cHV0VG9rZW5zID0gMCkge1xuICBjb25zdCBkYiA9IGdldERiKCk7XG5cbiAgLy8gQXRvbWljIGluY3JlbWVudCBvZiB0aGUgdGVhbSB1c2FnZSBjb3VudGVyXG4gIGF3YWl0IGRiLmNvbGxlY3Rpb24oJ3RlYW1zJykuZG9jKHRlYW1JZCkudXBkYXRlKHtcbiAgICB1c2FnZVRoaXNQZXJpb2Q6IEZpZWxkVmFsdWUuaW5jcmVtZW50KDEpLFxuICAgIHVwZGF0ZWRBdDogRmllbGRWYWx1ZS5zZXJ2ZXJUaW1lc3RhbXAoKSxcbiAgfSk7XG5cbiAgLy8gQXBwZW5kIGRldGFpbGVkIHVzYWdlIGxvZ1xuICBhd2FpdCBkYi5jb2xsZWN0aW9uKCd1c2FnZV9sb2dzJykuYWRkKHtcbiAgICB0ZWFtSWQsXG4gICAgdXNlcklkLFxuICAgIGZlYXR1cmUsXG4gICAgaW5wdXRUb2tlbnMsXG4gICAgb3V0cHV0VG9rZW5zLFxuICAgIHRpbWVzdGFtcDogRmllbGRWYWx1ZS5zZXJ2ZXJUaW1lc3RhbXAoKSxcbiAgfSk7XG59XG5cbmV4cG9ydCB7IEZpZWxkVmFsdWUgfTtcbiIsICIvLyBGaXJlYmFzZSBJRCB0b2tlbiB2ZXJpZmljYXRpb24gdXNpbmcgR29vZ2xlJ3MgSldLIGtleXMuXG4vLyBVc2VzIGNyeXB0by5zdWJ0bGUgZm9yIHNpZ25hdHVyZSB2ZXJpZmljYXRpb24uXG5cbmxldCBjYWNoZWRLZXlzID0gbnVsbDtcbmxldCBjYWNoZWRLZXlzRXhwaXJ5ID0gMDtcblxuY29uc3QgRklSRUJBU0VfUFJPSkVDVF9JRCA9ICdkZWJhdGVvcy03OGFjNSc7XG5jb25zdCBHT09HTEVfSldLU19VUkwgPVxuICAnaHR0cHM6Ly93d3cuZ29vZ2xlYXBpcy5jb20vc2VydmljZV9hY2NvdW50cy92MS9qd2svc2VjdXJldG9rZW5Ac3lzdGVtLmdzZXJ2aWNlYWNjb3VudC5jb20nO1xuXG5hc3luYyBmdW5jdGlvbiBnZXRKd2tzKCkge1xuICBpZiAoY2FjaGVkS2V5cyAmJiBEYXRlLm5vdygpIDwgY2FjaGVkS2V5c0V4cGlyeSkgcmV0dXJuIGNhY2hlZEtleXM7XG5cbiAgY29uc3QgcmVzID0gYXdhaXQgZmV0Y2goR09PR0xFX0pXS1NfVVJMKTtcbiAgaWYgKCFyZXMub2spIHRocm93IG5ldyBFcnJvcignRmFpbGVkIHRvIGZldGNoIEdvb2dsZSBKV0tzJyk7XG5cbiAgY29uc3QgY2FjaGVDb250cm9sID0gcmVzLmhlYWRlcnMuZ2V0KCdjYWNoZS1jb250cm9sJykgfHwgJyc7XG4gIGNvbnN0IG1heEFnZU1hdGNoID0gY2FjaGVDb250cm9sLm1hdGNoKC9tYXgtYWdlPShcXGQrKS8pO1xuICBjb25zdCBtYXhBZ2UgPSBtYXhBZ2VNYXRjaCA/IHBhcnNlSW50KG1heEFnZU1hdGNoWzFdLCAxMCkgKiAxMDAwIDogMzYwMDAwMDtcbiAgY2FjaGVkS2V5c0V4cGlyeSA9IERhdGUubm93KCkgKyBtYXhBZ2U7XG5cbiAgY29uc3QgZGF0YSA9IGF3YWl0IHJlcy5qc29uKCk7XG4gIGNhY2hlZEtleXMgPSBkYXRhLmtleXM7XG4gIHJldHVybiBjYWNoZWRLZXlzO1xufVxuXG5mdW5jdGlvbiBiYXNlNjR1cmxEZWNvZGUoc3RyKSB7XG4gIHN0ciA9IHN0ci5yZXBsYWNlKC8tL2csICcrJykucmVwbGFjZSgvXy9nLCAnLycpO1xuICB3aGlsZSAoc3RyLmxlbmd0aCAlIDQpIHN0ciArPSAnPSc7XG4gIGlmICh0eXBlb2YgQnVmZmVyICE9PSAndW5kZWZpbmVkJykge1xuICAgIHJldHVybiBCdWZmZXIuZnJvbShzdHIsICdiYXNlNjQnKS50b1N0cmluZygnYmluYXJ5Jyk7XG4gIH1cbiAgcmV0dXJuIGF0b2Ioc3RyKTtcbn1cblxuZnVuY3Rpb24gYmFzZTY0dXJsVG9VaW50OEFycmF5KHN0cikge1xuICBjb25zdCBiaW5hcnkgPSBiYXNlNjR1cmxEZWNvZGUoc3RyKTtcbiAgY29uc3QgYnl0ZXMgPSBuZXcgVWludDhBcnJheShiaW5hcnkubGVuZ3RoKTtcbiAgZm9yIChsZXQgaSA9IDA7IGkgPCBiaW5hcnkubGVuZ3RoOyBpKyspIGJ5dGVzW2ldID0gYmluYXJ5LmNoYXJDb2RlQXQoaSk7XG4gIHJldHVybiBieXRlcztcbn1cblxuLyoqXG4gKiBWZXJpZnkgYSBGaXJlYmFzZSBJRCB0b2tlbiBhbmQgcmV0dXJuIHRoZSBkZWNvZGVkIHBheWxvYWQuXG4gKiBUaHJvd3Mgb24gaW52YWxpZC9leHBpcmVkIHRva2Vucy5cbiAqL1xuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHZlcmlmeUlkVG9rZW4oaWRUb2tlbikge1xuICBpZiAoIWlkVG9rZW4pIHRocm93IG5ldyBFcnJvcignTm8gSUQgdG9rZW4gcHJvdmlkZWQnKTtcblxuICBjb25zdCBwYXJ0cyA9IGlkVG9rZW4uc3BsaXQoJy4nKTtcbiAgaWYgKHBhcnRzLmxlbmd0aCAhPT0gMykgdGhyb3cgbmV3IEVycm9yKCdJbnZhbGlkIHRva2VuIGZvcm1hdCcpO1xuXG4gIGNvbnN0IGhlYWRlciA9IEpTT04ucGFyc2UoYmFzZTY0dXJsRGVjb2RlKHBhcnRzWzBdKSk7XG4gIGNvbnN0IHBheWxvYWQgPSBKU09OLnBhcnNlKGJhc2U2NHVybERlY29kZShwYXJ0c1sxXSkpO1xuXG4gIC8vIENoZWNrIGNsYWltc1xuICBjb25zdCBub3cgPSBNYXRoLmZsb29yKERhdGUubm93KCkgLyAxMDAwKTtcbiAgaWYgKHBheWxvYWQuZXhwIDwgbm93KSB0aHJvdyBuZXcgRXJyb3IoJ1Rva2VuIGV4cGlyZWQnKTtcbiAgaWYgKHBheWxvYWQuaWF0ID4gbm93ICsgMzAwKSB0aHJvdyBuZXcgRXJyb3IoJ1Rva2VuIGlzc3VlZCBpbiB0aGUgZnV0dXJlJyk7XG4gIGlmIChwYXlsb2FkLmF1ZCAhPT0gRklSRUJBU0VfUFJPSkVDVF9JRCkgdGhyb3cgbmV3IEVycm9yKCdJbnZhbGlkIGF1ZGllbmNlJyk7XG4gIGlmIChwYXlsb2FkLmlzcyAhPT0gYGh0dHBzOi8vc2VjdXJldG9rZW4uZ29vZ2xlLmNvbS8ke0ZJUkVCQVNFX1BST0pFQ1RfSUR9YClcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ0ludmFsaWQgaXNzdWVyJyk7XG4gIGlmICghcGF5bG9hZC5zdWIgfHwgdHlwZW9mIHBheWxvYWQuc3ViICE9PSAnc3RyaW5nJylcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ0ludmFsaWQgc3ViamVjdCcpO1xuXG4gIC8vIEdldCB0aGUgbWF0Y2hpbmcgSldLXG4gIGNvbnN0IGp3a3MgPSBhd2FpdCBnZXRKd2tzKCk7XG4gIGNvbnN0IGp3ayA9IGp3a3MuZmluZChrID0+IGsua2lkID09PSBoZWFkZXIua2lkKTtcbiAgaWYgKCFqd2spIHRocm93IG5ldyBFcnJvcignVW5rbm93biBzaWduaW5nIGtleScpO1xuXG4gIC8vIEltcG9ydCB0aGUgSldLIGFzIGEgQ3J5cHRvS2V5XG4gIGNvbnN0IGNyeXB0b0tleSA9IGF3YWl0IGNyeXB0by5zdWJ0bGUuaW1wb3J0S2V5KFxuICAgICdqd2snLFxuICAgIGp3ayxcbiAgICB7IG5hbWU6ICdSU0FTU0EtUEtDUzEtdjFfNScsIGhhc2g6ICdTSEEtMjU2JyB9LFxuICAgIGZhbHNlLFxuICAgIFsndmVyaWZ5J11cbiAgKTtcblxuICAvLyBWZXJpZnkgc2lnbmF0dXJlXG4gIGNvbnN0IHNpZ25hdHVyZUJ1ZmZlciA9IGJhc2U2NHVybFRvVWludDhBcnJheShwYXJ0c1syXSk7XG4gIGNvbnN0IGRhdGFCdWZmZXIgPSBuZXcgVGV4dEVuY29kZXIoKS5lbmNvZGUocGFydHNbMF0gKyAnLicgKyBwYXJ0c1sxXSk7XG5cbiAgY29uc3QgdmFsaWQgPSBhd2FpdCBjcnlwdG8uc3VidGxlLnZlcmlmeShcbiAgICAnUlNBU1NBLVBLQ1MxLXYxXzUnLFxuICAgIGNyeXB0b0tleSxcbiAgICBzaWduYXR1cmVCdWZmZXIsXG4gICAgZGF0YUJ1ZmZlclxuICApO1xuXG4gIGlmICghdmFsaWQpIHRocm93IG5ldyBFcnJvcignSW52YWxpZCB0b2tlbiBzaWduYXR1cmUnKTtcblxuICByZXR1cm4gcGF5bG9hZDtcbn1cblxuLyoqXG4gKiBFeHRyYWN0IHRoZSBCZWFyZXIgdG9rZW4gZnJvbSBhbiBBdXRob3JpemF0aW9uIGhlYWRlci5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGV4dHJhY3RCZWFyZXJUb2tlbihyZXF1ZXN0KSB7XG4gIGNvbnN0IGF1dGggPSByZXF1ZXN0LmhlYWRlcnMuZ2V0KCdhdXRob3JpemF0aW9uJykgfHwgJyc7XG4gIGlmICghYXV0aC5zdGFydHNXaXRoKCdCZWFyZXIgJykpIHJldHVybiBudWxsO1xuICByZXR1cm4gYXV0aC5zbGljZSg3KTtcbn1cblxuLyoqXG4gKiBFbmZvcmNlIHRoYXQgdGhlIGNhbGxlciBpcyBzaWduZWQgaW4gQU5EIG9uIGEgcGFpZCBwbGFuLlxuICogUmV0dXJucyB7IG9rOiB0cnVlLCB1aWQsIHBsYW4gfSBvbiBzdWNjZXNzLCBvciB7IG9rOiBmYWxzZSwgc3RhdHVzLCBlcnJvciB9XG4gKiBvbiBmYWlsdXJlIFx1MjAxNCBjYWxsIHNpdGVzIHNob3VsZCByZXR1cm4gdGhlIGVycm9yIHJlc3BvbnNlIGFzLWlzLlxuICpcbiAqIFVzZSB0aGlzIHRvIGdhdGUgcHJlbWl1bSBlbmRwb2ludHMgKEdlbWluaSwgR3JvaywgT3BlbkFJKSB0aGF0IGZyZWVcbiAqIHVzZXJzIGNhbid0IGNhbGwuIEZyZWUgQ2xhdWRlIHVzYWdlIGdvZXMgdGhyb3VnaCAvYXBpL2NsYXVkZSB3aGljaFxuICogaGFzIGl0cyBvd24gYW5vbnltb3VzK3RyaWFsIGxheWVycyBhbmQgc2hvdWxkIG5vdCB1c2UgdGhpcyBoZWxwZXIuXG4gKi9cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiByZXF1aXJlUGFpZFBsYW4ocmVxdWVzdCwgZmVhdHVyZU5hbWUpIHtcbiAgY29uc3QgdG9rZW4gPSBleHRyYWN0QmVhcmVyVG9rZW4ocmVxdWVzdCk7XG4gIGlmICghdG9rZW4pIHtcbiAgICByZXR1cm4ge1xuICAgICAgb2s6IGZhbHNlLFxuICAgICAgc3RhdHVzOiA0MDEsXG4gICAgICBlcnJvcjogJ1NpZ24gaW4gcmVxdWlyZWQuICcgKyAoZmVhdHVyZU5hbWUgfHwgJ1RoaXMgbW9kZWwnKSArICcgaXMgYSBwYWlkLXBsYW4gZmVhdHVyZS4nLFxuICAgICAgY29kZTogJ0FVVEhfUkVRVUlSRUQnLFxuICAgIH07XG4gIH1cblxuICBsZXQgZGVjb2RlZDtcbiAgdHJ5IHtcbiAgICBkZWNvZGVkID0gYXdhaXQgdmVyaWZ5SWRUb2tlbih0b2tlbik7XG4gIH0gY2F0Y2ggKGVycikge1xuICAgIHJldHVybiB7XG4gICAgICBvazogZmFsc2UsXG4gICAgICBzdGF0dXM6IDQwMSxcbiAgICAgIGVycm9yOiAnQXV0aGVudGljYXRpb24gZmFpbGVkLiBQbGVhc2Ugc2lnbiBpbiBhZ2Fpbi4nLFxuICAgICAgY29kZTogJ0FVVEhfSU5WQUxJRCcsXG4gICAgfTtcbiAgfVxuXG4gIC8vIExhenktaW1wb3J0IGZpcmVzdG9yZSB0byBhdm9pZCBhIGNpcmN1bGFyIGRlcCArIGNvbGQtc3RhcnQgY29zdCBmb3JcbiAgLy8gY2FsbGVycyB0aGF0IGhhcHBlbiB0byBiZSBjaGVja2luZyBhdXRoIHdpdGhvdXQgbmVlZGluZyBwYWlkIGdhdGluZy5cbiAgY29uc3QgeyBnZXRVc2VyVGVhbSB9ID0gYXdhaXQgaW1wb3J0KCcuL2ZpcmVzdG9yZS5tanMnKTtcbiAgY29uc3QgcmVzdWx0ID0gYXdhaXQgZ2V0VXNlclRlYW0oZGVjb2RlZC5zdWIpO1xuICBjb25zdCBwbGFuID0gcmVzdWx0Py50ZWFtPy5wbGFuO1xuICBjb25zdCBzdGF0dXMgPSByZXN1bHQ/LnRlYW0/LnN0YXR1cztcbiAgY29uc3QgaXNQYWlkID1cbiAgICBwbGFuICYmXG4gICAgcGxhbiAhPT0gJ3RyaWFsJyAmJlxuICAgIFsnaW5kaXZpZHVhbCcsICd0ZWFtJywgJ2xpZmV0aW1lJywgJ2J5b2snXS5pbmNsdWRlcyhwbGFuKSAmJlxuICAgICghc3RhdHVzIHx8IHN0YXR1cyA9PT0gJ2FjdGl2ZScgfHwgc3RhdHVzID09PSAndHJpYWxpbmcnKTtcblxuICBpZiAoIWlzUGFpZCkge1xuICAgIHJldHVybiB7XG4gICAgICBvazogZmFsc2UsXG4gICAgICBzdGF0dXM6IDQwMiwgLy8gUGF5bWVudCBSZXF1aXJlZCBcdTIwMTQgc2VtYW50aWNhbGx5IHByZWNpc2UgZm9yIHRoaXMgY2FzZS5cbiAgICAgIGVycm9yOiAoZmVhdHVyZU5hbWUgfHwgJ1RoaXMgbW9kZWwnKSArICcgaXMgYSBwYWlkIGZlYXR1cmUuIFVwZ3JhZGUgdG8gSW5kaXZpZHVhbCAoJDUvbW8pIHRvIHVubG9jayBHZW1pbmksIEdQVCwgYW5kIEdyb2sgYWxvbmdzaWRlIENsYXVkZSBTb25uZXQuJyxcbiAgICAgIGNvZGU6ICdQQVlNRU5UX1JFUVVJUkVEJyxcbiAgICAgIGN1cnJlbnRQbGFuOiBwbGFuIHx8ICd0cmlhbCcsXG4gICAgfTtcbiAgfVxuXG4gIHJldHVybiB7IG9rOiB0cnVlLCB1aWQ6IGRlY29kZWQuc3ViLCBwbGFuIH07XG59XG4iLCAiaW1wb3J0IHsgdmVyaWZ5SWRUb2tlbiwgZXh0cmFjdEJlYXJlclRva2VuIH0gZnJvbSAnLi9saWIvYXV0aC5tanMnO1xuaW1wb3J0IHsgZ2V0RGIgfSBmcm9tICcuL2xpYi9maXJlc3RvcmUubWpzJztcbmltcG9ydCB7IGNvcnNSZXNwb25zZSwganNvblJlc3BvbnNlLCBlcnJvclJlc3BvbnNlIH0gZnJvbSAnLi9saWIvcmVzcG9uc2UubWpzJztcblxuLy8gSGFyZGNvZGVkIGFkbWluIFVJRCBcdTIwMTQgdGhlIGFwcCBvd25lcidzIEZpcmViYXNlIFVJRFxuY29uc3QgQURNSU5fVUlEID0gcHJvY2Vzcy5lbnYuQURNSU5fVUlEIHx8ICdSRVBMQUNFX1dJVEhfWU9VUl9GSVJFQkFTRV9VSUQnO1xuXG5leHBvcnQgZGVmYXVsdCBhc3luYyAocmVxdWVzdCkgPT4ge1xuICBpZiAocmVxdWVzdC5tZXRob2QgPT09ICdPUFRJT05TJykgcmV0dXJuIGNvcnNSZXNwb25zZShyZXF1ZXN0KTtcbiAgaWYgKHJlcXVlc3QubWV0aG9kICE9PSAnR0VUJykgcmV0dXJuIGVycm9yUmVzcG9uc2UoJ01ldGhvZCBub3QgYWxsb3dlZCcsIDQwNSwgcmVxdWVzdCk7XG5cbiAgY29uc3QgdG9rZW4gPSBleHRyYWN0QmVhcmVyVG9rZW4ocmVxdWVzdCk7XG4gIGlmICghdG9rZW4pIHJldHVybiBlcnJvclJlc3BvbnNlKCdBdXRob3JpemF0aW9uIHJlcXVpcmVkJywgNDAxLCByZXF1ZXN0KTtcblxuICBsZXQgZGVjb2RlZDtcbiAgdHJ5IHtcbiAgICBkZWNvZGVkID0gYXdhaXQgdmVyaWZ5SWRUb2tlbih0b2tlbik7XG4gIH0gY2F0Y2ggKGVycikge1xuICAgIGNvbnNvbGUuZXJyb3IoJ2FkbWluLWFuYWx5dGljcyBhdXRoIGVycm9yOicsIGVyci5tZXNzYWdlKTtcbiAgICByZXR1cm4gZXJyb3JSZXNwb25zZSgnQXV0aGVudGljYXRpb24gZmFpbGVkLiBQbGVhc2Ugc2lnbiBpbiBhZ2Fpbi4nLCA0MDEsIHJlcXVlc3QpO1xuICB9XG5cbiAgY29uc3QgdWlkID0gZGVjb2RlZC5zdWI7XG4gIGNvbnN0IGRiID0gZ2V0RGIoKTtcblxuICBsZXQgaXNBZG1pbiA9IHVpZCA9PT0gQURNSU5fVUlEO1xuICBpZiAoIWlzQWRtaW4pIHtcbiAgICB0cnkge1xuICAgICAgY29uc3QgcHJvZmlsZURvYyA9IGF3YWl0IGRiLmNvbGxlY3Rpb24oJ3VzZXJfcHJvZmlsZXMnKS5kb2ModWlkKS5nZXQoKTtcbiAgICAgIGlmIChwcm9maWxlRG9jLmV4aXN0cyAmJiBwcm9maWxlRG9jLmRhdGEoKS5pc0FkbWluID09PSB0cnVlKSB7XG4gICAgICAgIGlzQWRtaW4gPSB0cnVlO1xuICAgICAgfVxuICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgY29uc29sZS5lcnJvcignYWRtaW4tYW5hbHl0aWNzIHByb2ZpbGUgY2hlY2sgZXJyb3I6JywgZXJyLm1lc3NhZ2UpO1xuICAgIH1cbiAgfVxuXG4gIGlmICghaXNBZG1pbikgcmV0dXJuIGVycm9yUmVzcG9uc2UoJ0ZvcmJpZGRlbjogYWRtaW4gYWNjZXNzIHJlcXVpcmVkJywgNDAzLCByZXF1ZXN0KTtcblxuICB0cnkge1xuICAgIC8vIFJ1biBhbGwgY29sbGVjdGlvbiBjb3VudHMgaW4gcGFyYWxsZWxcbiAgICBjb25zdCBbXG4gICAgICB1c2Vyc1NuYXAsXG4gICAgICBjYXNlc1NuYXAsXG4gICAgICBzaGFyZWRDYXNlc1NuYXAsXG4gICAgICBmb3J1bVBvc3RzU25hcCxcbiAgICAgIGRlYmF0ZXNTbmFwLFxuICAgICAgdGVhbXNTbmFwLFxuICAgICAgcmVmZXJyYWxzU25hcCxcbiAgICAgIGV2ZW50c1NuYXAsXG4gICAgICBmZWVkYmFja1NuYXAsXG4gICAgXSA9IGF3YWl0IFByb21pc2UuYWxsKFtcbiAgICAgIGRiLmNvbGxlY3Rpb24oJ3VzZXJfcHJvZmlsZXMnKS5jb3VudCgpLmdldCgpLFxuICAgICAgZGIuY29sbGVjdGlvbigndXNlcl9jYXNlcycpLmNvdW50KCkuZ2V0KCksXG4gICAgICBkYi5jb2xsZWN0aW9uKCdzaGFyZWRfY2FzZXMnKS5jb3VudCgpLmdldCgpLFxuICAgICAgZGIuY29sbGVjdGlvbignZm9ydW1fcG9zdHMnKS5jb3VudCgpLmdldCgpLFxuICAgICAgZGIuY29sbGVjdGlvbignbGl2ZV9kZWJhdGVzJykuY291bnQoKS5nZXQoKSxcbiAgICAgIGRiLmNvbGxlY3Rpb24oJ3RlYW1zJykuZ2V0KCksXG4gICAgICBkYi5jb2xsZWN0aW9uKCdyZWZlcnJhbF9jcmVkaXRzJykuY291bnQoKS5nZXQoKSxcbiAgICAgIGRiLmNvbGxlY3Rpb24oJ2V2ZW50cycpLmNvdW50KCkuZ2V0KCksXG4gICAgICBkYi5jb2xsZWN0aW9uKCdmZWVkYmFjaycpLmNvdW50KCkuZ2V0KCkuY2F0Y2goKCkgPT4gKHsgZGF0YTogKCkgPT4gKHsgY291bnQ6IDAgfSkgfSkpLFxuICAgIF0pO1xuXG4gICAgY29uc3QgdG90YWxVc2VycyA9IHVzZXJzU25hcC5kYXRhKCkuY291bnQ7XG4gICAgY29uc3QgdG90YWxDYXNlcyA9IGNhc2VzU25hcC5kYXRhKCkuY291bnQ7XG4gICAgY29uc3QgdG90YWxTaGFyZWRDYXNlcyA9IHNoYXJlZENhc2VzU25hcC5kYXRhKCkuY291bnQ7XG4gICAgY29uc3QgdG90YWxGb3J1bVBvc3RzID0gZm9ydW1Qb3N0c1NuYXAuZGF0YSgpLmNvdW50O1xuICAgIGNvbnN0IHRvdGFsRGViYXRlcyA9IGRlYmF0ZXNTbmFwLmRhdGEoKS5jb3VudDtcbiAgICBjb25zdCB0b3RhbFJlZmVycmFscyA9IHJlZmVycmFsc1NuYXAuZGF0YSgpLmNvdW50O1xuICAgIGNvbnN0IHRvdGFsRXZlbnRzID0gZXZlbnRzU25hcC5kYXRhKCkuY291bnQ7XG4gICAgY29uc3QgdG90YWxGZWVkYmFjayA9IGZlZWRiYWNrU25hcC5kYXRhKCkuY291bnQ7XG5cbiAgICAvLyBUZWFtIG1ldHJpY3NcbiAgICBjb25zdCB0ZWFtRG9jcyA9IHRlYW1zU25hcC5kb2NzLm1hcChkID0+IGQuZGF0YSgpKTtcbiAgICBjb25zdCB0b3RhbFRlYW1zID0gdGVhbURvY3MubGVuZ3RoO1xuICAgIGNvbnN0IGFjdGl2ZVRlYW1zID0gdGVhbURvY3MuZmlsdGVyKHQgPT4gKHQudXNhZ2VUaGlzUGVyaW9kIHx8IDApID4gMCkubGVuZ3RoO1xuICAgIGNvbnN0IHBhaWRUZWFtcyA9IHRlYW1Eb2NzLmZpbHRlcih0ID0+IHQucGxhbiAmJiB0LnBsYW4gIT09ICd0cmlhbCcpLmxlbmd0aDtcblxuICAgIC8vIFJlY2VudCBzaWdudXBzIChsYXN0IDcgZGF5cylcbiAgICBjb25zdCBzZXZlbkRheXNBZ28gPSBuZXcgRGF0ZShEYXRlLm5vdygpIC0gNyAqIDI0ICogNjAgKiA2MCAqIDEwMDApO1xuICAgIGxldCByZWNlbnRTaWdudXBzID0gMDtcbiAgICB0cnkge1xuICAgICAgY29uc3QgcmVjZW50U25hcCA9IGF3YWl0IGRiLmNvbGxlY3Rpb24oJ3VzZXJfcHJvZmlsZXMnKVxuICAgICAgICAud2hlcmUoJ2NyZWF0ZWRBdCcsICc+PScsIHNldmVuRGF5c0FnbylcbiAgICAgICAgLmNvdW50KClcbiAgICAgICAgLmdldCgpO1xuICAgICAgcmVjZW50U2lnbnVwcyA9IHJlY2VudFNuYXAuZGF0YSgpLmNvdW50O1xuICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgY29uc29sZS53YXJuKCdDb3VsZCBub3QgY291bnQgcmVjZW50IHNpZ251cHM6JywgZXJyLm1lc3NhZ2UpO1xuICAgIH1cblxuICAgIC8vID09PSBUSU1FLVNFUklFUyBEQVRBID09PVxuICAgIC8vIFRocmVlIGdyYW51bGFyaXRpZXMgc28gY2hhcnRzIGxvb2sgZ29vZCBhdCBhbnkgem9vbSBsZXZlbDpcbiAgICAvLyAxLiBEYWlseTogbGFzdCAzMCBkYXlzIChyZWNlbnQgdHJlbmRzLCBmaW5lIGdyYWluKVxuICAgIC8vIDIuIFdlZWtseTogbGFzdCAyNiB3ZWVrcyAvIDYgbW9udGhzIChtZWRpdW0tdGVybSwgY2xlYW4gZ3JhcGgpXG4gICAgLy8gMy4gTW9udGhseTogbGFzdCAyNCBtb250aHMgKGxvbmctdGVybSBncm93dGgsIGNvbXBhY3QpXG5cbiAgICBjb25zdCBub3cgPSBuZXcgRGF0ZSgpO1xuICAgIGNvbnN0IGNvdW50USA9IChjb2wsIHN0YXJ0LCBlbmQpID0+XG4gICAgICBkYi5jb2xsZWN0aW9uKGNvbClcbiAgICAgICAgLndoZXJlKCdjcmVhdGVkQXQnLCAnPj0nLCBzdGFydClcbiAgICAgICAgLndoZXJlKCdjcmVhdGVkQXQnLCAnPCcsIGVuZClcbiAgICAgICAgLmNvdW50KCkuZ2V0KClcbiAgICAgICAgLnRoZW4ocyA9PiBzLmRhdGEoKS5jb3VudClcbiAgICAgICAgLmNhdGNoKCgpID0+IDApO1xuXG4gICAgLy8gMS4gREFJTFkgXHUyMDE0IGxhc3QgMzAgZGF5c1xuICAgIGNvbnN0IGRhaWx5UHJvbWlzZXMgPSBbXTtcbiAgICBmb3IgKGxldCBkID0gMDsgZCA8IDMwOyBkKyspIHtcbiAgICAgIGNvbnN0IGRheVN0YXJ0ID0gbmV3IERhdGUobm93LmdldEZ1bGxZZWFyKCksIG5vdy5nZXRNb250aCgpLCBub3cuZ2V0RGF0ZSgpIC0gZCk7XG4gICAgICBjb25zdCBkYXlFbmQgPSBuZXcgRGF0ZShub3cuZ2V0RnVsbFllYXIoKSwgbm93LmdldE1vbnRoKCksIG5vdy5nZXREYXRlKCkgLSBkICsgMSk7XG4gICAgICBjb25zdCBsYWJlbCA9IGRheVN0YXJ0LnRvTG9jYWxlRGF0ZVN0cmluZygnZW4tVVMnLCB7IG1vbnRoOiAnc2hvcnQnLCBkYXk6ICdudW1lcmljJyB9KTtcbiAgICAgIGRhaWx5UHJvbWlzZXMucHVzaChcbiAgICAgICAgUHJvbWlzZS5hbGwoW2NvdW50USgnZXZlbnRzJywgZGF5U3RhcnQsIGRheUVuZCksIGNvdW50USgndXNlcl9wcm9maWxlcycsIGRheVN0YXJ0LCBkYXlFbmQpXSlcbiAgICAgICAgICAudGhlbigoW2V2ZW50cywgbmV3VXNlcnNdKSA9PiAoeyBkYXRlOiBsYWJlbCwgZGF0ZUlTTzogZGF5U3RhcnQudG9JU09TdHJpbmcoKS5zbGljZSgwLCAxMCksIGV2ZW50cywgbmV3VXNlcnMgfSkpXG4gICAgICApO1xuICAgIH1cbiAgICBjb25zdCBkYWlseSA9IGF3YWl0IFByb21pc2UuYWxsKGRhaWx5UHJvbWlzZXMpO1xuXG4gICAgLy8gMi4gV0VFS0xZIFx1MjAxNCBsYXN0IDI2IHdlZWtzXG4gICAgY29uc3Qgd2Vla2x5UHJvbWlzZXMgPSBbXTtcbiAgICBmb3IgKGxldCB3ID0gMDsgdyA8IDI2OyB3KyspIHtcbiAgICAgIGNvbnN0IHdlZWtTdGFydCA9IG5ldyBEYXRlKG5vdy5nZXRGdWxsWWVhcigpLCBub3cuZ2V0TW9udGgoKSwgbm93LmdldERhdGUoKSAtICh3ICsgMSkgKiA3KTtcbiAgICAgIGNvbnN0IHdlZWtFbmQgPSBuZXcgRGF0ZShub3cuZ2V0RnVsbFllYXIoKSwgbm93LmdldE1vbnRoKCksIG5vdy5nZXREYXRlKCkgLSB3ICogNyk7XG4gICAgICBjb25zdCBsYWJlbCA9ICdXJyArICgyNiAtIHcpICsgJyAnICsgd2Vla1N0YXJ0LnRvTG9jYWxlRGF0ZVN0cmluZygnZW4tVVMnLCB7IG1vbnRoOiAnc2hvcnQnLCBkYXk6ICdudW1lcmljJyB9KTtcbiAgICAgIHdlZWtseVByb21pc2VzLnB1c2goXG4gICAgICAgIFByb21pc2UuYWxsKFtjb3VudFEoJ2V2ZW50cycsIHdlZWtTdGFydCwgd2Vla0VuZCksIGNvdW50USgndXNlcl9wcm9maWxlcycsIHdlZWtTdGFydCwgd2Vla0VuZCksIGNvdW50USgndGVhbXMnLCB3ZWVrU3RhcnQsIHdlZWtFbmQpXSlcbiAgICAgICAgICAudGhlbigoW2V2ZW50cywgbmV3VXNlcnMsIG5ld1RlYW1zXSkgPT4gKHsgd2VlazogbGFiZWwsIHdlZWtTdGFydDogd2Vla1N0YXJ0LnRvSVNPU3RyaW5nKCkuc2xpY2UoMCwgMTApLCBldmVudHMsIG5ld1VzZXJzLCBuZXdUZWFtcyB9KSlcbiAgICAgICk7XG4gICAgfVxuICAgIGNvbnN0IHdlZWtseSA9IGF3YWl0IFByb21pc2UuYWxsKHdlZWtseVByb21pc2VzKTtcblxuICAgIC8vIDMuIE1PTlRITFkgXHUyMDE0IGxhc3QgMjQgbW9udGhzXG4gICAgY29uc3QgbW9udGhseVByb21pc2VzID0gW107XG4gICAgZm9yIChsZXQgbSA9IDA7IG0gPCAyNDsgbSsrKSB7XG4gICAgICBjb25zdCBtb250aFN0YXJ0ID0gbmV3IERhdGUobm93LmdldEZ1bGxZZWFyKCksIG5vdy5nZXRNb250aCgpIC0gbSwgMSk7XG4gICAgICBjb25zdCBtb250aEVuZCA9IG5ldyBEYXRlKG5vdy5nZXRGdWxsWWVhcigpLCBub3cuZ2V0TW9udGgoKSAtIG0gKyAxLCAxKTtcbiAgICAgIGNvbnN0IGxhYmVsID0gbW9udGhTdGFydC50b0xvY2FsZVN0cmluZygnZW4tVVMnLCB7IG1vbnRoOiAnc2hvcnQnLCB5ZWFyOiAnbnVtZXJpYycgfSk7XG4gICAgICBtb250aGx5UHJvbWlzZXMucHVzaChcbiAgICAgICAgUHJvbWlzZS5hbGwoW2NvdW50USgnZXZlbnRzJywgbW9udGhTdGFydCwgbW9udGhFbmQpLCBjb3VudFEoJ3VzZXJfcHJvZmlsZXMnLCBtb250aFN0YXJ0LCBtb250aEVuZCksIGNvdW50USgndGVhbXMnLCBtb250aFN0YXJ0LCBtb250aEVuZCldKVxuICAgICAgICAgIC50aGVuKChbZXZlbnRzLCBuZXdVc2VycywgbmV3VGVhbXNdKSA9PiAoeyBtb250aDogbGFiZWwsIG1vbnRoU3RhcnQ6IG1vbnRoU3RhcnQudG9JU09TdHJpbmcoKS5zbGljZSgwLCAxMCksIGV2ZW50cywgbmV3VXNlcnMsIG5ld1RlYW1zIH0pKVxuICAgICAgKTtcbiAgICB9XG4gICAgY29uc3QgbW9udGhseSA9IGF3YWl0IFByb21pc2UuYWxsKG1vbnRobHlQcm9taXNlcyk7XG5cbiAgICAvLyBFdmVudCBicmVha2Rvd24gYnkgdHlwZSAobGFzdCAzMCBkYXlzKVxuICAgIGNvbnN0IHRoaXJ0eURheXNBZ28gPSBuZXcgRGF0ZShEYXRlLm5vdygpIC0gMzAgKiAyNCAqIDYwICogNjAgKiAxMDAwKTtcbiAgICBsZXQgZXZlbnRCcmVha2Rvd24gPSB7fTtcbiAgICB0cnkge1xuICAgICAgY29uc3QgcmVjZW50RXZlbnRzID0gYXdhaXQgZGIuY29sbGVjdGlvbignZXZlbnRzJylcbiAgICAgICAgLndoZXJlKCdjcmVhdGVkQXQnLCAnPj0nLCB0aGlydHlEYXlzQWdvKVxuICAgICAgICAubGltaXQoNTAwMClcbiAgICAgICAgLmdldCgpO1xuICAgICAgcmVjZW50RXZlbnRzLmRvY3MuZm9yRWFjaChkb2MgPT4ge1xuICAgICAgICBjb25zdCBldiA9IGRvYy5kYXRhKCkuZXZlbnQgfHwgJ3Vua25vd24nO1xuICAgICAgICBldmVudEJyZWFrZG93bltldl0gPSAoZXZlbnRCcmVha2Rvd25bZXZdIHx8IDApICsgMTtcbiAgICAgIH0pO1xuICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgY29uc29sZS53YXJuKCdDb3VsZCBub3QgYWdncmVnYXRlIGV2ZW50czonLCBlcnIubWVzc2FnZSk7XG4gICAgfVxuXG4gICAgLy8gVG9wIGZlYXR1cmVzIGZyb20gbGVhcm5pbmdfY291bnRlcnNcbiAgICBsZXQgdG9wRmVhdHVyZXMgPSBbXTtcbiAgICB0cnkge1xuICAgICAgY29uc3QgY291bnRlcnNTbmFwID0gYXdhaXQgZGIuY29sbGVjdGlvbignbGVhcm5pbmdfY291bnRlcnMnKS5saW1pdCgxMDApLmdldCgpO1xuICAgICAgY29uc3QgZmVhdHVyZVRvdGFscyA9IHt9O1xuICAgICAgLy8gU2tpcCBtZXRhZGF0YS1pc2ggbnVtZXJpYyBmaWVsZHMgdGhhdCBhcmVuJ3QgYWN0dWFsIGZlYXR1cmUgbmFtZXMuXG4gICAgICAvLyBXaXRob3V0IHRoaXMgZmlsdGVyIHRoZSBkYXNoYm9hcmQgc3VyZmFjZXMgYSBsaXRlcmFsIFwiY291bnQ6IDVcIiByb3cuXG4gICAgICBjb25zdCBTS0lQX0tFWVMgPSBuZXcgU2V0KFsnY291bnQnLCdjcmVhdGVkQXQnLCd1cGRhdGVkQXQnLCd1aWQnLCd0aW1lc3RhbXAnLCdsYXN0VXBkYXRlZCcsJ3ZlcnNpb24nLCd0cycsJ2lkJ10pO1xuICAgICAgY291bnRlcnNTbmFwLmRvY3MuZm9yRWFjaChkb2MgPT4ge1xuICAgICAgICBjb25zdCBkYXRhID0gZG9jLmRhdGEoKTtcbiAgICAgICAgZm9yIChjb25zdCBba2V5LCB2YWxdIG9mIE9iamVjdC5lbnRyaWVzKGRhdGEpKSB7XG4gICAgICAgICAgaWYgKHR5cGVvZiB2YWwgPT09ICdudW1iZXInICYmICFTS0lQX0tFWVMuaGFzKGtleSkpIHtcbiAgICAgICAgICAgIGZlYXR1cmVUb3RhbHNba2V5XSA9IChmZWF0dXJlVG90YWxzW2tleV0gfHwgMCkgKyB2YWw7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9KTtcbiAgICAgIHRvcEZlYXR1cmVzID0gT2JqZWN0LmVudHJpZXMoZmVhdHVyZVRvdGFscylcbiAgICAgICAgLnNvcnQoKGEsIGIpID0+IGJbMV0gLSBhWzFdKVxuICAgICAgICAuc2xpY2UoMCwgMTApXG4gICAgICAgIC5tYXAoKFtmZWF0dXJlLCBjb3VudF0pID0+ICh7IGZlYXR1cmUsIGNvdW50IH0pKTtcbiAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgIGNvbnNvbGUud2FybignQ291bGQgbm90IGFnZ3JlZ2F0ZSBsZWFybmluZ19jb3VudGVyczonLCBlcnIubWVzc2FnZSk7XG4gICAgfVxuXG4gICAgLy8gUmVjZW50IGZlZWRiYWNrIChsYXN0IDUgZW50cmllcykuXG4gICAgLy8gT2xkZXIgZmVlZGJhY2sgZG9jcyBwcmVkYXRlIHRoZSBjcmVhdGVkQXQgZmllbGQgXHUyMDE0IG9yZGVyQnkgc2lsZW50bHlcbiAgICAvLyBkcm9wcyB0aGVtLCBzbyB0aGUgZGFzaGJvYXJkIHNob3dlZCBGRUVEQkFDSyA3IGJ1dCBcIk5vIGZlZWRiYWNrIHlldC5cIlxuICAgIC8vIFN0cmF0ZWd5OiB0cnkgb3JkZXJlZCBxdWVyeSBmaXJzdCwgZmFsbCBiYWNrIHRvIHBsYWluIGxpbWl0IGlmIGVtcHR5LlxuICAgIGxldCByZWNlbnRGZWVkYmFjayA9IFtdO1xuICAgIGNvbnN0IG1hcEZiID0gZCA9PiB7XG4gICAgICBjb25zdCBkYXRhID0gZC5kYXRhKCk7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBjYXRlZ29yeTogZGF0YS5jYXRlZ29yeSxcbiAgICAgICAgZGVzY3JpcHRpb246IChkYXRhLmRlc2NyaXB0aW9uIHx8ICcnKS5zbGljZSgwLCAyMDApLFxuICAgICAgICBjdXJyZW50VGFiOiBkYXRhLmN1cnJlbnRUYWIsXG4gICAgICAgIGVtYWlsOiBkYXRhLmVtYWlsLFxuICAgICAgICBjcmVhdGVkQXQ6IGRhdGEuY3JlYXRlZEF0Py50b0RhdGU/LigpPy50b0lTT1N0cmluZygpIHx8IG51bGwsXG4gICAgICB9O1xuICAgIH07XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IGZiU25hcCA9IGF3YWl0IGRiLmNvbGxlY3Rpb24oJ2ZlZWRiYWNrJylcbiAgICAgICAgLm9yZGVyQnkoJ2NyZWF0ZWRBdCcsICdkZXNjJylcbiAgICAgICAgLmxpbWl0KDUpXG4gICAgICAgIC5nZXQoKTtcbiAgICAgIHJlY2VudEZlZWRiYWNrID0gZmJTbmFwLmRvY3MubWFwKG1hcEZiKTtcbiAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgIGNvbnNvbGUud2FybignQ291bGQgbm90IGZldGNoIG9yZGVyZWQgZmVlZGJhY2s6JywgZXJyLm1lc3NhZ2UpO1xuICAgIH1cbiAgICBpZiAocmVjZW50RmVlZGJhY2subGVuZ3RoID09PSAwKSB7XG4gICAgICB0cnkge1xuICAgICAgICBjb25zdCBmYlNuYXAgPSBhd2FpdCBkYi5jb2xsZWN0aW9uKCdmZWVkYmFjaycpLmxpbWl0KDEwKS5nZXQoKTtcbiAgICAgICAgcmVjZW50RmVlZGJhY2sgPSBmYlNuYXAuZG9jcy5tYXAobWFwRmIpO1xuICAgICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICAgIGNvbnNvbGUud2FybignQ291bGQgbm90IGZldGNoIGZhbGxiYWNrIGZlZWRiYWNrOicsIGVyci5tZXNzYWdlKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4ganNvblJlc3BvbnNlKHtcbiAgICAgIC8vIFRvdGFsc1xuICAgICAgdG90YWxVc2VycyxcbiAgICAgIHRvdGFsQ2FzZXMsXG4gICAgICB0b3RhbFNoYXJlZENhc2VzLFxuICAgICAgdG90YWxGb3J1bVBvc3RzLFxuICAgICAgdG90YWxEZWJhdGVzLFxuICAgICAgdG90YWxUZWFtcyxcbiAgICAgIGFjdGl2ZVRlYW1zLFxuICAgICAgcGFpZFRlYW1zLFxuICAgICAgdG90YWxSZWZlcnJhbHMsXG4gICAgICB0b3RhbEV2ZW50cyxcbiAgICAgIHRvdGFsRmVlZGJhY2ssXG4gICAgICByZWNlbnRTaWdudXBzLFxuXG4gICAgICAvLyBUaW1lLXNlcmllcyAobmV3ZXN0IGZpcnN0KVxuICAgICAgZGFpbHk6IGRhaWx5LnJldmVyc2UoKSxcbiAgICAgIHdlZWtseTogd2Vla2x5LnJldmVyc2UoKSxcbiAgICAgIG1vbnRobHk6IG1vbnRobHkucmV2ZXJzZSgpLFxuXG4gICAgICAvLyBFdmVudCBicmVha2Rvd24gKGxhc3QgMzAgZGF5cylcbiAgICAgIGV2ZW50QnJlYWtkb3duLFxuXG4gICAgICAvLyBUb3AgZmVhdHVyZXNcbiAgICAgIHRvcEZlYXR1cmVzLFxuXG4gICAgICAvLyBSZWNlbnQgZmVlZGJhY2tcbiAgICAgIHJlY2VudEZlZWRiYWNrLFxuXG4gICAgICB0aW1lc3RhbXA6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcbiAgICB9LCAyMDAsIHJlcXVlc3QpO1xuICB9IGNhdGNoIChlcnIpIHtcbiAgICBjb25zb2xlLmVycm9yKCdhZG1pbi1hbmFseXRpY3MgZXJyb3I6JywgZXJyKTtcbiAgICByZXR1cm4gZXJyb3JSZXNwb25zZSgnU29tZXRoaW5nIHdlbnQgd3JvbmcuIFBsZWFzZSB0cnkgYWdhaW4uJywgNTAwLCByZXF1ZXN0KTtcbiAgfVxufTtcblxuZXhwb3J0IGNvbnN0IGNvbmZpZyA9IHtcbiAgcGF0aDogJy9hcGkvYWRtaW4vYW5hbHl0aWNzJyxcbn07XG4iLCAiY29uc3QgUFJPRFVDVElPTl9PUklHSU5TID0gW1xuICAnaHR0cHM6Ly9kZWJhdGVvczEubmV0bGlmeS5hcHAnLFxuICAnaHR0cHM6Ly9kZXZpbHNhZHZvY2F0ZTEubmV0bGlmeS5hcHAnLFxuICAnaHR0cHM6Ly9kZWJhdGVvcy5jb20nLFxuICAnaHR0cHM6Ly93d3cuZGViYXRlb3MuY29tJyxcbiAgJ2h0dHBzOi8vZGViYXRldGhlZGV2aWwuY29tJyxcbiAgJ2h0dHBzOi8vd3d3LmRlYmF0ZXRoZWRldmlsLmNvbScsXG5dO1xuXG5jb25zdCBERVZfT1JJR0lOUyA9IFtcbiAgJ2h0dHA6Ly9sb2NhbGhvc3Q6ODg4OCcsXG4gICdodHRwOi8vbG9jYWxob3N0OjMwMDAnLFxuXTtcblxuLy8gT25seSBhbGxvdyBsb2NhbGhvc3Qgb3JpZ2lucyBvdXRzaWRlIHByb2R1Y3Rpb25cbmNvbnN0IGlzUHJvZHVjdGlvbiA9IHByb2Nlc3MuZW52LkNPTlRFWFQgPT09ICdwcm9kdWN0aW9uJztcbmNvbnN0IEFMTE9XRURfT1JJR0lOUyA9IGlzUHJvZHVjdGlvblxuICA/IFBST0RVQ1RJT05fT1JJR0lOU1xuICA6IFsuLi5QUk9EVUNUSU9OX09SSUdJTlMsIC4uLkRFVl9PUklHSU5TXTtcblxuLy8gRGVmYXVsdCBvcmlnaW4gZm9yIHByZWZsaWdodCAvIHdoZW4gcmVxdWVzdCBpcyBub3QgYXZhaWxhYmxlXG5jb25zdCBERUZBVUxUX09SSUdJTiA9IEFMTE9XRURfT1JJR0lOU1swXTtcblxuZnVuY3Rpb24gZ2V0T3JpZ2luKHJlcXVlc3QpIHtcbiAgaWYgKCFyZXF1ZXN0KSByZXR1cm4gREVGQVVMVF9PUklHSU47XG4gIGNvbnN0IG9yaWdpbiA9IHJlcXVlc3Q/LmhlYWRlcnM/LmdldD8uKCdvcmlnaW4nKSB8fCAnJztcbiAgcmV0dXJuIEFMTE9XRURfT1JJR0lOUy5pbmNsdWRlcyhvcmlnaW4pID8gb3JpZ2luIDogREVGQVVMVF9PUklHSU47XG59XG5cbmZ1bmN0aW9uIGNvcnNIZWFkZXJzKHJlcXVlc3QpIHtcbiAgcmV0dXJuIHtcbiAgICAnQWNjZXNzLUNvbnRyb2wtQWxsb3ctT3JpZ2luJzogZ2V0T3JpZ2luKHJlcXVlc3QpLFxuICAgICdBY2Nlc3MtQ29udHJvbC1BbGxvdy1NZXRob2RzJzogJ0dFVCwgUE9TVCwgREVMRVRFLCBPUFRJT05TJyxcbiAgICAnQWNjZXNzLUNvbnRyb2wtQWxsb3ctSGVhZGVycyc6ICdDb250ZW50LVR5cGUsIEF1dGhvcml6YXRpb24nLFxuICB9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gY29yc1Jlc3BvbnNlKHJlcXVlc3QpIHtcbiAgcmV0dXJuIG5ldyBSZXNwb25zZShudWxsLCB7IHN0YXR1czogMjA0LCBoZWFkZXJzOiBjb3JzSGVhZGVycyhyZXF1ZXN0KSB9KTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGpzb25SZXNwb25zZShkYXRhLCBzdGF0dXMgPSAyMDAsIHJlcXVlc3QpIHtcbiAgcmV0dXJuIG5ldyBSZXNwb25zZShKU09OLnN0cmluZ2lmeShkYXRhKSwge1xuICAgIHN0YXR1cyxcbiAgICBoZWFkZXJzOiB7ICdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicsIC4uLmNvcnNIZWFkZXJzKHJlcXVlc3QpIH0sXG4gIH0pO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZXJyb3JSZXNwb25zZShtZXNzYWdlLCBzdGF0dXMgPSA0MDAsIHJlcXVlc3QpIHtcbiAgcmV0dXJuIGpzb25SZXNwb25zZSh7IGVycm9yOiBt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
