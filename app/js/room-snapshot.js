/* A small snapshot of the two published room tiles. No screen capture,
   chat, transcript, hidden camera, or additional media permission. */
(function () {
  'use strict';
  function capture(seats, motion) {
    if (!seats || seats.length !== 2 || !seats.some(function (s) { return s.source; })) return null;
    var canvas = document.createElement('canvas');
    canvas.width = 640; canvas.height = 360;
    var ctx = canvas.getContext('2d');
    if (!ctx) return null;
    function text(value, width) {
      var s = String(value || '');
      if (ctx.measureText(s).width <= width) return s;
      while (s.length && ctx.measureText(s + '…').width > width) s = s.slice(0, -1);
      return s + '…';
    }
    try {
      ctx.fillStyle = '#151519'; ctx.fillRect(0, 0, 640, 360);
      ctx.font = '700 13px sans-serif'; ctx.fillStyle = '#f4f0ea';
      ctx.fillText('DEBATABLE', 15, 23);
      ctx.fillStyle = '#ff605d'; ctx.fillText('LIVE ROOM', 540, 23);
      var drawn = 0;
      seats.forEach(function (seat, i) {
        var x = 8 + i * 316, y = 36, w = 308, h = 267;
        ctx.fillStyle = '#29282e'; ctx.fillRect(x, y, w, h);
        var src = seat.source;
        var vw = src && (src.videoWidth || src.width), vh = src && (src.videoHeight || src.height);
        if (vw && vh) {
          var scale = Math.max(w / vw, h / vh), sw = w / scale, sh = h / scale;
          ctx.drawImage(src, (vw - sw) / 2, (vh - sh) / 2, sw, sh, x, y, w, h);
          drawn++;
        } else {
          ctx.fillStyle = '#a6a2ad'; ctx.font = '700 60px sans-serif';
          ctx.fillText(String(seat.name || '?').slice(0, 1).toUpperCase(), x + 130, y + 142);
          ctx.font = '13px sans-serif'; ctx.fillText('Camera off', x + 116, y + 172);
        }
        ctx.fillStyle = 'rgba(12,12,16,.78)'; ctx.fillRect(x, y + h - 33, w, 33);
        ctx.font = '700 15px sans-serif'; ctx.fillStyle = '#fff';
        ctx.fillText(text(seat.name || (i ? 'Against' : 'For'), w - 24), x + 12, y + h - 12);
        if (seat.active) {
          ctx.strokeStyle = '#f06059'; ctx.lineWidth = 3; ctx.strokeRect(x + 1.5, y + 1.5, w - 3, h - 3);
        }
      });
      if (!drawn) return null;
      ctx.font = '700 16px sans-serif'; ctx.fillStyle = '#f4f0ea';
      var words = String(motion || 'A live debate').split(/\s+/), lines = [''];
      words.forEach(function (word) {
        var at = lines.length - 1, next = (lines[at] + ' ' + word).trim();
        if (ctx.measureText(next).width > 608 && at === 0) lines.push(word);
        else lines[at] = next;
      });
      lines.forEach(function (line, i) { ctx.fillText(text(line, 608), 16, 326 + i * 21); });
      var data = canvas.toDataURL('image/jpeg', 0.65);
      if (data.length > 90000) data = canvas.toDataURL('image/jpeg', 0.42);
      return data.length > 200 && data.length < 90000 ? data : null;
    } catch (e) { return null; }
  }
  window.DBRoomSnapshot = { capture: capture };
})();
