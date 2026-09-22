import{rasterToLines}from'../image/imagePipeline';

const cancelled=new Set<string>();

self.onmessage=async(e)=>{
 const{type,id,file,detail}=e.data;
 if(type==='cancel'){if(id)cancelled.add(id);return}
 if(!id||cancelled.has(id))return;
 try{
  const check=()=>{if(cancelled.has(id))throw new Error('BATCH_CANCELLED')};
  check();
  const lines=await rasterToLines(file,detail,(progress)=>{
   check();
   self.postMessage({id,type:'progress',progress});
  });
  check();
  cancelled.delete(id);
  self.postMessage({id,ok:true,lines});
 }catch(error){
  cancelled.delete(id);
  self.postMessage({id,ok:false,error:error instanceof Error?error.message:String(error)});
 }
};