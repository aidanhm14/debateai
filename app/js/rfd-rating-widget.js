// WS1 Phase 3: Blind RFD rating widget for quality validation.
// Embeds in admin panels to rate RFDs without knowing model/persona.
// Dimensions: clarity, persuasiveness, accuracy, conciseness, fairness (1-5).

(function() {
  'use strict';

  const DIMENSIONS = [
    { key: 'clarity', label: 'Clarity', desc: 'Is the logic easy to follow?' },
    { key: 'persuasiveness', label: 'Persuasiveness', desc: 'Does it win the argument?' },
    { key: 'accuracy', label: 'Accuracy', desc: 'Are facts correct?' },
    { key: 'conciseness', label: 'Conciseness', desc: 'Is it properly paced?' },
    { key: 'fairness', label: 'Fairness', desc: 'Does it judge both sides fairly?' }
  ];

  async function submitRating(roundId, ratings) {
    const token = await getAuthToken();
    if (!token) {
      alert('Please sign in to rate RFDs.');
      return false;
    }

    try {
      const res = await fetch('/api/log-rfd-rating', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({ roundId, ratings, blind: true })
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert('Rating failed: ' + (err.error || res.statusText));
        return false;
      }

      return true;
    } catch (e) {
      console.error('[rfd-rating] submit error:', e);
      alert('Network error. Try again.');
      return false;
    }
  }

  function getAuthToken() {
    return new Promise((resolve) => {
      if (typeof firebase !== 'undefined' && firebase.auth) {
        firebase.auth().currentUser?.getIdToken().then(resolve).catch(() => resolve(null));
      } else {
        resolve(null);
      }
    });
  }

  window.RFDRatingWidget = {
    DIMENSIONS,
    submitRating,
    buildRatingForm: function(roundId) {
      const html = `
        <div class="rfd-rating-form">
          <h3>Rate this RFD</h3>
          <p style="font-size: 0.9em; opacity: 0.7;">Blind review — you won't see which model generated this.</p>
          <div class="rating-fields">
      `;
      
      let innerHtml = html;
      for (const dim of DIMENSIONS) {
        innerHtml += `
          <div class="rating-field">
            <label for="rating-${dim.key}">
              <strong>${dim.label}</strong>
              <br/><small>${dim.desc}</small>
            </label>
            <div class="rating-scale" role="radiogroup" aria-label="${dim.label}">
              ${[1, 2, 3, 4, 5].map(n => `
                <label class="rating-option">
                  <input type="radio" name="rating-${dim.key}" value="${n}" />
                  <span>${n}</span>
                </label>
              `).join('')}
            </div>
          </div>
        `;
      }

      innerHtml += `
          </div>
          <button type="button" class="rfd-submit-btn" onclick="RFDRatingWidget._handleSubmit('${roundId}')">
            Submit Rating
          </button>
        </div>
      `;
      
      return innerHtml;
    },
    _handleSubmit: async function(roundId) {
      const ratings = {};
      let allFilled = true;

      for (const dim of DIMENSIONS) {
        const selected = document.querySelector(`input[name="rating-${dim.key}"]:checked`);
        if (!selected) {
          allFilled = false;
          break;
        }
        ratings[dim.key] = parseInt(selected.value, 10);
      }

      if (!allFilled) {
        alert('Please rate all dimensions.');
        return;
      }

      const btn = event.target;
      btn.disabled = true;
      btn.textContent = 'Submitting…';

      const ok = await this.submitRating(roundId, ratings);
      if (ok) {
        alert('Rating submitted! Thanks for helping us improve.');
        btn.style.display = 'none';
      } else {
        btn.disabled = false;
        btn.textContent = 'Submit Rating';
      }
    }
  };
})();
