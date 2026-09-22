import type{Line,Point}from'../types';
import{potraceVectorize}from'./potraceVectorizer';
import{opencvSugarMaskFile}from'./opencvPipeline';

const dist=(a:Point,b:Point)=>Math.hypot(a.x-b.x,a.y-b.y);
const angle=(a:Point,b:Point)=>Math.atan2(b.y-a.y,b.x-a.x);
const angleDiff=(a:number,b:number)=>{let d=Math.abs(a-b)%(Math.PI*2);return d>Math.PI?Math.PI*2-d:d};

function thin(src:Uint8Array,w:number,h:number){
 const a=new Uint8Array(src);let changed=true;const idx=(x:number,y:number)=>y*w+x;
 while(changed){changed=false;
  for(let pass=0;pass<2;pass++)for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){
   const i=idx(x,y);if(!a[i])continue;
   const q=[a[idx(x,y-1)]>0,a[idx(x+1,y-1)]>0,a[idx(x+1,y)]>0,a[idx(x+1,y+1)]>0,a[idx(x,y+1)]>0,a[idx(x-1,y+1)]>0,a[idx(x-1,y)]>0,a[idx(x-1,y-1)]>0];
   const n=q.filter(Boolean).length,t=q.reduce((s,v,j)=>s+(!q[j-1<0?7:j-1]&&v?1:0),0);
   const m=pass===0?(q[0]&&q[2]&&q[4])||(q[2]&&q[4]&&q[6]):(q[0]&&q[2]&&q[6])||(q[0]&&q[4]&&q[6]);
   if(n>=2&&n<=6&&t===1&&!m){a[i]=0;changed=true}
  }
 }return a
}

function components(mask:Uint8Array,w:number,h:number,minSize:number){
 const seen=new Uint8Array(mask.length),out:Point[][]=[];
 for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){const start=y*w+x;if(!mask[start]||seen[start])continue;
  const q=[{x,y}],pts:Point[]=[];seen[start]=1;
  while(q.length){const p=q.pop()!;pts.push(p);
   for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){if(!dx&&!dy)continue;const nx=p.x+dx,ny=p.y+dy;
    if(nx<1||nx>=w-1||ny<1||ny>=h-1)continue;const ni=ny*w+nx;
    if(mask[ni]&&!seen[ni]){seen[ni]=1;q.push({x:nx,y:ny})}
   }
  }
  if(pts.length>=minSize)out.push(pts)
 }return out
}

function traceComponentPaths(mask:Uint8Array,w:number,h:number,component:Point[]):Point[][]{
 const allowed=new Set(component.map(p=>p.x+','+p.y));
 const neighbors=(p:Point)=>{const out:Point[]=[];for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)if(dx||dy){const q={x:p.x+dx,y:p.y+dy};if(allowed.has(q.x+','+q.y))out.push(q)}return out};
 const deg=new Map<string,number>();for(const p of component)deg.set(p.x+','+p.y,neighbors(p).length);
 const edgeKey=(a:Point,b:Point)=>{const A=a.x+','+a.y,B=b.x+','+b.y;return A<B?A+'|'+B:B+'|'+A};
 const used=new Set<string>(),paths:Point[][]=[];
 const starts=component.filter(p=>(deg.get(p.x+','+p.y)??0)!==2);
 const walk=(start:Point,next:Point)=>{
  const path=[{...start}],prev={...start},cur={...next};used.add(edgeKey(prev,cur));path.push({...cur});
  while((deg.get(cur.x+','+cur.y)??0)===2){
   const ns=neighbors(cur),n=dist(ns[0],prev)>0?ns[0]:ns[1];const k=edgeKey(cur,n);if(used.has(k))break;
   used.add(k);prev={...cur};cur={...n};path.push({...cur});
  }
  return path.map(p=>({x:p.x/w-.5,y:p.y/h-.5}))
 };
 for(const s of starts)for(const n of neighbors(s)){if(!used.has(edgeKey(s,n))){const p=walk(s,n);if(p.length>=2)paths.push(p)}}
 if(!paths.length){
  const s=component[0],ns=neighbors(s);if(ns.length){const p=walk(s,ns[0]);if(p.length>=2)paths.push(p)}
 }
 return paths
}
function rdp(points:Point[],eps:number):Point[]{
 if(points.length<3)return points;let max=0,idx=0,a=points[0],b=points.at(-1)!;
 for(let i=1;i<points.length-1;i++){const d=Math.abs((b.x-a.x)*(a.y-points[i].y)-(a.x-points[i].x)*(b.y-a.y))/(Math.hypot(b.x-a.x,b.y-a.y)||1);if(d>max){max=d;idx=i}}
 if(max>eps){const l=rdp(points.slice(0,idx+1),eps),r=rdp(points.slice(idx),eps);return l.slice(0,-1).concat(r)}return[a,b]
}

function lineLength(l:Line){return l.points.slice(1).reduce((s,p,i)=>s+dist(l.points[i],p),0)}
function mergeNearby(lines:Line[],gap:number):Line[]{
 const a=lines.map(l=>({...l,points:[...l.points]}));let changed=true;
 while(changed){changed=false;
  outer:for(let i=0;i<a.length;i++)for(let j=i+1;j<a.length;j++){
   const A=a[i],B=a[j],ae=A.points.at(-1)!,as=A.points[0],be=B.points.at(-1)!,bs=B.points[0];
   const pairs:[[Point,Point],[Point,Point]]=[ [ae,bs],[ae,be],[as,bs],[as,be] ];
   let best=Infinity,pa=0;
   pairs.forEach((p,k)=>{const z=dist(p[0],p[1]);if(z<best){best=z;pa=k}});
   if(best>gap)continue;
   let aa=A.points,bb=B.points;
   if(pa===1||pa===3)bb=[...bb].reverse();
   if(pa>=2)aa=[...aa].reverse();
   const ta=angle(aa.at(-2)??aa[0],aa.at(-1)!),tb=angle(bb[0],bb[1]??bb[0]);
   if(angleDiff(ta,tb)>Math.PI/3)continue;
   a[i]={...A,points:aa.concat(bb.slice(1))};a.splice(j,1);changed=true;break outer;
  }
 }
 return a
}

function dedupe(lines:Line[]):Line[]{
 const out:Line[]=[];
 for(const l of lines){
  const len=lineLength(l);if(len<.012)continue;
  const s=l.points[0],e=l.points.at(-1)!;
  const duplicate=out.some(o=>{
   if(Math.abs(lineLength(o)-len)>Math.max(.02,len*.35))return false;
   const os=o.points[0],oe=o.points.at(-1)!;
   return (dist(s,os)<.012&&dist(e,oe)<.012)||(dist(s,oe)<.012&&dist(e,os)<.012)
  });
  if(!duplicate)out.push(l)
 }
 return out
}

async function localTrace(file:File,detail:'low'|'balanced'|'high'):Promise<Line[]>{
 const img=await decodeFallback(file),max=900,scale=Math.min(1,max/Math.max(img.width,img.height)),w=Math.max(48,Math.round(img.width*scale)),h=Math.max(48,Math.round(img.height*scale));
 const c=new OffscreenCanvas(w,h),ctx=c.getContext('2d',{willReadFrequently:true})!;ctx.drawImage(img,0,0,w,h);if(img instanceof ImageBitmap)img.close();
 const d=ctx.getImageData(0,0,w,h),gray=new Uint8Array(w*h);
 for(let i=0;i<w*h;i++){const a=d.data[i*4+3]/255;gray[i]=Math.round((.299*d.data[i*4]+.587*d.data[i*4+1]+.114*d.data[i*4+2])*a+255*(1-a))}
 const t=detail==='low'?150:detail==='high'?185:168,binary=new Uint8Array(w*h);
 for(let i=0;i<gray.length;i++)binary[i]=gray[i]<t?1:0;
 const skeleton=thin(binary,w,h);
 const minSize=detail==='low'?Math.max(18,Math.round(w*h*.000015)):detail==='high'?Math.max(8,Math.round(w*h*.000006)):Math.max(12,Math.round(w*h*.00001));
 const parts=components(skeleton,w,h,minSize),eps=detail==='low'?.014:detail==='high'?.006:.009,lines:Line[]=[];
 for(const part of parts)for(const pts of traceComponentPaths(skeleton,w,h,part)){
  const simp=rdp(pts,eps);
  if(simp.length>=2)lines.push({id:crypto.randomUUID(),points:simp,width:3.5})
 }
 return dedupe(mergeNearby(lines,detail==='low'?.022:.018)).sort((a,b)=>lineLength(b)-lineLength(a))
}

export async function rasterToLines(file:File,detail:'low'|'balanced'|'high'='balanced'):Promise<Line[]>{
 try{const local=await localTrace(file,detail);if(local.length>=1)return local}catch{}
 try{const preprocessed=await opencvSugarMaskFile(file,detail);const traced=await potraceVectorize(preprocessed,detail);if(traced.length)return traced}catch{}
 try{const traced=await potraceVectorize(file,detail);if(traced.length)return traced}catch{}
 throw new Error('NO_LINES_DETECTED')
}
async function decodeFallback(file:File):Promise<ImageBitmap|HTMLImageElement>{
 if(file.size>50*1024*1024)throw new Error('IMAGE_TOO_LARGE');try{return await createImageBitmap(file)}catch{}
 const url=URL.createObjectURL(file);try{const img=new Image();img.decoding='async';img.src=url;await img.decode();return img}catch{throw new Error('IMAGE_DECODE_FAILED')}finally{URL.revokeObjectURL(url)}
}