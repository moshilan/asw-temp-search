import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { DEFAULT_HEADERS } from '../src/sources.js';
import { resolveDetailUrl } from '../public/detail-url.js';
import { validPilotDownloadUrls } from './build-static-index.js';
import { contentKind, sameSize } from './772txt-file-validation.js';
const base = 'http://772txt.com';
const nap = ms => new Promise(resolve => setTimeout(resolve, ms));
const originSlots = new Map();
async function withOriginSlot(url, request) {
 const origin = new URL(url, base).origin;
 const slots = originSlots.get(origin) || { active: 0, waiting: [] };
 originSlots.set(origin, slots);
 if (slots.active < 3) slots.active++;
 else await new Promise(resolve => slots.waiting.push(resolve));
 try { return await request(); }
 finally {
  const next = slots.waiting.shift();
  if (next) next();
  else slots.active--;
 }
}
const namedEntities = { amp: '&', quot: '"', lt: '<', gt: '>', nbsp: ' ' };
const entities = value => value.replace(/&(?:amp|quot|lt|gt|nbsp|#\d+|#x[0-9a-f]+);/gi, entity => {
 const key = entity.slice(1, -1).toLowerCase();
 if (!key.startsWith('#')) return namedEntities[key] || entity;
 const point = key.startsWith('#x') ? parseInt(key.slice(2), 16) : Number(key.slice(1));
 return point <= 0x10ffff ? String.fromCodePoint(point) : entity;
});
const clean = value => entities(value.replace(/<[^>]+>/g, '')).trim();
function get(url, referer) {
 return withOriginSlot(url, () => requestHtml(url, referer));
}
async function requestHtml(url,referer){
 const r=await fetch(new URL(url,base),{headers:{...DEFAULT_HEADERS,...(referer?{Referer:referer}:{})},redirect:'error',signal:AbortSignal.timeout(12000)});
 const bytes=await r.arrayBuffer();const utf=new TextDecoder().decode(bytes);
 const html=/charset\s*=\s*["']?\s*(gbk|gb2312|gb18030)/i.test((r.headers.get('content-type')||'')+utf.slice(0,5000))?new TextDecoder('gb18030').decode(bytes):utf;
 if(!r.ok)throw Error('HTTP '+r.status);
 return {html,url:r.url,status:r.status};
}
function links(h){return [...h.matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)].map(m=>[entities(m[1]),clean(m[2])]);}
function listing(html){
 return [...html.matchAll(/<div class="book-item"([^>]*)>\s*<div class="book-title">([\s\S]*?)<\/div>/gi)].flatMap(m=>{
 const intro=entities(m[1].match(/\bdata-intro="([^"]*)"/)?.[1]||'');
 const anchors=links(m[2]);const detail=anchors.find(([p])=>/\/txt-\d+\.htm$/.test(p));
 return detail?[{id:Number(detail[0].match(/txt-(\d+)/)[1]),path:detail[0],title:detail[1],label:anchors[0]?.[1],intro}]:[];
 });
}

const trusted=new Set(['mg.downbook12.com','mg3s.downbook8.com']);
const journal='data/772txt-backfill-progress.log';
const output='data/772txt-additions.json';
// The other six IDs in the original 100-record pilot were held for review.
const reviewedPilotRejections=new Set([284754,284649,285641,283994,281777,280915]);
const options=process.argv.slice(2);
const sizeArg=options.find(x=>x.startsWith('--batch-size='));
const batchSize=sizeArg?Number(sizeArg.split('=')[1]):100;
if(!Number.isInteger(batchSize)||batchSize<1||batchSize>500)throw Error('Invalid batch size');
const readJson=async name=>JSON.parse(await fs.readFile(name,'utf8'));
const pilot=await readJson('data/772txt-pilot.json');
if(pilot.length!==94||new Set(pilot.map(x=>x.sourceId)).size!==94)throw Error('Unexpected pilot baseline');
const oldIds=new Set([...pilot.map(x=>Number(x.sourceId)),...reviewedPilotRejections]);
const rows=await readJson('data/index.json');
if(rows.length!==98325)throw Error('ASW基线不等于98325条');
const key=x=>String(x||'').normalize('NFKC').toLowerCase().replace(/[\p{P}\p{S}\p{Z}\p{C}]/gu,'');
const core=x=>x.replace(/\.txt\s*$/i,'').replace(/txt全集(?:下载)?$/i,'').replace(/(?:全集|全本|完结版)$/,'').trim();
const quoted=x=>[...x.matchAll(/《([^》]+)》/g)].map(m=>m[1]);
const au=x=>key(x).replace(/^(?:作者|author)/,'');
function authors(raw){
 return [...new Set([...raw.normalize('NFKC').matchAll(/(?:作者\s*[:：]?\s*|[Bb][Yy]\s*[:：]?\s*)([\p{L}\p{N}·_]{1,20})(?=\s|[【《〔（(\[】。！，、：:]|$)/gu)].map(m=>au(m[1].replace(/(?:完结|简介|全文|番外|长佩|晋江|番茄).*$/,''))).filter(Boolean))];
}
function aswTitle(raw){
 const noext=core(raw.normalize('NFKC')).replace(/^[\s\d]*(?:\[[^\]]*\]|\([^)]{1,35}\)|【[^】]*】|\d+[.、])+\s*/g,'');
 return noext.split(/\s*(?:作者\s*[:：]?|(?:\s|[》】])by\s*[:：]?)\s*/i)[0].replace(/\s+-\s+[^-]+$/,'');
}
const index=new Map(), grams=new Map();
const normalizedNames=rows.map(x=>key(x.name));
for(const x of rows){
 const full=core(x.name.normalize('NFKC'));
 const authorList=authors(full);
 const tail=full.match(/\s+-\s+([\p{L}\p{N}·_]{1,20})$/u);
 if(tail)authorList.push(au(tail[1]));
 const main=key(aswTitle(full));
 const titles=[...new Set([main,...quoted(full).map(key)].filter(Boolean))];
 const o={x,authorList,titles};
 for(const t of titles){
  if(!index.has(t))index.set(t,[]);
  index.get(t).push(o);
  if(t.length>=5)for(const gram of new Set([t.slice(0,3),t.slice(-3)])){if(!grams.has(gram))grams.set(gram,[]);grams.get(gram).push(o);}
 }
}
const cat=x=>x.path.startsWith('/txt-xx/15/')?'耽美':x.path.startsWith('/txt-xx/nsxs/')?'女生':x.path.startsWith('/txt-xx/nsbook/')?'男生':'其他';

async function collectCandidates(){
const all=[], pageStats=[], failures=[];
for(let p=1;p<=34;p++){
 try{
 let res;
 for(let j=0;j<2;j++){try{res=await get('/txt-xx/new/index_'+p+'.htm');break;}catch(e){if(j===1)throw e;await nap(1100);}}
 const l=listing(res.html);
 const rawIds=links(res.html).map(([u])=>u.match(/\/txt-(\d+)\.htm$/)?.[1]).filter(Boolean);
 const current=res.html.match(/<option value="index_(\d+)\.htm" selected>/i)?.[1];
 pageStats.push([p,l.length,rawIds.length,current||null,l[0]?.id,l.at(-1)?.id]);
 if(l.length!==rawIds.length)console.log('PARSER GAP',p,l.length,rawIds.length);
 all.push(...l.map(x=>({...x,p})));
 }catch(e){failures.push([p,e.cause?.code||e.message]);}
 if(p%10===0)console.log('列表已核对',p);
 await nap(530);
}
const byId=new Map(all.map(x=>[x.id,x]));
if(failures.length||all.length!==5000||byId.size!==5000||pageStats.some(([page,n,raw,current])=>n!==(page===34?50:150)||n!==raw||(page>1&&Number(current)!==page))) throw Error('772txt列表与基线不同：'+JSON.stringify({failures,entries:all.length,unique:byId.size}));
for(const x of byId.values()){
 x.cat=cat(x);x.titleKey=key(core(quoted(x.title)[0]||x.title));
 const ix=x.intro.indexOf('作者');
 x.auth=ix>=0&&ix<150?authors(x.intro.slice(ix))[0]||'':'';
 const exact=index.get(x.titleKey)||[];
 const near=[];
 if(!exact.length&&x.titleKey.length>=5){
  const opts=new Set([...(grams.get(x.titleKey.slice(0,3))||[]),...(grams.get(x.titleKey.slice(-3))||[])]);
  for(const o of opts)if(o.titles.some(t=>t.length>=5&&Math.min(t.length,x.titleKey.length)/Math.max(t.length,x.titleKey.length)>=0.72&&(t.includes(x.titleKey)||x.titleKey.includes(t))))near.push(o);
 }
 x.matches=[...new Set([...exact,...near])];
 x.result=x.matches.length||!x.auth||!x.titleKey?'suspect':'candidate';
}

 const pool=new Map();
 for(const x of byId.values())if(x.result==='candidate'){
  const k=x.titleKey+'|'+x.auth;
  if(!pool.has(k))pool.set(k,{id:x.id,path:x.path,title:x.title,label:x.label,cat:x.cat,titleKey:x.titleKey,auth:x.auth});
 }
 if(pool.size!==2877)throw Error('候选池与上轮不一致：'+pool.size);
 if([...oldIds].some(id=>![...pool.values()].some(x=>x.id===id)))throw Error('上轮样本ID未完整重现');
 return [...pool.values()].filter(x=>!oldIds.has(x.id));
}
const numSize=s=>{const m=String(s).match(/(\d+(?:\.\d+)?)\s*([KMG])B/i);return m?Number(m[1])*1024**('KMG'.indexOf(m[2].toUpperCase())+1):null;};
const field=(s,tag)=>clean(s.match(new RegExp(tag+'[：:]\\s*<font[^>]*>([^<]*)','i'))?.[1]||'');
const labels=[/第一下载地址/,/第三下载地址/];
function validateUrl(raw){
 const u=new URL(raw);
 if(u.protocol!=='https:'||!trusted.has(u.hostname)||u.port||u.username||u.password||u.search||u.hash||
   !/^\/txt-xx\/UploadFile\/\d{4}-\d{1,2}\/[^/]+\.(?:txt|zip)$/i.test(u.pathname))throw Error('链接格式或镜像未确认');
 return u.href;
}
async function verifyOnce(url,size){
 const r=await fetch(url,{headers:{...DEFAULT_HEADERS,Range:'bytes=0-511'},redirect:'manual',signal:AbortSignal.timeout(9000)});
 if(r.status!==206){await r.body?.cancel();throw Error('文件HTTP '+r.status);}
 const m=r.headers.get('content-range')?.match(/^bytes 0-511\/(\d+)$/);
 const type=r.headers.get('content-type')||'';
 if(!m||!sameSize(size,Number(m[1]))||/html|json|xml/i.test(type)){
  await r.body?.cancel();
  throw Error(!m?'文件区段不符':!sameSize(size,Number(m[1]))?'文件大小不符':'返回HTML或错误页');
 }
 const rd=r.body.getReader(), chunks=[];let len=0;
 while(len<512){const {value,done}=await rd.read();if(done)break;len+=value.byteLength;if(len>512){await rd.cancel();throw Error('区段长度不符');}chunks.push(Buffer.from(value));}
 await rd.cancel();
 const bytes=Buffer.concat(chunks);const kind=contentKind(bytes,url);
 if(bytes.length!==512||!kind)throw Error('内容不是可确认的TXT或ZIP');
 return {url,kind,bytes:Number(m[1]),digest:createHash('sha256').update(bytes).digest('hex')};
}
async function verify(url,size){
 let reason;
 for(let i=0;i<2;i++)try{return await withOriginSlot(url,()=>verifyOnce(url,size));}catch(e){reason=e.cause?.code||e.message;if(i===0)await nap(450);}
 return {reason};
}

function aswMatch(x,author,size){
 const ref=(index.get(x.titleKey)||[]).filter(o=>o.authorList.includes(author));
 const bytes=numSize(size);
 if(bytes&&ref.some(o=>{const v=numSize(o.x.size);return v&&Math.abs(v-bytes)/bytes<=0.015;}))return 'duplicate';
 if(index.has(x.titleKey))return 'held';
 const t=x.titleKey;
 return normalizedNames.some(n=>n.includes(t)&&((t.length>=4&&n.includes(author))||t.length>=7))?'held':null;
}
async function enrich(row,gate){
 const issues=new Set();
 let raw=[];
 for(let i=0;i<5;i++){
  try{
   const response=await get(new URL(gate,row.url),row.url);
   if(new URL(response.url).origin!==base)throw Error('中转页跳出来源');
   raw=labels.flatMap(label=>{
    const link=links(response.html).find(([u,t])=>u.startsWith('https:')&&label.test(t));
    return link?[link[0]]:[];
   });
   if(raw.length)break;
   issues.add('中转页没有可用HTTPS链接');
  }catch(e){issues.add(e.cause?.code||e.message);}
  if(i<4)await nap(500+i*150);
 }
 const good=[];
 for(const value of raw){
  try{
   const v=await verify(validateUrl(value),row.size);
   if(v.reason)issues.add(v.reason);else good.push(v);
  }catch(e){issues.add(e.message);}
 }
 if(good.length===2&&(good[0].bytes!==good[1].bytes||good[0].digest!==good[1].digest)){
  issues.add('双镜像的大小或首段不一致');good.length=0;
 }
 const urls=[...new Set(good.map(v=>v.url))];
 if(urls.length&&validPilotDownloadUrls(urls))row.downloadUrls=urls;
 return [...issues];
}
async function review(x){
 let res;
 for(let i=0;i<2;i++){
  try{res=await get(x.path);break;}
  catch(e){if(i===1)return {id:x.id,status:'failed',reason:e.cause?.code||e.message};await nap(900);}
 }
 const {html,url}=res;
 const author=field(html,'作者名称'),size=field(html,'小说大小'),updated=field(html,'更新时间');
 const stamp=updated.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2}) (\d{1,2}):(\d{2}):\d{2}$/);
 const gate=links(html).find(([u])=>u.includes('softdownfree.asp')&&new URL(u,url).searchParams.get('softid')===String(x.id));
 if(!gate||new URL(url).origin!==base||new URL(url).pathname!==x.path||!html.includes(x.title.replace(/txt全集$/i,'')))return {id:x.id,status:'held',reason:'详情标题或来源ID未确认'};
 if(!stamp||!author||au(author)!==x.auth||!numSize(size))return {id:x.id,status:'held',reason:'作者、时间或大小未确认'};
 const match=aswMatch(x,au(author),size);
 if(match)return {id:x.id,status:match,reason:match==='duplicate'?'ASW书名、作者和大小一致':'ASW文件名存在疑似同书'};
 const [,y,m,d,h,mm]=stamp;
 const uploadedAt=y+'-'+m.padStart(2,'0')+'-'+d.padStart(2,'0')+' '+h.padStart(2,'0')+':'+mm;
 const parsed=new Date(uploadedAt.replace(' ','T')+':00Z');
 if(Number.isNaN(+parsed)||parsed.toISOString().slice(0,16).replace('T',' ')!==uploadedAt)return {id:x.id,status:'held',reason:'日期无效'};
 const category=x.cat==='女生'?'言情':x.cat;
 const row={source:'772txt',sourceId:String(x.id),sourceCategory:x.cat,sourceSubcategory:x.label,name:core(x.title)+' 作者：'+author+'.txt',category,categoryLabel:category,size,uploadedAt,url};
 if(!resolveDetailUrl(row))return {id:x.id,status:'held',reason:'详情URL未通过白名单'};
 return {id:x.id,status:'added',row,downloadIssues:await enrich(row,gate[0])};
}
const baseline=createHash('sha256').update(JSON.stringify({asw:rows,pilot})).digest('hex');
let raw=await fs.readFile(journal,'utf8').catch(e=>e.code==='ENOENT'?'':Promise.reject(e));
if (raw && !raw.endsWith('\n')) {
 const end = raw.lastIndexOf('\n');
 if (end < 0) throw Error('检查点的候选清单不完整');
 raw = raw.slice(0, end + 1);
 await fs.truncate(journal, Buffer.byteLength(raw));
}
const lines=raw.split('\n').filter(Boolean);
let header;
const progress=new Map();
if(lines.length){
 header=JSON.parse(lines[0]);
 if(header.baseline!==baseline||header.candidates?.length!==2777)throw Error('续跑基线不一致');
 const ids=new Set(header.candidates.map(x=>x.id));
 if(ids.size!==2777||[...oldIds].some(id=>ids.has(id)))throw Error('检查点的候选ID异常');
 for(const l of lines.slice(1)){const x=JSON.parse(l);if(!ids.has(x.id))throw Error('检查点包含未知ID');progress.set(x.id,x);}
}else{
 const candidates=await collectCandidates();
 if(candidates.length!==2777)throw Error('剩余候选数不等于2777');
 header={baseline,candidates};
 await fs.writeFile(journal,JSON.stringify(header)+'\n',{flag:'wx'});
}
if(!options.includes('--apply')){
 const todo=header.candidates.filter(x=>!progress.has(x.id)||(options.includes('--retry-failed')&&progress.get(x.id).status==='failed'));
 console.log('已保存',progress.size,'条，本轮待处理',todo.length,'条');
 let streak=0,stopped=false;
 for(let offset=0;offset<todo.length&&!stopped;offset+=batchSize){
  let next=offset;const end=Math.min(offset+batchSize,todo.length);
  let saved=Promise.resolve();
  await Promise.all(Array.from({length:6},async()=>{
   while(next<end&&!stopped){
    const item=todo[next++];const result=await review(item);
    streak=result.status==='failed'?streak+1:0;
    if(streak>=5)stopped=true;
    saved=saved.then(()=>fs.appendFile(journal,JSON.stringify(result)+'\n'));
    await saved;
    progress.set(result.id,result);
    if(progress.size%25===0)console.log('已核查',progress.size,'/ 2777');
    await nap(360);
   }
  }));
  console.log('批次结束',progress.size,'/ 2777');
 }
 if(stopped)console.error('连续五条详情请求失败，已保存检查点并停止');
}else{
 if(progress.size!==2777)throw Error('还有未核查的候选，暂不生成正式索引');
 const added=header.candidates.map(x=>progress.get(x.id)).filter(x=>x.status==='added').map(x=>x.row);
 const staged = output+'.'+process.pid+'.log';
 await fs.writeFile(staged,JSON.stringify(added,null,2)+'\n',{flag:'wx'});
 try {
  // Publish the completed file atomically and refuse to overwrite an existing export.
  await fs.link(staged, output);
 } finally {
  await fs.unlink(staged);
 }
}
const report={reviewed:progress.size,added:0,duplicate:0,held:0,failed:0,withDownload:0,withBackup:0,reasons:{},downloadIssues:{},categories:{}};
for(const x of progress.values()){
 report[x.status]++;
 if(x.status==='added'){
  const c=report.categories[x.row.category]??={added:0,download:0};
  c.added++;
  if(x.row.downloadUrls?.length){report.withDownload++;c.download++;}
  if(x.row.downloadUrls?.length===2)report.withBackup++;
  if(!x.row.downloadUrls?.length)for(const issue of x.downloadIssues)report.downloadIssues[issue]=(report.downloadIssues[issue]||0)+1;
 }else report.reasons[x.reason]=(report.reasons[x.reason]||0)+1;
}
console.log(JSON.stringify(report));
