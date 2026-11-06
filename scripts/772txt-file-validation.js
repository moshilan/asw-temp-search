export function sameSize(size,bytes){
 const m=size.match(/^(\d+(?:\.(\d+))?)\s*(KB|MB|GB)$/i);
 if(!m)return false;
 const factor=1024**({KB:1,MB:2,GB:3}[m[3].toUpperCase()]);
 return Math.abs(bytes/factor-Number(m[1]))<=0.51/10**(m[2]?.length||0);
}
export function contentKind(bytes,url){
 if(bytes[0]===0x50&&bytes[1]===0x4b&&[3,5,7].includes(bytes[2])&&url.endsWith('.zip'))return 'zip';
 if(!url.endsWith('.txt'))return '';
 const raw=new TextDecoder().decode(bytes);
 if(/<\s*(?:!doctype|html|head|body|script|meta|title)\b/i.test(raw)||/^[\s\uFEFF]*</.test(raw))return '';
 for(const enc of ['utf-8','gb18030','utf-16le','utf-16be']){
  if(enc.startsWith('utf-16')&&!((bytes[0]===0xff&&bytes[1]===0xfe)||(bytes[0]===0xfe&&bytes[1]===0xff)))continue;
  try{const t=new TextDecoder(enc,{fatal:true}).decode(bytes,{stream:true});if(/[\p{Script=Han}]/u.test(t)&&!/[\u0000-\u0008]/.test(t))return 'txt';}catch{}
 }
 return '';
}
