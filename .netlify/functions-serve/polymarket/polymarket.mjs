
import {createRequire as ___nfyCreateRequire} from "module";
import {fileURLToPath as ___nfyFileURLToPath} from "url";
import {dirname as ___nfyPathDirname} from "path";
let __filename=___nfyFileURLToPath(import.meta.url);
let __dirname=___nfyPathDirname(___nfyFileURLToPath(import.meta.url));
let require=___nfyCreateRequire(import.meta.url);


// ../../../netlify/functions/polymarket.mjs
var cache = null;
var cacheExpiry = 0;
var CACHE_TTL_MS = 60 * 1e3;
var GAMMA_URL = "https://gamma-api.polymarket.com/markets?active=true&closed=false&archived=false&order=volume24hr&ascending=false&limit=40";
function safeJson(s) {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}
function normalize(raw) {
  const list = Array.isArray(raw) ? raw : [];
  const out = [];
  for (const m of list) {
    if (!m || !m.question) continue;
    let prices = m.outcomePrices;
    if (typeof prices === "string") prices = safeJson(prices);
    if (!Array.isArray(prices) || prices.length < 1) continue;
    const yesPrice = parseFloat(prices[0]);
    if (!isFinite(yesPrice)) continue;
    if (yesPrice <= 5e-3 || yesPrice >= 0.995) continue;
    let outcomes = m.outcomes;
    if (typeof outcomes === "string") outcomes = safeJson(outcomes);
    const isBinary = !Array.isArray(outcomes) || outcomes.length === 2;
    if (!isBinary) continue;
    const vol24 = Number(m.volume24hr || 0);
    if (vol24 < 100) continue;
    out.push({
      id: String(m.id || m.conditionId || ""),
      question: m.question.trim(),
      slug: m.slug || null,
      url: m.slug ? `https://polymarket.com/event/${m.slug}` : "https://polymarket.com",
      yesPrice,
      // 0..1
      yesPct: Math.round(yesPrice * 100),
      outcomes: Array.isArray(outcomes) ? outcomes : ["Yes", "No"],
      volume24hr: vol24,
      volume: Number(m.volume || 0),
      endDate: m.endDate || null,
      image: m.image || m.icon || null
    });
  }
  out.sort((a, b) => b.volume24hr - a.volume24hr);
  return out;
}
var polymarket_default = async (_req) => {
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
    const r = await fetch(GAMMA_URL, {
      headers: { accept: "application/json", "user-agent": "devils-advocate/1.0" }
    });
    if (!r.ok) throw new Error("Gamma API " + r.status);
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
    console.error("[polymarket] fetch failed:", e && e.message);
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
var config = { path: "/api/polymarket" };
export {
  config,
  polymarket_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vLi4vLi4vbmV0bGlmeS9mdW5jdGlvbnMvcG9seW1hcmtldC5tanMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8vIFBvbHltYXJrZXQgbGl2ZSBtYXJrZXRzIHByb3h5LlxuLy9cbi8vIFB1bGxzIHRyZW5kaW5nIGFjdGl2ZSBtYXJrZXRzIGZyb20gdGhlIFBvbHltYXJrZXQgR2FtbWEgQVBJIGFuZCByZXR1cm5zXG4vLyBhIG5vcm1hbGl6ZWQsIGxpZ2h0d2VpZ2h0IHNoYXBlIGZvciB0aGUgbGFuZGluZyBwYWdlIHRvIHJlbmRlci4gQ2FjaGVkXG4vLyBmb3IgNjBzIGluLW1lbW9yeSBzbyB3ZSBkb24ndCBoYW1tZXIgR2FtbWEgaWYgdGhlIHBhZ2UgZ2V0cyB0cmFmZmljLlxuLy9cbi8vIFdoeSBhIHNlcnZlciBwcm94eSBhbmQgbm90IGEgZGlyZWN0IGJyb3dzZXIgZmV0Y2g/XG4vLyAgIDEuIEdhbW1hJ3MgQ09SUyBpc24ndCByZWxpYWJseSBzZXQgZm9yIGV2ZXJ5IGVuZHBvaW50XG4vLyAgIDIuIFdlIHdhbnQgdG8gZmlsdGVyL25vcm1hbGl6ZSBzbyB0aGUgY2xpZW50IGRvZXNuJ3Qgc2hpcCBhIDIwMEtCIGJsb2Jcbi8vICAgMy4gV2UgY2FuIHN3YXAgdGhlIHVwc3RyZWFtIChHYW1tYSBcdTIxOTIgQ0xPQiBcdTIxOTIgY2FjaGVkIHNuYXBzaG90KSB3aXRob3V0XG4vLyAgICAgIHNoaXBwaW5nIGEgbmV3IGJ1aWxkIG9mIGxhbmRpbmcuaHRtbFxuXG5sZXQgY2FjaGUgPSBudWxsO1xubGV0IGNhY2hlRXhwaXJ5ID0gMDtcbmNvbnN0IENBQ0hFX1RUTF9NUyA9IDYwICogMTAwMDtcblxuY29uc3QgR0FNTUFfVVJMID1cbiAgJ2h0dHBzOi8vZ2FtbWEtYXBpLnBvbHltYXJrZXQuY29tL21hcmtldHMnICtcbiAgJz9hY3RpdmU9dHJ1ZSZjbG9zZWQ9ZmFsc2UmYXJjaGl2ZWQ9ZmFsc2UnICtcbiAgJyZvcmRlcj12b2x1bWUyNGhyJmFzY2VuZGluZz1mYWxzZSZsaW1pdD00MCc7XG5cbmZ1bmN0aW9uIHNhZmVKc29uKHMpIHtcbiAgdHJ5IHsgcmV0dXJuIEpTT04ucGFyc2Uocyk7IH0gY2F0Y2ggeyByZXR1cm4gbnVsbDsgfVxufVxuXG5mdW5jdGlvbiBub3JtYWxpemUocmF3KSB7XG4gIGNvbnN0IGxpc3QgPSBBcnJheS5pc0FycmF5KHJhdykgPyByYXcgOiBbXTtcbiAgY29uc3Qgb3V0ID0gW107XG4gIGZvciAoY29uc3QgbSBvZiBsaXN0KSB7XG4gICAgaWYgKCFtIHx8ICFtLnF1ZXN0aW9uKSBjb250aW51ZTtcblxuICAgIC8vIG91dGNvbWVQcmljZXMgc2hpcHMgYXMgYSBKU09OLWVuY29kZWQgc3RyaW5nIGxpa2UgJ1tcIjAuNjJcIixcIjAuMzhcIl0nXG4gICAgbGV0IHByaWNlcyA9IG0ub3V0Y29tZVByaWNlcztcbiAgICBpZiAodHlwZW9mIHByaWNlcyA9PT0gJ3N0cmluZycpIHByaWNlcyA9IHNhZmVKc29uKHByaWNlcyk7XG4gICAgaWYgKCFBcnJheS5pc0FycmF5KHByaWNlcykgfHwgcHJpY2VzLmxlbmd0aCA8IDEpIGNvbnRpbnVlO1xuXG4gICAgY29uc3QgeWVzUHJpY2UgPSBwYXJzZUZsb2F0KHByaWNlc1swXSk7XG4gICAgaWYgKCFpc0Zpbml0ZSh5ZXNQcmljZSkpIGNvbnRpbnVlO1xuICAgIC8vIFNraXAgbWFya2V0cyB0aGF0IGhhdmUgZWZmZWN0aXZlbHkgcmVzb2x2ZWQgKHByaWNlIGF0IDAvMTAwKSBcdTIwMTQgdGhleSdyZVxuICAgIC8vIG5vdCBpbnRlcmVzdGluZyB0byBkZWJhdGUgYW5kIHRoZXkgY3Jvd2Qgb3V0IGxpdmUgYWN0aW9uLlxuICAgIGlmICh5ZXNQcmljZSA8PSAwLjAwNSB8fCB5ZXNQcmljZSA+PSAwLjk5NSkgY29udGludWU7XG5cbiAgICAvLyBvdXRjb21lcyBzaGlwIHRoZSBzYW1lIHdheVxuICAgIGxldCBvdXRjb21lcyA9IG0ub3V0Y29tZXM7XG4gICAgaWYgKHR5cGVvZiBvdXRjb21lcyA9PT0gJ3N0cmluZycpIG91dGNvbWVzID0gc2FmZUpzb24ob3V0Y29tZXMpO1xuXG4gICAgLy8gRmlsdGVyIHRvIEJJTkFSWSBvbmx5IChZZXMvTm8pLiBQb2x5bWFya2V0IGhhcyBtdWx0aS1vdXRjb21lIG1hcmtldHNcbiAgICAvLyB3ZSdkIHJlbmRlciBpbmNvcnJlY3RseSB3aXRoIGEgc2luZ2xlIFllcyAlLlxuICAgIGNvbnN0IGlzQmluYXJ5ID0gIUFycmF5LmlzQXJyYXkob3V0Y29tZXMpIHx8IG91dGNvbWVzLmxlbmd0aCA9PT0gMjtcbiAgICBpZiAoIWlzQmluYXJ5KSBjb250aW51ZTtcblxuICAgIGNvbnN0IHZvbDI0ID0gTnVtYmVyKG0udm9sdW1lMjRociB8fCAwKTtcbiAgICAvLyBSZXF1aXJlIHNvbWUgcmVhbCBhY3Rpb24gc28gd2UgZG9uJ3Qgc2hpcCBkZWFkIG1hcmtldHMgdG8gdGhlIGxhbmRpbmdcbiAgICAvLyBwYWdlLiAkMTAwLzI0aCBpcyBhIGxvdyBiYXI7IFBvbHltYXJrZXQncyB0b3AgbWFya2V0cyBjbGVhciAkMTAwSysuXG4gICAgaWYgKHZvbDI0IDwgMTAwKSBjb250aW51ZTtcblxuICAgIG91dC5wdXNoKHtcbiAgICAgIGlkOiBTdHJpbmcobS5pZCB8fCBtLmNvbmRpdGlvbklkIHx8ICcnKSxcbiAgICAgIHF1ZXN0aW9uOiBtLnF1ZXN0aW9uLnRyaW0oKSxcbiAgICAgIHNsdWc6IG0uc2x1ZyB8fCBudWxsLFxuICAgICAgdXJsOiBtLnNsdWdcbiAgICAgICAgPyBgaHR0cHM6Ly9wb2x5bWFya2V0LmNvbS9ldmVudC8ke20uc2x1Z31gXG4gICAgICAgIDogJ2h0dHBzOi8vcG9seW1hcmtldC5jb20nLFxuICAgICAgeWVzUHJpY2UsICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyAwLi4xXG4gICAgICB5ZXNQY3Q6IE1hdGgucm91bmQoeWVzUHJpY2UgKiAxMDApLFxuICAgICAgb3V0Y29tZXM6IEFycmF5LmlzQXJyYXkob3V0Y29tZXMpID8gb3V0Y29tZXMgOiBbJ1llcycsICdObyddLFxuICAgICAgdm9sdW1lMjRocjogdm9sMjQsXG4gICAgICB2b2x1bWU6IE51bWJlcihtLnZvbHVtZSB8fCAwKSxcbiAgICAgIGVuZERhdGU6IG0uZW5kRGF0ZSB8fCBudWxsLFxuICAgICAgaW1hZ2U6IG0uaW1hZ2UgfHwgbS5pY29uIHx8IG51bGwsXG4gICAgfSk7XG4gIH1cbiAgLy8gU29ydCBieSAyNGggdm9sdW1lIGRlc2NlbmRpbmcgaW4gY2FzZSB0aGUgdXBzdHJlYW0gb3JkZXIgZHJpZnRzXG4gIG91dC5zb3J0KChhLCBiKSA9PiBiLnZvbHVtZTI0aHIgLSBhLnZvbHVtZTI0aHIpO1xuICByZXR1cm4gb3V0O1xufVxuXG5leHBvcnQgZGVmYXVsdCBhc3luYyAoX3JlcSkgPT4ge1xuICBjb25zdCBub3cgPSBEYXRlLm5vdygpO1xuICBpZiAoY2FjaGUgJiYgbm93IDwgY2FjaGVFeHBpcnkpIHtcbiAgICByZXR1cm4gbmV3IFJlc3BvbnNlKEpTT04uc3RyaW5naWZ5KGNhY2hlKSwge1xuICAgICAgaGVhZGVyczoge1xuICAgICAgICAnY29udGVudC10eXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nLFxuICAgICAgICAnY2FjaGUtY29udHJvbCc6ICdwdWJsaWMsIG1heC1hZ2U9NjAnLFxuICAgICAgICAnYWNjZXNzLWNvbnRyb2wtYWxsb3ctb3JpZ2luJzogJyonLFxuICAgICAgfSxcbiAgICB9KTtcbiAgfVxuXG4gIHRyeSB7XG4gICAgY29uc3QgciA9IGF3YWl0IGZldGNoKEdBTU1BX1VSTCwge1xuICAgICAgaGVhZGVyczogeyBhY2NlcHQ6ICdhcHBsaWNhdGlvbi9qc29uJywgJ3VzZXItYWdlbnQnOiAnZGV2aWxzLWFkdm9jYXRlLzEuMCcgfSxcbiAgICB9KTtcbiAgICBpZiAoIXIub2spIHRocm93IG5ldyBFcnJvcignR2FtbWEgQVBJICcgKyByLnN0YXR1cyk7XG4gICAgY29uc3QgcmF3ID0gYXdhaXQgci5qc29uKCk7XG4gICAgY29uc3QgbWFya2V0cyA9IG5vcm1hbGl6ZShyYXcpLnNsaWNlKDAsIDI0KTtcblxuICAgIGNhY2hlID0geyBtYXJrZXRzLCBmZXRjaGVkQXQ6IG5vdywgY291bnQ6IG1hcmtldHMubGVuZ3RoIH07XG4gICAgY2FjaGVFeHBpcnkgPSBub3cgKyBDQUNIRV9UVExfTVM7XG5cbiAgICByZXR1cm4gbmV3IFJlc3BvbnNlKEpTT04uc3RyaW5naWZ5KGNhY2hlKSwge1xuICAgICAgaGVhZGVyczoge1xuICAgICAgICAnY29udGVudC10eXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nLFxuICAgICAgICAnY2FjaGUtY29udHJvbCc6ICdwdWJsaWMsIG1heC1hZ2U9NjAnLFxuICAgICAgICAnYWNjZXNzLWNvbnRyb2wtYWxsb3ctb3JpZ2luJzogJyonLFxuICAgICAgfSxcbiAgICB9KTtcbiAgfSBjYXRjaCAoZSkge1xuICAgIC8vIERvbid0IDUwMCB0aGUgcGFnZSBcdTIwMTQgcmV0dXJuIGFuIGVtcHR5IGxpc3QgYW5kIGxldCB0aGUgY2xpZW50IHNob3cgYVxuICAgIC8vIGdyYWNlZnVsIGZhbGxiYWNrLiBXZSBsb2cgdGhlIGVycm9yIGZvciBkZWJ1Z2dpbmcuXG4gICAgY29uc29sZS5lcnJvcignW3BvbHltYXJrZXRdIGZldGNoIGZhaWxlZDonLCBlICYmIGUubWVzc2FnZSk7XG4gICAgcmV0dXJuIG5ldyBSZXNwb25zZShcbiAgICAgIEpTT04uc3RyaW5naWZ5KHsgbWFya2V0czogW10sIGZldGNoZWRBdDogbm93LCBjb3VudDogMCwgZXJyb3I6IFN0cmluZyhlICYmIGUubWVzc2FnZSB8fCBlKSB9KSxcbiAgICAgIHtcbiAgICAgICAgc3RhdHVzOiAyMDAsXG4gICAgICAgIGhlYWRlcnM6IHtcbiAgICAgICAgICAnY29udGVudC10eXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nLFxuICAgICAgICAgICdjYWNoZS1jb250cm9sJzogJ25vLXN0b3JlJyxcbiAgICAgICAgICAnYWNjZXNzLWNvbnRyb2wtYWxsb3ctb3JpZ2luJzogJyonLFxuICAgICAgICB9LFxuICAgICAgfVxuICAgICk7XG4gIH1cbn07XG5cbmV4cG9ydCBjb25zdCBjb25maWcgPSB7IHBhdGg6ICcvYXBpL3BvbHltYXJrZXQnIH07XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7O0FBWUEsSUFBSSxRQUFRO0FBQ1osSUFBSSxjQUFjO0FBQ2xCLElBQU0sZUFBZSxLQUFLO0FBRTFCLElBQU0sWUFDSjtBQUlGLFNBQVMsU0FBUyxHQUFHO0FBQ25CLE1BQUk7QUFBRSxXQUFPLEtBQUssTUFBTSxDQUFDO0FBQUEsRUFBRyxRQUFRO0FBQUUsV0FBTztBQUFBLEVBQU07QUFDckQ7QUFFQSxTQUFTLFVBQVUsS0FBSztBQUN0QixRQUFNLE9BQU8sTUFBTSxRQUFRLEdBQUcsSUFBSSxNQUFNLENBQUM7QUFDekMsUUFBTSxNQUFNLENBQUM7QUFDYixhQUFXLEtBQUssTUFBTTtBQUNwQixRQUFJLENBQUMsS0FBSyxDQUFDLEVBQUUsU0FBVTtBQUd2QixRQUFJLFNBQVMsRUFBRTtBQUNmLFFBQUksT0FBTyxXQUFXLFNBQVUsVUFBUyxTQUFTLE1BQU07QUFDeEQsUUFBSSxDQUFDLE1BQU0sUUFBUSxNQUFNLEtBQUssT0FBTyxTQUFTLEVBQUc7QUFFakQsVUFBTSxXQUFXLFdBQVcsT0FBTyxDQUFDLENBQUM7QUFDckMsUUFBSSxDQUFDLFNBQVMsUUFBUSxFQUFHO0FBR3pCLFFBQUksWUFBWSxRQUFTLFlBQVksTUFBTztBQUc1QyxRQUFJLFdBQVcsRUFBRTtBQUNqQixRQUFJLE9BQU8sYUFBYSxTQUFVLFlBQVcsU0FBUyxRQUFRO0FBSTlELFVBQU0sV0FBVyxDQUFDLE1BQU0sUUFBUSxRQUFRLEtBQUssU0FBUyxXQUFXO0FBQ2pFLFFBQUksQ0FBQyxTQUFVO0FBRWYsVUFBTSxRQUFRLE9BQU8sRUFBRSxjQUFjLENBQUM7QUFHdEMsUUFBSSxRQUFRLElBQUs7QUFFakIsUUFBSSxLQUFLO0FBQUEsTUFDUCxJQUFJLE9BQU8sRUFBRSxNQUFNLEVBQUUsZUFBZSxFQUFFO0FBQUEsTUFDdEMsVUFBVSxFQUFFLFNBQVMsS0FBSztBQUFBLE1BQzFCLE1BQU0sRUFBRSxRQUFRO0FBQUEsTUFDaEIsS0FBSyxFQUFFLE9BQ0gsZ0NBQWdDLEVBQUUsSUFBSSxLQUN0QztBQUFBLE1BQ0o7QUFBQTtBQUFBLE1BQ0EsUUFBUSxLQUFLLE1BQU0sV0FBVyxHQUFHO0FBQUEsTUFDakMsVUFBVSxNQUFNLFFBQVEsUUFBUSxJQUFJLFdBQVcsQ0FBQyxPQUFPLElBQUk7QUFBQSxNQUMzRCxZQUFZO0FBQUEsTUFDWixRQUFRLE9BQU8sRUFBRSxVQUFVLENBQUM7QUFBQSxNQUM1QixTQUFTLEVBQUUsV0FBVztBQUFBLE1BQ3RCLE9BQU8sRUFBRSxTQUFTLEVBQUUsUUFBUTtBQUFBLElBQzlCLENBQUM7QUFBQSxFQUNIO0FBRUEsTUFBSSxLQUFLLENBQUMsR0FBRyxNQUFNLEVBQUUsYUFBYSxFQUFFLFVBQVU7QUFDOUMsU0FBTztBQUNUO0FBRUEsSUFBTyxxQkFBUSxPQUFPLFNBQVM7QUFDN0IsUUFBTSxNQUFNLEtBQUssSUFBSTtBQUNyQixNQUFJLFNBQVMsTUFBTSxhQUFhO0FBQzlCLFdBQU8sSUFBSSxTQUFTLEtBQUssVUFBVSxLQUFLLEdBQUc7QUFBQSxNQUN6QyxTQUFTO0FBQUEsUUFDUCxnQkFBZ0I7QUFBQSxRQUNoQixpQkFBaUI7QUFBQSxRQUNqQiwrQkFBK0I7QUFBQSxNQUNqQztBQUFBLElBQ0YsQ0FBQztBQUFBLEVBQ0g7QUFFQSxNQUFJO0FBQ0YsVUFBTSxJQUFJLE1BQU0sTUFBTSxXQUFXO0FBQUEsTUFDL0IsU0FBUyxFQUFFLFFBQVEsb0JBQW9CLGNBQWMsc0JBQXNCO0FBQUEsSUFDN0UsQ0FBQztBQUNELFFBQUksQ0FBQyxFQUFFLEdBQUksT0FBTSxJQUFJLE1BQU0sZUFBZSxFQUFFLE1BQU07QUFDbEQsVUFBTSxNQUFNLE1BQU0sRUFBRSxLQUFLO0FBQ3pCLFVBQU0sVUFBVSxVQUFVLEdBQUcsRUFBRSxNQUFNLEdBQUcsRUFBRTtBQUUxQyxZQUFRLEVBQUUsU0FBUyxXQUFXLEtBQUssT0FBTyxRQUFRLE9BQU87QUFDekQsa0JBQWMsTUFBTTtBQUVwQixXQUFPLElBQUksU0FBUyxLQUFLLFVBQVUsS0FBSyxHQUFHO0FBQUEsTUFDekMsU0FBUztBQUFBLFFBQ1AsZ0JBQWdCO0FBQUEsUUFDaEIsaUJBQWlCO0FBQUEsUUFDakIsK0JBQStCO0FBQUEsTUFDakM7QUFBQSxJQUNGLENBQUM7QUFBQSxFQUNILFNBQVMsR0FBRztBQUdWLFlBQVEsTUFBTSw4QkFBOEIsS0FBSyxFQUFFLE9BQU87QUFDMUQsV0FBTyxJQUFJO0FBQUEsTUFDVCxLQUFLLFVBQVUsRUFBRSxTQUFTLENBQUMsR0FBRyxXQUFXLEtBQUssT0FBTyxHQUFHLE9BQU8sT0FBTyxLQUFLLEVBQUUsV0FBVyxDQUFDLEVBQUUsQ0FBQztBQUFBLE1BQzVGO0FBQUEsUUFDRSxRQUFRO0FBQUEsUUFDUixTQUFTO0FBQUEsVUFDUCxnQkFBZ0I7QUFBQSxVQUNoQixpQkFBaUI7QUFBQSxVQUNqQiwrQkFBK0I7QUFBQSxRQUNqQztBQUFBLE1BQ0Y7QUFBQSxJQUNGO0FBQUEsRUFDRjtBQUNGO0FBRU8sSUFBTSxTQUFTLEVBQUUsTUFBTSxrQkFBa0I7IiwKICAibmFtZXMiOiBbXQp9Cg==
