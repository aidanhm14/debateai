
(function(){
  try {
    var params = new URLSearchParams(location.search);
    var status = params.get('billing');
    if (status !== 'success' && status !== 'canceled') return;
    var plan = (params.get('plan') || '').toLowerCase();
    var planLabel = ({lifetime:'Lifetime',individual:'Pro',team:'Team',byok:'BYOK'}[plan]) || 'Plan';
    var sessionId = params.get('session_id') || '';

    // Fire the GA4 purchase event BEFORE the URL params are stripped.
    // Without this, GA4 has no signal that the Stripe webhook closed a
    // sale — soul.md §8 ("Paid conversions: 0 tracked") was caused by
    // this gap. Stripe → Firestore was always wired; GA4 was not.
    if (status === 'success') {
      try {
        var planValue = ({lifetime:30, individual:10, team:50, byok:1}[plan]) || 0;
        if (window.gtag) {
          gtag('event', 'purchase', {
            transaction_id: sessionId || ('da-' + Date.now()),
            value: planValue,
            currency: 'USD',
            items: [{ item_id: plan || 'unknown', item_name: planLabel + ' plan', price: planValue, quantity: 1 }],
          });
        }
        if (window.dosTrack) {
          window.dosTrack('billing_purchase_completed', { plan: plan, value: planValue, session_id: sessionId });
        }
      } catch(e) { console.warn('[billing-banner] gtag purchase failed:', e); }
    } else if (status === 'canceled') {
      try { if (window.dosTrack) window.dosTrack('billing_purchase_canceled', { plan: plan }); } catch(e){}
    }

    // Strip params so refresh doesn't re-show the banner.
    try {
      var clean = location.pathname + location.hash;
      history.replaceState({}, '', clean);
    } catch(e){}

    var ok = status === 'success';
    var banner = document.createElement('div');
    banner.setAttribute('role','status');
    banner.style.cssText = [
      'position:fixed','top:20px','left:50%','transform:translateX(-50%)','z-index:99999',
      'max-width:560px','width:calc(100% - 32px)','padding:16px 22px',
      'background:'+(ok?'linear-gradient(135deg,rgba(34,197,94,.94),rgba(22,163,74,.94))':'rgba(20,20,24,.94)'),
      'color:#fff','font-family:var(--font-body)','font-size:.92rem','font-weight:600',
      'border:1px solid '+(ok?'rgba(34,197,94,.55)':'rgba(255,255,255,.18)'),
      'border-radius:14px','box-shadow:0 18px 60px rgba(0,0,0,.4)',
      'display:flex','align-items:center','gap:14px','flex-wrap:wrap',
      'animation:billingSlide .35s cubic-bezier(.2,.65,.3,.9)',
    ].join(';');
    banner.innerHTML = ok
      ? '<div style="flex:1;min-width:200px;line-height:1.45">'
        + '<div style="font-weight:800;font-size:.96rem;margin-bottom:2px">✓ '+planLabel+' is active.</div>'
        + '<div style="font-weight:500;opacity:.9;font-size:.82rem">Your team is upgraded. Receipt is on its way to your email.</div>'
        + '</div>'
        + '<a href="/newvoice" style="padding:8px 16px;background:rgba(255,255,255,.18);color:#fff;border-radius:999px;font-size:.78rem;font-weight:800;letter-spacing:.04em;text-decoration:none;white-space:nowrap;border:1px solid rgba(255,255,255,.32)">Run a round →</a>'
        + '<button type="button" aria-label="Dismiss" style="background:transparent;border:none;color:rgba(255,255,255,.85);font-size:1rem;cursor:pointer;padding:0 4px;font-family:inherit">✕</button>'
      : '<div style="flex:1;min-width:200px;line-height:1.45">'
        + '<div style="font-weight:800;font-size:.96rem;margin-bottom:2px">Checkout cancelled.</div>'
        + '<div style="font-weight:500;opacity:.85;font-size:.82rem">No charge was made. The page is unchanged.</div>'
        + '</div>'
        + '<a href="/pricing" style="padding:8px 16px;background:#fff;color:#1f1f1f;border-radius:999px;font-size:.78rem;font-weight:800;letter-spacing:.04em;text-decoration:none;white-space:nowrap">Try again</a>'
        + '<button type="button" aria-label="Dismiss" style="background:transparent;border:none;color:rgba(255,255,255,.7);font-size:1rem;cursor:pointer;padding:0 4px;font-family:inherit">✕</button>';

    var style = document.createElement('style');
    style.textContent = '@keyframes billingSlide{from{transform:translate(-50%,-12px);opacity:0}to{transform:translateX(-50%);opacity:1}}';
    document.head.appendChild(style);

    document.body.appendChild(banner);
    var dismiss = function(){ banner.style.transition='opacity .25s'; banner.style.opacity='0'; setTimeout(function(){ banner.remove(); }, 250); };
    var btn = banner.querySelector('button');
    if (btn) btn.addEventListener('click', dismiss);
    if (ok) setTimeout(dismiss, 14000);
    else setTimeout(dismiss, 9000);
  } catch(e) {
    console.warn('[billing-banner] failed:', e);
  }
})();
