export function elementLabel(el) {
  if (!el) return 'Element';
  const id = el.id || '';
  if (/globe/i.test(id + ' ' + (el.getAttribute('class') || ''))) return el.localName === 'canvas' ? 'Globe canvas' : 'Globe';
  if (el.getAttribute('aria-label')) return el.getAttribute('aria-label').slice(0, 65);
  if (el.localName === 'img') return el.getAttribute('alt') || 'Image';
  const text = [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.nodeValue.trim()).join(' ').trim();
  return text.slice(0, 55) || id.replace(/[-_]/g, ' ') || ({ div: 'Container', section: 'Section', canvas: 'Canvas', svg: 'SVG shape', path: 'Vector path', a: 'Link', button: 'Button', header: 'Header', footer: 'Footer' }[el.localName]) || el.localName;
}
export function selectorFor(el, doc) {
  const valid = s => /^[a-zA-Z_][\w-]*$/.test(s);
  if (el === doc.body) return 'body';
  if (valid(el.id) && doc.querySelectorAll(`#${el.id}`).length === 1) return `#${el.id}`;
  const classes = [...el.classList].filter(valid).filter(c => !/^(active|open|show|visible|anim|is-|has-)/.test(c));
  for (const c of classes) if (doc.querySelectorAll(`.${c}`).length === 1) return `.${c}`;
  const parts=[];
  let node=el;
  while(node && node !== doc.documentElement) {
    if(valid(node.id) && doc.querySelectorAll(`#${node.id}`).length === 1) { parts.unshift(`#${node.id}`); break; }
    if(node===doc.body) {parts.unshift('body');break;}
    const siblings=[...node.parentElement.children].filter(x=>x.localName===node.localName);
    parts.unshift(node.localName + (siblings.length>1?`:nth-of-type(${siblings.indexOf(node)+1})`:''));
    node=node.parentElement;
  }
  return parts.join(' > ');
}
export function attachSelection(doc, callbacks) {
  const controller = new doc.defaultView.AbortController();
  const signal=controller.signal;
  const style=doc.createElement('style');style.dataset.designChrome='selection';
  style.textContent='html[data-design-edit] *,html[data-design-edit] *::before,html[data-design-edit] *::after{cursor:default!important;caret-color:transparent!important}html[data-design-edit]{scroll-behavior:auto!important}';doc.head.appendChild(style);
  let down=null,editing=true;
  const interactive=e=> {
    const link=e.target.closest?.('a[href]');
    if(link){e.preventDefault();e.stopImmediatePropagation();if(!editing)callbacks.navigate(link.getAttribute('href'));}
    else if(editing){e.preventDefault();e.stopImmediatePropagation();}
  };
  doc.addEventListener('click',interactive,{capture:true,signal});
  doc.addEventListener('dblclick', e=>{if(editing){e.preventDefault();e.stopImmediatePropagation();callbacks.text();}},{capture:true,signal});
  doc.addEventListener('pointerdown',e=>{if(!editing)return;down={x:e.clientX,y:e.clientY,target:e.target};},{capture:true,signal});
  doc.addEventListener('pointerup',e=>{
    if(!editing||!down)return;
    if(Math.hypot(e.clientX-down.x,e.clientY-down.y)<9){const el=down.target;if(el?.nodeType===1&&!el.closest('[data-design-chrome]'))callbacks.select(el);}
    down=null;
  },{capture:true,signal});
  doc.addEventListener('keydown',e=>callbacks.key(e),{capture:true,signal});
  doc.addEventListener('scroll',()=>callbacks.rect(),{capture:true,passive:true,signal});
  doc.defaultView.addEventListener('resize',()=>callbacks.rect(),{signal});
  function mode(value){editing=value;doc.documentElement.toggleAttribute('data-design-edit',value);}
  mode(true);
  return { mode,destroy(){controller.abort();style.remove();doc.documentElement.removeAttribute('data-design-edit');} };
}
