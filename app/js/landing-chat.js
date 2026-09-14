(function(){
  'use strict';
  var panel = document.getElementById('fsChats');
  var form = document.getElementById('fsChatCompose');
  var input = document.getElementById('fsChatInput');
  var send = document.getElementById('fsChatSend');
  var status = document.getElementById('fsChatStatus');
  var join = document.getElementById('fsChatsJoin');
  if (!panel || !form || !input || !send || !status || !join) return;
  var user = null;
  var sending = false;

  function publicName(){
    return user && window.DBIdentity && window.DBIdentity.forUser(user).name;
  }
  function message(text, error){
    status.textContent = text;
    status.classList.toggle('is-error', !!error);
  }
  function update(){
    input.disabled = sending || !user;
    send.disabled = sending || !user || !input.value.trim();
    send.textContent = sending ? 'Sending…' : 'Send';
  }
  function identityNote(){
    if (user) message('The Commons · ' + (publicName() || 'Your public name'));
  }
  window.DBLandingChat = {
    setUser: function(next){
      next = next && !next.isAnonymous ? next : null;
      if (user && (!next || next.uid !== user.uid)) input.value = '';
      user = next;
      form.hidden = !user;
      join.hidden = !!user;
      panel.classList.toggle('is-member', !!user);
      if (user) identityNote();
      else message('');
      update();
    }
  };
  window.addEventListener('dbidentity:change', identityNote);
  input.addEventListener('input', function(){ identityNote(); update(); });
  input.addEventListener('keydown', function(event){
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing){
      event.preventDefault();
      form.requestSubmit();
    }
  });
  form.addEventListener('submit', async function(event){
    event.preventDefault();
    var text = input.value.trim();
    if (!user || sending || !text) return;
    var author = user;
    var handle = publicName();
    if (!handle){ message('Your public name is still loading. Try again.', true); return; }
    sending = true;
    message('Sending to The Commons…');
    update();
    try {
      var token = await author.getIdToken();
      // A sign-out or account switch during token refresh must cancel the post.
      if (!token || !user || user.uid !== author.uid) throw new Error('Sign in again to send.');
      var response = await fetch('/api/chat-feed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({ handle: handle, text: text })
      });
      var data = await response.json();
      if (!response.ok || !data || !data.ok || !data.row){
        var detail = response.status === 429 ? 'Wait a few seconds, then try again.'
          : response.status === 422 ? (data.error || 'Please revise your message.')
          : 'Could not send. Try again.';
        throw new Error(detail);
      }
      if (user && user.uid === author.uid){
        input.value = '';
        message('Sent to The Commons.');
      }
    } catch(error){
      if (user && user.uid === author.uid) message(error.message || 'Could not send. Try again.', true);
    } finally {
      sending = false;
      update();
    }
  });
  update();
})();
