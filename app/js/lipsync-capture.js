/**
 * LipSyncCapture — credential v1.0 anti-cheat client-side capture.
 *
 * Phase A (current ship): records the user's audio amplitude envelope at
 *   4Hz over the round, alongside placeholder mouth-aperture samples.
 *   The envelope is real; the mouth array is zeros until phase B lands.
 *   Server-side correlation deliberately treats this as informational
 *   only — no credential is gated on it yet. The feature flag in
 *   voice-debate.html (CERT_V1_ENABLED) is default OFF, so this code
 *   does not run for normal users until phase B is ready.
 *
 * Phase B (next session): integrate MediaPipe FaceMesh via CDN, track
 *   the 20 mouth landmarks, compute mouth aperture each frame, fill the
 *   mouthAperture array with real values. At that point the server's
 *   Pearson r threshold (>= 0.6) becomes gating.
 *
 * Phase C+ (see vault scoping doc): face identity lock, liveness
 *   challenges, audio watermark detection. None of those live here yet.
 *
 * Why this lives in its own file: voice-debate.html is already 6000+
 *   lines. Inlining a fresh capture module makes the file harder to
 *   navigate, and the capture pipeline is genuinely independent from
 *   the WebRTC + RFD logic. Loaded on demand only when the credential
 *   v1 flag is on, so non-credential rounds pay zero cost.
 *
 * Contract:
 *   var lsc = LipSyncCapture.create({ audioAnalyser, videoEl, sampleHz });
 *   lsc.start();
 *   ... round runs ...
 *   var payload = lsc.stop();
 *   // payload = {
 *   //   protocol: 'lipsync-v1',
 *   //   sampleHz: 4,
 *   //   durationMs: 1083500,
 *   //   audioEnvelope: [Float32, ...],
 *   //   mouthAperture: [Float32, ...],   // zeros until phase B
 *   //   meta: { audioFftSize, framesSampled, ... }
 *   // }
 *
 * The server (create-cert.mjs) computes Pearson r between the two
 * arrays and stores both the arrays and the result on the cert doc.
 * Threshold gating ships in phase B, not phase A.
 */
(function(global){
  'use strict';

  function create(opts){
    opts = opts || {};
    var audioAnalyser = opts.audioAnalyser || null;
    var videoEl       = opts.videoEl || null;
    var sampleHz      = Math.max(1, Math.min(10, opts.sampleHz || 4));
    var sampleMs      = Math.round(1000 / sampleHz);

    var running = false;
    var startMs = 0;
    var timerId = null;
    var audioEnvelope = [];
    var mouthAperture = [];
    var framesSampled = 0;

    // RMS amplitude of the analyser's current frequency-bin snapshot.
    // The analyser is already tapped from the user mic upstream
    // (voice-debate.html ~line 4421-4432), so we just read from it.
    var freqBuf = null;
    function sampleAudio(){
      if (!audioAnalyser) return 0;
      try {
        var n = audioAnalyser.frequencyBinCount;
        if (!freqBuf || freqBuf.length !== n) freqBuf = new Uint8Array(n);
        audioAnalyser.getByteFrequencyData(freqBuf);
        var sum = 0;
        for (var i = 0; i < n; i++) { var v = freqBuf[i] / 255; sum += v * v; }
        return Math.sqrt(sum / n); // 0..1
      } catch(e) { return 0; }
    }

    // Phase A: stub. Phase B replaces with FaceMesh.process(video) and
    // computes mouth aperture from landmarks 13/14 (upper/lower lip
    // center) divided by face height (landmark 10 to 152) so the metric
    // is scale-invariant to camera distance.
    function sampleMouth(){
      if (!videoEl || !videoEl.videoWidth) return 0;
      // PHASE A STUB. Returns 0 to signal "not measured yet."
      // Server treats all-zero mouth array as "no mouth data," skips r.
      return 0;
    }

    function tick(){
      if (!running) return;
      audioEnvelope.push(sampleAudio());
      mouthAperture.push(sampleMouth());
      framesSampled += 1;
    }

    function start(){
      if (running) return;
      audioEnvelope = [];
      mouthAperture = [];
      framesSampled = 0;
      startMs = Date.now();
      running = true;
      timerId = setInterval(tick, sampleMs);
    }

    function stop(){
      if (!running) return null;
      running = false;
      if (timerId) { clearInterval(timerId); timerId = null; }
      var durationMs = Date.now() - startMs;
      return {
        protocol: 'lipsync-v1',
        phase: 'A', // phase B fills the mouth array with real values
        sampleHz: sampleHz,
        durationMs: durationMs,
        audioEnvelope: audioEnvelope.slice(),
        mouthAperture: mouthAperture.slice(),
        meta: {
          audioFftSize: audioAnalyser ? audioAnalyser.fftSize : null,
          framesSampled: framesSampled,
          hasVideoSource: !!(videoEl && videoEl.videoWidth),
        },
      };
    }

    return { start: start, stop: stop };
  }

  global.LipSyncCapture = { create: create, VERSION: '1.0-phaseA' };
})(typeof window !== 'undefined' ? window : globalThis);
