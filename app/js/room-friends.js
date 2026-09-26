(function(){
  'use strict';
  window.DBRoomFriends = { attach:function(ctx){
    var bound='', status='idle', pending={}, optimistic={};
    function eligible(person){var u=ctx.user();return !!(u&&!u.isAnonymous&&person&&person.uid&&person.uid!==u.uid&&person.uid!=='ai'&&!/^ai[:_-]/i.test(person.uid));}
    function sync(){
      var u=ctx.user(), uid=u&&!u.isAnonymous?u.uid:'';
      if(uid===bound)return;
      bound=uid;status='idle';pending={};optimistic={};
      if(uid&&window.DBFriends&&ctx.db())window.DBFriends.init({db:ctx.db(),uid:uid});
    }
    function state(person){
      sync();
      if(!eligible(person))return null;
      var rel=optimistic[person.uid]||window.DBFriends.statusWith(person.uid);
      return {label:pending[person.uid]?'Sending…':status==='error'?'Retry friend status':status!=='ready'?'Loading…':rel==='friends'?'Friends':rel==='outgoing'?'Request sent':rel==='incoming'?'Accept request':'Add friend',disabled:!!pending[person.uid]||(status!=='error'&&(status!=='ready'||rel==='friends'||rel==='outgoing'))};
    }
    function html(person,seat){
      var s=state(person);if(!s)return '';
      return '<button type="button" class="round-person-message" data-friend-seat="'+seat+'"'+(s.disabled?' disabled':'')+'>'+s.label+'</button>';
    }
    function paint(button,person){var s=state(person);if(!button)return;button.hidden=!s;if(s){button.textContent=s.label;button.disabled=s.disabled;}}
    function act(person){
      var s=state(person);if(!s||s.disabled)return;
      if(status==='error'){status='idle';window.DBFriends.init({db:ctx.db(),uid:bound,force:true});ctx.repaint();return;}
      var u=ctx.user(), uid=u.uid, target=person.uid;
      pending[target]=true;ctx.repaint();
      var accepting=window.DBFriends.statusWith(target)==='incoming';
      var promise=accepting?window.DBFriends.accept(target,ctx.name()):window.DBFriends.request(target,person.name,ctx.name());
      promise.then(function(){if(bound!==uid)return;optimistic[target]=accepting?'friends':'outgoing';ctx.toast(accepting?'You are friends now.':'Friend request sent.');})
        .catch(function(){if(bound===uid)ctx.toast('Could not save the friend request. Try again.');})
        .then(function(){if(bound===uid){delete pending[target];ctx.repaint();}});
    }
    var stop=window.DBFriends.watch(function(v){status=v.status;optimistic={};ctx.repaint();});
    document.addEventListener('click',function(e){
      var button=e.target.closest('[data-friend-seat], [data-friend-opponent]');if(!button)return;
      var seat=button.getAttribute('data-friend-seat');act(seat?ctx.target(seat):ctx.opponent());
    });
    sync();
    return {html:html,paint:paint,act:act,sync:sync};
  }};
})();
