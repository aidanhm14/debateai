
        (function(){
          // 2026-05-26 (rev5): mantra variant weighted 3x so the "Debate
          // it." word is the modal first-paint headline, but the accent
          // span is now empty so the headline lands as a single,
          // confident verb instead of a chant.
          var VARIANTS=[
            {key:'debatable_mantra', lead:'Debatable.', accent:''},
            {key:'debatable_mantra', lead:'Debatable.', accent:''},
            {key:'debatable_mantra', lead:'Debatable.', accent:''},
            {key:'out_loud', lead:'Debate an AI opponent', accent:'out loud.'},
            {key:'rethink',  lead:'Rethink',               accent:'argumentation.'},
            // 'filling' carries no accent: .hh-accent is display:block, which
            // on a ~375px screen forced "gap." onto its own line with an ugly
            // gap above two short words. As one flowing string it wraps
            // naturally instead.
            {key:'filling',  lead:'Filling the gap.',      accent:''},
            // 'omegle' renamed 2026-05-26: the /debate-chat page that
            // owned the "Omegle of debate" framing was retired and now
            // 301s to /spar. The headline rotation keeps the slot but
            // points at the matchmaker's actual job: spawning live
            // human-vs-human rounds on demand. Key kept for GA event
            // continuity.
            // 2026-05-26 (rev15): "Live spawn / into debates." -> "Live
            // debates." per the founder "live debates (correct to this)." Spawn
            // verb was meta-developer-speak; the page already has a
            // mantra elsewhere — this variant should just name the thing.
            // Key kept for GA event continuity.
            {key:'omegle',   lead:'Live debates.',          accent:''},
            {key:'trust_ai', lead:'Trust AI over',         accent:'human judgment?'},
            // 'debatable' (added 2026-05-26): the personality word from the
            // three-word brand system (product = Debatable · personality =
            // Debatable · CTA = Debatable). Keeps the "Debatable" identity
            // surfaced as one of the rotating headlines without making it
            // the canonical product name.
            {key:'debatable', lead:'Everything is',        accent:'debatable.'}
          ];
          try{
            var h=document.getElementById('heroHeadline');
            if(!h)return;
            var v=VARIANTS[Math.floor(Math.random()*VARIANTS.length)];
            // textContent (not innerHTML) keeps this injection-proof. When a
            // variant has an accent, it's rebuilt as a .hh-accent span so the
            // display:block line break + Fraunces styling carry over; variants
            // with no accent render as a single flowing headline.
            h.textContent = v.accent ? v.lead+' ' : v.lead;
            if(v.accent){
              var span=document.createElement('span');
              span.className='hh-accent';
              span.textContent=v.accent;
              h.appendChild(span);
            }
            window.__heroHeadline=v.key;
            if(window.dosTrack)window.dosTrack('hero_headline_view',{variant:v.key});
          }catch(e){}
        })();
      