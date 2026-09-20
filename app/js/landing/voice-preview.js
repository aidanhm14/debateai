
(function(){
  var stage = document.querySelector('#voice-ai .voice-anim-stage');
  if (!stage) return;
  var label = stage.querySelector('.vas-label');
  var persona = stage.querySelector('.vas-persona');
  var line = stage.querySelector('.voice-anim-line');
  if (!label || !persona || !line) return;
  // India is ~80% of traffic (soul.md §8); the rotating hero example
  // is now a coaching-culture motion that lands for Indian school +
  // college audiences (Kota, JEE, NEET as the implicit referents)
  // while staying readable to global users as a generic high-stakes
  // exam critique. Personas use the Asian Parli "Government / Whip"
  // vocabulary already, so the example sits inside the format frame
  // 80% of visitors are coming for.
  var SEQ = [
    { speaker:'you',   label:'You',     persona:'Government, 1st speaker', line:'Coaching culture is a tax on adolescence. We are mortgaging childhood for marginal rank gains.' },
    { speaker:'ai',    label:'Veteran', persona:'Opposition, cuts in',     line:'POI. The coaching tax bought your engineers, doctors, civil servants. Define harm net of that.' },
    { speaker:'you',   label:'You',     persona:'Response',                line:'Two years of pattern drills versus a lifetime of conceptual fluency. The trade collapses on review.' },
    { speaker:'ai',    label:'Veteran', persona:'Opposition, rebuttal',    line:'Your case relies on a counterfactual education system that has never run at this scale.' },
    { speaker:'you',   label:'You',     persona:'Whip, 7 min',             line:'Korea is reversing the same model right now. The counterfactual is one country east.' },
    { speaker:'judge', label:'Judge',   persona:'RFD, 4 to 3 Gov',         line:'Gov wins on impact. Opp wins on link. Razor-close on weighing.' }
  ];
  var idx = 0;
  function tick(){
    var s = SEQ[idx % SEQ.length];
    line.style.opacity = '0';
    setTimeout(function(){
      stage.dataset.speaker = s.speaker;
      label.textContent = s.label;
      persona.textContent = s.persona;
      line.textContent = s.line;
      line.style.opacity = '1';
    }, 220);
    idx++;
  }
  tick();
  var iv = setInterval(tick, 3400);
  document.addEventListener('visibilitychange', function(){
    if (document.hidden){ clearInterval(iv); iv = null; }
    else if (!iv){ iv = setInterval(tick, 3400); }
  });
})();
