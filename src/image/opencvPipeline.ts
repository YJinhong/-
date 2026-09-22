export type OpenCVModule=any;
let cvPromise:Promise<OpenCVModule>|null=null;
export function loadOpenCV():Promise<OpenCVModule>{
 if(cvPromise)return cvPromise;
 cvPromise=import('@techstark/opencv-js').then((m:any)=>{const cv=m.default??m;if(typeof cv==='function')return new Promise(resolve=>{cv.onRuntimeInitialized=()=>resolve(cv)});if(cv?.onRuntimeInitialized)return new Promise(resolve=>{cv.onRuntimeInitialized=()=>resolve(cv)});return cv});
 return cvPromise;
}
export async function opencvThreshold(gray:Uint8Array,width:number,height:number,threshold=165){const cv=await loadOpenCV();const src=new cv.Mat(height,width,cv.CV_8UC1);src.data.set(gray);const dst=new cv.Mat();cv.threshold(src,dst,threshold,255,cv.THRESH_BINARY_INV);const data=new Uint8Array(dst.data);const out=new Uint8Array(data.length);out.set(data);src.delete();dst.delete();return out}

function detailParams(detail:'low'|'balanced'|'high'){
 return detail==='low'?{blur:7,block:31,c:7,close:5,open:3}:detail==='high'?{blur:3,block:19,c:4,close:3,open:2}:{blur:5,block:25,c:6,close:5,open:3};
}

/** Browser-local photo preprocessing. This is intentionally heuristic, not a material/ML segmentation model. */
export async function opencvSugarMask(file:File,detail:'low'|'balanced'|'high'='balanced'){
 const cv=await loadOpenCV();
 const img=await createImageBitmap(file),max=1200,scale=Math.min(1,max/Math.max(img.width,img.height)),w=Math.max(32,Math.round(img.width*scale)),h=Math.max(32,Math.round(img.height*scale));
 const canvas=new OffscreenCanvas(w,h),ctx=canvas.getContext('2d',{willReadFrequently:true})!;ctx.drawImage(img,0,0,w,h);
 const rgba=ctx.getImageData(0,0,w,h);
 const src=cv.matFromImageData(rgba),gray=new cv.Mat(),blur=new cv.Mat(),binary=new cv.Mat(),clean=new cv.Mat(),edges=new cv.Mat();
 try{
  cv.cvtColor(src,gray,cv.COLOR_RGBA2GRAY);
  const p=detailParams(detail);
  cv.GaussianBlur(gray,blur,new cv.Size(p.blur,p.blur),0,0,cv.BORDER_DEFAULT);
  cv.adaptiveThreshold(blur,binary,255,cv.ADAPTIVE_THRESH_GAUSSIAN_C,cv.THRESH_BINARY_INV,p.block,p.c);
  const closeKernel=cv.getStructuringElement(cv.MORPH_ELLIPSE,new cv.Size(p.close,p.close));
  const openKernel=cv.getStructuringElement(cv.MORPH_ELLIPSE,new cv.Size(p.open,p.open));
  cv.morphologyEx(binary,clean,cv.MORPH_CLOSE,closeKernel);
  cv.morphologyEx(clean,clean,cv.MORPH_OPEN,openKernel);
  cv.Canny(gray,edges,detail==='low'?70:50,detail==='high'?150:130,3,false);
  cv.bitwise_or(clean,edges,clean);
  closeKernel.delete();openKernel.delete();
  const out=new Uint8ClampedArray(w*h*4);const data=clean.data;
  for(let i=0;i<w*h;i++){const on=data[i]>0?0:255;out[i*4]=on;out[i*4+1]=on;out[i*4+2]=on;out[i*4+3]=255;}
  return{imageData:new ImageData(out,w,h),width:w,height:h};
 }finally{src.delete();gray.delete();blur.delete();binary.delete();clean.delete();edges.delete()}
}

export async function opencvSugarMaskFile(file:File,detail:'low'|'balanced'|'high'='balanced'){
 const result=await opencvSugarMask(file,detail),canvas=new OffscreenCanvas(result.width,result.height),ctx=canvas.getContext('2d')!;ctx.putImageData(result.imageData,0,0);
 const blob=await canvas.convertToBlob({type:'image/png'});
 return new File([blob],file.name.replace(/\\.[^.]+$/,'')+'-sugar.png',{type:'image/png'});
}
