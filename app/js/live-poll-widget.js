// WS2 Phase 2: Live poll widget for mid-debate audience participation.
// Displays polls every 90s during voice rounds.
// Questions generated dynamically from motion + argument context.

(function() {
  'use strict';

  let pollTimer = null;
  let pollNumber = 0;
  let currentPollEl = null;

  async function generatePollQuestion(roundId, motion, sideArg, elapsedMs) {
    try {
      const res = await fetch('/api/generate-poll-question', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roundId, motion, sideArg, elapsedMs })
      });

      if (!res.ok) return null;
      return await res.json();
    } catch (e) {
      console.error('[live-poll] generate error:', e);
      return null;
    }
  }

  async function submitPollResponse(roundId, pollNumber, pollType, question, answer) {
    try {
      const res = await fetch('/api/log-poll-response', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roundId, pollNumber, pollType, question, answer })
      });

      if (!res.ok) {
        console.error('[live-poll] submit failed:', res.status);
        return false;
      }

      if (typeof gtag === 'function') {
        gtag('event', 'live_poll_response', {
          round_id: roundId,
          poll_number: pollNumber,
          poll_type: pollType,
          answer: answer
        });
      }

      return true;
    } catch (e) {
      console.error('[live-poll] submit error:', e);
      return false;
    }
  }

  function buildPollUI(pollData) {
    const { question, pollType, answers, pollNumber } = pollData;
    
    const html = `
      <div class="live-poll" data-poll-number="${pollNumber}">
        <div class="poll-header">
          <div class="poll-label">Live Poll ${pollNumber}</div>
          <div class="poll-question">${question}</div>
        </div>
        <div class="poll-options">
          ${answers.map((ans, idx) => `
            <button type="button" class="poll-option" data-answer="${ans}">
              ${ans}
            </button>
          `).join('')}
        </div>
        <div class="poll-timer">Closes in 90 seconds</div>
      </div>
    `;
    
    return html;
  }

  function showPoll(pollHTML, roundId, pollNumber, pollType, question) {
    if (currentPollEl) {
      currentPollEl.remove();
    }

    const container = document.querySelector('[data-role="arena-live"]') || 
                     document.querySelector('.arena') ||
                     document.body;
    
    const wrapper = document.createElement('div');
    wrapper.innerHTML = pollHTML;
    currentPollEl = wrapper.firstChild;
    container.appendChild(currentPollEl);

    // Attach click handlers
    currentPollEl.querySelectorAll('.poll-option').forEach(btn => {
      btn.addEventListener('click', async function() {
        const answer = this.getAttribute('data-answer');
        btn.disabled = true;
        btn.textContent = '✓ ' + answer;

        await submitPollResponse(roundId, pollNumber, pollType, question, answer);
        
        setTimeout(() => {
          if (currentPollEl && currentPollEl.parentNode) {
            currentPollEl.remove();
            currentPollEl = null;
          }
        }, 2000);
      });
    });

    // Auto-close after 90s
    setTimeout(() => {
      if (currentPollEl && currentPollEl.parentNode) {
        currentPollEl.remove();
        currentPollEl = null;
      }
    }, 90000);
  }

  window.LivePollWidget = {
    start: function(roundId, motion, opts) {
      opts = opts || {};
      const interval = opts.interval || 90000; // 90 seconds default

      pollTimer = setInterval(async () => {
        pollNumber++;
        
        // Get the current side's argument from the DOM or pass via opts
        const currentArg = opts.getCurrentArg ? opts.getCurrentArg() : motion;
        const elapsedMs = opts.getElapsed ? opts.getElapsed() : Date.now();

        const pollData = await generatePollQuestion(roundId, motion, currentArg, elapsedMs);
        if (pollData && pollData.ok) {
          const pollHTML = buildPollUI(pollData);
          showPoll(pollHTML, roundId, pollData.pollNumber, pollData.pollType, pollData.question);
        }
      }, interval);
    },

    stop: function() {
      if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
      if (currentPollEl && currentPollEl.parentNode) {
        currentPollEl.remove();
        currentPollEl = null;
      }
    }
  };
})();
