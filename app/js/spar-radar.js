/* spar-radar.js
 *
 * Live debate matchmaking radar.
 *
 * Replaces the rotating world-globe on /spar's searching state. The
 * globe was reading as "generic Web3 visualization" — geographically
 * accurate but emotionally illegible. This swaps the metaphor: instead
 * of "look at the world map of debaters," show "the matchmaker is
 * actively looking for your opponent."
 *
 * What it draws (back-to-front):
 *   1. Faint grid wash (very low opacity, gives the disc texture)
 *   2. Three concentric range rings (thin crimson, equally faint)
 *   3. Twelve compass tick marks at the outer ring
 *   4. A slow-rotating radar sweep arm (single line, gradient fade)
 *   5. 6–9 debater nodes drifting on slow orbital paths at different
 *      radii. Each node is a small dot with a 2-3 char handle initial
 *      next to it (so the user reads "people," not "particles").
 *   6. Intermittent "match attempt" arcs that form between two nearby
 *      nodes, glow briefly, and fade. Reads as the matchmaker probing
 *      pairings.
 *   7. A center "you" pulse — slightly larger dot, brighter, slow
 *      breath. The user is implicitly at the center of the search.
 *
 * No data dependency. Self-contained. Honors prefers-reduced-motion.
 *
 * Public API:
 *   SparRadar.mount(canvasEl, opts?)
 *     opts.accent       — base color (default '#ef4444')
 *     opts.accentDim    — dimmed variant (default 'rgba(239,68,68,.32)')
 *     opts.nodeCount    — how many drifting debater nodes (default 8)
 *     opts.sweepSec     — radar sweep full rotation in seconds (default 6.5)
 *     opts.matchEverySec — average seconds between "match attempt" arcs
 *                         (default 2.4, jittered ±35%)
 *   Returns: { stop(): void }
 */

(function (global) {
  'use strict';

  // Sample debater handles. NOT real users — just gives the dots a name
  // tag so the visual reads as "people in the system" rather than
  // "abstract particles." Mirrors the RECENT_PAIRINGS list on spar.html
  // so the language stays consistent across the page.
  var HANDLE_POOL = [
    'flow_nerd', 'kant_kid', 'pmr_collapse', 'card_doctor',
    'wsdc_2nd', 'whip_speaker', 'redteam', '1ar_collapse',
    'kritik_fan', 'topicality_god', 'housing_wonk', 'value_crit',
    'first_gen_voice', 'firstround', 'nsda_qual', 'national_champ',
  ];

  // RNG with a fixed seed so the radar layout is stable across rerenders
  // within a session. Different seeds per node, so each node has its own
  // orbit speed and phase but the *set* of orbits is deterministic.
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function mount(canvas, opts) {
    if (!canvas || !canvas.getContext) {
      return { stop: function(){} };
    }
    opts = opts || {};
    var accent       = opts.accent       || '#ef4444';
    var accentDim    = opts.accentDim    || 'rgba(239,68,68,.32)';
    var nodeCount    = Math.max(4, Math.min(12, opts.nodeCount || 8));
    var sweepSec     = opts.sweepSec     || 6.5;
    var matchEverySec = opts.matchEverySec || 2.4;

    var ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return { stop: function(){} };

    var dpr = Math.max(1, Math.min(2, global.devicePixelRatio || 1));
    var reduceMotion = global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Theme-aware palette. The renderer reads data-theme on <html> at
    // mount; doesn't re-read mid-frame, so users who flip themes mid-
    // search keep the original palette until they navigate. Acceptable
    // since the searching state is short-lived.
    var theme = (global.document && global.document.documentElement.getAttribute('data-theme')) || 'crimson';
    var isLight = theme === 'light';
    var pal = isLight ? {
      gridStroke:   'rgba(125,95,45,.08)',
      ringMain:     'rgba(125,95,45,.42)',
      ringRim:      'rgba(125,95,45,.70)',
      tickStroke:   'rgba(125,95,45,.55)',
      sweepRgb:     '125,95,45',
      sweepLead:    'rgba(125,95,45,.85)',
      sweepLeadEnd: 'rgba(125,95,45,0)',
      nodeHaloIn:   'rgba(125,95,45,.55)',
      nodeHaloOut:  'rgba(125,95,45,0)',
      nodeCore:     '#5f4621',
      nodeTag:      'rgba(40,30,15,.65)',
      arcStroke:    'rgba(95,70,33,.85)',
      arcShadow:    '#7d5f2d',
      centerHaloIn: 'rgba(125,95,45,.65)',
      centerHaloOut:'rgba(125,95,45,0)',
      centerRing:   'rgba(95,70,33,.75)',
      centerCore:   '#3a2a14',
    } : {
      gridStroke:   'rgba(255,255,255,.025)',
      ringMain:     accentDim,
      ringRim:      'rgba(239,68,68,.55)',
      tickStroke:   accentDim,
      sweepRgb:     '239,68,68',
      sweepLead:    'rgba(255,200,200,.85)',
      sweepLeadEnd: 'rgba(239,68,68,0)',
      nodeHaloIn:   'rgba(255,170,170,.55)',
      nodeHaloOut:  'rgba(239,68,68,0)',
      nodeCore:     '#ffe6e6',
      nodeTag:      'rgba(255,255,255,.55)',
      arcStroke:    'rgba(255,210,210,.65)',
      arcShadow:    accent,
      centerHaloIn: 'rgba(255,200,200,.65)',
      centerHaloOut:'rgba(239,68,68,0)',
      centerRing:   'rgba(255,140,140,.65)',
      centerCore:   '#fff',
    };

    // Sizing follows the canvas's CSS box. parent owns layout (.globe-frame).
    // We sync the internal bitmap to the CSS size × dpr.
    var W = 1, H = 1, CX = 0, CY = 0, R = 1;
    function resize() {
      var rect = canvas.getBoundingClientRect();
      var w = Math.max(40, rect.width);
      var h = Math.max(40, rect.height);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      W = w; H = h;
      CX = w / 2; CY = h / 2;
      // Outer ring sits a hair inside the disc to leave room for halos.
      R = Math.min(w, h) * 0.46;
    }
    resize();
    var ro = null;
    if (global.ResizeObserver) {
      ro = new global.ResizeObserver(resize);
      ro.observe(canvas);
    } else {
      global.addEventListener('resize', resize);
    }

    // Build the orbit set.
    var rand = mulberry32(0xC0FFEE);
    var nodes = [];
    for (var i = 0; i < nodeCount; i++) {
      // Three orbit bands so nodes don't all clump at one radius.
      var bandIdx = i % 3;
      var radiusFrac = [0.42, 0.68, 0.92][bandIdx];
      // Mix of slow CW + CCW orbits.
      var dir = (i % 2 === 0) ? 1 : -1;
      // Period 22–46s — slow enough that the eye sees "drift," not "spin."
      var periodSec = 22 + rand() * 24;
      nodes.push({
        idx: i,
        radius: radiusFrac,
        phase: rand() * Math.PI * 2,
        omega: dir * (Math.PI * 2) / periodSec, // rad / sec
        handle: HANDLE_POOL[i % HANDLE_POOL.length],
        // Tiny radial wobble so the orbit doesn't read as a perfect circle.
        wobbleAmp: 0.012 + rand() * 0.018,
        wobbleHz: 0.07 + rand() * 0.10,
        wobblePhase: rand() * Math.PI * 2,
      });
    }

    // Match-attempt arc state. We pick two nodes, draw a glowing arc
    // between them for ~900ms, then fade out, then wait a randomized
    // gap before the next attempt. Gives the search a rhythm of
    // "probe → reject → probe" without ever resolving (until the real
    // matchmaker fires the actual match-found event from outside).
    var nextMatchAt = 0;   // ms timestamp
    var activeMatch = null; // { a, b, startedAt, durationMs }
    function scheduleNextMatch(nowMs) {
      var jitter = 0.65 + Math.random() * 0.70; // ±35%
      nextMatchAt = nowMs + matchEverySec * 1000 * jitter;
    }
    scheduleNextMatch(performance.now() + 600); // gentle first beat

    // Lock-on state. When renderMatched fires, we call radarHandle.lockOn()
    // to play the cinematic "we found someone" beat — all drifting nodes
    // ease toward center, the sweep arm fades to zero, a single expanding
    // ring pulses outward from center, and the "you" pulse brightens.
    // Total duration ~1100ms. Caller waits ~700-800ms then swaps the
    // page markup so the beat carries the transition.
    var lockState = null; // { startedAt, durationMs }
    function startLockOn() {
      if (lockState) return; // idempotent — second call is a no-op
      lockState = { startedAt: performance.now(), durationMs: 1100 };
    }

    // ease-out cubic — fast pull at the start, soft settle at the end.
    function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }

    // Compute a node's current (x, y) in canvas coords. During a lockOn
    // beat the position eases toward center based on lockState progress,
    // so the same nodePos call is used by both paintNodes and paintMatchArc
    // and they stay in sync.
    function nodePos(n, tSec) {
      var theta = n.phase + n.omega * tSec;
      var wobble = Math.sin(tSec * 2 * Math.PI * n.wobbleHz + n.wobblePhase) * n.wobbleAmp;
      var r = R * (n.radius + wobble);
      if (lockState) {
        var lt = Math.min(1, (performance.now() - lockState.startedAt) / lockState.durationMs);
        // Pull from current radius down to ~12% of R as the lock progresses.
        var pull = easeOutCubic(lt);
        r = r * (1 - pull) + (R * 0.12) * pull;
      }
      return { x: CX + Math.cos(theta) * r, y: CY + Math.sin(theta) * r };
    }

    // ── Layer painters ─────────────────────────────────────────────

    function paintGrid() {
      // Faint square grid clipped to the radar disc. Reads as "instrument
      // glass," very low contrast. 16 cells per side.
      ctx.save();
      ctx.beginPath();
      ctx.arc(CX, CY, R + 4, 0, Math.PI * 2);
      ctx.clip();
      ctx.strokeStyle = pal.gridStroke;
      ctx.lineWidth = 1;
      var step = (R * 2) / 16;
      for (var i = -8; i <= 8; i++) {
        var v = i * step;
        ctx.beginPath();
        ctx.moveTo(CX - R, CY + v); ctx.lineTo(CX + R, CY + v);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(CX + v, CY - R); ctx.lineTo(CX + v, CY + R);
        ctx.stroke();
      }
      ctx.restore();
    }

    function paintRings() {
      // Three concentric range rings + outer rim.
      ctx.strokeStyle = pal.ringMain;
      ctx.lineWidth = 0.8;
      [0.42, 0.68, 0.92].forEach(function (rf) {
        ctx.beginPath();
        ctx.arc(CX, CY, R * rf, 0, Math.PI * 2);
        ctx.stroke();
      });
      // Outer rim, slightly brighter.
      ctx.strokeStyle = pal.ringRim;
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.arc(CX, CY, R, 0, Math.PI * 2);
      ctx.stroke();

      // Compass ticks at the outer rim (every 30°).
      ctx.strokeStyle = pal.tickStroke;
      ctx.lineWidth = 1;
      for (var deg = 0; deg < 360; deg += 30) {
        var rad = (deg * Math.PI) / 180;
        var x0 = CX + Math.cos(rad) * R;
        var y0 = CY + Math.sin(rad) * R;
        var x1 = CX + Math.cos(rad) * (R - 7);
        var y1 = CY + Math.sin(rad) * (R - 7);
        ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
      }
    }

    function paintSweep(tSec) {
      if (reduceMotion) return;
      // During a lockOn beat the sweep fades to zero so the convergence
      // ring + nodes carry the visual.
      var lockFade = 1;
      if (lockState) {
        var lt = Math.min(1, (performance.now() - lockState.startedAt) / lockState.durationMs);
        lockFade = 1 - lt;
      }
      if (lockFade <= 0.02) return;
      // Single sweep arm. Drawn as a thin radial gradient wedge using a
      // sequence of line segments fanning from center, each progressively
      // dimmer. Gives the "radar sweep" look without needing canvas conic.
      var sweepAngle = (tSec / sweepSec) * Math.PI * 2;
      var arc = Math.PI / 4.5; // ~40° wedge trailing the leading edge
      var segCount = 28;
      ctx.save();
      ctx.lineCap = 'round';
      for (var k = 0; k < segCount; k++) {
        var t = k / segCount;
        var a = sweepAngle - arc * t;
        var alpha = (1 - t) * 0.28 * lockFade;
        ctx.strokeStyle = 'rgba(' + pal.sweepRgb + ',' + alpha.toFixed(3) + ')';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(CX, CY);
        ctx.lineTo(CX + Math.cos(a) * R, CY + Math.sin(a) * R);
        ctx.stroke();
      }
      // Leading-edge bright dot at the rim, sells the rotation.
      var leadX = CX + Math.cos(sweepAngle) * R;
      var leadY = CY + Math.sin(sweepAngle) * R;
      var glow = ctx.createRadialGradient(leadX, leadY, 0, leadX, leadY, 14);
      // Fade the lead glow with the sweep itself.
      var fadedLead = pal.sweepLead.replace(/[\d.]+\)$/, (0.85 * lockFade).toFixed(3) + ')');
      glow.addColorStop(0, fadedLead);
      glow.addColorStop(1, pal.sweepLeadEnd);
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(leadX, leadY, 14, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Convergence ring — fires once when lockOn starts, expands outward
    // from center over the full lock duration, fades as it grows.
    // Reads as the "match found" pulse spreading through the chamber.
    function paintConvergeRing(nowMs) {
      if (!lockState) return;
      var lt = Math.min(1, (nowMs - lockState.startedAt) / lockState.durationMs);
      var radius = R * (0.05 + easeOutCubic(lt) * 0.95);
      var alpha = (1 - lt) * 0.65;
      ctx.save();
      ctx.strokeStyle = 'rgba(' + pal.sweepRgb + ',' + alpha.toFixed(3) + ')';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(CX, CY, radius, 0, Math.PI * 2);
      ctx.stroke();
      // Second, dimmer trailing ring for depth.
      if (lt > 0.15) {
        var lt2 = lt - 0.15;
        var r2 = R * (0.05 + easeOutCubic(lt2) * 0.85);
        var a2 = (1 - lt2 / 0.85) * 0.32;
        ctx.strokeStyle = 'rgba(' + pal.sweepRgb + ',' + Math.max(0, a2).toFixed(3) + ')';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(CX, CY, r2, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }

    function paintNodes(tSec) {
      ctx.save();
      ctx.font = '500 9px Inter, system-ui, sans-serif';
      ctx.textBaseline = 'middle';
      for (var i = 0; i < nodes.length; i++) {
        var n = nodes[i];
        var p = nodePos(n, tSec);
        // Soft halo behind each node, very small.
        var halo = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 9);
        halo.addColorStop(0, pal.nodeHaloIn);
        halo.addColorStop(1, pal.nodeHaloOut);
        ctx.fillStyle = halo;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 9, 0, Math.PI * 2);
        ctx.fill();
        // Core dot.
        ctx.fillStyle = pal.nodeCore;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 2.2, 0, Math.PI * 2);
        ctx.fill();
        // Handle tag — tiny, dimmed, sits to the right of the dot.
        // Only render on the inner two bands to avoid label overlap at
        // the outer rim where nodes are close to ticks.
        if (n.radius < 0.85) {
          ctx.fillStyle = pal.nodeTag;
          ctx.fillText('@' + n.handle, p.x + 7, p.y);
        }
      }
      ctx.restore();
    }

    function paintMatchArc(tSec, nowMs) {
      // Maybe spawn a new attempt.
      if (!activeMatch && nowMs >= nextMatchAt) {
        var ai = Math.floor(Math.random() * nodes.length);
        var bi = Math.floor(Math.random() * nodes.length);
        if (bi === ai) bi = (bi + 1) % nodes.length;
        activeMatch = { a: nodes[ai], b: nodes[bi], startedAt: nowMs, durationMs: 1200 };
      }
      if (!activeMatch) return;
      var t = (nowMs - activeMatch.startedAt) / activeMatch.durationMs;
      if (t >= 1) {
        activeMatch = null;
        scheduleNextMatch(nowMs);
        return;
      }
      // Envelope: fade in quickly, hold, fade out.
      var env;
      if (t < 0.18) env = t / 0.18;
      else if (t > 0.75) env = (1 - t) / 0.25;
      else env = 1;
      env = Math.max(0, Math.min(1, env));
      var pa = nodePos(activeMatch.a, tSec);
      var pb = nodePos(activeMatch.b, tSec);
      // Bezier arc bowed away from center so the line doesn't pass
      // through the middle pulse.
      var mx = (pa.x + pb.x) / 2;
      var my = (pa.y + pb.y) / 2;
      var dx = mx - CX, dy = my - CY;
      var d = Math.sqrt(dx * dx + dy * dy) || 1;
      var bow = R * 0.22;
      var cx = mx + (dx / d) * bow;
      var cy = my + (dy / d) * bow;
      ctx.save();
      ctx.lineCap = 'round';
      // pal.arcStroke ends in ".85)" — splice the env factor in by
      // rebuilding the rgba(). Keeps the palette object simple.
      ctx.strokeStyle = pal.arcStroke.replace(/[\d.]+\)$/, (0.85 * env).toFixed(3) + ')');
      ctx.lineWidth = 1.3;
      ctx.shadowColor = pal.arcShadow;
      ctx.shadowBlur = 8 * env;
      ctx.beginPath();
      ctx.moveTo(pa.x, pa.y);
      ctx.quadraticCurveTo(cx, cy, pb.x, pb.y);
      ctx.stroke();
      ctx.restore();
    }

    function paintCenter(tSec) {
      // "You" pulse at center. Slow breath, brighter than the orbiting
      // nodes. Two concentric circles + halo. During lockOn the halo
      // swells and brightens — the user IS the center, the room
      // converges on them.
      var breath = 0.5 + 0.5 * Math.sin(tSec * 2 * Math.PI * 0.35);
      var lockBoost = 0;
      if (lockState) {
        var lt = Math.min(1, (performance.now() - lockState.startedAt) / lockState.durationMs);
        lockBoost = easeOutCubic(lt);
      }
      breath = breath * (1 - lockBoost * 0.4) + lockBoost;
      var haloR = (18 + breath * 5) * (1 + lockBoost * 0.6);
      var halo = ctx.createRadialGradient(CX, CY, 0, CX, CY, haloR);
      // Splice the breath alpha onto the center-halo color the same
      // way we did for arcStroke. pal.centerHaloIn ends in ".XX)".
      var ha = (0.55 + breath * 0.20).toFixed(3);
      halo.addColorStop(0, pal.centerHaloIn.replace(/[\d.]+\)$/, ha + ')'));
      halo.addColorStop(1, pal.centerHaloOut);
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(CX, CY, haloR, 0, Math.PI * 2);
      ctx.fill();
      // Outer ring.
      ctx.strokeStyle = pal.centerRing;
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.arc(CX, CY, 6 + breath * 1.5, 0, Math.PI * 2);
      ctx.stroke();
      // Core.
      ctx.fillStyle = pal.centerCore;
      ctx.beginPath();
      ctx.arc(CX, CY, 2.6, 0, Math.PI * 2);
      ctx.fill();
    }

    // ── Frame loop ─────────────────────────────────────────────────

    var startMs = performance.now();
    var raf = 0;
    var stopped = false;
    function frame(nowMs) {
      if (stopped) return;
      var tSec = (nowMs - startMs) / 1000;
      ctx.clearRect(0, 0, W, H);
      paintGrid();
      paintRings();
      paintSweep(tSec);
      // Match-attempt arcs pause once lockOn fires (the room is no
      // longer probing pairings; it's confirming one).
      if (!lockState) paintMatchArc(tSec, nowMs);
      paintConvergeRing(nowMs);
      paintNodes(tSec);
      paintCenter(tSec);
      raf = global.requestAnimationFrame(frame);
    }
    raf = global.requestAnimationFrame(frame);

    return {
      stop: function () {
        stopped = true;
        if (raf) global.cancelAnimationFrame(raf);
        if (ro) ro.disconnect();
        else global.removeEventListener('resize', resize);
      },
      // Cinematic match-found beat — caller (renderMatched on spar.html)
      // calls this FIRST, waits ~700-800ms, then swaps the page markup
      // so the beat carries the transition.
      lockOn: startLockOn,
    };
  }

  global.SparRadar = { mount: mount };
})(this);
