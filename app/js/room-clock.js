(function(root){
  'use strict';
  var offset = 0;
  function millis(value){
    if (value && typeof value.toMillis === 'function') return value.toMillis();
    if (value && typeof value.seconds === 'number') return value.seconds * 1000 + (value.nanoseconds || 0) / 1e6;
    return typeof value === 'number' && isFinite(value) ? value : 0;
  }
  // updatedAtServer is stamped by Firestore in the same write. Its
  // difference from the publisher's clock is independent of when we join.
  function publisherOffset(timer){
    var server = millis(timer && timer.updatedAtServer);
    return server && timer.updatedAtMs ? timer.updatedAtMs - server : 0;
  }
  function localStart(timer){
    return timer.startMs ? timer.startMs - publisherOffset(timer) - offset : 0;
  }
  root.DBRoomClock = { millis: millis, localStart: localStart, publisherOffset: publisherOffset,
    now: function(){ return Date.now() + offset; } };
  if (typeof document === 'undefined' || /[?&]design=/.test(location.search)) return;
  async function sync(){
    if (document.hidden) return;
    var started = Date.now(), abort = new AbortController();
    var timeout = setTimeout(function(){ abort.abort(); }, 4000);
    try {
      var response = await fetch('/api/room-clock', { cache:'no-store', signal:abort.signal });
      if (!response.ok) return;
      var data = await response.json(), ended = Date.now();
      if (!Number.isFinite(data.now) || ended - started > 2000) return;
      offset = data.now - (started + ended) / 2;
      document.dispatchEvent(new Event('room-clock-ready'));
    } catch(e) { /* Shared start times still work with normal device clocks. */ }
    finally { clearTimeout(timeout); }
  }
  sync();
  setInterval(sync, 300000);
  document.addEventListener('visibilitychange', function(){ if (!document.hidden) sync(); });
})(window);
