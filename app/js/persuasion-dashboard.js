// WS3: Persuasion delta dashboard — visualize which arguments changed minds.
// Embeds in /admin to show per-round analysis.

(function() {
  'use strict';

  async function fetchPersuasionData(roundId) {
    try {
      const res = await fetch('/api/compute-persuasion-delta?roundId=' + encodeURIComponent(roundId));
      if (!res.ok) return null;
      return await res.json();
    } catch (e) {
      console.error('[persuasion-dashboard] fetch error:', e);
      return null;
    }
  }

  function renderDeltaBar(delta, maxScore) {
    const pct = Math.abs(delta.persuasionScore) / maxScore * 100;
    const isPositive = delta.persuasionScore >= 0;
    const color = isPositive ? '#4ade80' : '#ef4444';
    
    return `
      <div class="delta-row">
        <div class="delta-claim">${delta.claim}</div>
        <div class="delta-bar" style="width: ${pct}%; background: ${color}; height: 24px; border-radius: 4px; position: relative;">
          <span class="delta-label" style="position: absolute; right: 8px; top: 2px; color: white; font-size: 0.8em; font-weight: 600;">
            ${isPositive ? '+' : ''}${delta.persuasionScore}%
          </span>
        </div>
        <div class="delta-meta">${delta.respondentCount} voters</div>
      </div>
    `;
  }

  function renderDashboard(data) {
    if (!data || !data.deltas || data.deltas.length === 0) {
      return `<div style="padding: 20px; text-align: center; opacity: 0.6;">No poll data yet</div>`;
    }

    const maxScore = Math.max(...data.deltas.map(d => Math.abs(d.persuasionScore)));
    
    const html = `
      <div class="persuasion-dashboard">
        <div class="dashboard-header">
          <h3>Persuasion Analysis</h3>
          <p style="font-size: 0.9em; opacity: 0.7;">Which arguments moved the needle? (${data.pollCount} polls)</p>
        </div>
        <div class="dashboard-stat">
          <strong>Average Impact:</strong> ${data.avgPersuasionScore >= 0 ? '+' : ''}${data.avgPersuasionScore}%
        </div>
        <div class="delta-rows">
          ${data.deltas.map(d => renderDeltaBar(d, maxScore)).join('')}
        </div>
        <div class="dashboard-footer" style="font-size: 0.85em; opacity: 0.6; margin-top: 12px;">
          Green = more agreement after the argument. Red = more disagreement.
        </div>
      </div>
    `;

    return html;
  }

  window.PersuasionDashboard = {
    render: async function(roundId, container) {
      if (typeof container === 'string') {
        container = document.querySelector(container);
      }
      
      if (!container) return;

      container.innerHTML = '<div style="padding: 20px; text-align: center;">Loading persuasion analysis…</div>';

      const data = await fetchPersuasionData(roundId);
      container.innerHTML = renderDashboard(data);

      if (typeof gtag === 'function') {
        gtag('event', 'persuasion_dashboard_view', { round_id: roundId, poll_count: data?.pollCount || 0 });
      }
    }
  };
})();
