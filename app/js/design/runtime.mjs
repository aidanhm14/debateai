import { compileCSS, applicableChanges, SCREENS } from './model.mjs';
export function mountDesign(doc, design, page) {
  let current = [];
  let destroyed = false;
  const originals = new Map();
  const inlineOriginals = new Map();
  function restoreInline() {
    for(const [el, properties] of inlineOriginals) for(const [key, value] of properties) {
      if(el.style.getPropertyValue(key) === value.after) el.style.setProperty(key, value.before, value.priority);
    }
    inlineOriginals.clear();
  }
  function inlinePass() {
    restoreInline();
    for(const screen of Object.keys(SCREENS)) {
      if(screen !== 'all' && !doc.defaultView.matchMedia?.(SCREENS[screen]).matches) continue;
      for(const change of current) {
        if(change.pseudo) continue;
        let elements;try { elements=doc.querySelectorAll(change.selector); } catch { continue; }
        for(const el of elements) for(const [key,value] of Object.entries(change.styles?.[screen] || {})) {
          if(!el.style || el.style.getPropertyPriority(key) !== 'important') continue;
          if(!inlineOriginals.has(el)) inlineOriginals.set(el,new Map());
          const properties=inlineOriginals.get(el);
          if(!properties.has(key)) properties.set(key,{ before:el.style.getPropertyValue(key), priority:'important', after:value });
          el.style.setProperty(key,value,'important');
          properties.get(key).after=el.style.getPropertyValue(key);
        }
      }
    }
  }
  const style = doc.createElement('style');
  style.dataset.designChrome = 'styles';
  doc.head.appendChild(style);
  let queued = false;
  const restoreText = () => {
    for (const [node, record] of originals) if (node.isConnected && node.nodeValue === record.after) node.nodeValue = record.before;
    originals.clear();
  };
  function textPass() {
    if(destroyed) return;
    observer.disconnect();
    inlinePass();
    for (const c of current) {
      if (c.pseudo || !c.text?.length) continue;
      let nodes;
      try { nodes = doc.querySelectorAll(c.selector); } catch { continue; }
      for (const el of nodes) {
        if (c.tag && el.localName !== c.tag) continue;
        for (const edit of c.text) {
          const node = el.childNodes[edit.index];
          if (!node || node.nodeType !== 3) continue;
          if (node.nodeValue === edit.before) {
            originals.set(node, { before: node.nodeValue, after: edit.after });
            node.nodeValue = edit.after;
          }
        }
      }
    }
    observer.observe(doc.documentElement, { childList: true, subtree: true, characterData: true });
  }
  const observer = new doc.defaultView.MutationObserver(() => {
    if (queued || destroyed) return;
    queued = true;
    doc.defaultView.requestAnimationFrame(() => { queued = false; textPass(); });
  });
  function update(next, nextPage = page) {
    page = nextPage;
    observer.disconnect();
    restoreText();
    current = applicableChanges(next, page);
    style.textContent = compileCSS(current);
    textPass();
    doc.defaultView.dispatchEvent(new doc.defaultView.Event('resize'));
  }
  const resize = () => { observer.disconnect(); inlinePass(); observer.observe(doc.documentElement, { childList: true, subtree: true, characterData: true }); };
  doc.defaultView.addEventListener?.('resize', resize);
  update(design);
  return { update, destroy() { destroyed = true; observer.disconnect(); doc.defaultView.removeEventListener?.('resize', resize); restoreText(); restoreInline(); style.remove(); } };
}
