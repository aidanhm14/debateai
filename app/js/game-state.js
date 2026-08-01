// WS2 Phase 4: Real-time game state display + visual effects.
// Tracks score, streak, combo, argument strength per side.
// Renders health bar, score ticker, combo announcements.

const GameState = (() => {
  let roundIdRef = null;
  let sideRef = null;
  let containerRef = null;
  let scoreRef = 0;
  let streakRef = 0;
  let comboRef = false;
  let argumentStrengthRef = 0;

  // DOM refs
  let scoreDisplayRef = null;
  let healthBarRef = null;
  let streakDisplayRef = null;
  let comboAnnouncementRef = null;

  const start = (roundId, side, container) => {
    roundIdRef = roundId;
    sideRef = side;
    containerRef = container;
    render();
    listenToGameState();
  };

  const stop = () => {
    roundIdRef = null;
    sideRef = null;
    if (containerRef) containerRef.innerHTML = '';
  };

  const render = () => {
    if (!containerRef) return;

    containerRef.innerHTML = `
      <div style="
        display: flex;
        flex-direction: column;
        gap: 12px;
        padding: 16px;
        background: rgba(0,0,0,0.02);
        border-radius: 8px;
        border: 1px solid rgba(0,0,0,0.08);
        font-family: 'Geist Mono', monospace;
      ">
        <!-- Score Display -->
        <div style="
          display: flex;
          justify-content: space-between;
          align-items: baseline;
          gap: 12px;
        ">
          <div style="font-size: 12px; font-weight: 600; text-transform: uppercase; color: #666; letter-spacing: 0.5px;">
            Round Score
          </div>
          <div id="scoreDisplay" style="
            font-size: 28px;
            font-weight: 700;
            color: #ef4444;
            transition: transform 200ms cubic-bezier(0.34, 1.56, 0.64, 1);
          ">
            ${scoreRef}
          </div>
        </div>

        <!-- Health Bar -->
        <div style="
          display: flex;
          flex-direction: column;
          gap: 6px;
        ">
          <div style="font-size: 11px; font-weight: 500; color: #999; text-transform: uppercase; letter-spacing: 0.4px;">
            Argument Strength
          </div>
          <div id="healthBar" style="
            height: 8px;
            background: #eee;
            border-radius: 4px;
            overflow: hidden;
            position: relative;
          ">
            <div style="
              height: 100%;
              width: ${Math.max(0, argumentStrengthRef * 100)}%;
              background: linear-gradient(90deg, #ef4444 0%, #f97316 50%, #22c55e 100%);
              transition: width 400ms ease-out;
              box-shadow: 0 0 12px rgba(239, 68, 68, 0.4);
            "></div>
          </div>
        </div>

        <!-- Streak Indicator -->
        <div id="streakDisplay" style="
          display: ${streakRef > 0 ? 'flex' : 'none'};
          align-items: center;
          gap: 8px;
          padding: 8px 12px;
          background: linear-gradient(135deg, #fbbf24, #f59e0b);
          border-radius: 6px;
          color: #fff;
          font-weight: 600;
          font-size: 13px;
          animation: slideIn 300ms cubic-bezier(0.34, 1.56, 0.64, 1);
        ">
          🔥 ${streakRef} Hit Streak
        </div>

        <!-- Combo Announcement -->
        <div id="comboAnnouncement" style="
          display: none;
          text-align: center;
          padding: 12px;
          background: linear-gradient(135deg, #a78bfa, #8b5cf6);
          border-radius: 6px;
          color: #fff;
          font-weight: 700;
          font-size: 16px;
          animation: popIn 300ms cubic-bezier(0.34, 1.56, 0.64, 1);
        ">
          💥 COMBO! ×1.5
        </div>
      </div>

      <style>
        @keyframes slideIn {
          from {
            opacity: 0;
            transform: translateX(-12px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }

        @keyframes popIn {
          0% {
            opacity: 0;
            transform: scale(0.8);
          }
          50% {
            opacity: 1;
            transform: scale(1.05);
          }
          100% {
            opacity: 1;
            transform: scale(1);
          }
        }
      </style>
    `;

    scoreDisplayRef = containerRef.querySelector('#scoreDisplay');
    healthBarRef = containerRef.querySelector('#healthBar');
    streakDisplayRef = containerRef.querySelector('#streakDisplay');
    comboAnnouncementRef = containerRef.querySelector('#comboAnnouncement');
  };

  const updateScore = async (speechIndex, argumentText) => {
    if (!roundIdRef || !sideRef) return;

    try {
      // Token optional: anon rounds still score (the endpoint only reads
      // public reaction counts); signed-in users get attributed.
      let token = null;
      try { token = await firebase.auth().currentUser?.getIdToken(); } catch (_) {}
      const headers = { 'content-type': 'application/json' };
      if (token) headers['authorization'] = `Bearer ${token}`;

      const res = await fetch('/api/compute-game-score', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          roundId: roundIdRef,
          speechIndex,
          side: sideRef,
          argumentText: argumentText?.slice(0, 500) || ''
        })
      });

      if (!res.ok) return;

      const data = await res.json();
      if (!data.ok) return;

      scoreRef = data.score;
      streakRef = data.streak;
      comboRef = data.combo;
      argumentStrengthRef = data.argumentStrength;

      // Visual update
      if (scoreDisplayRef) {
        scoreDisplayRef.textContent = data.totalScore;
        scoreDisplayRef.style.transform = 'scale(1.15)';
        setTimeout(() => {
          scoreDisplayRef.style.transform = 'scale(1)';
        }, 200);
      }

      // Update health bar
      if (healthBarRef) {
        const fillBar = healthBarRef.querySelector('div');
        if (fillBar) {
          fillBar.style.width = `${Math.max(0, argumentStrengthRef * 100)}%`;
        }
      }

      // Streak display
      if (streakDisplayRef) {
        streakDisplayRef.style.display = streakRef > 0 ? 'flex' : 'none';
        streakDisplayRef.textContent = `🔥 ${streakRef} Hit Streak`;
      }

      // Combo announcement
      if (comboRef && comboAnnouncementRef) {
        comboAnnouncementRef.style.display = 'block';
        setTimeout(() => {
          comboAnnouncementRef.style.display = 'none';
        }, 2000);
      }

      // GA4
      if (typeof gtag !== 'undefined') {
        gtag('event', 'game_score_updated', {
          round_id: roundIdRef,
          side: sideRef,
          score: data.score,
          total_score: data.totalScore,
          streak: data.streak,
          combo: data.combo,
          argument_strength: Math.round(argumentStrengthRef * 100)
        });
      }
    } catch (err) {
      console.error('[game-state] update error:', err);
    }
  };

  const listenToGameState = () => {
    if (!roundIdRef) return;

    try {
      const unsubscribe = firebase.firestore()
        .collection('voice_rounds').doc(roundIdRef)
        .collection('game_state').doc('current')
        .onSnapshot((snap) => {
          if (!snap.exists) return;
          const state = snap.data();
          scoreRef = state.lastSpeechScore || 0;
          streakRef = state.streak || 0;
        }, (err) => console.error('[game-state] listener error:', err));

      window.__gameStateUnsubscribe = unsubscribe;
    } catch (err) {
      console.error('[game-state] listen error:', err);
    }
  };

  return { start, stop, updateScore };
})();
