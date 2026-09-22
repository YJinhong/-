import type{BatchJob,Line}from'../types';
type Result={lines:Line[]};
export class BatchProcessor{
 private worker:Worker;private cancelled=false;private paused=false;private activeId:string|null=null;
 constructor(){this.worker=new Worker(new URL('../workers/imageWorker.ts',import.meta.url),{type:'module'})}
 process(file:File,detail:'low'|'balanced'|'high'){return new Promise<Line[]>((resolve,reject)=>{const id=crypto.randomUUID();this.activeId=id;const done=(e:MessageEvent)=>{if(e.data.id!==id)return;this.worker.removeEventListener('message',done);this.activeId=null;e.data.ok?resolve(e.data.lines):reject(new Error(e.data.error))};this.worker.addEventListener('message',done);this.worker.postMessage({id,file,detail})})}
 cancel(){this.cancelled=true;this.paused=false;this.worker.postMessage({type:'cancel'})}
 pause(){this.paused=true}
 resume(){this.paused=false}
 async runWithResults(files:File[],detail:'low'|'balanced'|'high',onProgress:(jobs:BatchJob[])=>void){this.cancelled=false;const jobs:BatchJob[]=files.map((f,i)=>({id:crypto.randomUUID(),fileName:f.name,size:f.size,status:'queued',progress:0,sourceIndex:i}));const results:(Result|undefined)[]=[];onProgress([...jobs]);for(let i=0;i<files.length;i++){while(this.paused&&!this.cancelled)await new Promise(r=>setTimeout(r,100));if(this.cancelled){for(let k=i;k<jobs.length;k++)jobs[k].status='cancelled';onProgress([...jobs]);break;}jobs[i].status='processing';jobs[i].progress=5;onProgress([...jobs]);try{results[i]={lines:await this.process(files[i],detail)};jobs[i].lines=results[i].lines;jobs[i].status='done';jobs[i].progress=100}catch(e){jobs[i].status='error';jobs[i].error=e instanceof Error?e.message:String(e)}onProgress([...jobs])}return results}
 async run(files:File[],detail:'low'|'balanced'|'high',onProgress:(jobs:BatchJob[])=>void){await this.runWithResults(files,detail,onProgress);return}
 dispose(){this.worker.terminate()}
}