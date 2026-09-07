import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { resolve, relative, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(fileURLToPath(new URL('../app', import.meta.url)));
export function injectDesign(html, page) {
  if (/data-db-design-loader/.test(html)) return html;
  return html.replace(/<head(\s[^>]*)?>/i, m => `${m}\n<script data-db-design-loader data-page="${page}" src="/js/design-loader.js"></script>`);
}
const titles = { landing:'Home', spar:'Meet someone', 'live-round':'Live round', newvoice:'Voice AI', watch:'Watch', community:'Community', leaderboard:'Leaderboard', pricing:'Pricing', 'voice-tokens':'Voice tokens', profile:'Profile', messages:'Messages', brain:'Your brain', judge:'Judge', 'how-it-works':'How it works', story:'About', terms:'Terms', privacy:'Privacy', schools:'Schools' };
export function designPages() {
  const pages=[];
  for (const name of readdirSync(root)) {
    if (!name.endsWith('.html') || /^(admin|design|studio|_|offline|native|og-|stage|air|404|splash)/.test(name)) continue;
    const html=readFileSync(join(root,name),'utf8');
    if (/http-equiv\s*=\s*["']?refresh/i.test(html)) continue;
    const slug=name.slice(0,-5);
    const title=titles[slug] || slug.split('-').map(x=>x[0].toUpperCase()+x.slice(1)).join(' ');
    const group=['landing','spar','newvoice','live-round','watch','community','leaderboard','profile','messages'].includes(slug)?'Main pages':['terms','privacy','cookies','disclosures','safety','accessibility'].includes(slug)?'Policies':'More pages';
    pages.push({ path:`/${name}`,key:`/${slug}`,title,group });
  }
  const main=Object.keys(titles);
  pages.sort((a,b)=> (main.indexOf(a.key.slice(1))<0?1000:main.indexOf(a.key.slice(1))) - (main.indexOf(b.key.slice(1))<0?1000:main.indexOf(b.key.slice(1))) || a.title.localeCompare(b.title));
  return pages;
}
if (process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const pages=designPages();
  writeFileSync(join(root,'js/design/pages.json'),JSON.stringify(pages,null,2)+'\n');
  if (!process.argv.includes('--manifest-only')) {
    for(const name of readdirSync(root).filter(n=>n.endsWith('.html') && n!=='design.html')) {
      const path=join(root,name), html=readFileSync(path,'utf8');
      writeFileSync(path,injectDesign(html,`/${name}`));
    }
  }
  console.log(`Design editor: ${pages.length} pages indexed${process.argv.includes('--manifest-only')?'':', preview and published design loader installed'}.`);
}
