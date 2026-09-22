import{loadOpenCV}from'../image/opencvPipeline';

export type SegmentationResult={mask:ImageData;confidence:number;method:'local-heuristic'|'model-ready';foregroundRatio:number};

function resizeSource(source:CanvasImageSource,size=512){const c=new OffscreenCanvas(size,size),ctx=c.getContext('2d',{willReadFrequently:true})!;ctx.drawImage(source,0,0,size,size);return ctx.getImageData(0,0,size,size)}
function clamp(v:number,a=0,b=255){return Math.max(a,Math.min(b,v))}

/**
 * Border-background / color-distance / center-prior foreground heuristic.
 * This is local geometry/image processing, not an ML segmentation model.
 */
export async function segmentSubject(source:CanvasImageSource):Promise<SegmentationResult>{
 const d=resizeSource(source),w=d.width,h=d.height,cv=await loadOpenCV();
 const src=cv.matFromImageData(d),lab=new cv.Mat(),blur=new cv.Mat(),mask=new cv.Mat(),clean=new cv.Mat(),labels=new cv.Mat(),stats=new cv.Mat(),centroids=new cv.Mat();
 try{
  cv.cvtColor(src,lab,cv.COLOR_RGBA2RGB);cv.cvtColor(lab,lab,cv.COLOR_RGB2Lab);cv.GaussianBlur(lab,blur,new cv.Size(5,5),0,0,cv.BORDER_DEFAULT);
  const data=blur.data,samples:number[][]=[];const step=Math.max(1,Math.floor(w/32));
  const add=(x:number,y:number)=>{const i=(y*w+x)*3;samples.push([data[i],data[i+1],data[i+2]])};
  for(let x=0;x<w;x+=step){add(x,0);add(x,h-1)}for(let y=0;y<h;y+=step){add(0,y);add(w-1,y)}
  const bg=samples.reduce((a,b)=>a.map((v,i)=>v+b[i]),[0,0,0]).map(v=>v/samples.length),out=new Uint8Array(w*h);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=(y*w+x)*3,dl=data[i]-bg[0],da=data[i+1]-bg[1],db=data[i+2]-bg[2];const color=Math.min(255,Math.hypot(dl,da,db)*2.4),center=1-Math.min(1,Math.hypot(x-w/2,y-h/2)/(Math.hypot(w/2,h/2)*.9));out[y*w+x]=clamp(color*.78+center*55)}
  const tmp=new cv.Mat(h,w,cv.CV_8UC1);tmp.data.set(out);cv.threshold(tmp,mask,0,255,cv.THRESH_BINARY+cv.THRESH_OTSU);
  const kernel=cv.getStructuringElement(cv.MORPH_ELLIPSE,new cv.Size(9,9));cv.morphologyEx(mask,clean,cv.MORPH_CLOSE,kernel);cv.morphologyEx(clean,clean,cv.MORPH_OPEN,kernel);
  const count=cv.connectedComponentsWithStats(clean,labels,stats,centroids,8,cv.CV_32S),selected=new Uint8Array(w*h);let best=-1,bestArea=0;
  for(let i=1;i<count;i++){const area=stats.intAt(i,cv.CC_STAT_AREA);if(area>bestArea){bestArea=area;best=i}}
  if(best>0)for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(labels.intAt(y,x)===best)selected[y*w+x]=255;
  const rgba=new Uint8ClampedArray(w*h*4);for(let i=0;i<w*h;i++){const v=selected[i];rgba[i*4]=v;rgba[i*4+1]=v;rgba[i*4+2]=v;rgba[i*4+3]=v}
  const foregroundRatio=bestArea/(w*h),confidence=Math.max(.15,Math.min(.9,.45+.45*Math.min(1,foregroundRatio/.35)));
  return{mask:new ImageData(rgba,w,h),confidence,method:'local-heuristic',foregroundRatio};
 }finally{src.delete();lab.delete();blur.delete();mask.delete();clean.delete();labels.delete();stats.delete();centroids.delete()}
}

export function applySubjectMask(image:ImageData,mask:ImageData){
 const out=new ImageData(new Uint8ClampedArray(image.data),image.width,image.height),sx=mask.width/image.width,sy=mask.height/image.height;
 for(let y=0;y<image.height;y++)for(let x=0;x<image.width;x++){const mi=(Math.min(mask.height-1,Math.floor(y*sy))*mask.width+Math.min(mask.width-1,Math.floor(x*sx)));out.data[(y*image.width+x)*4+3]=mask.data[mi*4+3]}
 return out;
}
