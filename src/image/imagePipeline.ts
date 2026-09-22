import type{Line,Point}from'../types';
import{potraceVectorize}from'./potraceVectorizer';
import{opencvSugarMaskFile}from'./opencvPipeline';

function thin(src:Uint8Array,w:number,h:number){
 const a=new Uint8Array(src);let changed=true;const idx=(x:number,y:number)=>y*w+x;
 while(changed){changed=false;for(let pass=0;pass<2;pass++)for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){
  const i=idx(x,y);if(!a[i])continue;
  const p=[a[idx(x,y-1)]>0,a[idx(x+1,y-1)]>0,a[idx(x+1,y)]>0,a[idx(x+1,y+1)]>0,a[idx(x,y+1)]>0,a[idx(x-1,y+1)]>0,a[idx(x-1,y)]>0,a[idx(x-1,y-1)]>0],
  n=p.filter(Boolean).length,t=p.reduce((s,v,j)=>s+(!p[j-1<0?7:j-1]&&v?1:0),0),
  m=pass===0?(p[0]&&p[2]&&p[4])||(p[2]&&p[4]&&p[6]):(p[0]&&p[2]&&p[6])||(p[0]&&p[4]&&p[6]);
  if(n>=2&&n<=6&&t===1&&!m){a[i]=0;changed=true}
 }}return a
}

function trace(mask:Uint8Array,w:number,h:number):Point[]{
 let start:Point|undefined;
 for(let y=1;y<h-1&&!start;y++)for(let x=1;x<w-1;x++)if(mask[y*w+x]){start={x,y};break}
 if(!start)return[];
 const out:Point[]=[];let cur={...start},prev={x:start.x-1,y:start.y};const seen=new Set<string>();
 for(let k=0;k<w*h;k++){
  out.push({x:cur.x/w-.5,y:cur.y/h-.5});seen.add(cur.x+','+cur.y);
  let next:{x:number;y:number}|undefined,best=99;
  for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
   if(!dx&&!dy)continue;const q={x:cur.x+dx,y:cur.y+dy};
   if(q.x<1||q.x>=w-1||q.y<1||q.y>=h-1||!mask[q.y*w+q.x]||seen.has(q.x+','+q.y))continue;
   const d=(q.x-prev.x)**2+(q.y-prev.y)**2;if(d<best){best=d;next=q}
  }
  if(!next)break;prev=cur;cur=next
 }
 return out
}

function rdp(points:Point[],eps:number):Point[]{
 if(points.length<3)return points;let max=0,idx=0,a=points[0],b=points.at(-1)!;
 for(let i=1;i<points.length-1;i++){const d=Math.abs((b.x-a.x)*(a.y-points[i].y)-(a.x-points[i].x)*(b.y-a.y))/(Math.hypot(b.x-a.x,b.y-a.y)||1);if(d>max){max=d;idx=i}}
 if(max>eps){const l=rdp(points.slice(0,idx+1),eps),r=rdp(points.slice(idx),eps);return l.slice(0,-1).concat(r)}
 return[a,b]
}

async function decodeFallback(file:File):Promise<ImageBitmap|HTMLImageElement>{
 if(file.size>50*1024*1024)throw new Error('IMAGE_TOO_LARGE');
 try{
  return await createImageBitmap(file,{imageOrientation:'from-image',premultiplyAlpha:'default',colorSpaceConversion:'default'});
 }catch{}
 if(typeof Image==='undefined')throw new Error('IMAGE_DECODE_FAILED');
 const url=URL.createObjectURL(file);
 try{
  const img=new Image();
  img.decoding='async';
  img.src=url;
  if(img.decode)await img.decode();else await new Promise<void>((resolve,reject)=>{img.onload=()=>resolve();img.onerror=()=>reject(new Error('IMAGE_DECODE_FAILED'))});
  if(!img.naturalWidth||!img.naturalHeight)throw new Error('IMAGE_DECODE_FAILED');
  return img;
 }catch{throw new Error('IMAGE_DECODE_FAILED')}
 finally{URL.revokeObjectURL(url)}
}

async function localTrace(file:File,detail:'low'|'balanced'|'high'):Promise<Line[]>{
 const img=await decodeFallback(file),max=1000,scale=Math.min(1,max/Math.max(img.width,img.height)),
 w=Math.max(8,Math.round(img.width*scale)),h=Math.max(8,Math.round(img.height*scale)),
 c=typeof OffscreenCanvas!=='undefined'?new OffscreenCanvas(w,h):document.createElement('canvas');
 c.width=w;c.height=h;
 const ctx=c.getContext('2d',{willReadFrequently:true})!;ctx.drawImage(img,0,0,w,h);
 if(img instanceof ImageBitmap)img.close();
 const d=ctx.getImageData(0,0,w,h),gray=new Uint8Array(w*h);
 for(let i=0;i<w*h;i++){const a=d.data[i*4+3]/255;gray[i]=Math.round((.299*d.data[i*4]+.587*d.data[i*4+1]+.114*d.data[i*4+2])*a+255*(1-a))}
 const t=detail==='low'?145:detail==='high'?185:165,binary=new Uint8Array(w*h);
 for(let i=0;i<gray.length;i++)binary[i]=gray[i]<t?1:0;
 const pts=trace(thin(binary,w,h),w,h),simp=rdp(pts,detail==='low'?.012:detail==='high'?.004:.008);
 return simp.length<2?[]:[{id:crypto.randomUUID(),points:simp,width:3.5}]
}

export async function rasterToLines(file:File,detail:'low'|'balanced'|'high'='balanced'):Promise<Line[]>{
 let local:Line[]=[];
 try{local=await localTrace(file,detail);if(local.length)return local}catch{}
 try{const preprocessed=await opencvSugarMaskFile(file,detail);const traced=await potraceVectorize(preprocessed,detail);if(traced.length)return traced}catch{}
 try{const traced=await potraceVectorize(file,detail);if(traced.length)return traced}catch{}
 throw new Error('NO_LINES_DETECTED')
}
