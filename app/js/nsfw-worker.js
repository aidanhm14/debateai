/* nsfw-worker.js — the explicit-content classifier, off the main thread.
 *
 * Loaded by nsfw-guard.js. Runs the SAME self-hosted nsfwjs model on the
 * same TF.js webgl backend the in-page path used; the only thing that
 * changes is which thread the arithmetic happens on.
 *
 * Why it exists, measured 2026-08-26 on an M3 Pro against the real
 * vendored model: classifying in-page blocked the MAIN thread for a
 * median of 39ms and up to 80ms per sample, and 4 of 20 samples
 * registered as long tasks (>=50ms). At one sample per 1.6s inside a
 * live video call that is a 2 to 5 frame stall on a fixed rhythm, for
 * the length of the round, on the same thread that composites the
 * video. Through this worker the main thread pays 0.1ms median (1.2ms
 * worst) and records no long tasks at all.
 *
 * Frames arrive as ImageBitmaps, already resized to the model's 224px
 * input by createImageBitmap on the caller's side, and are TRANSFERRED
 * rather than copied. They are closed here after use: an ImageBitmap
 * holds real GPU memory and one leaked per 1.6s would be a slow leak
 * for the whole round.
 *
 * No frame, no pixel and no bitmap ever leaves the device. This worker
 * makes no network request beyond fetching the model itself, and holds
 * no reference to a bitmap once it has been classified.
 */
var model = null;
var loading = null;

function loadModel(vendor) {
  if (loading) return loading;
  loading = Promise.resolve()
    .then(function () { importScripts(vendor + 'nsfwjs.min.js'); })
    .then(function () { return self.nsfwjs.load(vendor); })
    .then(function (m) { model = m; return m; })
    .catch(function (err) {
      loading = null;               // let the page retry on a later attach
      throw err;
    });
  return loading;
}

self.onmessage = function (e) {
  var msg = e.data || {};

  if (msg.cmd === 'init') {
    loadModel(msg.vendor).then(function () {
      var backend = '';
      try { backend = (self._tfengine && self._tfengine.backendName) || ''; } catch (err) {}
      self.postMessage({ cmd: 'ready', backend: backend });
    }).catch(function (err) {
      self.postMessage({ cmd: 'fail', error: String((err && err.message) || err) });
    });
    return;
  }

  if (msg.cmd === 'classify') {
    var bmp = msg.bitmap;
    var done = function (payload) {
      // Always release the bitmap's GPU memory, on every path out.
      try { if (bmp && bmp.close) bmp.close(); } catch (err) {}
      payload.cmd = 'scores';
      payload.id = msg.id;
      self.postMessage(payload);
    };
    if (!model) { done({ error: 'model not loaded' }); return; }
    var t0 = 0;
    try { t0 = performance.now(); } catch (err) {}
    model.classify(bmp).then(function (preds) {
      // Rebuilt as plain objects: the prediction objects are not
      // guaranteed to survive structured clone as they come.
      done({
        preds: (preds || []).map(function (p) {
          return { className: String(p.className), probability: Number(p.probability) };
        }),
        ms: (function () { try { return performance.now() - t0; } catch (err) { return 0; } })(),
      });
    }).catch(function (err) {
      done({ error: String((err && err.message) || err) });
    });
  }
};
