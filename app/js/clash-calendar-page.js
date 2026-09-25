(function(){
  var schedule = window.DBClashSchedule;
  if (!schedule) return;
  schedule.SESSIONS.forEach(function(session){
    var card = document.getElementById(session.id);
    var next = schedule.nextFor(session, Date.now());
    var label = new Intl.DateTimeFormat(undefined,{weekday:'short',hour:'numeric',minute:'2-digit',timeZoneName:'short'}).format(new Date(next.start));
    card.querySelector('[data-local]').textContent = 'Next session: ' + label + ' your time.';
  });
}());
