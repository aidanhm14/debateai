/* audio-bus.js — site-wide mutual-exclusion guard for audio playback.
 *
 * Any HTMLAudioElement.prototype.play() call pauses every other audio
 * element that's currently playing. Installed once on script load via
 * a one-time monkey-patch on the prototype, so existing call sites
 * (TTS chunk playback in /debate-ai, sample line on the landing orb,
 * voice provider preview in Settings, splash hook audio, etc.) get
 * the behavior for free without per-call wiring.
 *
 * The site had multiple independent audio paths created with
 * `new Audio(url)`. Without a bus, clicking play on a second one
 * while the first was still going produced overlapping audio.
 *
 * We use `pause()` (not stop+seek-to-0) so the previously-playing
 * audio resumes from where it left off if the user explicitly plays
 * it again — non-destructive to position. Live tracking via a Set,
 * cleanup on ended/error/pause events.
 *
 * NOT covered by this bus: WebRTC MediaStream playback (no .play()
 * intercept; the realtime voice debate audio sink lives outside this
 * path), and Web Audio API oscillator nodes (the splash sonar ping
 * synthesizes via createOscillator). Those are short / context-bound
 * and don't realistically overlap with HTMLAudioElement playback in
 * normal use.
 */
(function(){
  if (window.__audioBusInstalled) return;
  window.__audioBusInstalled = true;

  // Tracks Audio elements that are currently playing. Ordinary Set
  // (not WeakSet) so we can iterate; cleaned up via the lifecycle
  // listeners below to avoid leaks.
  var live = new Set();

  function stopOthers(self){
    live.forEach(function(a){
      if (a === self) return;
      try { a.pause(); } catch(e){}
    });
  }

  var origPlay = HTMLAudioElement.prototype.play;
  HTMLAudioElement.prototype.play = function(){
    stopOthers(this);
    live.add(this);
    var self = this;
    var off = function(){ live.delete(self); };
    // Use { once: true } so a single ended/error/pause cleans up and
    // doesn't accumulate listeners across replays.
    this.addEventListener('ended', off, { once: true });
    this.addEventListener('error', off, { once: true });
    this.addEventListener('pause', off, { once: true });
    return origPlay.apply(this, arguments);
  };
})();
