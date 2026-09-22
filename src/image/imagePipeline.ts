import type{Line,Point}from'../types';
import{opencvSugarMask,loadOpenCV}from'./opencvPipeline';

function thin(src:Uint8Array,w:number,h:number){
 const a=new Uint8Array(src),idx=(x:number,y:number)=>y*w+x;
 let changed=true;
 while(changed){changed=false;
  for(let pass=0;pass<2;pass++)for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){
   const i=idx(x,y);if(!a[i])continue;
   const p=[a[idx(x,y-1)]>0,a[idx(x+1,y-1)]>0,a[idx(x+1,y)]>0,a[idx(x+1,y+1)]>0,a[idx(x,y+1)]>0,a[idx(x-1,y+1)]>0,a[idx(x-1,y)]>0,a[idx(x-1,y-1)]>0],
   n=p.filter(Boolean).length,t=p.reduce((s,v,j)=>s+(!p[j-1<0?7:j-1]&&v?1:0),0),
   m=pass===0?(p[0]&&p[2]&&p[4])||(p[2]&&p[4]&&p[6]):(p[0]&&p[2]&&p[6])||(p[0]&&p[4]&&p[6]);
   if(n>=2&&n<=6&&t===1&&!m){a[i]=0;changed=true}
  }
 }
 return a;
}

function contours(mask:Uint8Array,w:number,h:number):Point[][]{
 const id=(x:number,y:number)=>y*w+x;
 const dirs=[[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1],[0,-1],[1,-1]];
 const neighbors=(x:number,y:number)=>{
  const out:number[]=[];
  for(let d=0;d<8;d++){const nx=x+dirs[d][0],ny=y+dirs[d][1];
   if(nx>=1&&nx<w-1&&ny>=1&&ny<h-1&&mask[id(nx,ny)])out.push(d);
  }
  return out;
 };
 const degree=new Uint8Array(w*h);
 for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++)if(mask[id(x,y)])degree[id(x,y)]=neighbors(x,y).length;
 const used=new Uint8Array(w*h),out:Point[][]=[];
 const mark=(x:number,y:number)=>used[id(x,y)]=1;
 const point=(x:number,y:number):Point=>({x:x/w-.5,y:y/h-.5});
 const trace=(sx:number,sy:number,sd:number)=>{
  const pts:Point[]=[point(sx,sy)];let px=sx,py=sy,x=sx+dirs[sd][0],y=sy+dirs[sd][1];
  mark(sx,sy);
  for(let guard=0;guard<w*h;guard++){
   if(x<1||x>=w-1||y<1||y>=h-1||!mask[id(x,y)])break;
   pts.push(point(x,y));mark(x,y);
   const ns=neighbors(x,y);
   if(degree[id(x,y)]!==2)break;
   let next=-1;
   for(const d of ns){const nx=x+dirs[d][0],ny=y+dirs[d][1];if(nx!==px||ny!==py){next=d;break}}
   if(next<0)break;
   px=x;py=y;x+=dirs[next][0];y+=dirs[next][1];
  }
  return pts;
 };
 for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){
  if(!mask[id(x,y)]||degree[id(x,y)]===2)continue;
  for(const d of neighbors(x,y)){
   const nx=x+dirs[d][0],ny=y+dirs[d][1];
   if(!used[id(nx,ny)]){const p=trace(x,y,d);if(p.length>=3)out.push(p)}
  }
 }
 for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){
  const root=id(x,y);if(!mask[root]||used[root]||degree[root]!==2)continue;
  const ns=neighbors(x,y);if(!ns.length)continue;
  const pts:Point[]=[point(x,y)];let px=x,py=y,cx=x+dirs[ns[0]][0],cy=y+dirs[ns[0]][1];mark(x,y);
  for(let guard=0;guard<w*h;guard++){
   if(cx===x&&cy===y)break;
   if(cx<1||cx>=w-1||cy<1||cy>=h-1||!mask[id(cx,cy)])break;
   pts.push(point(cx,cy));mark(cx,cy);
   const nexts=neighbors(cx,cy);let nd=-1;
   for(const d of nexts){const nx=cx+dirs[d][0],ny=cy+dirs[d][1];if(nx!==px||ny!==py){nd=d;break}}
   if(nd<0)break;
   px=cx;py=cy;cx+=dirs[nd][0];cy+=dirs[nd][1];
  }
  if(pts.length>=3)out.push(pts);
 }
 return out;
}

function rdp(points:Point[],eps:number):Point[]{
 if(points.length<3)return points;
 let max=0,idx=0,a=points[0],b=points.at(-1)!;
 for(let i=1;i<points.length-1;i++){const d=Math.abs((b.x-a.x)*(a.y-points[i].y)-(a.x-points[i].x)*(b.y-a.y))/(Math.hypot(b.x-a.x,b.y-a.y)||1);if(d>max){max=d;idx=i}}
 if(max>eps){const l=rdp(points.slice(0,idx+1),eps),r=rdp(points.slice(idx),eps);return l.slice(0,-1).concat(r)}
 return[a,b];
}

async function decode(file:File):Promise<ImageBitmap|HTMLImageElement>{
 if(file.size>50*1024*1024)throw new Error('IMAGE_TOO_LARGE');
 try{return await createImageBitmap(file,{imageOrientation:'from-image'});}catch{}
 if(typeof Image==='undefined')throw new Error('IMAGE_DECODE_FAILED');
 const u=URL.createObjectURL(file);
 try{const img=new Image();img.decoding='async';img.src=u;
  if(img.decode)await img.decode();else await new Promise<void>((r,j)=>{img.onload=()=>r();img.onerror=()=>j(new Error('IMAGE_DECODE_FAILED'))});
  if(!img.naturalWidth)throw new Error('IMAGE_DECODE_FAILED');return img;
 }finally{URL.revokeObjectURL(u)}
}

async function smartContours(file:File,detail:'low'|'balanced'|'high',onProgress?:(value:number)=>void):Promise<Line[]>{
 const cv=await loadOpenCV();onProgress?.(10);const result=await opencvSugarMask(file,detail);onProgress?.(35);
 const src=cv.matFromImageData(result.imageData),gray=new cv.Mat(),blur=new cv.Mat();
 try{
  cv.cvtColor(src,gray,cv.COLOR_RGBA2GRAY);
  const candidates:any[]=[];
  const sugar=cv.matFromImageData(result.imageData);
  candidates.push(sugar);
  cv.GaussianBlur(gray,blur,new cv.Size(detail==='high'?3:5,detail==='high'?3:5),0,0,cv.BORDER_DEFAULT);
  const edge=new cv.Mat();
  cv.Canny(blur,edge,detail==='low'?45:detail==='high'?35:40,detail==='low'?115:detail==='high'?105:110,3,false);
  const kernel=cv.getStructuringElement(cv.MORPH_ELLIPSE,new cv.Size(detail==='high'?2:3,detail==='low'?5:3));
  cv.morphologyEx(edge,edge,cv.MORPH_CLOSE,kernel);
  candidates.push(edge);
  const adaptive=new cv.Mat();
  cv.adaptiveThreshold(blur,adaptive,255,cv.ADAPTIVE_THRESH_GAUSSIAN_C,cv.THRESH_BINARY_INV,detail==='low'?31:25,detail==='high'?4:6);
  candidates.push(adaptive);
  const extract=(mask:any):Line[]=>{
   const cs=new cv.MatVector(),hier=new cv.Mat(),lines:Line[]=[];
   try{
    cv.findContours(mask,cs,hier,cv.RETR_LIST,cv.CHAIN_APPROX_NONE);
    const minPerimeter=Math.max(14,Math.min(result.width,result.height)*.025);
    for(let i=0;i<cs.size();i++){
     const c=cs.get(i),per=cv.arcLength(c,true),box=cv.boundingRect(c);
     if(per<minPerimeter||(box.width<4&&box.height<4)||(box.width<.97*result.width&&box.height<.97*result.height?false:false)){c.delete();continue}
     if(box.width>.97*result.width&&box.height>.97*result.height&&per<result.width*2.5){c.delete();continue}
     const approx=new cv.Mat(),eps=per*(detail==='low'?.012:detail==='high'?.004:.007);
     cv.approxPolyDP(c,approx,eps,true);
     const pts:Point[]=[];
     for(let j=0;j<approx.rows;j++){const x=approx.data32S[j*2],y=approx.data32S[j*2+1];pts.push({x:x/result.width-.5,y:y/result.height-.5})}
     if(pts.length>=3)lines.push({id:crypto.randomUUID(),points:pts,width:3.5});
     approx.delete();c.delete();
     if(lines.length>=300)break;
    }
   }finally{cs.delete();hier.delete()}
   return lines;
  };
  let best:Line[]=[];let bestScore=-Infinity;
  for(const candidate of candidates){
   const lines=extract(candidate);
   const score=lines.reduce((n,l)=>n+Math.min(80,Math.max(0,l.points.length)),0);
   if(lines.length>=1&&score>bestScore){best=lines;bestScore=score}
   if((candidate as any).delete)candidate.delete?.();
  }
  onProgress?.(90);
  return best;
 }finally{src.delete();gray.delete();blur.delete()}

}

function gradientMask(g:Uint8Array,w:number,h:number,multiplier:number){
 const mag=new Float32Array(w*h);let sum=0,count=0;
 for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){
  const i=y*w+x;
  const gx=-g[i-w-1]-2*g[i-1]-g[i+w-1]+g[i-w+1]+2*g[i+1]+g[i+w+1];
  const gy=-g[i-w-1]-2*g[i-w]-g[i-w+1]+g[i+w-1]+2*g[i+w]+g[i+w+1];
  const m=Math.hypot(gx,gy);mag[i]=m;sum+=m;count++;
 }
 const mean=sum/Math.max(1,count);let variance=0;
 for(let i=0;i<mag.length;i++){const d=mag[i]-mean;variance+=d*d}
 const std=Math.sqrt(variance/Math.max(1,mag.length)),threshold=Math.max(28,mean+std*.45*multiplier);
 const out=new Uint8Array(w*h);for(let i=0;i<mag.length;i++)if(mag[i]>=threshold)out[i]=1;return out;
}

export async function rasterToLines(file:File,detail:'low'|'balanced'|'high'='balanced',onProgress?:(value:number)=>void):Promise<Line[]>{
 try{
  const smart=await smartContours(file,detail,onProgress);
  if(smart.length>0)return smart;
 }catch(e){
  if(e instanceof Error&&e.message==='BATCH_CANCELLED')throw e;
  console.warn('Smart contour pipeline unavailable, using local fallback',e);
 }
 onProgress?.(10);const img=await decode(file);onProgress?.(30);const max=1000,scale=Math.min(1,max/Math.max(img.width,img.height)),
 w=Math.max(8,Math.round(img.width*scale)),h=Math.max(8,Math.round(img.height*scale)),
 c=typeof OffscreenCanvas!=='undefined'?new OffscreenCanvas(w,h):document.createElement('canvas');
 c.width=w;c.height=h;const ctx=c.getContext('2d',{willReadFrequently:true})!;ctx.drawImage(img,0,0,w,h);
 if(typeof ImageBitmap!=='undefined'&&img instanceof ImageBitmap)img.close();
 const d=ctx.getImageData(0,0,w,h),g=new Uint8Array(w*h);
 for(let i=0;i<w*h;i++)g[i]=Math.round(.299*d.data[i*4]+.587*d.data[i*4+1]+.114*d.data[i*4+2]);
 const collect=(mask:Uint8Array,target:Line[])=>{const found=contours(thin(mask,w,h),w,h);for(const p of found){const q=rdp(p,detail==='low'?.010:detail==='high'?.003:.006);if(q.length>=3)target.push({id:crypto.randomUUID(),points:q,width:3.5});}};
 const fallbackLines:Line[]=[];
 for(const factor of detail==='low'?[.8,1,1.25]:detail==='high'?[.9,1,1.15]:[.85,1,1.2]){
  collect(gradientMask(g,w,h,factor),fallbackLines);
  if(fallbackLines.length>=4)break;
 }
 if(fallbackLines.length===0){
  const t=detail==='low'?145:detail==='high'?185:165,b=new Uint8Array(w*h);
  for(let i=0;i<g.length;i++)b[i]=g[i]<t?1:0;
  collect(b,fallbackLines);
 }
 onProgress?.(100);return fallbackLines.slice(0,400);
}