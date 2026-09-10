(function(root){
  'use strict';
  function attach(options){
    var host=options.element, current=null, busy=false, last='', activeRoom='', poll=0;
    function user(){return options.user();}
    function button(text, action, key, uid){
      var b=document.createElement('button'); b.type='button';b.className='btn team-seat-action';b.textContent=text;b.disabled=busy;
      b.addEventListener('click',function(){send(action,{key:key,uid:uid});});return b;
    }
    function line(text, className){var p=document.createElement('p');p.textContent=text;if(className)p.className=className;return p;}
    function seatName(seat){return seat.name || (seat.side==='pro'?'For':'Against')+' partner';}
    function joinTeam(){
      if(!current)return;
      var url=new URL(location.href);url.searchParams.delete('spectate');url.searchParams.delete('stage');url.searchParams.delete('mySide');
      current.seats.forEach(function(s){
        url.searchParams.set(root.DBRoomTeams.uidField(s.key),s.uid);
        url.searchParams.set(s.key,s.name);
      });
      location.assign(url.href);
    }
    function render(){
      if(!current){host.hidden=true;return;}
      var u=user(), uid=u&&u.uid, isHost=current.hostUid===uid;
      var mine=current.seats.find(function(s){return s.uid===uid;});
      host.replaceChildren();host.hidden=!current.enabled&&!current.canEnable;
      if(host.hidden)return;
      if(!current.enabled){
        host.appendChild(button('Open 2v2 team seats','enable'));
        host.appendChild(line('Invite two viewers to join, one on each side. You approve their requests.','team-seat-hint'));
        return;
      }
      var heading=document.createElement('strong');heading.textContent='2v2 · Two people per side';host.appendChild(heading);
      var grid=document.createElement('div');grid.className='team-seat-grid';
      ['pro','con'].forEach(function(side){
        var team=document.createElement('div');team.className='team-seat-side';team.dataset.side=side;
        var label=document.createElement('b');label.textContent=side==='pro'?'For':'Against';team.appendChild(label);
        current.seats.filter(function(s){return s.side===side;}).forEach(function(s){
          var row=document.createElement('div');row.className='team-seat-person';
          var name=document.createElement('span');name.textContent=s.uid?seatName(s):'Open team seat';row.appendChild(name);
          if(!s.uid&&!mine&&!current.locked){
            var pending=current.request&&current.request.status==='pending'&&Date.now()-current.request.requestedAt<180000;
            if(pending&&current.request.key===s.key)row.appendChild(button('Cancel request','withdraw'));
            else if(!pending)row.appendChild(button('Ask to join','request',s.key));
          }
          team.appendChild(row);
        });grid.appendChild(team);
      });host.appendChild(grid);
      if(mine&&options.spectator()){
        var join=button('Join your team');
        join.addEventListener('click',joinTeam);host.appendChild(join);
      }
      if(isHost&&!current.locked){
        (current.requests||[]).forEach(function(req){
          var row=document.createElement('div');row.className='team-seat-request';
          row.appendChild(line((req.name||'Anonymous')+' wants to join '+(req.key==='pro2'?'For':'Against')+'.'));
          row.appendChild(button('Approve','approve',null,req.uid));row.appendChild(button('Decline','decline',null,req.uid));host.appendChild(row);
        });
        var invite=button('Copy viewer invite');invite.addEventListener('click',function(){
          var url=new URL('/live-round',location.origin);url.searchParams.set('room',options.room());url.searchParams.set('spectate','1');
          navigator.clipboard.writeText(url.href).then(function(){options.toast('Viewer invite copied.');},function(){options.toast('Copy the round link from your address bar to invite viewers.');});
        });host.appendChild(invite);
        if(!current.seats.some(function(s){return s.key.endsWith('2')&&s.uid;}))host.appendChild(button('Return to 1v1','disable'));
      }
      if(mine&&mine.key.endsWith('2')&&!current.locked)host.appendChild(button('Leave team seat','leave'));
      var hint=current.locked?'Team seats are locked for this round.':current.full?'All four seats are filled. Everyone joins the room before starting.':'The host approves requests. Both team seats must fill before starting.';
      if(!mine&&current.request&&current.request.status==='pending'&&Date.now()-current.request.requestedAt<180000)hint='Your request is with the host. You stay a viewer until approved.';
      if(!mine&&current.request&&current.request.status==='rejected')hint='The host declined your request. You can keep watching.';
      host.appendChild(line(hint,'team-seat-hint'));
      host.appendChild(line('The judge scores the two teams. 2v2 results do not change the 1v1 leaderboard.','team-seat-hint'));
    }
    async function api(action, data){
      var u=user();if(!u||u.isAnonymous){options.signIn();throw new Error('Sign in to request a team seat.');}
      var headers={Authorization:'Bearer '+await u.getIdToken()};
      var url='/api/team-seats?room='+encodeURIComponent(options.room()), init={headers:headers,cache:'no-store'};
      if(action){headers['Content-Type']='application/json';init.method='POST';init.body=JSON.stringify(Object.assign({action:action,room:options.room()},data||{}));}
      var response=await fetch(url,init), body=await response.json();
      if(!response.ok)throw Object.assign(new Error(body.error||'Could not update team seats.'),{code:body.code});
      return body;
    }
    async function refresh(){
      if(!user()||user().isAnonymous||!options.room()||busy||document.hidden)return;
      try{current=await api();render();}catch(e){if(!current)host.hidden=true;}
    }
    async function send(action,data){
      if(!action||busy)return;
      busy=true;render();
      try{
        current=await api(action,data);render();
        if(action==='request')options.toast('Your team-seat request was sent to the host.');
        if(action==='leave'){var url=new URL(location.href);url.searchParams.set('spectate','1');url.searchParams.delete('mySide');location.assign(url.href);}
      }catch(e){
        if(e.code==='AGE_BAND_REQUIRED'&&root.daAskAgeBand){
          root.daAskAgeBand(function(band){root.daRecordAgeBand(band,function(recorded){if(recorded)send(action,data);});});
        }else options.toast(e.message);
      }finally{busy=false;render();}
    }
    function sync(round){
      var sig=JSON.stringify([options.room(),user()&&user().uid,round.teamSize,round.teamHostUid,round.teamLockedAt,round.proUid,round.conUid,round.proUid2,round.conUid2,round.status,round.speechIdx]);
      if(sig!==last){last=sig;refresh();}
      if(activeRoom!==options.room()){activeRoom=options.room();if(poll)clearInterval(poll);poll=setInterval(refresh,10000);}
    }
    return {sync:sync,refresh:refresh,begin:async function(format){
      current=await api('start',{format:format});render();return current;
    },finish:function(){return api('finish');},finishReady:function(){return api('finish-ready');}};
  }
  root.DBTeamSeats={attach:attach};
})(window);
