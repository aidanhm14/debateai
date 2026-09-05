/* Round exports. Google authorization is separate from Debatable sign-in.
 * drive.file grants access only to files this app creates or the user selects.
 * Tokens stay in this call's closure, never storage, logs, or our server.
 * https://developers.google.com/identity/oauth2/web/guides/use-token-model
 * https://developers.google.com/workspace/drive/api/guides/manage-uploads
 */
(function(root){
  'use strict';
  // Reuse the dedicated Drive client already shipped in app/index.html.
  // Firebase's One Tap client belongs to a separate Cloud project.
  var CLIENT_ID = '157975635848-d5lq4m9d4l4kipl90nrrj95tc6f1vvk6.apps.googleusercontent.com';
  var SCOPE = 'https://www.googleapis.com/auth/drive.file';
  var sdkPromise;
  function esc(value){
    return String(value == null ? '' : value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function plain(value){ return typeof value === 'string' ? value : JSON.stringify(value, null, 2); }
  function paragraph(value){ return '<p>' + esc(plain(value) || '').replace(/\n/g, '<br>') + '</p>'; }
  function sideLabel(round, side){
    return (round.sideLabels && round.sideLabels[side]) || ({pro:'For',con:'Against',gov:'For',opp:'Against'})[side] || side || 'Side not recorded';
  }
  function toHtml(round, includeJudge){
    var html = '<!doctype html><html><head><meta charset="utf-8"><title>' + esc(round.title || 'Debatable round') + '</title></head>'
      + '<body style="font:11pt Arial,sans-serif;line-height:1.5"><h1>' + esc(round.title || 'Debatable round') + '</h1>';
    if (round.motion) html += '<h2>' + esc(round.motion) + '</h2>';
    if (round.date){
      var date = new Date(round.date);
      if (!isNaN(date.getTime())) html += paragraph(date.toLocaleString());
    }
    var notes = (Array.isArray(round.notes) ? round.notes : []).slice().sort(function(a,b){ return (a.idx||0) - (b.idx||0); });
    if (notes.length){
      html += '<h2>AI notes</h2><p>Bullet points of what each side said.</p>';
      notes.forEach(function(note){
        html += '<h3>' + esc([sideLabel(round, note.side), note.speakerName, note.code].filter(Boolean).join(' · ')) + '</h3><ul>';
        (Array.isArray(note.points) ? note.points : []).forEach(function(point){
          if (point.note) html += '<li>' + esc(point.note) + '</li>';
        });
        html += '</ul>';
      });
    }
    if (!notes.length && round.notesText){
      html += '<h2>AI notes</h2>';
      String(round.notesText).split(/\n{2,}/).filter(Boolean).forEach(function(block){
        var lines=block.split('\n').filter(Boolean);
        if (lines.length && !/^- /.test(lines[0])) html += '<h3>'+esc(lines.shift())+'</h3>';
        html += '<ul>'+lines.map(function(line){return '<li>'+esc(line.replace(/^- /,''))+'</li>';}).join('')+'</ul>';
      });
    }
    html += '<h2>Transcript</h2>';
    var log = Array.isArray(round.log) ? round.log : [];
    if (!log.length) html += '<p>No transcript was saved for this round.</p>';
    log.forEach(function(speech){
      html += '<h3>' + esc([speech.code, speech.speakerName || speech.who || speech.name || 'Speaker', speech.side ? sideLabel(round, speech.side) : ''].filter(Boolean).join(' · ')) + '</h3>'
        + paragraph(speech.text || 'No transcript was saved for this speech.');
    });
    if (includeJudge && round.feedback) html += '<h2>Judge ballot</h2>' + paragraph(round.feedback);
    html += '<p>Exported from Debatable · itsdebatable.com</p></body></html>';
    return html;
  }
  function multipart(title, html, boundary){
    return '--' + boundary + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n'
      + JSON.stringify({name:String(title || 'Debatable round').slice(0,180), mimeType:'application/vnd.google-apps.document'})
      + '\r\n--' + boundary + '\r\nContent-Type: text/html; charset=UTF-8\r\n\r\n'
      + html + '\r\n--' + boundary + '--';
  }
  function ensureSdk(){
    if (root.google && root.google.accounts && root.google.accounts.oauth2) return Promise.resolve();
    if (sdkPromise) return sdkPromise;
    sdkPromise = new Promise(function(resolve,reject){
      var script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client'; script.async = true;
      var timer = setTimeout(function(){ sdkPromise = null; reject(new Error('Google connection took too long. Try again or download the document.')); }, 15000);
      script.onload = function(){
        clearTimeout(timer);
        if (root.google && root.google.accounts && root.google.accounts.oauth2) resolve();
        else { sdkPromise = null; reject(new Error('Google connection is unavailable. Download the document below.')); }
      };
      script.onerror = function(){ clearTimeout(timer); sdkPromise = null; reject(new Error('Google could not load. Check your connection or download the document.')); };
      document.head.appendChild(script);
    });
    return sdkPromise;
  }
  function errorMessage(error){
    var reason = error && error.error;
    if (reason === 'access_denied') return 'Google access was declined. You can try again or download the document.';
    if (error && error.type === 'popup_closed') return 'Google window closed. You can try again or download the document.';
    if (error && error.type === 'popup_failed_to_open') return 'Allow the Google popup, or open this page in Safari or Chrome and try again.';
    return error && error.message || 'Could not connect to Google. You can download the document below.';
  }
  function open(round){
    if (document.getElementById('roundExportDialog')) return;
    var previous = document.activeElement;
    var dialog = document.createElement('dialog');
    dialog.id = 'roundExportDialog';
    dialog.setAttribute('aria-labelledby','roundExportTitle');
    dialog.style.cssText = 'box-sizing:border-box;margin:auto;width:min(500px,calc(100% - 28px));max-height:90dvh;overflow:auto;border:1px solid #bbb;border-radius:16px;padding:24px;color:#1b1b1b;background:#fff;font:15px/1.5 system-ui,sans-serif;';
    dialog.innerHTML = '<h2 id="roundExportTitle" style="margin:0 0 10px;font-size:22px">Export this round</h2>'
      + '<p style="overflow-wrap:anywhere">' + esc(round.motion || round.title || 'Debatable round') + '</p>'
      + '<p>Save the available transcript and AI notes as a new Google Doc. Choose the Google account that should receive it.</p>'
      + (round.feedback ? '<label style="display:block;margin:14px 0"><input type="checkbox" data-export-judge checked> Include the judge ballot in a separate section</label>' : '')
      + '<p style="font-size:13px;color:#555">Google asks for access to documents you create or select with Debatable. This does not change your Debatable sign-in.</p>'
      + '<p data-export-status role="status" style="min-height:24px"></p>'
      + '<div style="display:flex;gap:10px;flex-wrap:wrap"><button type="button" data-export-google disabled>Connect Google and export</button>'
      + '<button type="button" data-export-download>Download .doc</button><button type="button" data-export-close>Close</button></div>'
      + '<p style="font-size:13px;color:#555">You can also upload the downloaded .doc to Google Drive, then open it with Google Docs.</p>';
    dialog.querySelectorAll('p').forEach(function(p){p.style.margin='0 0 12px';});
    dialog.querySelectorAll('button').forEach(function(b){ b.style.cssText='font:600 14px system-ui;padding:10px 13px;border:1px solid #aaa;border-radius:8px;cursor:pointer;background:#fff;color:#222;min-height:42px'; });
    var googleButton = dialog.querySelector('[data-export-google]');
    googleButton.style.background = '#b91c1c'; googleButton.style.color = '#fff';
    var status = dialog.querySelector('[data-export-status]');
    var busy = false;
    function html(){ var check=dialog.querySelector('[data-export-judge]'); return toHtml(round,!!(check && check.checked)); }
    function setBusy(value){ busy=value;googleButton.disabled=value;dialog.querySelector('[data-export-close]').disabled=value; var check=dialog.querySelector('[data-export-judge]');if(check)check.disabled=value; }
    function fail(message){ setBusy(false);status.textContent=message; }
    dialog.querySelector('[data-export-close]').onclick=function(){ dialog.close(); };
    dialog.addEventListener('cancel',function(event){if(busy)event.preventDefault();});
    dialog.addEventListener('close',function(){dialog.remove();if(previous && previous.isConnected)previous.focus();});
    dialog.querySelector('[data-export-download]').onclick=function(){
      var blob=new Blob(['\ufeff',html()],{type:'application/msword'}),url=URL.createObjectURL(blob),a=document.createElement('a');
      a.href=url; a.download='debatable-round-'+String(round.motion||'notes').toLowerCase().replace(/[^a-z0-9]+/g,'-').slice(0,50)+'.doc';
      document.body.appendChild(a);a.click();a.remove();setTimeout(function(){URL.revokeObjectURL(url);},10000);
      status.textContent='Downloaded. Upload the .doc to Google Drive and open it with Google Docs.';
    };
    googleButton.onclick=function(){
      if(busy)return;
      var content=html();
      if(new Blob([content]).size>4*1024*1024){fail('This round is too large for direct export. Download the document instead.');return;}
      setBusy(true);status.textContent='Choose your Google account and allow document access.';
      try {
        var client=root.google.accounts.oauth2.initTokenClient({
          client_id:CLIENT_ID,scope:SCOPE,include_granted_scopes:false,
          error_callback:function(error){fail(errorMessage(error));},
          callback:function(token){
            if(token.error || !token.access_token){fail(errorMessage(token));return;}
            if(!root.google.accounts.oauth2.hasGrantedAllScopes(token,SCOPE)){fail('Document access was not granted. Try again and allow it, or download the document.');return;}
            status.textContent='Creating your Google Doc…';
            var boundary='debatable_'+Date.now()+'_'+Math.random().toString(36).slice(2);
            var controller=new AbortController(),timer=setTimeout(function(){controller.abort();},45000);
            // One upload creates the populated Doc. Never retry writes automatically:
            // a lost response may still have created the document in Google Drive.
            fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id',{
              method:'POST',headers:{Authorization:'Bearer '+token.access_token,'Content-Type':'multipart/related; boundary='+boundary},
              body:multipart(round.title||('Debatable: '+(round.motion||'Round')),content,boundary),signal:controller.signal
            }).then(function(response){
              if(!response.ok){
                if(response.status===401)throw new Error('Google access expired. Connect again to retry.');
                if(response.status===403)throw new Error('Google could not allow this export. Download the document below; Debatable may need Google Drive access enabled.');
                throw new Error('Google could not confirm the export. Check your Google Drive before trying again, or download the document.');
              }
              return response.json();
            }).then(function(file){
              if(!file.id || !/^[a-zA-Z0-9_-]+$/.test(file.id))throw new Error('Google did not return a document link. Check your Google Drive before trying again.');
              status.textContent='Your Google Doc is ready. ';
              var link=document.createElement('a');link.href='https://docs.google.com/document/d/'+file.id+'/edit';link.target='_blank';link.rel='noopener';link.textContent='Open Google Doc';status.appendChild(link);
              setBusy(false);googleButton.textContent='Exported to Google Docs';googleButton.disabled=true;
            }).catch(function(error){
              fail(error.name==='AbortError'||error instanceof TypeError?'The connection ended before Google confirmed the export. Check your Google Drive before trying again, or download the document.':errorMessage(error));
            }).finally(function(){clearTimeout(timer);token.access_token='';});
          }
        });
        client.requestAccessToken({prompt:'select_account'});
      } catch(error){fail(errorMessage(error));}
    };
    document.body.appendChild(dialog);dialog.showModal();
    status.textContent='Loading Google connection…';
    ensureSdk().then(function(){googleButton.disabled=false;status.textContent='';}).catch(function(error){status.textContent=errorMessage(error);});
  }
  root.DBRoundExport={open:open,toHtml:toHtml,multipart:multipart};
})(typeof window !== 'undefined' ? window : globalThis);
