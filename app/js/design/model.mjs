export const SCREENS = { all: '', desktop: '(min-width: 1100px)', tablet: '(min-width: 768px) and (max-width: 1099px)', phone: '(max-width: 767px)' };
export const MAX_CHANGES = 500;
export function pageKey(value = '/') {
  const path = String(value).split(/[?#]/)[0].replace(/\.html$/, '').replace(/\/$/, '') || '/';
  return path === '/' || path === '/landing' ? '/landing' : path;
}
export function validateDesign(input) {
  if (!input || input.version !== 1 || !Array.isArray(input.changes) || input.changes.length > MAX_CHANGES) throw new Error('This draft is not a supported design file.');
  if (new TextEncoder().encode(JSON.stringify(input)).length > 650000) throw new Error('This draft is too large. Export a backup before continuing.');
  const ids = new Set();
  const changes = input.changes.map(c => {
    if (!c || !/^[a-zA-Z0-9_-]{1,90}$/.test(c.id) || ids.has(c.id)) throw new Error('Each change needs a unique identity.');
    ids.add(c.id);
    if (typeof c.page !== 'string' || !/^(\*|\/[a-zA-Z0-9_/-]*)$/.test(c.page) || c.page.includes('..')) throw new Error('Choose a Debatable page.');
    if (typeof c.selector !== 'string' || !c.selector.trim() || c.selector.length > 700 || /[{}<>@;\\\r\n]/.test(c.selector)) throw new Error('That element selector is not supported.');
    if (c.pseudo && !['::before', '::after'].includes(c.pseudo)) throw new Error('That shape is not supported.');
    const styles = {};
    for (const [screen, declarations] of Object.entries(c.styles || {})) {
      if (!Object.hasOwn(SCREENS, screen) || !declarations || typeof declarations !== 'object' || Array.isArray(declarations)) throw new Error('Choose a supported screen size.');
      if (Object.keys(declarations).length > 120) throw new Error('Too many properties on one element.');
      styles[screen] = {};
      for (const [property, value] of Object.entries(declarations)) {
        if (!/^(--[a-zA-Z][\w-]*|[a-z][a-z-]*)$/.test(property) || ['behavior', '-moz-binding'].includes(property)) throw new Error('That style property is not supported.');
        if (typeof value !== 'string' || value.length > 1000 || /[{}<>;\\\r\n]|url\s*\(|expression\s*\(|@import|!important/i.test(value)) throw new Error('Use a single style value without URLs or extra rules.');
        styles[screen][property] = value;
      }
    }
    const text = (c.text || []).map(t => {
      if (!Number.isInteger(t.index) || t.index < 0 || t.index > 300 || typeof t.before !== 'string' || typeof t.after !== 'string' || t.before.length > 12000 || t.after.length > 12000) throw new Error('That text edit is too long.');
      return { index: t.index, before: t.before, after: t.after };
    });
    if (text.length > 100) throw new Error('Select a smaller text element.');
    return { id: c.id, page: c.page === '*' ? '*' : pageKey(c.page), selector: c.selector, pseudo: c.pseudo || '', label: String(c.label || 'Element').slice(0, 120), tag: String(c.tag || '').slice(0, 30), styles, text };
  });
  return { version: 1, name: String(input.name || 'My site design').slice(0, 100), changes };
}
export function applicableChanges(design, page) {
  return (design?.changes || []).filter(c => c.page === '*' || pageKey(c.page) === pageKey(page)).sort((a, b) => Number(a.page !== '*') - Number(b.page !== '*'));
}
export function compileCSS(changes) {
  const blocks = [];
  for (const screen of Object.keys(SCREENS)) {
    const rules = changes.map(c => {
      const body = Object.entries(c.styles?.[screen] || {}).filter(([, v]) => v !== '').map(([k, v]) => `${k}:${v} !important`).join(';');
      // Repeating the root ID specificity lets intentional edits outrank the site's existing !important rules.
      return body ? `:is(html,#__db_design_priority#__db_design_priority) ${c.selector}${c.pseudo || ''}{${body}}` : '';
    }).filter(Boolean).join('\n');
    if (rules) blocks.push(SCREENS[screen] ? `@media ${SCREENS[screen]}{\n${rules}\n}` : rules);
  }
  return blocks.join('\n');
}
export function changeCount(design) { return design.changes.filter(c => c.text.length || Object.values(c.styles).some(s => Object.keys(s).length)).length; }
