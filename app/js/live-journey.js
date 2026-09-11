// Transport recovery and diagnostics for the queue -> live-room journey.
// No matching, speech, or judging decisions live here.
(function(root, factory){
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DBLiveJourney = api;
})(typeof window !== 'undefined' ? window : globalThis, function(){
  'use strict';
  function timeout(work, ms){
    return new Promise(function(resolve, reject){
      var timer = setTimeout(function(){ var e = new Error('Request timed out'); e.code = 'timeout'; reject(e); }, ms);
      Promise.resolve(work).then(function(v){ clearTimeout(timer); resolve(v); }, function(e){ clearTimeout(timer); reject(e); });
    });
  }
  function value(v){
    if ('nullValue' in v) return null;
    if ('booleanValue' in v) return v.booleanValue;
    if ('integerValue' in v) return Number(v.integerValue);
    if ('doubleValue' in v) return Number(v.doubleValue);
    if ('stringValue' in v) return v.stringValue;
    if ('timestampValue' in v){
      var ms = Date.parse(v.timestampValue);
      var nanos = (v.timestampValue.match(/\.(\d+)/) || [,''])[1];
      return { seconds: Math.floor(ms / 1000), nanoseconds: Number((nanos + '000000000').slice(0, 9)),
        toMillis: function(){ return ms; }, toDate: function(){ return new Date(ms); } };
    }
    if ('arrayValue' in v) return (v.arrayValue.values || []).map(value);
    if ('mapValue' in v) return fields(v.mapValue.fields || {});
    if ('referenceValue' in v) return v.referenceValue;
    if ('geoPointValue' in v) return v.geoPointValue;
    if ('bytesValue' in v) return v.bytesValue;
    throw new Error('Unknown document value');
  }
  function fields(input){
    var out = {};
    Object.keys(input).forEach(function(k){ Object.defineProperty(out, k, { value: value(input[k]), enumerable: true, writable: true, configurable: true }); });
    return out;
  }
  // A Firestore SDK get() also uses its Listen transport. Use a genuine
  // independent HTTPS read with the current user's token and the SAME
  // Firestore rules. Never an admin endpoint or a service-account key.
  function readDocument(ref, user){
    if (!user || !user.getIdToken) return Promise.reject({ code: 'auth_required' });
    var project = ref.firestore.app.options.projectId;
    var path = ref.path.split('/').map(encodeURIComponent).join('/');
    var controller = new AbortController();
    var check = typeof window !== 'undefined' && window.getAppCheckToken ? window.getAppCheckToken() : Promise.resolve('');
    return timeout(Promise.all([user.getIdToken(), check]).then(function(tokens){
      if (controller.signal.aborted) throw new Error('Read timed out');
      var headers = { Authorization: 'Bearer ' + tokens[0] };
      if (tokens[1]) headers['X-Firebase-AppCheck'] = tokens[1];
      return fetch('https://firestore.googleapis.com/v1/projects/' + encodeURIComponent(project) + '/databases/(default)/documents/' + path,
        { headers: headers, signal: controller.signal, cache: 'no-store' });
    }).then(function(response){
      if (response.status === 404) return { exists: false, data: function(){ return null; } };
      if (!response.ok) throw { code: 'http_' + response.status };
      return response.json().then(function(body){ var data = fields(body.fields || {}); return { exists: true, data: function(){ return data; } }; });
    }), 6500).catch(function(e){ controller.abort(); throw e; });
  }
  // Server reads backstop a broken listener. Never apply a read begun
  // before a newer snapshot, a local pending write, or a stopped watcher.
  function watch(ref, options){
    var stopped = false, revision = 0, read = null, serverSeen = false, pendingWrites = false, snapshotAt = 0;
    var fingerprint = '', lastSnapshot = '', lastError = '';
    function progress(doc){
      if (!doc.exists) return 'missing';
      var d = doc.data();
      return JSON.stringify([d.status, d.room, d.speechIdx, d.ballotPending, !!d.ballot, !!d.ballotUnresolved]);
    }
    function report(kind, info){ if (options.report) options.report(kind, info || {}); }
    function deliver(doc, source){
      if (stopped) return;
      var meta = doc.metadata || {};
      if (source === 'snapshot'){ pendingWrites = !!meta.hasPendingWrites; snapshotAt = Date.now(); }
      if (source === 'snapshot' && serverSeen && meta.fromCache && !meta.hasPendingWrites) return;
      revision++;
      if (source === 'server' || !meta.fromCache) serverSeen = true;
      var key = JSON.stringify(doc.exists ? doc.data() : null);
      if (source === 'snapshot') lastSnapshot = progress(doc);
      if (key === fingerprint) return;
      if (source === 'server' && progress(doc) !== lastSnapshot) report('sync_recovered', {
        status: doc.exists ? (doc.data().status || '') : 'missing', listener_gap_ms: snapshotAt ? Date.now() - snapshotAt : 0, had_snapshot: !!snapshotAt,
      });
      fingerprint = key;
      options.value(doc);
    }
    function refresh(){
      if (stopped || read) return read || Promise.resolve();
      var started = revision;
      read = timeout(Promise.resolve().then(options.read), options.timeoutMs || 7000)
        .then(function(doc){
          if (stopped || pendingWrites || revision !== started) return;
          lastError = '';
          deliver(doc, 'server');
        }).catch(function(e){
          if (stopped) return;
          var code = e.code || 'unavailable';
          if (code !== lastError){ lastError = code; report('sync_error', { code: code }); }
        }).then(function(){ read = null; });
      return read;
    }
    var unsubscribe = ref.onSnapshot({ includeMetadataChanges: true }, function(doc){ deliver(doc, 'snapshot'); }, function(e){
      report('sync_listener_error', { code: e.code || 'unavailable' }); refresh();
    });
    var interval = setInterval(function(){ if (Date.now() - snapshotAt > 12000) refresh(); }, options.intervalMs || 8000);
    function resume(){ if (typeof document === 'undefined' || !document.hidden) refresh(); }
    if (typeof window !== 'undefined') window.addEventListener('online', resume);
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', resume);
    function stop(){
      stopped = true; revision++; clearInterval(interval); unsubscribe();
      if (typeof window !== 'undefined') window.removeEventListener('online', resume);
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', resume);
    }
    stop.refresh = refresh;
    refresh();
    return stop;
  }
  // Existing track.js supplies tab, acquisition, and anonymous identity.
  // Keep values small and categorical: no names, transcripts, or device ids.
  function event(stage, detail){
    try {
      if (typeof window !== 'undefined' && window.track) window.track('app_event', Object.assign({ name: 'live_journey', stage: stage, version: 1 }, detail || {}));
    } catch(e){}
  }
  return { timeout: timeout, watch: watch, event: event, readDocument: readDocument, decodeFields: fields };
});
