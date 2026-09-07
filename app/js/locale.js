/* Debatable · locale.js
 *
 * ONE language for the whole product. Until 2026-09-07 the site had the
 * plumbing for a non-English round (a picker on two pages, aiLanguage on
 * the voice minter, a Google Translate cookie on the landing) and no way
 * for the language to FOLLOW the person: someone who argued a whole
 * round in Spanish got a Spanish opponent, an English ballot, and an
 * English page around both. This module is the authority every surface
 * reads and writes so the three can no longer disagree:
 *
 *   UI       Google Translate, driven by the googtrans cookie, loaded on
 *            any page whose stored locale is not English (the same
 *            mechanism the landing has used since May, now sitewide).
 *   JUDGING  every ballot prompt reads DBLocale.get() (or detects the
 *            round's language from the transcript) and writes its prose
 *            in that language while keeping the parsed labels English.
 *   VOICE    the Realtime minters and /api/tts read the same key.
 *
 * DETECTION is the new half. observe(text) is fed every user utterance
 * (voice transcript or typed speech) on the round surfaces; once the
 * evidence is clear it switches the locale and everything follows. It
 * is deliberately conservative: "Hi." switches nothing, a full Spanish
 * sentence does, and clear English switches BACK, which is what makes a
 * stale locale (the 2026-07-04 Spanish-lock bug on /newvoice) self-heal
 * instead of pinning a round to the wrong language.
 *
 * Storage: debateos-locale (UI) and debateos-ai-lang (AI) are written
 * TOGETHER, always the same value, so older readers of either key see
 * the one language. Both keys already sync across devices via
 * prefs-sync.js. debateos-locale-src records who set it (user / detect /
 * browser) so an explicit choice can outrank a guess.
 *
 * Browser language is an OFFER, never a switch: a hi-IN browser belongs to
 * many people who debate in English, and machine-translating the first
 * screen for them would be a claim about who they are. Content is the
 * signal; the browser locale only earns a one-tap chip in that language.
 */
(function () {
  'use strict';
  if (window.DBLocale) return;

  var KEY_UI = 'debateos-locale';
  var KEY_AI = 'debateos-ai-lang';
  var KEY_SRC = 'debateos-locale-src';
  var KEY_OFFER_OFF = 'debateos-locale-offer-off';

  // The languages every layer supports: the practice LANGUAGES map, the
  // Realtime minter's REALTIME_LANG_NAMES, tts.mjs and Google Translate.
  // Order is the picker order.
  var LANGS = {
    en: { name: 'English', native: 'English' },
    es: { name: 'Spanish', native: 'Español' },
    fr: { name: 'French', native: 'Français' },
    de: { name: 'German', native: 'Deutsch' },
    it: { name: 'Italian', native: 'Italiano' },
    pt: { name: 'Portuguese', native: 'Português' },
    nl: { name: 'Dutch', native: 'Nederlands' },
    tr: { name: 'Turkish', native: 'Türkçe' },
    ru: { name: 'Russian', native: 'Русский' },
    ar: { name: 'Arabic', native: 'العربية' },
    hi: { name: 'Hindi', native: 'हिन्दी' },
    zh: { name: 'Mandarin Chinese', native: '中文' },
    ja: { name: 'Japanese', native: '日本語' },
    ko: { name: 'Korean', native: '한국어' }
  };
  var ORDER = Object.keys(LANGS);

  // Short strings for the switch toast and the browser-language offer,
  // in the language they are about. Kept tiny on purpose: this module
  // must never depend on the translation layer it controls.
  var STR = {
    en: { on: 'Site in English.', undo: 'Undo', ask: 'View the site in English?', yes: 'Yes', no: 'No' },
    es: { on: 'Sitio en español.', undo: 'Deshacer', ask: '¿Ver el sitio en español?', yes: 'Sí', no: 'No' },
    fr: { on: 'Site en français.', undo: 'Annuler', ask: 'Voir le site en français ?', yes: 'Oui', no: 'Non' },
    de: { on: 'Seite auf Deutsch.', undo: 'Rückgängig', ask: 'Die Seite auf Deutsch anzeigen?', yes: 'Ja', no: 'Nein' },
    it: { on: 'Sito in italiano.', undo: 'Annulla', ask: 'Vedere il sito in italiano?', yes: 'Sì', no: 'No' },
    pt: { on: 'Site em português.', undo: 'Desfazer', ask: 'Ver o site em português?', yes: 'Sim', no: 'Não' },
    nl: { on: 'Site in het Nederlands.', undo: 'Ongedaan maken', ask: 'De site in het Nederlands bekijken?', yes: 'Ja', no: 'Nee' },
    tr: { on: 'Site Türkçe.', undo: 'Geri al', ask: 'Siteyi Türkçe görmek ister misiniz?', yes: 'Evet', no: 'Hayır' },
    ru: { on: 'Сайт на русском.', undo: 'Отменить', ask: 'Показать сайт на русском?', yes: 'Да', no: 'Нет' },
    ar: { on: 'الموقع بالعربية.', undo: 'تراجع', ask: 'عرض الموقع بالعربية؟', yes: 'نعم', no: 'لا' },
    hi: { on: 'साइट हिन्दी में।', undo: 'पूर्ववत करें', ask: 'साइट हिन्दी में देखें?', yes: 'हाँ', no: 'नहीं' },
    zh: { on: '网站已切换为中文。', undo: '撤销', ask: '用中文浏览网站？', yes: '是', no: '否' },
    ja: { on: 'サイトを日本語で表示中。', undo: '元に戻す', ask: 'サイトを日本語で表示しますか？', yes: 'はい', no: 'いいえ' },
    ko: { on: '사이트가 한국어로 표시됩니다.', undo: '되돌리기', ask: '사이트를 한국어로 볼까요?', yes: '네', no: '아니요' }
  };

  function norm(code) {
    code = String(code || '').toLowerCase().split(/[-_]/)[0];
    return LANGS[code] ? code : '';
  }
  function read(k) { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } }
  function write(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) {} }

  function get() {
    // The AI key wins when the two disagree: it is the one the round
    // surfaces write, so it is the freshest signal of what the person
    // actually used.
    return norm(read(KEY_AI)) || norm(read(KEY_UI)) || 'en';
  }
  function source() { return (read(KEY_SRC).split(':')[0]) || ''; }

  /* ── Detection ───────────────────────────────────────────────────
   * Script first (unambiguous), then Latin-script function words.
   * Returns {code, confidence, tokens} or null when the text says
   * nothing clear. Word lists hold only words that are frequent in one
   * language and rare in the others in this set; anything shared
   * (a, de, la, en, no, on, is) is left out of every list so it cannot
   * tip a close call.
   */
  var WORDS = {
    en: 'the and is are that this with have not you for but they what from would should because there about which their been more than just like think people really actually don\'t doesn\'t can\'t isn\'t it\'s we\'re they\'re',
    es: 'el los las es son que por para con pero una uno del al como más muy esto esta ese esa porque también tiene tienen hay está están ser sí yo nosotros ustedes entonces creo debería deberían puede pueden nada todo todos cuando donde',
    fr: 'le les des est une et que qui pour avec mais dans sur pas ne ce cette ces nous vous ils elles sont être aussi parce donc très il elle je c\'est n\'est qu\'il d\'un d\'une faut peut',
    de: 'der die das und ist sind nicht ein eine einen mit für auf aber auch wir sie ich dass wenn oder sich haben werden kann können sollte sollten weil mehr sehr wie was noch nur doch schon muss müssen',
    it: 'il lo gli che di non per con una uno sono è ma anche come più molto questo questa perché essere hanno ha ci si nel nella della delle degli dei quindi',
    pt: 'o os as um uma é são não que para com mas também muito mais isso isto esse essa porque você vocês nós eles elas ser tem têm está estão pelo pela dos das do da na em ao então',
    nl: 'het een niet van dat dit met voor maar ook wij we ze zij ik je jij als dan omdat kunnen moeten zou zouden heeft hebben wordt worden er nog wel geen veel over bij',
    tr: 've bir bu için ile ama çok daha gibi değil var yok olarak olan bence çünkü şu ben biz siz onlar ne ki her hiç sadece zaten yani ancak olduğunu olduğu gerekir gerek lazım'
  };
  var SETS = {};
  Object.keys(WORDS).forEach(function (k) {
    SETS[k] = {};
    WORDS[k].split(/\s+/).forEach(function (w) { SETS[k][w] = 1; });
  });
  var DIACRITIC = [
    [/[ñ¿¡]/g, 'es', 1.5],
    [/[çœ]|[àèùâêîôû]/g, 'fr', 0.8],
    [/[ßäöü]/g, 'de', 0.8],
    [/[ãõ]/g, 'pt', 1.5],
    [/[ıışğİ]/g, 'tr', 1.2],
    [/[ìò]/g, 'it', 1.2]
  ];
  var SCRIPTS = [
    [/[ऀ-ॿ]/g, 'hi'],
    [/[؀-ۿݐ-ݿ]/g, 'ar'],
    [/[Ѐ-ӿ]/g, 'ru'],
    [/[가-힯ᄀ-ᇿ㄰-㆏]/g, 'ko'],
    [/[぀-ヿ]/g, 'ja'],
    [/[一-鿿㐀-䶿]/g, 'zh']
  ];

  function detect(text) {
    text = String(text || '');
    var letters = (text.match(/[\p{L}]/gu) || []).length;
    if (letters < 4) return null;
    // Script pass. Kana beats Han (Japanese text carries both).
    var best = null, bestN = 0, hasKana = false;
    for (var i = 0; i < SCRIPTS.length; i++) {
      var n = (text.match(SCRIPTS[i][0]) || []).length;
      if (SCRIPTS[i][1] === 'ja' && n > 0) hasKana = true;
      if (n > bestN) { bestN = n; best = SCRIPTS[i][1]; }
    }
    if (best && bestN / letters >= 0.5) {
      if (best === 'zh' && hasKana) best = 'ja';
      // CJK has no spaces; count characters as tokens.
      var tk = (best === 'zh' || best === 'ja') ? Math.min(60, bestN) : (text.split(/\s+/).filter(Boolean).length);
      return { code: best, confidence: Math.min(1, bestN / letters), tokens: tk, script: true };
    }
    // Latin pass.
    var toks = text.toLowerCase().replace(/[’‘]/g, '\'').match(/[\p{L}']+/gu) || [];
    if (toks.length < 3) return null;
    var score = {};
    Object.keys(SETS).forEach(function (k) { score[k] = 0; });
    toks.forEach(function (w) {
      Object.keys(SETS).forEach(function (k) { if (SETS[k][w]) score[k] += 1; });
    });
    DIACRITIC.forEach(function (d) {
      var m = (text.match(d[0]) || []).length;
      if (m) score[d[1]] += Math.min(3, m) * d[2];
    });
    var top = '', topV = 0, second = 0;
    Object.keys(score).forEach(function (k) {
      if (score[k] > topV) { second = topV; topV = score[k]; top = k; }
      else if (score[k] > second) second = score[k];
    });
    if (!top || topV < 2) return null;
    var share = topV / toks.length;
    if (share < 0.12) return null;
    if (topV < second * 1.6) return null;
    return { code: top, confidence: Math.min(1, share * 2), tokens: toks.length, script: false };
  }

  /* ── Evidence + switching ─────────────────────────────────────── */
  var evidence = [];          // last few observations
  var lastAutoAt = 0;
  var explicitThisPage = false;

  function observe(text, opts) {
    opts = opts || {};
    var d = detect(text);
    if (!d) return null;
    var now = Date.now();
    evidence.push({ code: d.code, w: Math.min(30, d.tokens) * d.confidence, tokens: d.tokens, conf: d.confidence, at: now });
    if (evidence.length > 6) evidence.shift();
    var cur = get();
    if (d.code === cur) return d;
    if (explicitThisPage && !opts.force) return d;
    if (now - lastAutoAt < 15000) return d;
    // Sum recent evidence per language.
    var sum = {};
    evidence.forEach(function (e) { if (now - e.at < 180000) sum[e.code] = (sum[e.code] || 0) + e.w; });
    var cand = d.code, candW = sum[cand] || 0, other = 0;
    Object.keys(sum).forEach(function (k) { if (k !== cand && sum[k] > other) other = sum[k]; });
    var strongSingle = d.script ? d.tokens >= 3 : (d.tokens >= 8 && d.confidence >= 0.3);
    var cumulative = candW >= 14 && evidence.filter(function (e) { return e.code === cand; }).length >= 2;
    if ((strongSingle || cumulative) && candW >= other * 2) {
      lastAutoAt = now;
      set(cand, { source: 'detect', ui: opts.ui });
    }
    return d;
  }

  /* ── Google Translate (the UI half) ───────────────────────────── */
  function setCookie(name, val, domain) {
    document.cookie = name + '=' + val + '; path=/' + (domain ? '; domain=' + domain : '');
  }
  function clearCookie(name, domain) {
    document.cookie = name + '=; path=/; expires=Thu, 01 Jan 1970 00:00:00 UTC' + (domain ? '; domain=' + domain : '');
  }
  function writeGtCookie(code) {
    var host = location.hostname, bare = host.replace(/^www\./, '');
    clearCookie('googtrans'); clearCookie('googtrans', '.' + host); clearCookie('googtrans', '.' + bare);
    if (code && code !== 'en') {
      var v = '/en/' + code;
      setCookie('googtrans', v); setCookie('googtrans', v, '.' + host); setCookie('googtrans', v, '.' + bare);
    }
  }
  var GT_CSS = '.goog-te-banner-frame.skiptranslate,.goog-te-gadget-icon,#goog-gt-tt,.goog-te-balloon-frame{display:none!important}' +
    'body{top:0!important}.goog-tooltip,.goog-tooltip:hover{display:none!important}' +
    '.goog-text-highlight{background:transparent!important;box-shadow:none!important}' +
    '#google_translate_element{display:none}.skiptranslate iframe{display:none!important}' +
    'font[style*="vertical-align: inherit"]{font:inherit!important;vertical-align:baseline!important}';
  function ensureGtCss() {
    if (document.getElementById('dbLocaleGtCss')) return;
    var s = document.createElement('style'); s.id = 'dbLocaleGtCss'; s.textContent = GT_CSS;
    (document.head || document.documentElement).appendChild(s);
  }
  function uiAllowed() {
    var v = document.documentElement.getAttribute('data-locale-ui');
    return v !== 'off';
  }
  function gtScriptPresent() {
    return !!document.querySelector('script[src*="translate.google.com/translate_a/element.js"]');
  }
  function ensureGtWidget() {
    if (!uiAllowed()) return;
    ensureGtCss();
    if (!document.getElementById('google_translate_element')) {
      var host = document.createElement('div'); host.id = 'google_translate_element';
      (document.body || document.documentElement).appendChild(host);
    }
    if (typeof window.googleTranslateElementInit !== 'function') {
      window.googleTranslateElementInit = function () {
        try {
          // The default (dropdown) layout, not SIMPLE: only the dropdown
          // renders the select.goog-te-combo that gtSwitchLive() drives
          // for a mid-page switch. The host is display:none either way.
          new google.translate.TranslateElement({ pageLanguage: 'en', autoDisplay: false }, 'google_translate_element');
        } catch (e) {}
      };
    }
    if (gtScriptPresent()) return;
    var s = document.createElement('script');
    s.src = 'https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit';
    s.async = true;
    document.head.appendChild(s);
  }
  // Drive an already-loaded widget to a new language without a reload.
  function gtSwitchLive(code) {
    var combo = document.querySelector('select.goog-te-combo');
    if (!combo) return false;
    try {
      combo.value = code === 'en' ? '' : code;
      combo.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    } catch (e) { return false; }
  }
  var pendingUi = '';
  function applyUI(code) {
    code = code || get();
    writeGtCookie(code);
    document.documentElement.setAttribute('lang', code);
    if (!uiAllowed()) return;
    if (code === 'en') {
      if (gtScriptPresent()) {
        if (!gtSwitchLive('en')) return;
        // The widget usually restores the original text; if the page is
        // still marked translated after a beat, a reload is the honest
        // way back to the authored copy.
        setTimeout(function () {
          if (/translated-/.test(document.documentElement.className)) location.reload();
        }, 700);
      }
      return;
    }
    if (gtScriptPresent()) {
      // A page that hosts its own SIMPLE-layout widget (landing, practice)
      // has no combo to drive; the cookie is already written, so a reload
      // is what applies it there.
      if (!gtSwitchLive(code)) location.reload();
      return;
    }
    ensureGtWidget();
  }
  function flushUI() {
    if (!pendingUi) return;
    var c = pendingUi; pendingUi = '';
    applyUI(c);
  }

  /* ── set() ─────────────────────────────────────────────────────── */
  var listeners = [];
  function set(code, opts) {
    opts = opts || {};
    code = norm(code) || 'en';
    var prev = get();
    var src = opts.source || 'user';
    if (src === 'user') explicitThisPage = true;
    write(KEY_UI, code);
    write(KEY_AI, code);
    write(KEY_SRC, src + ':' + Date.now());
    // The UI half. Round pages may ask for it to wait (a live translation
    // pass over a page mid-round can rewrite text a script is about to
    // read); they call flushUI() when it is safe.
    if (opts.ui === 'defer') { pendingUi = code; writeGtCookie(code); document.documentElement.setAttribute('lang', code); }
    else if (opts.ui !== false) applyUI(code);
    else { writeGtCookie(code); document.documentElement.setAttribute('lang', code); }
    if (code !== prev) {
      var detail = { code: code, prev: prev, source: src };
      try { window.dispatchEvent(new CustomEvent('debatable:locale', { detail: detail })); } catch (e) {}
      listeners.forEach(function (fn) { try { fn(detail); } catch (e) {} });
      syncPickers(code);
      if (src === 'detect' && !opts.silent) toast(code, prev);
      try { if (typeof gtag === 'function') gtag('event', 'locale_set', { lang: code, prev: prev, source: src }); } catch (e) {}
    }
    return code;
  }
  function onChange(fn) { if (typeof fn === 'function') listeners.push(fn); }

  /* ── Toast: the switch says so, in the new language, with one undo ─ */
  function toast(code, prev) {
    try {
      var old = document.getElementById('dbLocaleToast'); if (old) old.remove();
      var s = STR[code] || STR.en;
      var box = document.createElement('div');
      box.id = 'dbLocaleToast';
      box.className = 'notranslate';
      box.setAttribute('translate', 'no');
      box.setAttribute('role', 'status');
      box.style.cssText = 'position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:2147482000;display:flex;align-items:center;gap:12px;padding:10px 12px 10px 16px;border-radius:999px;background:rgba(16,10,14,.94);color:#fff;font:600 13px/1 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;box-shadow:0 8px 30px rgba(0,0,0,.35);border:1px solid rgba(255,255,255,.1);max-width:calc(100vw - 24px)';
      var msg = document.createElement('span'); msg.textContent = '🌐 ' + s.on;
      var undo = document.createElement('button');
      undo.type = 'button'; undo.textContent = s.undo;
      undo.style.cssText = 'border:0;border-radius:999px;padding:7px 12px;background:#fff;color:#111;font:700 12px system-ui,sans-serif;cursor:pointer';
      undo.addEventListener('click', function () { set(prev || 'en', { source: 'user' }); box.remove(); });
      box.appendChild(msg); box.appendChild(undo);
      document.body.appendChild(box);
      setTimeout(function () { if (box.parentNode) box.remove(); }, 9000);
    } catch (e) {}
  }

  /* ── Browser-language offer (one chip, once) ──────────────────── */
  function browserLang() {
    try {
      var l = (navigator.languages && navigator.languages[0]) || navigator.language || '';
      return norm(l);
    } catch (e) { return ''; }
  }
  function maybeOffer() {
    try {
      if (navigator.webdriver) return;
      if (read(KEY_SRC) || read(KEY_UI) || read(KEY_AI)) return;      // already chosen or detected
      if (read(KEY_OFFER_OFF) === '1') return;
      if (document.documentElement.getAttribute('data-locale-offer') === 'off') return;
      if (/^\/(live-round|voice-debate|newvoice|practice|room-judge|casual-room|admin)/.test(location.pathname)) return;
      var bl = browserLang();
      if (!bl || bl === 'en') return;
      var s = STR[bl];
      var box = document.createElement('div');
      box.id = 'dbLocaleOffer';
      box.className = 'notranslate';
      box.setAttribute('translate', 'no');
      box.setAttribute('role', 'dialog');
      box.setAttribute('aria-label', s.ask);
      var bottom = (window.matchMedia && window.matchMedia('(max-width:600px)').matches) ? '82px' : '18px';
      box.style.cssText = 'position:fixed;left:50%;bottom:' + bottom + ';transform:translateX(-50%);z-index:9998;display:flex;align-items:center;gap:10px;padding:10px 12px 10px 16px;border-radius:999px;background:rgba(20,10,18,.92);color:#fff;font:600 13px/1 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;backdrop-filter:blur(8px);box-shadow:0 8px 30px rgba(0,0,0,.35);border:1px solid rgba(255,255,255,.08);max-width:calc(100vw - 24px)';
      var msg = document.createElement('span'); msg.textContent = '🌐 ' + s.ask;
      var yes = document.createElement('button'); yes.type = 'button'; yes.textContent = s.yes;
      yes.style.cssText = 'border:0;border-radius:999px;padding:7px 12px;background:#ef4444;color:#fff;font:700 12px system-ui,sans-serif;cursor:pointer';
      var no = document.createElement('button'); no.type = 'button'; no.textContent = s.no;
      no.style.cssText = 'border:0;border-radius:999px;padding:7px 10px;background:transparent;color:rgba(255,255,255,.7);font:700 12px system-ui,sans-serif;cursor:pointer';
      yes.addEventListener('click', function () { box.remove(); set(bl, { source: 'browser' }); });
      no.addEventListener('click', function () { write(KEY_OFFER_OFF, '1'); box.remove(); });
      box.appendChild(msg); box.appendChild(yes); box.appendChild(no);
      document.body.appendChild(box);
      try { if (typeof gtag === 'function') gtag('event', 'locale_offer_shown', { lang: bl }); } catch (e) {}
    } catch (e) {}
  }

  /* ── Picker ───────────────────────────────────────────────────── */
  var pickers = [];
  function syncPickers(code) {
    pickers.forEach(function (sel) { try { if (sel.value !== code) sel.value = code; } catch (e) {} });
  }
  function mountPicker(container, opts) {
    opts = opts || {};
    if (!container) return null;
    var wrap = document.createElement('label');
    wrap.className = 'db-locale-picker notranslate' + (opts.className ? ' ' + opts.className : '');
    wrap.setAttribute('translate', 'no');
    wrap.title = 'Language';
    var glyph = document.createElement('span'); glyph.className = 'db-locale-glyph'; glyph.textContent = '🌐'; glyph.setAttribute('aria-hidden', 'true');
    var sel = document.createElement('select');
    sel.className = 'db-locale-select';
    sel.setAttribute('aria-label', 'Site language');
    ORDER.forEach(function (c) {
      var o = document.createElement('option'); o.value = c; o.textContent = LANGS[c].native; sel.appendChild(o);
    });
    sel.value = get();
    sel.addEventListener('change', function () { set(sel.value, { source: 'user' }); });
    wrap.appendChild(glyph); wrap.appendChild(sel);
    if (opts.before && opts.before.parentNode === container) container.insertBefore(wrap, opts.before);
    else container.appendChild(wrap);
    pickers.push(sel);
    return wrap;
  }

  /* ── Boot ─────────────────────────────────────────────────────── */
  function boot() {
    var code = get();
    document.documentElement.setAttribute('lang', code);
    // The brand is a name: a translated tab title reads "Debatible" in
    // Spanish. The wordmark carries translate="no" in topbar.js; the
    // title tag gets it here.
    try { var tt = document.querySelector('title'); if (tt) { tt.setAttribute('translate', 'no'); tt.classList.add('notranslate'); } } catch (e) {}
    if (code !== 'en') {
      // Pages that host their own Google Translate loader (landing,
      // practice) run it on DOMContentLoaded; wait a tick so this never
      // double-injects the script beside theirs.
      setTimeout(function () { applyUI(code); }, 0);
    } else {
      maybeOffer();
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  window.DBLocale = {
    LANGS: LANGS,
    ORDER: ORDER,
    get: get,
    set: set,
    source: source,
    detect: detect,
    observe: observe,
    onChange: onChange,
    flushUI: flushUI,
    applyUI: applyUI,
    mountPicker: mountPicker,
    name: function (code) { code = norm(code) || 'en'; return LANGS[code].name; },
    native: function (code) { code = norm(code) || 'en'; return LANGS[code].native; },
    norm: norm,
    // The language a round was actually argued in: the user's own words
    // outrank the stored key, which may predate the round.
    roundLang: function (userText) {
      var d = detect(userText);
      if (d && (d.script ? d.tokens >= 3 : (d.tokens >= 8 && d.confidence >= 0.3))) return d.code;
      return get();
    },
    // A prompt block for any judge / writer call. Labels and JSON keys
    // are parsed downstream and must stay in English; only prose moves.
    promptBlock: function (code) {
      code = norm(code) || 'en';
      if (code === 'en') return '';
      var n = LANGS[code].name;
      return 'LANGUAGE: The debater argued in ' + n + '. Write every sentence of prose in ' + n +
        ': the decision, the reasoning, the feedback, the fixes, all of it. Do NOT translate or alter section labels, JSON keys, ' +
        'enum values (USER, AI, MACHINE, the "Winner: You." / "Winner: The machine." / "Winner: Wash." line, the "Score: N" line, SCORE, DECISION, THE BALLOT, BEST MOMENT, COSTLIEST MOMENT, TWO FIXES FOR NEXT ROUND, DIMENSIONS, ' +
        'or the axis names); those are parsed by software and stay exactly as specified in English. Quote the transcript in its original language. ' +
        'Names of real people and proper nouns stay as they are.\n\n';
    }
  };
})();
