import type{BatchJob,Line}from'../types';
import{rasterToLines}from'../image/imagePipeline';
type Result={lines:Line[]};

export class BatchProcessor{
 private worker:Worker;private cancelled=false;private paused=false;private activeId:string|null=null;private activeReject:((reason?:unknown)=>void)|null=null;
 constructor(){this.worker=new Worker(new URL('../workers/imageWorker.ts',import.meta.url),{type:'module'})}

 process(file:File,detail:'low'|'balanced'|'high',onProgress?:(value:number)=>void){
  return new Promise<Line[]>((resolve,reject)=>{
   const id=crypto.randomUUID();this.activeId=id;this.activeReject=reject;
   const done=(e:MessageEvent)=>{
    if(e.data.id!==id)return;
    if(e.data.type==='progress'){onProgress?.(Math.max(5,Math.min(99,Number(e.data.progress)||5)));return}
    this.worker.removeEventListener('message',done);this.activeId=null;this.activeReject=null;
    if(e.data.ok){resolve(e.data.lines);return}
    const error=String(e.data.error??'UNKNOWN');
    if(error==='BATCH_CANCELLED'){reject(new Error('Batch processing cancelled'));return}
    if(error==='IMAGE_DECODE_FAILED'||error==='OFFSCREEN_CANVAS_UNAVAILABLE'){
      rasterToLines(file,detail).then(resolve,reject);
    }else reject(new Error(error));
   };
   this.worker.addEventListener('message',done);this.worker.postMessage({id,file,detail})
  })
 }

 cancel(){this.cancelled=true;this.paused=false;const id=this.activeId;if(id)this.worker.postMessage({type:'cancel',id});this.activeReject?.(new Error('Batch processing cancelled'));this.activeReject=null;this.activeId=null;}
 pause(){this.paused=true}
 resume(){this.paused=false}

 async runWithResults(files:File[],detail:'low'|'balanced'|'high',onProgress:(jobs:BatchJob[])=>void){
  this.cancelled=false;
  const jobs:BatchJob[]=files.map((f,i)=>({id:crypto.randomUUID(),fileName:f.name,size:f.size,status:'queued',progress:0,sourceIndex:i}));
  const results:(Result|undefined)[]=[];onProgress([...jobs]);
  for(let i=0;i<files.length;i++){
   while(this.paused&&!this.cancelled)await new Promise(r=>setTimeout(r,100));
   if(this.cancelled){for(let k=i;k<jobs.length;k++)jobs[k].status='cancelled';onProgress([...jobs]);break}
   jobs[i].status='processing';jobs[i].progress=5;onProgress([...jobs]);
   try{
    const lines=await this.process(files[i]!,detail,p=>{jobs[i].progress=p;onProgress([...jobs])});results[i]={lines};jobs[i].lines=lines;jobs[i].status='done';jobs[i].progress=100
   }catch(e){
    if(this.cancelled){jobs[i].status='cancelled';jobs[i].error=undefined}
    else{jobs[i].status='error';jobs[i].error=e instanceof Error?e.message:String(e);jobs[i].diagnostic=jobs[i].error}
   }
   onProgress([...jobs])
  }
  return results
 }

 async run(files:File[],detail:'low'|'balanced'|'high',onProgress:(jobs:BatchJob[])=>void){await this.runWithResults(files,detail,onProgress);return}
 dispose(){this.worker.terminate()}
}
