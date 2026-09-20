
(function(){
  var KEY='debateos-locale';
  function setCookie(name,val,domain){
    document.cookie=name+'='+val+'; path=/'+(domain?'; domain='+domain:'');
  }
  function clearCookie(name,domain){
    document.cookie=name+'=; path=/; expires=Thu, 01 Jan 1970 00:00:00 UTC'+(domain?'; domain='+domain:'');
  }
  window.__setLang=function(lang){
    var host=location.hostname;
    var bare=host.replace(/^www\./,'');
    clearCookie('googtrans');clearCookie('googtrans','.'+host);clearCookie('googtrans','.'+bare);
    if(lang&&lang!=='en'){
      var v='/en/'+lang;
      setCookie('googtrans',v);setCookie('googtrans',v,'.'+host);setCookie('googtrans',v,'.'+bare);
      try{localStorage.setItem(KEY,lang);localStorage.setItem('debateos-ai-lang',lang);localStorage.setItem('debateos-locale-src','user:'+Date.now())}catch(e){}
    }else{
      try{localStorage.setItem(KEY,'en');localStorage.setItem('debateos-ai-lang','en');localStorage.setItem('debateos-locale-src','user:'+Date.now())}catch(e){}
    }
    location.reload();
  };
  window.googleTranslateElementInit=function(){
    new google.translate.TranslateElement({pageLanguage:'en',autoDisplay:false,layout:google.translate.TranslateElement.InlineLayout.SIMPLE},'google_translate_element');
  };
  document.addEventListener('DOMContentLoaded',function(){
    var sel=document.getElementById('langPickerSel');
    var saved='en';try{saved=localStorage.getItem(KEY)||'en'}catch(e){}
    // Mirror the selected flag onto the wrapper so the phone-width
    // "flag-only" picker has something to render (the select's own text
    // is zeroed out at <=720px. see the @media block above).
    function syncFlag(){
      var w=document.querySelector('.lang-picker');
      if(!w||!sel)return;
      var opt=sel.options[sel.selectedIndex];
      var flag=opt?(opt.textContent.trim().split(/\s+/)[0]||'🌐'):'🌐';
      w.setAttribute('data-flag',flag);
    }
    if(sel){
      sel.value=saved;
      syncFlag();
      sel.addEventListener('change',function(){syncFlag();window.__setLang(sel.value)});
    }
    // Move the picker into the topbar (between the theme dots and the
    // Debatable CTA) so it doesn't overlap the existing nav buttons.
    var pickerWrap = document.querySelector('.lang-picker');
    var navRight = document.querySelector('.ui-topbar-right');
    var debateBtn = navRight && navRight.querySelector('.ui-btn-primary');
    if (pickerWrap && navRight) {
      pickerWrap.classList.add('in-nav');
      if (debateBtn) navRight.insertBefore(pickerWrap, debateBtn);
      else navRight.appendChild(pickerWrap);
    }
    // Only load the Google widget if a non-English locale is active. Saves
    // ~70KB of script + a network round-trip for the default English read.
    if(saved&&saved!=='en'){
      var s=document.createElement('script');
      s.src='https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit';
      s.async=true;
      document.head.appendChild(s);
    }
  });
})();
