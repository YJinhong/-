import type{Endpoint,Line,ConnectionCandidate,Point}from'../types';
import{dist}from'./geometry';
function endpointPoint(l:Line,e:Endpoint){return e==='start'?l.points[0]:l.points.at(-1)!}
function angle(a:Point,b:Point){return Math.atan2(b.y-a.y,b.x-a.x)*180/Math.PI}
export function findConnectionCandidates(lines:Line[],maxDistance=.06):ConnectionCandidate[]{
 const out:ConnectionCandidate[]=[];
 for(let i=0;i<lines.length;i++)for(let j=i+1;j<lines.length;j++){
  let best:ConnectionCandidate|undefined;
  for(const aEnd of ['start','end'] as Endpoint[])for(const bEnd of ['start','end'] as Endpoint[]){
   const a=endpointPoint(lines[i],aEnd),b=endpointPoint(lines[j],bEnd),d=dist(a,b);
   if(d>maxDistance)continue;
   const candidate={id:crypto.randomUUID(),a:lines[i].id,b:lines[j].id,aEnd,bEnd,distance:d,angle:Math.abs(angle(a,b)),reason:d<maxDistance*.45?'very close endpoints':'close endpoints',status:'pending' as const};
   if(!best||d<best.distance)best=candidate;
  }
  if(best)out.push(best);
 }
 return out.sort((a,b)=>a.distance-b.distance);
}
export function applyConnections(lines:Line[],connections:ConnectionCandidate[]):Line[]{
 const map=new Map(lines.map(l=>[l.id,{...l,points:l.points.map(p=>({...p}))}]));
 for(const c of connections.filter(x=>x.status==='accepted')){
  const a=map.get(c.a),b=map.get(c.b);if(!a||!b)continue;
  const ap=endpointPoint(a,c.aEnd),bp=endpointPoint(b,c.bEnd);
  if(dist(ap,bp)>.08)continue;
  const target={...bp};
  if(c.aEnd==='end'){if(dist(ap,bp)>0.0001)a.points.push(target)}
  else a.points.unshift(target);
 }
 return [...map.values()];
}
