/* Both people agree, both captures settle, then the server opens judging. */
(function(root){
  'use strict';
  function attach(options){
    var room = '', current = null, busy = false, flushing = false, flushed = '', completed = '', error = '';
    function reset(){
      if (room === options.room()) return;
      room = options.room(); current = null; busy = false; flushing = false; flushed = ''; completed = ''; error = '';
    }
    function paint(){ reset(); options.paint(current, {busy:busy, flushing:flushing, error:error}); }
    async function post(action){
      var user = options.user();
      var requestRoom=room, requestId=current && current.id;
      if (!user || !user.getIdToken) throw new Error('Sign in again to finish this conversation.');
      var token = await user.getIdToken();
      var controller = new AbortController();
      var timeout = setTimeout(function(){controller.abort();},15000);
      try {
        var response = await fetch('/api/conversation-finish', {method:'POST', signal:controller.signal,
          headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},
          body:JSON.stringify({room:requestRoom, action:action, id:requestId})});
        var data = await response.json();
        if (!response.ok || !data.ok) throw new Error(data.error || 'Could not save that choice. Try again.');
        return data.finish;
      } finally {clearTimeout(timeout);}
    }
    async function settle(){
      if (!current || current.phase !== 'flushing' || flushing || !options.seated()) return;
      var origin = room, id = current.id;
      flushing = true; error = ''; paint();
      try {
        // A failed acknowledgment retries the durable upload too. Never
        // declare ready after a rejected transcription or Firestore save.
        if (flushed !== id) {await options.flush(); if (room !== origin) return; flushed = id;}
        var result = await post('ready');
        if (room === origin) sync(result);
      } catch (e) {if (room === origin) error = e.message || 'Could not save the final words. Retry saving.';}
      finally {if (room === origin) {flushing = false; paint();}}
    }
    function sync(value){
      reset();
      if (!value || (current && value.revision < current.revision)) return;
      current = value; paint();
      if (current.phase === 'flushing' && !busy && !error) {
        var side = options.side();
        if (!current.ready || !current.ready[side]) settle();
        else options.hold();
      }
      if (current.phase === 'completed' && options.seated() && completed !== current.id){
        completed = current.id;
        Promise.resolve(options.complete()).catch(function(e){completed='';error=e.message;paint();});
      }
    }
    async function act(action){
      reset(); if (busy) return;
      if (action === 'retry') {error=''; if(current && current.phase === 'completed') sync(current); else settle(); return;}
      var origin = room; busy = true; error = ''; paint();
      try {var next = await post(action); if (room === origin) sync(next);}
      catch(e){if (room === origin) error=e.message || 'Could not save that choice. Try again.';}
      finally {if (room === origin){busy=false; paint(); if(current && current.phase==='flushing' && !error) sync(current);}}
    }
    return {sync:sync, act:act, paint:paint};
  }
  var api = {attach:attach};
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DBConversationFinish = api;
})(typeof window === 'undefined' ? globalThis : window);
