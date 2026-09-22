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
 // Trace every edge incident to a junction/end point. This preserves branches
 // instead of greedily consuming a junction and losing the remaining arms.
 for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){
  if(!mask[id(x,y)]||degree[id(x,y)]===2)continue;
  for(const d of neighbors(x,y)){
   const nx=x+dirs[d][0],ny=y+dirs[d][1];
   if(!used[id(nx,ny)]){
    const p=trace(x,y,d);if(p.length>=3)out.push(p);
   }
  }
 }
 // Remaining degree-2 pixels are isolated loops. Trace each loop once.
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
 const cv=await loadOpenCV();onProgress?.(15);const result=await opencvSugarMask(file,detail);onProgress?.(45);
 const src=cv.matFromImageData(result.imageData),gray=new cv.Mat(),bin=new cv.Mat(),cs=new cv.MatVector(),hier=new cv.Mat(),lines:Line[]=[];
 try{
  cv.cvtColor(src,gray,cv.COLOR_RGBA2GRAY);
  cv.threshold(gray,bin,250,255,cv.THRESH_BINARY_INV);
  cv.findContours(bin,cs,hier,cv.RETR_LIST,cv.CHAIN_APPROX_NONE);onProgress?.(60);
  const minArea=Math.max(4,result.width*result.height*(detail==='low'?.000025:detail==='high'?.00001:.000018));
  for(let i=0;i<cs.size();i++){
   const c=cs.get(i),area=Math.abs(cv.contourArea(c)),per=cv.arcLength(c,true);
   if(per<18||(area<minArea&&per<72)){c.delete();continue}
   const approx=new cv.Mat(),eps=per*(detail==='low'?.012:detail==='high'?.004:.007);
   cv.approxPolyDP(c,approx,eps,true);
   const pts:Point[]=[];
   for(let j=0;j<approx.rows;j++){const x=approx.data32S[j*2],y=approx.data32S[j*2+1];pts.push({x:x/result.width-.5,y:y/result.height-.5})}
   if(pts.length>=3){
    lines.push({id:crypto.randomUUID(),points:pts,width:3.5});
   }
   approx.delete();c.delete();
  }
  onProgress?.(90);return lines;
 }finally{src.delete();gray.delete();bin.delete();cs.delete();hier.delete()}
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
 const t=detail==='low'?145:detail==='high'?185:165,b=new Uint8Array(w*h);
 for(let i=0;i<g.length;i++)b[i]=g[i]<t?1:0;
 const collect=(mask:Uint8Array)=>{const found=contours(thin(mask,w,h),w,h);for(const p of found){const q=rdp(p,detail==='low'?.010:detail==='high'?.003:.006);if(q.length>=3)lines.push({id:crypto.randomUUID(),points:q,width:3.5})}};
 collect(b);
 if(lines.length===0){
  const thresholds=detail==='low'?[115,145,175]:detail==='high'?[145,175,205]:[125,155,185];
  for(const threshold of thresholds){const alt=new Uint8Array(w*h);for(let i=0;i<g.length;i++)alt[i]=g[i]<threshold?1:0;collect(alt);if(lines.length>=2)break}
 }
 onProgress?.(100);return lines;
}