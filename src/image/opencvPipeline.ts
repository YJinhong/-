export type OpenCVModule=any;
let cvPromise:Promise<OpenCVModule>|null=null;
export function loadOpenCV():Promise<OpenCVModule>{if(cvPromise)return cvPromise;cvPromise=import('@techstark/opencv-js').then((m:any)=>{const cv=m.default??m;if(typeof cv==='function')return new Promise(resolve=>{cv.onRuntimeInitialized=()=>resolve(cv)});if(cv?.onRuntimeInitialized)return new Promise(resolve=>{cv.onRuntimeInitialized=()=>resolve(cv)});return cv});return cvPromise}

function detailParams(detail:'low'|'balanced'|'high'){return detail==='low'?{blur:7,block:31,c:7,close:7,open:3}:detail==='high'?{blur:3,block:19,c:4,close:3,open:2}:{blur:5,block:25,c:6,close:5,open:3}}
function imageToMat(file:File,cv:OpenCVModule){return createImageBitmap(file).then(img=>{const max=1200,scale=Math.min(1,max/Math.max(img.width,img.height)),w=Math.max(32,Math.round(img.width*scale)),h=Math.max(32,Math.round(img.height*scale)),canvas=new OffscreenCanvas(w,h),ctx=canvas.getContext('2d',{willReadFrequently:true})!;ctx.drawImage(img,0,0,w,h);img.close?.();return{cvMat:cv.matFromImageData(ctx.getImageData(0,0,w,h)),width:w,height:h}})}
function borderBackgroundLab(lab:any,w:number,h:number,cv:OpenCVModule){const data=lab.data,s:number[][]=[],step=Math.max(1,Math.floor(w/32));const add=(x:number,y:number)=>{const i=(y*w+x)*3;s.push([data[i],data[i+1],data[i+2]])};for(let x=0;x<w;x+=step){add(x,0);add(x,h-1)}for(let y=0;y<h;y+=step){add(0,y);add(w-1,y)}const sum=s.reduce((a,b)=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]],[0,0,0]);return sum.map(v=>v/s.length)}
export async function opencvThreshold(gray:Uint8Array,width:number,height:number,threshold=165){const cv=await loadOpenCV(),src=new cv.Mat(height,width,cv.CV_8UC1),dst=new cv.Mat();src.data.set(gray);cv.threshold(src,dst,threshold,255,cv.THRESH_BINARY_INV);const out=new Uint8Array(dst.data);const copy=new Uint8Array(out);src.delete();dst.delete();return copy}

export async function opencvSugarMask(file:File,detail:'low'|'balanced'|'high'='balanced'){
 const cv=await loadOpenCV(),{cvMat:src,width:w,height:h}=await imageToMat(file,cv),rgb=new cv.Mat(),lab=new cv.Mat(),blur=new cv.Mat(),foreground=new cv.Mat(),edges=new cv.Mat(),boundary=new cv.Mat(),combined=new cv.Mat(),score=new cv.Mat(h,w,cv.CV_8UC1);
 try{
  cv.cvtColor(src,rgb,cv.COLOR_RGBA2RGB);cv.cvtColor(rgb,lab,cv.COLOR_RGB2Lab);cv.GaussianBlur(lab,blur,new cv.Size(5,5),0,0,cv.BORDER_DEFAULT);
  const bg=borderBackgroundLab(blur,w,h,cv),data=blur.data,params=detailParams(detail);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=(y*w+x)*3,cd=Math.min(255,Math.hypot(data[i]-bg[0],data[i+1]-bg[1],data[i+2]-bg[2])*2.4),center=1-Math.min(1,Math.hypot(x-w/2,y-h/2)/(Math.hypot(w/2,h/2)*.9));score.data[y*w+x]=Math.min(255,cd*.78+center*55)}
  cv.threshold(score,foreground,0,255,cv.THRESH_BINARY+cv.THRESH_OTSU);
  const k=cv.getStructuringElement(cv.MORPH_ELLIPSE,new cv.Size(params.close,params.close));cv.morphologyEx(foreground,foreground,cv.MORPH_CLOSE,k);cv.morphologyEx(foreground,foreground,cv.MORPH_OPEN,k);cv.morphologyEx(foreground,boundary,cv.MORPH_GRADIENT,k);k.delete();
  cv.cvtColor(src,edges,cv.COLOR_RGBA2GRAY);cv.GaussianBlur(edges,edges,new cv.Size(params.blur,params.blur),0);
  cv.Canny(edges,edges,detail==='low'?75:55,detail==='high'?155:135,3,false);
  cv.bitwise_and(edges,foreground,combined);cv.bitwise_or(combined,boundary,combined);
  const out=new Uint8ClampedArray(w*h*4),fd=foreground.data as Uint8Array,ed=combined.data as Uint8Array;for(let i=0;i<w*h;i++){const on=ed[i]>0?0:255;out[i*4]=on;out[i*4+1]=on;out[i*4+2]=on;out[i*4+3]=255}
  return{imageData:new ImageData(out,w,h),width:w,height:h,foregroundRatio:Array.from(fd).reduce((n,v)=>n+(v>0?1:0),0)/(w*h)}
 }finally{src.delete();rgb.delete();lab.delete();blur.delete();foreground.delete();edges.delete();boundary.delete();combined.delete();score.delete()}
}

export async function opencvSugarMaskFile(file:File,detail:'low'|'balanced'|'high'='balanced'){
 const result=await opencvSugarMask(file,detail),canvas=new OffscreenCanvas(result.width,result.height),ctx=canvas.getContext('2d')!;ctx.putImageData(result.imageData,0,0);const blob=await canvas.convertToBlob({type:'image/png'});return new File([blob],file.name.replace(/\.[^.]+$/,'')+'-sugar.png',{type:'image/png'})
}
