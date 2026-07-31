// WS2: Spectator pre/post vote collection for recorded debates.
// Handles device identity (signed cookie), vote UI, and persists votes.
// No signup required; permanent device cookie (365 days).

(function() {
  'use strict';

  const VOTER_ID_COOKIE = 'debateos-voter-id';
  const VOTER_ID_STORAGE_KEY = 'debateos-voter-id-fallback';
  const VOTE_TIMEOUT_MS = 30_000;

  // Generate a cryptographically random voter ID (hex string, 32 chars)
  function generateVoterId() {
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      const arr = new Uint8Array(16);
      crypto.getRandomValues(arr);
      return Array.from(arr, b => b.toString(16).padStart(2, '0')).join('');
    }
    // Fallback: weak random (for old browsers)
    return Math.random().toString(36).substring(2, 18) +
           Math.random().toString(36).substring(2, 18);
  }

  // Get or create the voter ID (stored in a signed cookie)
  function getVoterId() {
    // Check if cookie exists (naive check; real impl would verify signature)
    const cookies = document.cookie.split(';');
    for (let c of cookies) {
      const [name, value] = c.trim().split('=');
      if (name === VOTER_ID_COOKIE && value) {
        return decodeURIComponent(value);
      }
    }

    // Cookie not found; check localStorage fallback
    let voterId = localStorage.getItem(VOTER_ID_STORAGE_KEY);
    if (!voterId) {
      voterId = generateVoterId();
      localStorage.setItem(VOTER_ID_STORAGE_KEY, voterId);
    }

    // Set cookie (365 days, path=/, no-secure for localhost testing, secure in prod)
    const expiry = new Date();
    expiry.setTime(expiry.getTime() + 365 * 24 * 60 * 60 * 1000);
    const secure = location.protocol === 'https:' ? '; Secure' : '';
    document.cookie = VOTER_ID_COOKIE + '=' + encodeURIComponent(voterId) +
                      '; expires=' + expiry.toUTCString() +
                      '; path=/' + secure + '; SameSite=Lax';

    return voterId;
  }

  // Submit a vote to /api/log-vote
  async function submitVote(roundId, side, confidence, phase) {
    const voterId = getVoterId();
    const payload = { roundId, voterId, side, confidence, phase };

    try {
      const res = await fetch('/api/log-vote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        console.warn('[vote-collector] vote failed:', err);
        return { success: false, error: err.error };
      }

      const result = await res.json();
      if (window.gtag) {
        gtag('event', phase + '_vote_cast', {
          round_id: roundId,
          side: side || 'unsure',
          confidence: confidence,
        });
      }
      return result;
    } catch (e) {
      console.error('[vote-collector] fetch error:', e);
      return { success: false, error: e.message };
    }
  }

  // Build the pre-vote UI
  function buildPreVoteUI(roundId) {
    const html = `
      <div class="vote-card vote-card--pre" id="preVoteCard">
        <div class="vote-header">
          <h3>Before you watch</h3>
          <p>Which side do you think is right?</p>
        </div>
        <div class="vote-form">
          <div class="vote-side-group" role="radiogroup" aria-label="Which side do you agree with?">
            <label class="vote-side-option">
              <input type="radio" name="preVoteSide" value="gov" />
              <span class="radio-label">Government / Affirmative</span>
            </label>
            <label class="vote-side-option">
              <input type="radio" name="preVoteSide" value="opp" />
              <span class="radio-label">Opposition / Negative</span>
            </label>
            <label class="vote-side-option">
              <input type="radio" name="preVoteSide" value="unsure" />
              <span class="radio-label">Not sure yet</span>
            </label>
          </div>

          <div class="vote-confidence">
            <label for="preConfidence">How confident? <span class="confidence-value" id="preConfidenceValue">50</span>%</label>
            <input type="range" id="preConfidence" name="preConfidence" min="0" max="100" value="50"
                   class="confidence-slider" />
          </div>

          <button class="vote-submit" id="preVoteSubmit" type="button">Continue to ballot →</button>
        </div>
      </div>
    `;
    return html;
  }

  // Build the post-vote UI
  function buildPostVoteUI(roundId) {
    const html = `
      <div class="vote-card vote-card--post" id="postVoteCard">
        <div class="vote-header">
          <h3>After the ballot</h3>
          <p>Did the round change your mind?</p>
        </div>
        <div class="vote-form">
          <div class="vote-side-group" role="radiogroup" aria-label="What do you think now?">
            <label class="vote-side-option">
              <input type="radio" name="postVoteSide" value="gov" />
              <span class="radio-label">Government / Affirmative</span>
            </label>
            <label class="vote-side-option">
              <input type="radio" name="postVoteSide" value="opp" />
              <span class="radio-label">Opposition / Negative</span>
            </label>
            <label class="vote-side-option">
              <input type="radio" name="postVoteSide" value="unsure" />
              <span class="radio-label">Still not sure</span>
            </label>
          </div>

          <div class="vote-confidence">
            <label for="postConfidence">How confident now? <span class="confidence-value" id="postConfidenceValue">50</span>%</label>
            <input type="range" id="postConfidence" name="postConfidence" min="0" max="100" value="50"
                   class="confidence-slider" />
          </div>

          <button class="vote-submit" id="postVoteSubmit" type="button">Submit vote</button>
        </div>
      </div>
    `;
    return html;
  }

  // Attach listeners to vote forms
  function attachVoteListeners(roundId, phase) {
    const prefix = phase === 'pre' ? 'pre' : 'post';
    const submitBtn = document.getElementById(prefix + 'VoteSubmit');
    const confSlider = document.getElementById(prefix + 'Confidence');
    const confValue = document.getElementById(prefix + 'ConfidenceValue');

    if (confSlider) {
      confSlider.addEventListener('input', function() {
        confValue.textContent = this.value;
      });
    }

    if (submitBtn) {
      submitBtn.addEventListener('click', async function() {
        const sideInput = document.querySelector('input[name="' + prefix + 'VoteSide"]:checked');
        const side = sideInput ? (sideInput.value === 'unsure' ? null : sideInput.value) : null;
        const confidence = confSlider ? parseInt(confSlider.value) : 50;

        submitBtn.disabled = true;
        submitBtn.textContent = phase === 'pre' ? 'Loading ballot...' : 'Submitting...';

        const result = await submitVote(roundId, side, confidence, phase);

        if (result.success) {
          const card = document.getElementById(phase + 'VoteCard');
          if (card) {
            card.style.display = 'none';
          }
        } else {
          console.error('[vote-collector] vote failed:', result.error);
          submitBtn.disabled = false;
          submitBtn.textContent = phase === 'pre' ? 'Continue to ballot →' : 'Submit vote';
        }
      });
    }
  }

  // Public API
  window.VoteCollector = {
    getVoterId,
    buildPreVoteUI,
    buildPostVoteUI,
    attachVoteListeners,
    submitVote,
  };
})();
