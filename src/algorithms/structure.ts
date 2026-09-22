import type{Line,Point,StructuralWarning,SupportStick}from'../types';
import{buildSkeletonGraph}from'./skeletonGraph';

const d=(a:Point,b:Point)=>Math.hypot(a.x-b.x,a.y-b.y);
const polyLength=(p:Point[])=>p.slice(1).reduce((s,q,i)=>s+d(p[i],q),0);
const angle=(a:Point,b:Point)=>Math.atan2(b.y-a.y,b.x-a.x)*180/Math.PI;
const clamp=(v:number,min:number,max:number)=>Math.max(min,Math.min(max,v));
const add=(out:StructuralWarning[],severity:StructuralWarning['severity'],message:string,lineIds:string[])=>out.push({id:crypto.randomUUID(),severity,message,lineIds});

function tangentAt(l:Line,index:number):Point{
 const lo=Math.max(0,index-3),hi=Math.min(l.points.length-1,index+3);
 const a=l.points[lo]??l.points[0],b=l.points[hi]??l.points.at(-1)!;
 return{x:b.x-a.x,y:b.y-a.y};
}
function curvatureAt(l:Line,index:number){
 const t0=tangentAt(l,Math.max(0,index-2)),t1=tangentAt(l,Math.min(l.points.length-1,index+2));
 const m0=Math.hypot(t0.x,t0.y),m1=Math.hypot(t1.x,t1.y);
 if(m0<1e-9||m1<1e-9)return 0;
 return Math.acos(clamp((t0.x*t1.x+t0.y*t1.y)/(m0*m1),-1,1))*180/Math.PI;
}
function pointToSegmentDistance(p:Point,a:Point,b:Point){
 const dx=b.x-a.x,dy=b.y-a.y,den=dx*dx+dy*dy;
 if(den<1e-12)return d(p,a);
 const t=clamp(((p.x-a.x)*dx+(p.y-a.y)*dy)/den,0,1);
 return d(p,{x:a.x+t*dx,y:a.y+t*dy});
}
function tooCloseToOtherLines(p:Point,sourceId:string,lines:Line[],clearance=.045){
 for(const l of lines){
  if(l.id===sourceId)continue;
  for(let i=1;i<l.points.length;i++)if(pointToSegmentDistance(p,l.points[i-1],l.points[i])<clearance)return true;
 }
 return false;
}

export function analyze(lines:Line[]){
 const warnings:StructuralWarning[]=[];
 if(!lines.length)return warnings;
 const graph=buildSkeletonGraph(lines,.018);
 const degreeByLine=new Map<string,number>();
 graph.forEach(n=>n.lineIds.forEach(id=>degreeByLine.set(id,Math.max(degreeByLine.get(id)??0,n.degree))));

 lines.forEach(l=>{
  if(l.points.length<2)return;
  const start=l.points[0],end=l.points.at(-1)!;
  const span=d(start,end),len=polyLength(l.points),straightness=span/(len||1),degree=degreeByLine.get(l.id)??1;
  if(l.width<2.5)add(warnings,'high','Line width '+l.width.toFixed(1)+' mm is below the 2.5 mm practical threshold; consider thickening.',[l.id]);
  else if(l.width<3.2)add(warnings,'medium','Line width '+l.width.toFixed(1)+' mm is relatively narrow for hand-made sugar art.',[l.id]);
  if(len>.42)add(warnings,len>.65?'high':'medium','Long span ('+len.toFixed(2)+'u) may need support or a shorter structural span.',[l.id]);
  if(degree===1&&len>.22)add(warnings,'medium','Suspended endpoint on a '+len.toFixed(2)+'u segment; consider a support near the load-bearing area.',[l.id]);
  if(straightness<.55&&len>.16)add(warnings,'low','Highly curved/segmented path may have a weaker load path; inspect narrow turns and joints.',[l.id]);
  if(degree>=3)add(warnings,'low','Junction with degree '+degree+'; inspect the joint for crowding and local thickness.',[l.id]);
 });

 graph.filter(n=>n.degree>=3).forEach(n=>{
  const connected=lines.filter(l=>n.lineIds.includes(l.id));
  if(connected.length>=3&&Math.min(...connected.map(l=>l.width))<3)add(warnings,'medium','Junction contains a narrow connected segment; reinforce the joint before cooking.',connected.map(l=>l.id));
 });

 const seen=new Set<string>();
 for(const n of graph){
  if(seen.has(n.id))continue;
  const ids=new Set<string>(n.lineIds),queue=[n.id];seen.add(n.id);
  while(queue.length){
   const id=queue.pop()!,node=graph.find(x=>x.id===id)!;
   for(const lid of node.lineIds)for(const other of graph)if(other.lineIds.includes(lid)&&!seen.has(other.id)){seen.add(other.id);queue.push(other.id);other.lineIds.forEach(x=>ids.add(x))}
  }
  const component=lines.filter(l=>ids.has(l.id)),ends=graph.filter(x=>x.degree===1&&x.lineIds.some(id=>ids.has(id))).length,total=component.reduce((s,l)=>s+polyLength(l.points),0);
  if(component.length>2&&ends>=4&&total>.8)add(warnings,'medium','Connected region has '+ends+' exposed endpoints across '+component.length+' segments; review the unsupported perimeter.',component.map(l=>l.id));
 }
 return warnings;
}

export function recommendSticks(lines:Line[]):SupportStick[]{
 if(!lines.length)return[];
 const graph=buildSkeletonGraph(lines,.018),degree=new Map<string,number>();
 graph.forEach(n=>n.lineIds.forEach(id=>degree.set(id,Math.max(degree.get(id)??0,n.degree))));

 const candidates:{line:Line;point:Point;angle:number;score:number;clearance:number}[]=[];
 for(const line of lines){
  const len=polyLength(line.points);
  if(len<.18||line.points.length<3)continue;
  const cumulative=[0];
  for(let i=1;i<line.points.length;i++)cumulative.push(cumulative[i-1]+d(line.points[i-1],line.points[i]));
  const total=cumulative.at(-1)!;
  const minOffset=Math.min(.12,total*.22),maxOffset=Math.max(minOffset,total*.78);
  for(let i=1;i<line.points.length-1;i++){
   const s=cumulative[i];
   if(s<minOffset||s>maxOffset)continue;
   const p=line.points[i];
   const curvature=curvatureAt(line,i);
   const tangent=tangentAt(line,i);
   const tm=Math.hypot(tangent.x,tangent.y);
   if(tm<1e-9)continue;
   const localAngle=Math.atan2(tangent.y,tangent.x)*180/Math.PI;
   const stickAngle=localAngle+90;
   const clearance=tooCloseToOtherLines(p,line.id,lines);
   if(clearance)continue;
   const endBalance=Math.min(s,total-s)/(total||1);
   const curvaturePenalty=Math.min(1,curvature/110);
   const widthBonus=clamp((line.width-2.5)/2.5,0,1);
   const lineDegree=degree.get(line.id)??1;
   const degreeBonus=lineDegree>=3?0.12:lineDegree===1?0.08:0;
   const score=clamp(
    42+
    34*clamp(len/.8,0,1)+
    16*endBalance+
    8*widthBonus+
    8*degreeBonus-
    18*curvaturePenalty,0,100
   );
   candidates.push({line,point:p,angle:stickAngle,score,clearance:0});
  }
 }
 candidates.sort((a,b)=>b.score-a.score);

 const selected:{lineId:string;point:Point;angle:number;score:number}[]=[];
 for(const c of candidates){
  if(selected.some(s=>s.lineId===c.line.id&&d(s.point,c.point)<.14))continue;
  if(selected.some(s=>d(s.point,c.point)<.10))continue;
  selected.push({lineId:c.line.id,point:c.point,angle:c.angle,score:c.score});
  if(selected.length>=6)break;
 }
 return selected.map((c,i)=>{
  const source=lines.find(l=>l.id===c.lineId)!;
  const len=polyLength(source.points);
  return{
   id:crypto.randomUUID(),
   x:c.point.x,y:c.point.y,
   length:clamp(25+len*35,25,70),
   angle:c.angle,
   score:Math.round(c.score),
   kind:i===0?'recommended':c.score>=55?'optional':'avoid'
  };
 });
}
