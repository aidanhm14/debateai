
/* Rotates the caption pair through language pairs so the card shows the
   translation happening. Pauses off-screen and under reduced motion. */
(function(){
  var card = document.querySelector('.credential-card--xlang');
  if (!card) return;
  var slots = ['from','src','dst','from2','src2','dst2'].map(function(k){
    return card.querySelector('[data-xl="' + k + '"]');
  });
  if (slots.some(function(el){ return !el; })) return;
  /* Each entry is one on-screen state: two speakers, two languages, so
     the card always shows more than one language at a time. */
  var PAIRS = [
    [['Español',  'La carga de la prueba sigue siendo suya, y no han dado ni un solo mecanismo.',
                  'The burden of proof is still theirs, and they have not given a single mechanism.'],
     ['中文',      '你说会有伤害，但没有说明它怎么发生。请给出机制。',
                  'You claim harm but never show how it happens. Give me the mechanism.']],
    [['हिन्दी',      'आपका उदाहरण एक अपवाद है, कोई नियम नहीं। यह मेरे तर्क को नहीं तोड़ता।',
                  'Your example is an exception, not a rule. It does not break my argument.'],
     ['Français', 'Vous avez changé de critère au milieu du tour. Choisissez-en un et défendez-le.',
                  'You changed your standard halfway through the round. Pick one and defend it.']],
    [['العربية',    'أنت تصف المشكلة ولا تقدّم حلاً. ما الآلية التي تقترحها؟',
                  'You are describing the problem, not solving it. What mechanism are you proposing?'],
     ['Português','Os seus próprios dados mostram o efeito contrário depois de dois anos.',
                  'Your own data shows the opposite effect after two years.']]
  ];
  var i = 0, live = true, tick = null;
  var reduced = false;
  try { reduced = window.matchMedia('(prefers-reduced-motion:reduce)').matches; } catch (e) {}
  function paint(){
    i = (i + 1) % PAIRS.length;
    var p = PAIRS[i];
    card.classList.add('xl-swap');
    setTimeout(function(){
      var flat = p[0].concat(p[1]);
      for (var s = 0; s < slots.length; s++) slots[s].textContent = flat[s];
      card.classList.remove('xl-swap');
    }, 220);
  }
  function start(){ if (reduced || tick) return; tick = setInterval(function(){ if (live) paint(); }, 4200); }
  if ('IntersectionObserver' in window){
    new IntersectionObserver(function(es){
      live = es.some(function(e){ return e.isIntersecting; });
    }, { rootMargin: '160px 0px' }).observe(card);
  }
  start();
})();
