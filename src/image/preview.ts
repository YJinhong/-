export async function createPreviewData(file:File,maxDimension=1600):Promise<{data:string;width:number;height:number}>{
 let source:ImageBitmap|HTMLImageElement|null=null;
 let objectUrl:string|undefined;
 try{
  try{
   source=await createImageBitmap(file,{imageOrientation:'from-image'});
  }catch{
   if(typeof Image==='undefined')throw new Error('IMAGE_PREVIEW_FAILED');
   objectUrl=URL.createObjectURL(file);
   const img=new Image();
   img.decoding='async';
   img.src=objectUrl;
   if(img.decode)await img.decode();
   else await new Promise<void>((resolve,reject)=>{img.onload=()=>resolve();img.onerror=()=>reject(new Error('IMAGE_PREVIEW_FAILED'))});
   if(!img.naturalWidth||!img.naturalHeight)throw new Error('IMAGE_PREVIEW_FAILED');
   source=img;
  }
  const sw=source instanceof ImageBitmap?source.width:source.naturalWidth;
  const sh=source instanceof ImageBitmap?source.height:source.naturalHeight;
  const scale=Math.min(1,maxDimension/Math.max(sw,sh));
  const width=Math.max(1,Math.round(sw*scale)),height=Math.max(1,Math.round(sh*scale));
  const canvas=document.createElement('canvas');
  canvas.width=width;canvas.height=height;
  const ctx=canvas.getContext('2d',{alpha:true});
  if(!ctx)throw new Error('IMAGE_PREVIEW_FAILED');
  ctx.drawImage(source,0,0,width,height);
  const isPng=/\.png$/i.test(file.name)||file.type==='image/png';
  const data=canvas.toDataURL(isPng?'image/png':'image/jpeg',isPng?undefined:.86);
  return{data,width:sw,height:sh};
 }finally{
  if(source instanceof ImageBitmap)source.close();
  if(objectUrl)URL.revokeObjectURL(objectUrl);
 }
}