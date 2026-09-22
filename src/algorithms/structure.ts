import type{Line,Point,StructuralWarning,SupportStick}from'../types';
import{buildSkeletonGraph}from'./skeletonGraph';

const d=(a:Point,b:Point)=>Math.hypot(a.x-b.x,a.y-b.y);
const polyLength=(p:Point[])=>p.slice(1).reduce((s,q,i)=>s+d(p[i],q),0);
const angle=(a:Point,b:Point)=>Math.atan2(b.y-a.y,b.x-a.x)*180/Math.PI;
const add=(out:StructuralWarning[],severity:StructuralWarning['severity'],message:string,lineIds:string[])=>out.push({id:crypto.randomUUID(),severity,message,lineIds});

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
 const candidates=lines.map(l=>{
  const len=polyLength(l.points),a=l.points[0],b=l.points.at(-1)!,da=degree.get(l.id)??1;
  const score=Math.max(0,Math.min(100,35+Math.min(40,len*55)+(da===1?18:da>=3?8:0)-(l.width<3?15:0)));
  const mid=l.points[Math.floor((l.points.length-1)/2)]??a;
  return{line:l,len,score,mid,angle:angle(a,b)};
 }).filter(x=>x.len>.18).sort((a,b)=>b.score-a.score).slice(0,5);
 return candidates.map((c,i)=>({
  id:crypto.randomUUID(),x:c.mid.x,y:c.mid.y,
  length:Math.max(25,Math.min(70,c.len*100)),angle:c.angle+90,
  score:Math.round(c.score),kind:i===0?'recommended':c.score>=55?'optional':'avoid'
 }));
}