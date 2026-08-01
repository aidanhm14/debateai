// WS2 Phase 3: Reaction rail — spectators tag moments with reactions.
// Reactions: 👍 strong point | ❌ dodge | 📖 citation needed | 🎯 direct | 💭 unclear
// Stored per-speech in voice_rounds/{id}/reactions/{speechIndex}/{reactionType}

const ReactionRail = (() => {
  let roundIdRef = null;
  let speechIndexRef = null;
  let containerRef = null;
  const reactions = [
    { key: 'strong', emoji: '👍', label: 'Strong point' },
    { key: 'dodge', emoji: '❌', label: 'Dodges' },
    { key: 'citation', emoji: '📖', label: 'Citation needed' },
    { key: 'direct', emoji: '🎯', label: 'Direct clash' },
    { key: 'unclear', emoji: '💭', label: 'Unclear' }
  ];

  const start = (roundId, speechIndex, container) => {
    roundIdRef = roundId;
    speechIndexRef = speechIndex;
    containerRef = container;
    renderRail();
  };

  const stop = () => {
    roundIdRef = null;
    speechIndexRef = null;
    if (containerRef) containerRef.innerHTML = '';
  };

  const renderRail = () => {
    if (!containerRef || !roundIdRef || typeof speechIndexRef !== 'number') return;

    containerRef.innerHTML = '';
    containerRef.style.cssText = `
      display: flex;
      gap: 8px;
      align-items: center;
      padding: 12px 16px;
      background: rgba(0,0,0,0.04);
      border-radius: 8px;
      border: 1px solid rgba(0,0,0,0.08);
    `;

    const label = document.createElement('div');
    label.textContent = 'React:';
    label.style.cssText = 'font-size: 12px; font-weight: 600; color: #666; text-transform: uppercase; letter-spacing: 0.5px;';
    containerRef.appendChild(label);

    reactions.forEach(({ key, emoji, label: labelText }) => {
      const btn = document.createElement('button');
      btn.setAttribute('data-reaction', key);
      btn.textContent = `${emoji} ${labelText}`;
      btn.title = labelText;
      btn.style.cssText = `
        background: #f5f5f0;
        border: 1px solid #ddd;
        border-radius: 6px;
        padding: 8px 12px;
        font-size: 13px;
        cursor: pointer;
        transition: all 200ms;
        display: flex;
        align-items: center;
        gap: 4px;
        white-space: nowrap;
      `;

      btn.onmouseover = () => {
        btn.style.background = '#efefeb';
        btn.style.borderColor = '#bbb';
      };
      btn.onmouseout = () => {
        btn.style.background = '#f5f5f0';
        btn.style.borderColor = '#ddd';
      };

      btn.onclick = async (e) => {
        e.preventDefault();
        await logReaction(key);
        btn.style.background = '#e8f5e9';
        btn.style.borderColor = '#4caf50';
        btn.textContent = '✓ ' + labelText;
        setTimeout(() => {
          btn.style.background = '#f5f5f0';
          btn.style.borderColor = '#ddd';
          btn.textContent = `${emoji} ${labelText}`;
        }, 1500);
      };

      containerRef.appendChild(btn);
    });
  };

  const logReaction = async (reactionKey) => {
    if (!roundIdRef || typeof speechIndexRef !== 'number') return;

    try {
      const token = await firebase.auth().currentUser?.getIdToken();
      if (!token) return;  // Anon users can't react

      await fetch('/api/log-reaction', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'authorization': `Bearer ${token}` },
        body: JSON.stringify({
          roundId: roundIdRef,
          speechIndex: speechIndexRef,
          reactionKey
        })
      });

      // GA4
      if (typeof gtag !== 'undefined') {
        gtag('event', 'voice_reaction', {
          round_id: roundIdRef,
          speech_index: speechIndexRef,
          reaction: reactionKey
        });
      }
    } catch (err) {
      console.error('[reaction-rail] log error:', err);
    }
  };

  return { start, stop };
})();

// Top-level const doesn't attach to window; the voice-debate wiring
// checks window.ReactionRail, so expose explicitly.
window.ReactionRail = ReactionRail;
