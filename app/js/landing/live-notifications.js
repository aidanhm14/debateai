
(function(){
  if (typeof window === 'undefined') return;
  var FS_URL = 'https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore-compat.js';
  var CONFIG = {
    apiKey: ["AIzaSyDDx","TYlyWLOJnFP99","e7XsLPb3FwIEijNNM"].join(""),
    authDomain: "itsdebatable.com",
    projectId: "debateos-78ac5",
    storageBucket: "debateos-78ac5.firebasestorage.app",
    messagingSenderId: "860359449192",
    appId: "1:860359449192:web:f5dc0060dbd50d6c4fb9dd",
  };
  var db = null, liveRooms = [], reqUnsub = null, cdTimer = null;

  function loadFS(cb){
    if (window.firebase && firebase.firestore){ cb(); return; }
    var ex = document.getElementById('da-fs-sdk');
    if (ex){ ex.addEventListener('load', cb, { once:true }); return; }
    var s = document.createElement('script'); s.id = 'da-fs-sdk'; s.src = FS_URL;
    s.addEventListener('load', cb, { once:true }); s.addEventListener('error', function(){});
    document.head.appendChild(s);
  }
  function ensureApp(){ try { if (window.firebase && firebase.apps && !firebase.apps.length) firebase.initializeApp(CONFIG); } catch(e){} }

  var css = document.createElement('style');
  css.textContent =
    '.livenow-live{display:inline-flex;align-items:center;gap:10px;margin:4px auto 18px;padding:9px 16px;border-radius:999px;background:rgba(34,197,94,.1);border:1px solid rgba(34,197,94,.4);font-weight:700;font-size:.9rem;color:var(--text,#1a1a1f)}' +
    /* When the strip lands inside the CTA flex row (renderBand inserts it
       before .livenow-cta), auto side margins eat the row's free space and
       shove the buttons to the right edge; zero them so the three pills
       center as one group at matching height. */
    '.livenow-cta-row .livenow-live{margin:0}' +
    '[data-theme="grey"] .livenow-live,[data-theme="crimson"] .livenow-live,[data-theme="dark"] .livenow-live{color:#f4f1ea}' +
    '.livenow-live-dot{width:9px;height:9px;border-radius:50%;background:#22c55e;box-shadow:0 0 9px #22c55e;animation:ljPulse 1.6s infinite}' +
    '@keyframes ljPulse{0%,100%{opacity:1}50%{opacity:.35}}' +
    '.lj-join{margin-left:4px;padding:8px 18px;border-radius:999px;border:0;background:var(--accent,#ef4444);color:#fff;font-weight:800;font-size:.84rem;cursor:pointer}' +
    '.lj-join:hover{background:#dc2626}' +
    /* Side panel, not a page-blocking modal — docks to the right edge,
       lets the page stay live underneath (pointer-events:none on the
       container, auto on the card), slides in from the right. */
    '#ljModal{position:fixed;inset:0;z-index:2147483600;display:none;align-items:center;justify-content:flex-end;pointer-events:none;background:transparent}' +
    '#ljModal.on{display:flex}' +
    '#ljModal.on .lj-card{animation:ljSlideIn .42s cubic-bezier(.22,1,.36,1) both}' +
    '@keyframes ljSlideIn{from{opacity:0;transform:translateX(34px)}to{opacity:1;transform:translateX(0)}}' +
    '.lj-card{position:relative;pointer-events:auto;background:#fff;color:#16130f;width:min(360px,calc(100vw - 32px));margin-right:24px;border-radius:18px;padding:24px 24px 22px;box-shadow:0 24px 70px rgba(0,0,0,.34);text-align:center;font-family:var(--font-body);border:1px solid rgba(239,68,68,.18)}' +
    '.lj-x{position:absolute;top:10px;right:12px;width:28px;height:28px;border:0;border-radius:50%;background:rgba(127,127,127,.12);color:inherit;font-size:1.25rem;line-height:1;cursor:pointer;opacity:.55;font-family:inherit}' +
    '.lj-x:hover{opacity:1;background:rgba(127,127,127,.2)}' +
    '@media (max-width:520px){#ljModal{align-items:flex-end;justify-content:center}.lj-card{margin:0 0 18px}}' +
    '[data-theme="grey"] .lj-card,[data-theme="crimson"] .lj-card,[data-theme="dark"] .lj-card{background:#1c160f;color:#f4f1ea}' +
    '.lj-h{font-size:1.15rem;font-weight:800;margin:0 0 8px}' +
    '.lj-p{font-size:.9rem;opacity:.72;margin:0 0 14px;line-height:1.45}' +
    '.lj-count{font-size:2.1rem;font-weight:800;font-variant-numeric:tabular-nums;color:#ef4444;margin:4px 0 12px}' +
    '.lj-btn{display:block;width:100%;padding:12px;border-radius:11px;border:0;font-weight:800;font-size:.95rem;cursor:pointer;margin-top:8px;font-family:inherit}' +
    '.lj-btn-primary{background:#b91c1c;color:#fff}.lj-btn-primary:hover{background:#dc2626}' +
    '.lj-btn-ghost{background:rgba(127,127,127,.14);color:inherit}' +
    '.lj-note{width:100%;box-sizing:border-box;border:1px solid rgba(127,127,127,.35);border-radius:10px;padding:10px;font:inherit;font-size:.9rem;margin:6px 0 4px;resize:vertical;min-height:62px;background:transparent;color:inherit}';
  document.head.appendChild(css);

  var modal = document.createElement('div');
  modal.id = 'ljModal';
  modal.innerHTML = '<div class="lj-card"><button type="button" class="lj-x" id="ljDismiss" aria-label="Close">&times;</button><div id="ljCard"></div></div>';
  document.body.appendChild(modal);
  modal.addEventListener('click', function(e){ if (e.target === modal) closeModal(); });
  document.getElementById('ljDismiss').addEventListener('click', closeModal);
  function closeModal(){ modal.classList.remove('on'); cleanup(); }
  function cleanup(){ if (reqUnsub){ reqUnsub(); reqUnsub = null; } if (cdTimer){ clearInterval(cdTimer); cdTimer = null; } }
  function card(html){ document.getElementById('ljCard').innerHTML = html; modal.classList.add('on'); }
  function esc(s){ return String(s==null?'':s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];}); }

  function renderBand(){
    var wrap = document.querySelector('.live-proof-cta'); if (!wrap) return;
    var strip = document.getElementById('livenowLive');
    if (!liveRooms.length){ if (strip) strip.remove(); return; }
    if (!strip){
      strip = document.createElement('div'); strip.id = 'livenowLive'; strip.className = 'livenow-live';
      var cta = wrap.querySelector('.livenow-cta');
      if (cta && cta.parentNode) cta.parentNode.insertBefore(strip, cta); else wrap.appendChild(strip);
    }
    strip.innerHTML = '<span class="livenow-live-dot"></span><span>' + liveRooms.length + ' debate' + (liveRooms.length===1?'':'s') + ' live now</span><button type="button" class="lj-join" id="ljJoinBtn">Join a live round &rarr;</button>';
    document.getElementById('ljJoinBtn').addEventListener('click', onJoinClick);
  }

  /* This band used to open a live_rounds onSnapshot on every visitor,
     which meant lazy-loading firestore-compat (~100KB gzipped, ~50KB heap)
     and holding an open realtime listener per person just to print a
     count. At a few hundred concurrent visitors that is a few hundred
     listeners fanning out on every write to the collection.

     /api/watch-live answers the same question off a 12s shared server
     cache and applies the same liveness rule (lastSeenAt inside ~100s),
     so the whole room reads it for roughly the cost of one. Firestore is
     now loaded only when someone actually clicks Join. */
  function startFeed(){
    pullFeed();
    setInterval(function(){ if (!document.hidden) pullFeed(); }, 60000);
  }

  function pullFeed(){
    window.watchLive().then(function(d){
      var rounds = (d && d.rounds) || [];
      var rooms = [];
      for (var i = 0; i < rounds.length; i++){
        // The endpoint also reports rounds sitting on the ballot. The
        // band only ever advertised rounds still being debated.
        if (rounds[i].status !== 'round') continue;
        rooms.push({ id: rounds[i].room, motion: rounds[i].motion || '' });
      }
      liveRooms = rooms; renderBand();
    }).catch(function(){});
  }

  function isRealUser(u){
    return !!(u && !u.isAnonymous);
  }

  function authThen(cb){
    if (!window.firebase || !firebase.auth){
      card('<div class="lj-h">Sign-in did not load</div><div class="lj-p">Open the app, sign in with Google, then try the live room again.</div><button class="lj-btn lj-btn-ghost" id="ljX">Close</button>');
      document.getElementById('ljX').addEventListener('click', closeModal);
      return;
    }
    var auth = firebase.auth();
    var u = auth.currentUser;
    if (isRealUser(u)){ cb(u); return; }
    card('<div class="lj-h">Sign in to join live</div><div class="lj-p">Live rooms need a real name and profile photo so the debater knows who is asking to enter.</div><button class="lj-btn lj-btn-go" id="ljGoogle">Continue with Google</button><button class="lj-btn lj-btn-ghost" id="ljX">Close</button>');
    document.getElementById('ljX').addEventListener('click', closeModal);
    document.getElementById('ljGoogle').addEventListener('click', function(){
      var btn = document.getElementById('ljGoogle');
      if (btn) { btn.disabled = true; btn.textContent = 'Opening Google...'; }
      try {
        // Live-video entry still requires Google sign-in.
        // This direct Google popup stays as the fallback if that script fails.
        if (typeof window.openAuthModal === 'function') { window.openAuthModal('signin', { liveVideo: true }); return; }
        var provider = new firebase.auth.GoogleAuthProvider();
        auth.signInWithPopup(provider).then(function(r){
          var signed = r && r.user ? r.user : auth.currentUser;
          if (isRealUser(signed)) cb(signed);
          else throw new Error('Google sign-in did not finish.');
        }).catch(function(){
          card('<div class="lj-h">Google did not finish</div><div class="lj-p">Try again from the app topbar. Anonymous guests cannot request live-room entry.</div><button class="lj-btn lj-btn-ghost" id="ljX">Close</button>');
          document.getElementById('ljX').addEventListener('click', closeModal);
        });
      } catch (e) {
        card('<div class="lj-h">Google did not open</div><div class="lj-p">Try again from the app topbar. Anonymous guests cannot request live-room entry.</div><button class="lj-btn lj-btn-ghost" id="ljX">Close</button>');
        document.getElementById('ljX').addEventListener('click', closeModal);
      }
    });
  }

  function onJoinClick(){
    if (!liveRooms.length) return;
    var room = liveRooms[0];
    // Firestore arrives here, on intent, instead of on every page load.
    loadFS(function(){
      ensureApp();
      if (!window.firebase || !firebase.firestore) return;
      db = firebase.firestore();
      askToJoin(room);
    });
  }

  function askToJoin(room){
    authThen(function(u){
      card('<div class="lj-h">Join a live debate</div><div class="lj-p">Asking a debater in the room to let you in. They have 20 seconds.</div><div class="lj-count" id="ljCountdown">20</div>' + (room.motion ? '<div class="lj-p" style="margin:0;font-size:.82rem">Motion: ' + esc(room.motion.slice(0,120)) + '</div>' : ''));
      sendRequest(room, u, null);
    });
  }

  function sendRequest(room, u, comment){
    cleanup();
    var reqRef = db.collection('live_rounds').doc(room.id).collection('joinRequests').doc(u.uid);
    var payload = { name: (window.DBIdentity ? DBIdentity.forUser(u).name : 'Anonymous'), status: 'pending', requestedAt: firebase.firestore.FieldValue.serverTimestamp() };
    payload.comment = comment ? comment : firebase.firestore.FieldValue.delete();
    reqRef.set(payload, { merge:true }).catch(function(){});
    var resolved = false;
    reqUnsub = reqRef.onSnapshot(function(doc){
      var d = doc.data()||{};
      if (d.status === 'accepted'){ resolved = true; cleanup(); window.location.href = '/live-round?room=' + encodeURIComponent(room.id); }
      else if (d.status === 'rejected'){ resolved = true; cleanup(); showRejected(room, u); }
    });
    var secs = 20;
    cdTimer = setInterval(function(){
      secs--; var el = document.getElementById('ljCountdown'); if (el) el.textContent = secs;
      if (secs <= 0){ clearInterval(cdTimer); cdTimer = null; if (!resolved) showRejected(room, u); }
    }, 1000);
  }

  function showRejected(room, u){
    cleanup();
    card('<div class="lj-h">Not let in yet</div><div class="lj-p">No one accepted in time. Send the debaters a quick note and ask again.</div><textarea class="lj-note" id="ljNote" maxlength="280" placeholder="e.g. Same circuit, would love to watch and learn"></textarea><button class="lj-btn lj-btn-primary" id="ljResend">Send note + ask again</button><button class="lj-btn lj-btn-ghost" id="ljClose">Maybe later</button>');
    document.getElementById('ljResend').addEventListener('click', function(){
      var note = (document.getElementById('ljNote').value||'').trim().slice(0,280);
      card('<div class="lj-h">Join a live debate</div><div class="lj-p">Note sent. Asking again. 20 seconds.</div><div class="lj-count" id="ljCountdown">20</div>');
      sendRequest(room, u, note || null);
    });
    document.getElementById('ljClose').addEventListener('click', closeModal);
  }

  function boot(){ if ('requestIdleCallback' in window) requestIdleCallback(startFeed, { timeout:3000 }); else setTimeout(startFeed, 2200); }
  if (document.readyState === 'complete') boot(); else window.addEventListener('load', boot);
})();
