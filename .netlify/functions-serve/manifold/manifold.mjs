
import {createRequire as ___nfyCreateRequire} from "module";
import {fileURLToPath as ___nfyFileURLToPath} from "url";
import {dirname as ___nfyPathDirname} from "path";
let __filename=___nfyFileURLToPath(import.meta.url);
let __dirname=___nfyPathDirname(___nfyFileURLToPath(import.meta.url));
let require=___nfyCreateRequire(import.meta.url);


// ../../../netlify/functions/manifold.mjs
var cache = null;
var cacheExpiry = 0;
var CACHE_TTL_MS = 60 * 1e3;
var MANIFOLD_URL = "https://api.manifold.markets/v0/search-markets?term=&sort=score&filter=open&contractType=BINARY&limit=60";
function normalize(raw) {
  const list = Array.isArray(raw) ? raw : [];
  const out = [];
  for (const m of list) {
    if (!m || !m.question) continue;
    if (m.outcomeType !== "BINARY" && m.outcomeType !== void 0) continue;
    if (m.isResolved) continue;
    const p = typeof m.probability === "number" ? m.probability : null;
    if (p == null || !isFinite(p)) continue;
    if (p <= 0.01 || p >= 0.99) continue;
    const v24 = Number(m.volume24Hours || 0);
    if (v24 < 5) continue;
    out.push({
      id: String(m.id || ""),
      question: String(m.question).trim(),
      slug: m.slug || null,
      url: m.url || (m.slug && m.creatorUsername ? `https://manifold.markets/${m.creatorUsername}/${m.slug}` : "https://manifold.markets"),
      yesPrice: p,
      yesPct: Math.round(p * 100),
      outcomes: ["Yes", "No"],
      // Manifold uses "volume24Hours" — we normalize to volume24hr to match
      // the Polymarket shape so the landing page card is source-agnostic.
      volume24hr: Number(m.volume24Hours || 0),
      volume: Number(m.volume || 0),
      endDate: m.closeTime ? new Date(m.closeTime).toISOString() : null,
      image: m.coverImageUrl || null,
      // tag we use client-side for filter chips + the "source" badge
      source: "manifold"
    });
  }
  out.sort((a, b) => b.volume24hr - a.volume24hr);
  return out;
}
var manifold_default = async (_req) => {
  const now = Date.now();
  if (cache && now < cacheExpiry) {
    return new Response(JSON.stringify(cache), {
      headers: {
        "content-type": "application/json",
        "cache-control": "public, max-age=60",
        "access-control-allow-origin": "*"
      }
    });
  }
  try {
    const r = await fetch(MANIFOLD_URL, {
      headers: { accept: "application/json", "user-agent": "devils-advocate/1.0" }
    });
    if (!r.ok) throw new Error("Manifold API " + r.status);
    const raw = await r.json();
    const markets = normalize(raw).slice(0, 24);
    cache = { markets, fetchedAt: now, count: markets.length };
    cacheExpiry = now + CACHE_TTL_MS;
    return new Response(JSON.stringify(cache), {
      headers: {
        "content-type": "application/json",
        "cache-control": "public, max-age=60",
        "access-control-allow-origin": "*"
      }
    });
  } catch (e) {
    console.error("[manifold] fetch failed:", e && e.message);
    return new Response(
      JSON.stringify({ markets: [], fetchedAt: now, count: 0, error: String(e && e.message || e) }),
      {
        status: 200,
        headers: {
          "content-type": "application/json",
          "cache-control": "no-store",
          "access-control-allow-origin": "*"
        }
      }
    );
  }
};
var config = { path: "/api/manifold" };
export {
  config,
  manifold_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vLi4vLi4vbmV0bGlmeS9mdW5jdGlvbnMvbWFuaWZvbGQubWpzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvLyBNYW5pZm9sZCBNYXJrZXRzIGxpdmUgbWFya2V0cyBwcm94eS5cbi8vXG4vLyBNYW5pZm9sZCBpcyB0aGUgcGxheS1tb25leSBzaXN0ZXIgdG8gUG9seW1hcmtldCBcdTIwMTQgaW5kaWUsIGludGVsbGVjdHVhbGx5XG4vLyBwbGF5ZnVsLCBydW4gYnkgcGVvcGxlIHdobydkIGxvdmUgYmVpbmcgZmVhdHVyZWQgbmV4dCB0byBQb2x5bWFya2V0IG9uXG4vLyBvdXIgbGFuZGluZyBwYWdlLiBJdHMgcHVibGljIEFQSSBpcyBmcmllbmRsaWVyIHRoYW4gR2FtbWE6XG4vLyAgIEdFVCBodHRwczovL2FwaS5tYW5pZm9sZC5tYXJrZXRzL3YwL21hcmtldHM/bGltaXQ9MTAwXG4vLyAgIEdFVCBodHRwczovL2FwaS5tYW5pZm9sZC5tYXJrZXRzL3YwL3NlYXJjaC1tYXJrZXRzP3Rlcm09Li4uJmxpbWl0PTIwXG4vL1xuLy8gV2UgcHVsbCByZWNlbnQgYWN0aXZlIGJpbmFyeSBtYXJrZXRzLCBzb3J0IGJ5IDI0aCB0cmFkZSB2b2x1bWUsIGFuZFxuLy8gbm9ybWFsaXplIHRvIHRoZSBzYW1lIHNoYXBlIGFzIC9hcGkvcG9seW1hcmtldCBzbyB0aGUgbGFuZGluZyBwYWdlXG4vLyBjYW4gcmVuZGVyIGJvdGggd2l0aCBvbmUgY2FyZCBjb21wb25lbnQuXG5cbmxldCBjYWNoZSA9IG51bGw7XG5sZXQgY2FjaGVFeHBpcnkgPSAwO1xuY29uc3QgQ0FDSEVfVFRMX01TID0gNjAgKiAxMDAwO1xuXG5jb25zdCBNQU5JRk9MRF9VUkwgPVxuICAnaHR0cHM6Ly9hcGkubWFuaWZvbGQubWFya2V0cy92MC9zZWFyY2gtbWFya2V0cycgK1xuICAnP3Rlcm09JnNvcnQ9c2NvcmUmZmlsdGVyPW9wZW4mY29udHJhY3RUeXBlPUJJTkFSWSZsaW1pdD02MCc7XG5cbmZ1bmN0aW9uIG5vcm1hbGl6ZShyYXcpIHtcbiAgY29uc3QgbGlzdCA9IEFycmF5LmlzQXJyYXkocmF3KSA/IHJhdyA6IFtdO1xuICBjb25zdCBvdXQgPSBbXTtcbiAgZm9yIChjb25zdCBtIG9mIGxpc3QpIHtcbiAgICBpZiAoIW0gfHwgIW0ucXVlc3Rpb24pIGNvbnRpbnVlO1xuICAgIGlmIChtLm91dGNvbWVUeXBlICE9PSAnQklOQVJZJyAmJiBtLm91dGNvbWVUeXBlICE9PSB1bmRlZmluZWQpIGNvbnRpbnVlO1xuICAgIGlmIChtLmlzUmVzb2x2ZWQpIGNvbnRpbnVlO1xuXG4gICAgLy8gTWFuaWZvbGQgcmV0dXJucyBwcm9iYWJpbGl0eSBhcyBhIDAuLjEgZmxvYXRcbiAgICBjb25zdCBwID0gdHlwZW9mIG0ucHJvYmFiaWxpdHkgPT09ICdudW1iZXInID8gbS5wcm9iYWJpbGl0eSA6IG51bGw7XG4gICAgaWYgKHAgPT0gbnVsbCB8fCAhaXNGaW5pdGUocCkpIGNvbnRpbnVlO1xuICAgIC8vIERyb3AgZWZmZWN0aXZlbHktcmVzb2x2ZWQgbWFya2V0cyBcdTIwMTQgYm9yaW5nIHRvIGRlYmF0ZVxuICAgIGlmIChwIDw9IDAuMDEgfHwgcCA+PSAwLjk5KSBjb250aW51ZTtcbiAgICAvLyBEcm9wIGRlYWQgbWFya2V0cyB3aXRoIHplcm8gcmVjZW50IGFjdGlvblxuICAgIGNvbnN0IHYyNCA9IE51bWJlcihtLnZvbHVtZTI0SG91cnMgfHwgMCk7XG4gICAgaWYgKHYyNCA8IDUpIGNvbnRpbnVlO1xuXG4gICAgb3V0LnB1c2goe1xuICAgICAgaWQ6IFN0cmluZyhtLmlkIHx8ICcnKSxcbiAgICAgIHF1ZXN0aW9uOiBTdHJpbmcobS5xdWVzdGlvbikudHJpbSgpLFxuICAgICAgc2x1ZzogbS5zbHVnIHx8IG51bGwsXG4gICAgICB1cmw6IG0udXJsIHx8IChtLnNsdWcgJiYgbS5jcmVhdG9yVXNlcm5hbWVcbiAgICAgICAgPyBgaHR0cHM6Ly9tYW5pZm9sZC5tYXJrZXRzLyR7bS5jcmVhdG9yVXNlcm5hbWV9LyR7bS5zbHVnfWBcbiAgICAgICAgOiAnaHR0cHM6Ly9tYW5pZm9sZC5tYXJrZXRzJyksXG4gICAgICB5ZXNQcmljZTogcCxcbiAgICAgIHllc1BjdDogTWF0aC5yb3VuZChwICogMTAwKSxcbiAgICAgIG91dGNvbWVzOiBbJ1llcycsICdObyddLFxuICAgICAgLy8gTWFuaWZvbGQgdXNlcyBcInZvbHVtZTI0SG91cnNcIiBcdTIwMTQgd2Ugbm9ybWFsaXplIHRvIHZvbHVtZTI0aHIgdG8gbWF0Y2hcbiAgICAgIC8vIHRoZSBQb2x5bWFya2V0IHNoYXBlIHNvIHRoZSBsYW5kaW5nIHBhZ2UgY2FyZCBpcyBzb3VyY2UtYWdub3N0aWMuXG4gICAgICB2b2x1bWUyNGhyOiBOdW1iZXIobS52b2x1bWUyNEhvdXJzIHx8IDApLFxuICAgICAgdm9sdW1lOiBOdW1iZXIobS52b2x1bWUgfHwgMCksXG4gICAgICBlbmREYXRlOiBtLmNsb3NlVGltZSA/IG5ldyBEYXRlKG0uY2xvc2VUaW1lKS50b0lTT1N0cmluZygpIDogbnVsbCxcbiAgICAgIGltYWdlOiBtLmNvdmVySW1hZ2VVcmwgfHwgbnVsbCxcbiAgICAgIC8vIHRhZyB3ZSB1c2UgY2xpZW50LXNpZGUgZm9yIGZpbHRlciBjaGlwcyArIHRoZSBcInNvdXJjZVwiIGJhZGdlXG4gICAgICBzb3VyY2U6ICdtYW5pZm9sZCcsXG4gICAgfSk7XG4gIH1cbiAgLy8gU29ydCBieSAyNGggdm9sdW1lIGRlc2NlbmRpbmcgc28gdGhlIGJpZ2dlc3QgYWN0aW9uIGZsb2F0cyB1cFxuICBvdXQuc29ydCgoYSwgYikgPT4gYi52b2x1bWUyNGhyIC0gYS52b2x1bWUyNGhyKTtcbiAgcmV0dXJuIG91dDtcbn1cblxuZXhwb3J0IGRlZmF1bHQgYXN5bmMgKF9yZXEpID0+IHtcbiAgY29uc3Qgbm93ID0gRGF0ZS5ub3coKTtcbiAgaWYgKGNhY2hlICYmIG5vdyA8IGNhY2hlRXhwaXJ5KSB7XG4gICAgcmV0dXJuIG5ldyBSZXNwb25zZShKU09OLnN0cmluZ2lmeShjYWNoZSksIHtcbiAgICAgIGhlYWRlcnM6IHtcbiAgICAgICAgJ2NvbnRlbnQtdHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyxcbiAgICAgICAgJ2NhY2hlLWNvbnRyb2wnOiAncHVibGljLCBtYXgtYWdlPTYwJyxcbiAgICAgICAgJ2FjY2Vzcy1jb250cm9sLWFsbG93LW9yaWdpbic6ICcqJyxcbiAgICAgIH0sXG4gICAgfSk7XG4gIH1cblxuICB0cnkge1xuICAgIGNvbnN0IHIgPSBhd2FpdCBmZXRjaChNQU5JRk9MRF9VUkwsIHtcbiAgICAgIGhlYWRlcnM6IHsgYWNjZXB0OiAnYXBwbGljYXRpb24vanNvbicsICd1c2VyLWFnZW50JzogJ2Rldmlscy1hZHZvY2F0ZS8xLjAnIH0sXG4gICAgfSk7XG4gICAgaWYgKCFyLm9rKSB0aHJvdyBuZXcgRXJyb3IoJ01hbmlmb2xkIEFQSSAnICsgci5zdGF0dXMpO1xuICAgIGNvbnN0IHJhdyA9IGF3YWl0IHIuanNvbigpO1xuICAgIGNvbnN0IG1hcmtldHMgPSBub3JtYWxpemUocmF3KS5zbGljZSgwLCAyNCk7XG5cbiAgICBjYWNoZSA9IHsgbWFya2V0cywgZmV0Y2hlZEF0OiBub3csIGNvdW50OiBtYXJrZXRzLmxlbmd0aCB9O1xuICAgIGNhY2hlRXhwaXJ5ID0gbm93ICsgQ0FDSEVfVFRMX01TO1xuXG4gICAgcmV0dXJuIG5ldyBSZXNwb25zZShKU09OLnN0cmluZ2lmeShjYWNoZSksIHtcbiAgICAgIGhlYWRlcnM6IHtcbiAgICAgICAgJ2NvbnRlbnQtdHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyxcbiAgICAgICAgJ2NhY2hlLWNvbnRyb2wnOiAncHVibGljLCBtYXgtYWdlPTYwJyxcbiAgICAgICAgJ2FjY2Vzcy1jb250cm9sLWFsbG93LW9yaWdpbic6ICcqJyxcbiAgICAgIH0sXG4gICAgfSk7XG4gIH0gY2F0Y2ggKGUpIHtcbiAgICBjb25zb2xlLmVycm9yKCdbbWFuaWZvbGRdIGZldGNoIGZhaWxlZDonLCBlICYmIGUubWVzc2FnZSk7XG4gICAgcmV0dXJuIG5ldyBSZXNwb25zZShcbiAgICAgIEpTT04uc3RyaW5naWZ5KHsgbWFya2V0czogW10sIGZldGNoZWRBdDogbm93LCBjb3VudDogMCwgZXJyb3I6IFN0cmluZyhlICYmIGUubWVzc2FnZSB8fCBlKSB9KSxcbiAgICAgIHtcbiAgICAgICAgc3RhdHVzOiAyMDAsXG4gICAgICAgIGhlYWRlcnM6IHtcbiAgICAgICAgICAnY29udGVudC10eXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nLFxuICAgICAgICAgICdjYWNoZS1jb250cm9sJzogJ25vLXN0b3JlJyxcbiAgICAgICAgICAnYWNjZXNzLWNvbnRyb2wtYWxsb3ctb3JpZ2luJzogJyonLFxuICAgICAgICB9LFxuICAgICAgfVxuICAgICk7XG4gIH1cbn07XG5cbmV4cG9ydCBjb25zdCBjb25maWcgPSB7IHBhdGg6ICcvYXBpL21hbmlmb2xkJyB9O1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7OztBQVlBLElBQUksUUFBUTtBQUNaLElBQUksY0FBYztBQUNsQixJQUFNLGVBQWUsS0FBSztBQUUxQixJQUFNLGVBQ0o7QUFHRixTQUFTLFVBQVUsS0FBSztBQUN0QixRQUFNLE9BQU8sTUFBTSxRQUFRLEdBQUcsSUFBSSxNQUFNLENBQUM7QUFDekMsUUFBTSxNQUFNLENBQUM7QUFDYixhQUFXLEtBQUssTUFBTTtBQUNwQixRQUFJLENBQUMsS0FBSyxDQUFDLEVBQUUsU0FBVTtBQUN2QixRQUFJLEVBQUUsZ0JBQWdCLFlBQVksRUFBRSxnQkFBZ0IsT0FBVztBQUMvRCxRQUFJLEVBQUUsV0FBWTtBQUdsQixVQUFNLElBQUksT0FBTyxFQUFFLGdCQUFnQixXQUFXLEVBQUUsY0FBYztBQUM5RCxRQUFJLEtBQUssUUFBUSxDQUFDLFNBQVMsQ0FBQyxFQUFHO0FBRS9CLFFBQUksS0FBSyxRQUFRLEtBQUssS0FBTTtBQUU1QixVQUFNLE1BQU0sT0FBTyxFQUFFLGlCQUFpQixDQUFDO0FBQ3ZDLFFBQUksTUFBTSxFQUFHO0FBRWIsUUFB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
