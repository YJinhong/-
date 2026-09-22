import type{CADConstraint,Line}from'../types';

export type ConstraintSolveResult={lines:Line[];residuals:{id:string;error:number}[];conflicts:string[]};
export type ConstraintDiagnostic={id:string;error:number;severity:'ok'|'warning'|'conflict';conflictingIds:string[];improvement:number;priority:number;recommendedDisable:boolean};

const clone=(lines:Line[])=>lines.map(l=>({...l,points:l.points.map(p=>({...p}))}));

function project(line:Line,c:CADConstraint,all:Line[],w:number,h:number):Line{
 if(line.points.length<2)return line;
 const pts=line.points.map(p=>({...p})),a=pts[0],b=pts[pts.length-1];
 const move=(dx:number,dy:number)=>pts.forEach(p=>{p.x+=dx;p.y+=dy});
 if(c.type==='horizontal')pts.forEach(p=>p.y=a.y);
 else if(c.type==='vertical')pts.forEach(p=>p.x=a.x);
 else if(c.type==='x'&&c.value!==undefined)move(c.value/w-a.x,0);
 else if(c.type==='y'&&c.value!==undefined)move(0,c.value/h-a.y);
 else if(c.type==='fixedPoint'&&c.value!==undefined&&c.value2!==undefined)move(c.value/w-a.x,c.value2/h-a.y);
 else if((c.type==='length'||c.type==='angle')&&c.value!==undefined){
  const dx=(b.x-a.x)*w,dy=(b.y-a.y)*h,len=Math.hypot(dx,dy)||1;
  const targetLen=c.type==='length'?c.value:len,targetAng=c.type==='angle'?c.value*Math.PI/180:Math.atan2(dy,dx);
  const rot=targetAng-Math.atan2(dy,dx),k=targetLen/len;
  for(let i=1;i<pts.length;i++){const rx=(pts[i].x-a.x)*w,ry=(pts[i].y-a.y)*h,xx=(rx*Math.cos(rot)-ry*Math.sin(rot))*k,yy=(rx*Math.sin(rot)+ry*Math.cos(rot))*k;pts[i].x=a.x+xx/w;pts[i].y=a.y+yy/h}
 }else if((c.type==='parallel'||c.type==='perpendicular'||c.type==='equalLength')&&c.referenceLineId){
  const ref=all.find(x=>x.id===c.referenceLineId);if(ref&&ref.points.length>1){
   const ra=ref.points[0],rb=ref.points.at(-1)!,ta=pts[0],tb=pts.at(-1)!;
   const rdx=(rb.x-ra.x)*w,rdy=(rb.y-ra.y)*h,tdx=(tb.x-ta.x)*w,tdy=(tb.y-ta.y)*h;
   const tl=Math.hypot(tdx,tdy)||1,rl=Math.hypot(rdx,rdy)||1;
   const ang=Math.atan2(rdy,rdx)+(c.type==='perpendicular'?Math.PI/2:0),len=c.type==='equalLength'?rl:tl,rot=ang-Math.atan2(tdy,tdx),k=len/tl;
   for(let i=1;i<pts.length;i++){const rx=(pts[i].x-ta.x)*w,ry=(pts[i].y-ta.y)*h,xx=(rx*Math.cos(rot)-ry*Math.sin(rot))*k,yy=(rx*Math.sin(rot)+ry*Math.cos(rot))*k;pts[i].x=ta.x+xx/w;pts[i].y=ta.y+yy/h}
  }
 }else if((c.type==='horizontalDistance'||c.type==='verticalDistance')&&c.referenceLineId&&c.value!==undefined){
  const ref=all.find(x=>x.id===c.referenceLineId);if(ref){
   const ra=ref.points[0],ta=pts[0];
   if(c.type==='horizontalDistance'){const target=ra.x+(c.value/w)*(ta.x>=ra.x?1:-1);move(target-ta.x,0)}
   else{const target=ra.y+(c.value/h)*(ta.y>=ra.y?1:-1);move(0,target-ta.y)}
  }
 }
 return {...line,points:pts};
}

function error(line:Line,c:CADConstraint,all:Line[],w:number,h:number){
 if(line.points.length<2)return 0;
 const a=line.points[0],b=line.points.at(-1)!,dx=(b.x-a.x)*w,dy=(b.y-a.y)*h,len=Math.hypot(dx,dy);
 if(c.type==='length'&&c.value!==undefined)return Math.abs(len-c.value);
 if(c.type==='angle'&&c.value!==undefined){const ang=Math.atan2(dy,dx)*180/Math.PI;return Math.abs((((ang-c.value+180)%360)-180))}
 if(c.type==='horizontal')return Math.abs(dy);
 if(c.type==='vertical')return Math.abs(dx);
 if(c.type==='x'&&c.value!==undefined)return Math.abs(a.x*w-c.value);
 if(c.type==='y'&&c.value!==undefined)return Math.abs(a.y*h-c.value);
 if(c.type==='fixedPoint'&&c.value!==undefined&&c.value2!==undefined)return Math.hypot(a.x*w-c.value,a.y*h-c.value2);
 if(c.referenceLineId){const ref=all.find(x=>x.id===c.referenceLineId);if(ref&&ref.points.length>1){
  const r=ref.points.at(-1)!,ra=ref.points[0],rdx=(r.x-ra.x)*w,rdy=(r.y-ra.y)*h;
  if(c.type==='parallel'||c.type==='perpendicular'){const dot=(dx*rdx+dy*rdy)/(len*Math.hypot(rdx,rdy)||1),target=c.type==='parallel'?1:0;return Math.abs(Math.abs(dot)-target)}
  if(c.type==='equalLength')return Math.abs(len-Math.hypot(rdx,rdy));
  if(c.type==='horizontalDistance')return Math.abs((a.x-ra.x)*w-c.value!);
  if(c.type==='verticalDistance')return Math.abs((a.y-ra.y)*h-c.value!);
 }}return 0;
}

export function solveConstraints(input:Line[],constraints:CADConstraint[],w:number,h:number,iterations=10):ConstraintSolveResult{
 let lines=clone(input);
 for(let pass=0;pass<iterations;pass++){
  const snapshot=clone(lines);
  for(const c of constraints){if(c.enabled===false)continue;
   const idx=lines.findIndex(l=>l.id===c.lineId);if(idx<0)continue;
   lines[idx]=project(lines[idx],c,lines,w,h);
  }
  let max=0;for(const c of constraints){if(c.enabled===false)continue;const l=lines.find(x=>x.id===c.lineId);if(l)max=Math.max(max,error(l,c,lines,w,h))}
  if(max<.01)break;
  if(pass===iterations-1)lines=snapshot;
 }
 const residuals=constraints.map(c=>{const l=lines.find(x=>x.id===c.lineId);return{id:c.id,error:l?error(l,c,lines,w,h):0}}).filter(x=>x.error>.05);
 return{lines,residuals,conflicts:residuals.map(x=>x.id)};
}


export function diagnoseConstraints(input:Line[],constraints:CADConstraint[],w:number,h:number,iterations=12):ConstraintDiagnostic[]{
 const active=constraints.filter(c=>c.enabled!==false);
 if(!active.length)return [];
 const baseline=solveConstraints(input,active,w,h,iterations);
 const baseMap=new Map(baseline.residuals.map(r=>[r.id,r.error]));
 const total=(rs:{id:string;error:number}[])=>rs.reduce((n,r)=>n+r.error,0);
 const baseTotal=total(baseline.residuals);
 const tests=active.map(c=>{
  const others=active.filter(x=>x.id!==c.id);
  const result=solveConstraints(input,others,w,h,iterations);
  return{c,result,relief:Math.max(0,baseTotal-total(result.residuals))};
 });
 const bestRelief=Math.max(0,...tests.map(x=>x.relief));
 return active.map(c=>{
  const current=baseMap.get(c.id)??0;
  const test=tests.find(x=>x.c.id===c.id)!;
  const severity=current>.5&&test.relief>.05?'conflict':current>.05?'warning':'ok';
  const related=new Set<string>();
  if(severity==='conflict'){
   related.add(c.id);
   if(c.referenceLineId){
    active.filter(x=>x.lineId===c.referenceLineId||x.referenceLineId===c.lineId).forEach(x=>related.add(x.id));
   }
   tests.filter(x=>x.relief>.05).sort((a,b)=>b.relief-a.relief).slice(0,4).forEach(x=>{
    if(x.c.id!==c.id&&Math.abs(x.relief-test.relief)<Math.max(.5,test.relief*.75))related.add(x.c.id);
   });
  }
  const priority=severity==='conflict'?Math.round(Math.min(100,(test.relief/Math.max(.01,bestRelief))*70+(current/Math.max(.01,baseTotal))*30)):severity==='warning'?30:0;
  return{id:c.id,error:current,severity,conflictingIds:Array.from(related),improvement:test.relief,priority,recommendedDisable:severity==='conflict'&&test.relief>=bestRelief*.8};
 });
}
