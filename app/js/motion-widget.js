(function () {
  'use strict';

  var motions = [
    { motion: 'Governments should ban targeted advertising to minors.', clash: 'Consumer choice versus protection from manipulation.' },
    { motion: 'Social media platforms should require identity verification for every account.', clash: 'Accountability versus privacy and open participation.' },
    { motion: 'Cities should make public transportation free.', clash: 'Universal access versus cost and service quality.' },
    { motion: 'Schools should replace most homework with supervised study time.', clash: 'Independent practice versus equitable support and free time.' },
    { motion: 'Professional sports leagues should use promotion and relegation.', clash: 'Competitive merit versus financial stability.' },
    { motion: 'Governments should guarantee a job to every adult who wants one.', clash: 'Economic security versus cost and labor-market distortion.' },
    { motion: 'News organizations should stop publishing political opinion polls before elections.', clash: 'Public information versus bandwagon effects and strategic voting.' },
    { motion: 'Museums should return contested cultural artifacts to their places of origin.', clash: 'Restitution and sovereignty versus preservation and public access.' },
    { motion: 'Universities should abolish legacy admissions.', clash: 'Equal opportunity versus institutional loyalty and fundraising.' },
    { motion: 'Artificial intelligence companies should compensate creators whose work trains commercial models.', clash: 'Creator rights versus innovation and practical enforcement.' },
    { motion: 'Countries should lower the voting age to 16.', clash: 'Earlier representation versus readiness and civic knowledge.' },
    { motion: 'Scientific research funded by taxpayers should be free for anyone to read.', clash: 'Public access versus the cost of publishing and review.' }
  ];

  var lastIndex = -1;

  function element(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  function addStyles() {
    if (document.getElementById('da-motion-widget-styles')) return;
    var style = document.createElement('style');
    style.id = 'da-motion-widget-styles';
    style.textContent =
      '.da-motion-widget{font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;max-width:680px;color:#171717}' +
      '.da-motion-widget *{box-sizing:border-box}' +
      '.da-motion-widget__card{border:1px solid #dedbd4;border-radius:16px;background:#fff;padding:24px;box-shadow:0 10px 30px rgba(23,23,23,.08)}' +
      '.da-motion-widget__label{margin:0 0 10px;color:#a11a18;font-size:12px;font-weight:800;letter-spacing:.12em;text-transform:uppercase}' +
      '.da-motion-widget__motion{margin:0;font-family:Georgia,"Times New Roman",serif;font-size:clamp(22px,4vw,34px);line-height:1.14;letter-spacing:-.02em}' +
      '.da-motion-widget__clash{margin:14px 0 22px;color:#57534e;font-size:15px;line-height:1.55}' +
      '.da-motion-widget__actions{display:flex;flex-wrap:wrap;gap:10px;align-items:center}' +
      '.da-motion-widget__button,.da-motion-widget__link{display:inline-flex;min-height:42px;align-items:center;justify-content:center;border-radius:8px;padding:10px 15px;font:700 14px/1 inherit;text-decoration:none;cursor:pointer}' +
      '.da-motion-widget__button{border:1px solid #c9c5bc;background:#fff;color:#292524}' +
      '.da-motion-widget__button:hover{background:#f5f3ee}' +
      '.da-motion-widget__link{border:1px solid #a11a18;background:#a11a18;color:#fff}' +
      '.da-motion-widget__link:hover{background:#861412}' +
      '.da-motion-widget__credit{margin:14px 0 0;font-size:12px;color:#78716c}' +
      '.da-motion-widget__credit a{color:inherit;text-underline-offset:3px}';
    document.head.appendChild(style);
  }

  function chooseMotion() {
    var index = Math.floor(Math.random() * motions.length);
    if (motions.length > 1 && index === lastIndex) index = (index + 1) % motions.length;
    lastIndex = index;
    return motions[index];
  }

  function build(root) {
    if (root.getAttribute('data-debatable-motion-ready') === 'true') return;
    root.setAttribute('data-debatable-motion-ready', 'true');
    root.classList.add('da-motion-widget');

    var card = element('section', 'da-motion-widget__card');
    card.setAttribute('aria-label', 'Debate motion generator');
    var label = element('p', 'da-motion-widget__label', 'Debate motion');
    var motion = element('h2', 'da-motion-widget__motion');
    var clash = element('p', 'da-motion-widget__clash');
    clash.setAttribute('aria-live', 'polite');
    var actions = element('div', 'da-motion-widget__actions');
    var refresh = element('button', 'da-motion-widget__button', 'New motion');
    refresh.type = 'button';
    var debate = element('a', 'da-motion-widget__link', 'Debate this motion');
    debate.target = '_blank';
    debate.rel = 'noopener';
    var credit = element('p', 'da-motion-widget__credit');
    var source = element('a', '', 'Powered by Debatable');
    source.href = 'https://itsdebatable.com/debate-topic-generator?utm_source=motion_widget&utm_medium=embed';
    source.target = '_blank';
    source.rel = 'noopener';
    credit.appendChild(source);

    function draw() {
      var selected = chooseMotion();
      motion.textContent = selected.motion;
      clash.textContent = 'Core clash: ' + selected.clash;
      debate.href = 'https://itsdebatable.com/practice?format=quick&motion=' + encodeURIComponent(selected.motion) + '&utm_source=motion_widget&utm_medium=embed';
    }

    refresh.addEventListener('click', draw);
    actions.appendChild(refresh);
    actions.appendChild(debate);
    card.appendChild(label);
    card.appendChild(motion);
    card.appendChild(clash);
    card.appendChild(actions);
    card.appendChild(credit);
    root.appendChild(card);
    draw();
  }

  function init() {
    addStyles();
    Array.prototype.forEach.call(document.querySelectorAll('[data-debatable-motion-widget]'), build);
  }

  window.DebatableMotionWidget = { init: init };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
}());
