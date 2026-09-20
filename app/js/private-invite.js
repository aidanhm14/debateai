(function(root){
  'use strict';
  root.DBPrivateInvite={request:function(user,body){
    if(!user || user.isAnonymous)return Promise.reject(new Error('Sign in before opening a private round.'));
    return user.getIdToken().then(function(token){
      var controller=new AbortController();
      var timer=setTimeout(function(){controller.abort();},20000);
      return fetch('/api/private-invite',{method:'POST',signal:controller.signal,headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify(body)})
        .finally(function(){clearTimeout(timer);});
    }).then(function(response){
      return response.json().then(function(data){
        if(!response.ok)throw new Error(data.error || 'Could not open this private round. Try again.');
        return data;
      });
    }).catch(function(error){
      if(error.name==='AbortError')throw new Error('The connection timed out. Try again.');
      throw error;
    });
  }};
})(window);
