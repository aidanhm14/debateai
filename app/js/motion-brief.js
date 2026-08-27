/* Shared resilient background-brief request for /live-round.
 *
 * A context brief is helpful setup, not a reason to strand the round. The
 * provider gets one retry for transient failures. If it is still unavailable,
 * the page receives a neutral local brief instead of an error message.
 */
(function (root) {
  'use strict';

  var SYSTEM = 'You are a debate case-writer. Given a motion, write a SHORT factual background brief of 2 to 3 sentences that a person could read aloud to set context: what the motion is about, the real-world facts and stakes, and the central tension. Neutral, take no side. No jargon, no preamble, no markdown, no em dashes.';

  function fallback(motion) {
    var clean = String(motion || '').replace(/\s+/g, ' ').trim();
    if (/\bregrets?\b/i.test(clean)) {
      return 'The central question is whether the choice named in the resolution caused more harm than benefit, and whether a realistic alternative would have produced a better result. Compare what changed because of that choice, who was affected, and which consequences matter most.';
    }
    if (/\bwould\b|\bshould\b|\bmust\b|\bban\b|\brequire\b|\babolish\b|\blegali[sz]e\b/i.test(clean)) {
      return 'The central question is whether the proposed change would solve the problem better than the current approach or a narrower alternative. Compare who gains, who bears the costs, what incentives change, and whether the proposal can work as intended.';
    }
    return 'The central question is which side gives the better account of the values, consequences, and incentives behind the resolution. Compare who is affected, what changes in practice, and why one set of tradeoffs should matter more.';
  }

  function extract(payload) {
    var text = (payload && payload.content && payload.content[0] && payload.content[0].text) ||
      (payload && payload.choices && payload.choices[0] && payload.choices[0].message && payload.choices[0].message.content) ||
      (payload && payload.text) || '';
    return String(text || '').trim();
  }

  function once(motion, fetchImpl) {
    return fetchImpl('/api/claude', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 400,
        stream: false,
        system: SYSTEM,
        messages: [{ role: 'user', content: 'Motion: ' + motion }],
        _feature: 'live-round-brief',
        _motion: motion,
      }),
    }).then(function (response) {
      var parsed = null;
      try { parsed = response && response.json ? response.json() : null; } catch (e) {}
      return Promise.resolve(parsed).catch(function () { return null; }).then(function (payload) {
        var text = extract(payload);
        if (response && response.ok && text) return text;
        var err = new Error((payload && payload.error) || 'Brief request failed');
        err.status = response ? Number(response.status || 0) : 0;
        err.code = payload && payload.code;
        err.empty = !!(response && response.ok && !text);
        throw err;
      });
    });
  }

  function wait(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  function request(motion, options) {
    var opts = options || {};
    var fetchImpl = opts.fetch || (root.fetch && root.fetch.bind(root));
    var retries = typeof opts.retries === 'number' ? Math.max(0, opts.retries) : 1;
    var retryDelay = typeof opts.retryDelay === 'number' ? Math.max(0, opts.retryDelay) : 500;
    if (!fetchImpl) return Promise.resolve(fallback(motion));

    function attempt(number) {
      return once(motion, fetchImpl).catch(function (err) {
        var transient = !!err.empty || !err.status || err.status === 408 || err.status === 425 || err.status >= 500;
        if (transient && number < retries) {
          return wait(retryDelay).then(function () { return attempt(number + 1); });
        }
        try {
          if (root.gtag) root.gtag('event', 'live_round_brief_fallback', {
            status: err.status || 0,
            code: err.code || 'network',
          });
        } catch (e) {}
        return fallback(motion);
      });
    }

    return attempt(0);
  }

  root.MotionBrief = {
    request: request,
    fallback: fallback,
    extract: extract,
  };
})(typeof window !== 'undefined' ? window : globalThis);
