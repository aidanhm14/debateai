
        (function(){
          // Stable per-tab pid for anon heartbeats. Sessions die when
          // the tab closes, so the presence doc TTLs out of the 5-min
          // window naturally. localStorage would over-count revisits.
          var pid;
          try {
            pid = sessionStorage.getItem('da-pid');
            if (!pid) {
              pid = (crypto && crypto.randomUUID ? crypto.randomUUID().replace(/-/g,'').slice(0,16)
                                                  : (Date.now().toString(36) + Math.random().toString(36).slice(2,10)));
              sessionStorage.setItem('da-pid', pid);
            }
          } catch (_) {
            // Some embedded browsers throw on sessionStorage. Skip the
            // heartbeat entirely in that case; the count just won't
            // include this visitor.
            return;
          }

          function ping(){
            // Skip while the tab is hidden (Page Visibility API). No
            // point counting a backgrounded tab as "online."
            if (document.visibilityState === 'hidden') return;
            // Include the Firebase ID token if the user is signed in
            // so the server can key by uid (one presence row per
            // signed-in user, even across tabs). Falls through to
            // anon pid keying if the token isn't available.
            var headers = { 'Content-Type': 'application/json' };
            try {
              var u = window.firebase && firebase.auth && firebase.auth().currentUser;
              if (u && u.getIdToken) {
                u.getIdToken().then(function(token){
                  headers.Authorization = 'Bearer ' + token;
                  postPing(headers);
                }).catch(function(){ postPing(headers); });
                return;
              }
            } catch (_) {}
            postPing(headers);
          }
          function postPing(headers){
            try {
              fetch('/api/presence-ping', {
                method: 'POST',
                headers: headers,
                credentials: 'omit',
                body: JSON.stringify({ pid: pid })
              }).catch(function(){ /* network errors silent */ });
            } catch (_) {}
          }

          function refreshCount(){
            // Don't poll the count in a backgrounded tab; the
            // visibilitychange handler below re-fetches on return.
            if (document.visibilityState === 'hidden') return;
            fetch('/api/online-count', { credentials: 'omit' })
              .then(function(r){ return r.ok ? r.json() : null; })
              .then(function(j){
                if (!j || typeof j.online !== 'number') return;
                // Floor at 1 — the viewer themselves is on the page, so
                // 0 is a lie. The server response can be 0 if the cache
                // is warm but our own heartbeat hasn't landed yet, or
                // if the presence write silently failed (env vars,
                // permissions, cold start). Showing "0 online" while
                // you're literally reading the page is worse than
                // showing "1 online" honestly. signedIn count gets
                // floored at 1 only if the viewer is actually signed
                // in (window.firebase auth).
                var online = Math.max(j.online | 0, 1);
                var signedIn = j.signedIn | 0;
                try {
                  var u = window.firebase && firebase.auth && firebase.auth().currentUser;
                  if (u) signedIn = Math.max(signedIn, 1);
                } catch(_){}
                var a = document.getElementById('hesActive');
                var r = document.getElementById('hesRooms');
                if (a) a.textContent = String(online);
                if (r) r.textContent = String(signedIn);
                var b = document.getElementById('heroOnlineCount');
                if (b) b.textContent = String(online);
              })
              .catch(function(){ /* keep last value */ });
          }

          // 2026-07-01: the hero live-usage counters this heartbeat fed
          // were removed, so it no longer runs. Leaving it active would keep
          // spending /api/presence-ping + /api/online-count invocations every
          // 30-60s per visitor for UI that no longer exists.
          return;
          // Re-ping + refresh when the tab returns from background, so
          // a returning visitor immediately re-shows as online.
          document.addEventListener('visibilitychange', function(){
            if (document.visibilityState === 'visible') {
              ping();
              setTimeout(refreshCount, 350);
            }
          });
        })();
      