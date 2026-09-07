import { createServer } from 'node:http';
import { readFile,writeFile,mkdir,stat } from 'node:fs/promises';
import { resolve,join,extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { injectDesign, designPages } from './build-design.mjs';
import { validateDesign } from '../app/js/design/model.mjs';
const appRoot=fileURLToPath(new URL('../app/',import.meta.url));
const draftPath=resolve(process.env.DESIGN_PREVIEW_DRAFT_DIR||new URL('../../private-design-preview/',import.meta.url).pathname);
await mkdir(draftPath,{recursive:true});
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.woff2':'font/woff2','.mp4':'video/mp4'};
const server=createServer(async(req,res)=>{
  const url=new URL(req.url,'http://127.0.0.1:4317');
  const send=(value,status=200,type='application/json')=>{res.writeHead(status,{'Content-Type':type,'Cache-Control':'no-store'});res.end(typeof value==='string'||Buffer.isBuffer(value)?value:JSON.stringify(value));};
  if(url.pathname==='/api/admin/design'){
    const path=join(draftPath,'draft.json');let draft;
    try{draft=JSON.parse(await readFile(path,'utf8'));}catch{draft={revision:0,design:{version:1,name:'My site design',changes:[]}};}
    if(req.method==='GET')return send({local:true,draft,publishedRevision:0});
    let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>750000)return send({error:'Draft too large'},413);}
    try{
      const body=JSON.parse(raw);
      if(body.action==='history')return send({history:[]});
      if(body.action!=='save')return send({error:'This preview saves private drafts only. Publish from the live editor.'},403);
      if(body.revision!==draft.revision)return send({error:'Another window saved a newer draft. Export your changes and reload.',conflict:true},409);
      draft={revision:draft.revision+1,design:validateDesign(body.design),savedAt:new Date().toISOString()};
      await writeFile(path,JSON.stringify(draft));return send({revision:draft.revision,savedAt:draft.savedAt,publishedRevision:0});
    }catch(e){return send({error:e.message},400);}
  }
  if(url.pathname==='/api/site-design')return send({version:1,changes:[]});
  if(url.pathname==='/js/design/pages.json')return send(designPages());
  if(url.pathname.startsWith('/api/'))return send({error:'Live data is unavailable in the local design preview'},403);
  if(!['GET','HEAD'].includes(req.method))return send({error:'Read only preview'},403);
  if(/^\/(netlify|\.netlify|node_modules|\.git|\.env)/.test(url.pathname))return send('Not found',404,'text/plain');
  let pathname=decodeURIComponent(url.pathname);if(pathname==='/')pathname='/landing.html';if(!extname(pathname))pathname+='.html';
  const path=resolve(appRoot,'.'+pathname);if(!path.startsWith(appRoot))return send('Not found',404,'text/plain');
  try{let file=await readFile(path);if(extname(path)==='.html'&&pathname!=='/design.html')file=Buffer.from(injectDesign(file.toString(),pathname));send(file,200,mime[extname(path)]||'application/octet-stream');}
  catch{send('Not found',404,'text/plain');}
});
server.listen(4317,'127.0.0.1',()=>console.log('Design preview: http://127.0.0.1:4317/design'));
