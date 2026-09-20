
        (function(){
          if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
          var speaker = document.querySelector('.hi-lf-stage img[data-live-face-slot="speaker"]');
          var opponent = document.querySelector('.hi-lf-stage img[data-live-face-slot="opponent"]');
          if (!speaker || !opponent) return;
          var motion = document.querySelector('[data-live-motion-text]');
          var judge = document.querySelector('.hi-lf-judge-t');
          var motionTests = [
            { motion: 'Schools should ban phones during class.', clash: 'privacy vs distraction' },
            { motion: 'Cities should make public transit free.', clash: 'access vs cost' },
            { motion: 'AI art should be eligible for copyright.', clash: 'authorship vs innovation' },
            { motion: 'College admissions should end legacy preference.', clash: 'fairness vs alumni funding' },
            { motion: 'Social media platforms should verify all users.', clash: 'safety vs anonymity' },
            { motion: 'National service should be required after high school.', clash: 'civic duty vs freedom' },
            { motion: 'Schools should replace homework with supervised practice.', clash: 'equity vs independence' },
            /* 2026-09-09: a motion was removed from this bank rather than
               reworded. It asked a room to decide how a school should treat
               one group of children, which is the exact shape the 08-19
               exclusion rules out: contested is the goal, targeted is not.
               This bank is dormant (the hero live card was removed on
               08-01, so the rotator returns early and none of these have
               rendered since), and it is still a hardcoded motion bank on
               the highest-traffic page, so it is held to the same bar as
               the board. */
            { motion: 'Universities should remain neutral on political controversies.', clash: 'public trust vs moral leadership' },
            { motion: 'Social platforms should ban anonymous political accounts.', clash: 'accountability vs dissent' },
            { motion: 'Museums should return artifacts acquired under colonial rule.', clash: 'restitution vs stewardship' },
            { motion: 'Governments should ban social media for children under sixteen.', clash: 'child safety vs family choice' }
          ];
          try {
            var motionIdx = parseInt(localStorage.getItem('dit-live-motion-idx') || '-1', 10);
            motionIdx = (isNaN(motionIdx) ? -1 : motionIdx) + 1;
            motionIdx = motionIdx % motionTests.length;
            localStorage.setItem('dit-live-motion-idx', String(motionIdx));
            if (motion) motion.textContent = motionTests[motionIdx].motion;
            if (judge) judge.innerHTML = '<b>AI judge</b> flowing the round &middot; clash: ' + motionTests[motionIdx].clash + ' &middot; the verdict settles every call';
          } catch(e){}
          /* ── Market engine (2026-07-22) ─────────────────────────────
             Drives the featured-market card: a drifting Pro price with
             a 28-point history line, per-side fills, and a pot that
             ticks up. Names follow the face pairs; a new market seeds
             on every round swap. Pure illustration — no wallet, no
             endpoint. Reduced-motion never reaches this (the IIFE
             returns above), so those visitors keep the static market
             baked into the markup. */
          var mktLine = document.querySelector('[data-mkt-line]');
          var mktArea = document.querySelector('[data-mkt-area]');
          var mktDot = document.querySelector('[data-mkt-dot]');
          var mktProPct = document.querySelector('[data-mkt-pct="pro"]');
          var mktConPct = document.querySelector('[data-mkt-pct="con"]');
          var mktProFill = document.querySelector('[data-mkt-fill="pro"]');
          var mktConFill = document.querySelector('[data-mkt-fill="con"]');
          var mktProName = document.querySelector('[data-mkt-name="pro"]');
          var mktConName = document.querySelector('[data-mkt-name="con"]');
          var mktVol = document.querySelector('[data-mkt-vol]');
          var mktBackers = document.querySelector('[data-mkt-backers]');
          var mktNames = [
            ['Maya','Jake'],
            ['Priya','Sam'],
            ['Arjun','Leah'],
            ['Dana','Ines'],
            ['Theo','Zara']
          ];
          var mktPro = 62, mktVolN = 1284, mktBackersN = 37, mktWatchN = 214, mktHist = [];
          var mktWatchEl = document.querySelector('[data-live-watching]');
          function mktClamp(v){ return Math.max(12, Math.min(88, v)); }
          function renderMkt(){
            if (!mktLine) return;
            /* y-scale hugs the history's own range (with padding) so the
               line always fills the chart like a real price chart —
               a fixed 0-100 scale flattens a 45-55 drift to a hairline. */
            var lo = Math.min.apply(null, mktHist), hi = Math.max.apply(null, mktHist);
            var pad = Math.max(3, (hi - lo) * .15);
            lo -= pad; hi += pad;
            function yy(p){ return 37 - (p - lo) / (hi - lo) * 34; }
            var pts = [], n = mktHist.length, i;
            for (i = 0; i < n; i++) pts.push((i * (100 / (n - 1))).toFixed(2) + ',' + yy(mktHist[i]).toFixed(2));
            mktLine.setAttribute('points', pts.join(' '));
            if (mktArea) mktArea.setAttribute('d', 'M0,40 L' + pts.join(' L') + ' L100,40 Z');
            if (mktDot) mktDot.style.top = (yy(mktPro) / 40 * 100).toFixed(1) + '%';
            var p = Math.round(mktPro), c = 100 - p;
            if (mktProPct) mktProPct.textContent = p + '%';
            if (mktConPct) mktConPct.textContent = c + '%';
            if (mktProFill) mktProFill.style.width = p + '%';
            if (mktConFill) mktConFill.style.width = c + '%';
            if (mktVol) mktVol.textContent = mktVolN.toLocaleString('en-US');
            if (mktBackers) mktBackers.textContent = String(mktBackersN);
            if (mktWatchEl) mktWatchEl.textContent = String(mktWatchN);
          }
          function newMarket(pairIdx){
            if (!mktLine) return;
            var nm = mktNames[pairIdx % mktNames.length];
            if (mktProName) mktProName.textContent = nm[0];
            if (mktConName) mktConName.textContent = nm[1];
            mktHist = [];
            var v = 42 + Math.random() * 16;
            for (var i = 0; i < 28; i++) { v = mktClamp(v + (Math.random() * 11 - 5)); mktHist.push(v); }
            mktPro = mktHist[mktHist.length - 1];
            mktVolN = 600 + Math.floor(Math.random() * 1800);
            mktBackersN = 18 + Math.floor(Math.random() * 40);
            mktWatchN = 120 + Math.floor(Math.random() * 260);
            renderMkt();
          }
          function tickMkt(){
            if (document.hidden || !mktLine) return;
            mktPro = mktClamp(mktPro + (Math.random() * 7 - 3.5));
            mktHist.push(mktPro);
            if (mktHist.length > 28) mktHist.shift();
            mktVolN += 2 + Math.floor(Math.random() * 13);
            if (Math.random() < .4) mktBackersN += 1;
            if (Math.random() < .5) mktWatchN += Math.round(Math.random() * 6 - 2.6);
            renderMkt();
          }
          newMarket(0);
          setInterval(tickMkt, 1700);
          var pairs = [
            ['/img/round/faces/face02.jpg','/img/round/faces/face07.jpg'],
            ['/img/round/faces/face10.jpg','/img/round/faces/face11.jpg'],
            ['/img/round/faces/face16.jpg','/img/round/faces/face19.jpg'],
            ['/img/round/faces/face24.jpg','/img/round/faces/face28.jpg'],
            ['/img/round/faces/face33.jpg','/img/round/faces/face41.jpg']
          ];
          pairs.forEach(function(pair){
            pair.forEach(function(src){
              var img = new Image();
              img.src = src;
            });
          });
          var idx = 0;
          // 2026-07-22: slowed per the founder. The tiles are meant to read as a
          // room you glance into, not a slideshow; at a 12s cycle with a
          // 230ms cut the pair visibly flicked while you were still reading
          // the motion under them.
          var fadeMs = 420;
          var staggerMs = 7000;
          var cycleMs = 21000;
          function swapFace(img, src){
            if (!img || !src || img.getAttribute('src') === src) return;
            img.classList.add('is-swapping');
            setTimeout(function(){
              img.src = src;
              img.classList.remove('is-swapping');
            }, fadeMs);
          }
          function swapRound(){
            if (document.hidden) return;
            idx = (idx + 1) % pairs.length;
            var next = pairs[idx];
            newMarket(idx);
            swapFace(speaker, next[0]);
            setTimeout(function(){
              if (document.hidden) return;
              swapFace(opponent, next[1]);
            }, staggerMs);
          }
          setTimeout(function(){
            swapRound();
            setInterval(swapRound, cycleMs);
          }, 4200);
        })();
      