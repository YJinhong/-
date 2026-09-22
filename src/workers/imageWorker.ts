import{rasterToLines}from'../image/imagePipeline';
self.onmessage=async(e)=>{
 const{id,file,detail}=e.data;
 try{
  const lines=await rasterToLines(file,detail,(progress)=>self.postMessage({id,type:'progress',progress}));
  self.postMessage({id,ok:true,lines});
 }catch(error){
  self.postMessage({id,ok:false,error:error instanceof Error?error.message:String(error)});
 }
};