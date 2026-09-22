import type{Endpoint,Line,ConnectionCandidate,Point}from'../types';import{dist}from'./geometry';
function endpointPoint(l:Line,e:Endpoint){return e==='start'?l.points[0]:l.points.at(-1)!}
function normalize(v:Point){
 const m=Math.hypot(v.x,v.y);
 return m<1e-9?{x:0,y:0}:{x:v.x/m,y:v.y/m};
}
function endpointTangent(l:Line,e:Endpoint):Point{
 const count=l.points.length;
 if(count<2)return{x:0,y:0};
 const span=Math.min(6,count-1);
 if(e==='start'){
  const a=l.points[0],b=l.points[span];
  return normalize({x:b.x-a.x,y:b.y-a.y});
 }
 const a=l.points[count-1],b=l.points[count-1-span];
 return normalize({x:a.x-b.x,y:a.y-b.y});
}
function continuityAngle(a:Point,b:Point){
 const ma=Math.hypot(a.x,a.y),mb=Math.hypot(b.x,b.y);
 if(ma<1e-9||mb<1e-9)return 90;
 // Endpoint tangents point inward along each source line. A smooth join
 // therefore wants the two inward tangents to face opposite directions.
 const dot=Math.max(-1,Math.min(1,-(a.x*b.x+a.y*b.y)/(ma*mb)));
 return Math.acos(dot)*180/Math.PI;
}
function reverse(l:Line):Line{return{...l,points:[...l.points].reverse()}}
function orient(l:Line,e:Endpoint){return e==='end'?l:reverse(l)}
export function findConnectionCandidates(lines:Line[],maxDistance=.06):ConnectionCandidate[]{
 const out:ConnectionCandidate[]=[];
 for(let i=0;i<lines.length;i++)for(let j=i+1;j<lines.length;j++){
  const candidates:{aEnd:Endpoint;bEnd:Endpoint;distance:number;angle:number;cost:number}[]=[];
  for(const aEnd of ['start','end'] as Endpoint[])for(const bEnd of ['start','end'] as Endpoint[]){
   const a=endpointPoint(lines[i],aEnd),b=endpointPoint(lines[j],bEnd),distance=dist(a,b);
   if(distance>maxDistance)continue;
   const angle=continuityAngle(endpointTangent(lines[i],aEnd),endpointTangent(lines[j],bEnd));
   // Distance remains dominant, while tangent continuity suppresses nearby
   // endpoints that would force a sharp reversal or unrelated join.
   const cost=.68*(distance/maxDistance)+.32*(angle/180);
   candidates.push({aEnd,bEnd,distance,angle,cost});
  }
  candidates.sort((a,b)=>a.cost-b.cost);
  const usedA=new Set<Endpoint>(),usedB=new Set<Endpoint>();
  for(const candidate of candidates){
   if(usedA.has(candidate.aEnd)||usedB.has(candidate.bEnd))continue;
   usedA.add(candidate.aEnd);usedB.add(candidate.bEnd);
   // Do not hide a very close endpoint just because rasterization made its
   // tangent noisy; only reject clearly U-turn-like joins at ordinary gaps.
   if(candidate.angle>132&&candidate.distance>maxDistance*.35)continue;
   const reason=candidate.angle<=30
    ?'very close endpoints · smooth tangent'
    :candidate.angle<=65
      ?'close endpoints · compatible tangent'
      :candidate.angle<=100
        ?'close endpoints · corner join'
        :'very close endpoints · sharp corner';
   out.push({
    id:crypto.randomUUID(),a:lines[i].id,b:lines[j].id,
    aEnd:candidate.aEnd,bEnd:candidate.bEnd,distance:candidate.distance,
    angle:candidate.angle,reason,status:'pending'
   });
  }
 }
 return out.sort((a,b)=>{
  const ac=.68*(a.distance/Math.max(maxDistance,1e-9))+.32*(a.angle/180);
  const bc=.68*(b.distance/Math.max(maxDistance,1e-9))+.32*(b.angle/180);
  return ac-bc;
 });
}

type SideRef={lineId:string;end:Endpoint};
type Link={to:SideRef;distance:number};

function mergeComponent(lines:Line[],connections:ConnectionCandidate[]):Line[]{
 const byId=new Map(lines.map(l=>[l.id,l]));
 const links=new Map<string,Partial<Record<Endpoint,Link>>>();

 const setLink=(lineId:string,end:Endpoint,link:Link)=>{
  const sides=links.get(lineId)??{};
  if(sides[end])return false;
  sides[end]=link;links.set(lineId,sides);return true;
 };

 const ranked=[...connections].filter(c=>c.a!==c.b&&byId.has(c.a)&&byId.has(c.b)).sort((a,b)=>a.distance-b.distance);
 for(const c of ranked){
  const aOk=setLink(c.a,c.aEnd,{to:{lineId:c.b,end:c.bEnd},distance:c.distance});
  const bOk=setLink(c.b,c.bEnd,{to:{lineId:c.a,end:c.aEnd},distance:c.distance});
  if(aOk&&bOk)continue;
  // A line endpoint can only participate in one linear join. If either side
  // is already occupied, discard the whole candidate rather than creating a
  // one-sided link that can corrupt traversal.
  const aLinks=links.get(c.a)??{},bLinks=links.get(c.b)??{};
  if(aOk)delete aLinks[c.aEnd];
  if(bOk)delete bLinks[c.bEnd];
  links.set(c.a,aLinks);links.set(c.b,bLinks);
 }

 const degree=(id:string)=>{
  const s=links.get(id)??{};
  return Number(Boolean(s.start))+Number(Boolean(s.end));
 };

 const unused=new Set(lines.map(l=>l.id));
 const output:Line[]=[];

 while(unused.size){
  let startId=[...unused].find(id=>degree(id)<=1)??[...unused][0];
  let startEnd:Endpoint='start';
  const startLinks=links.get(startId)??{};
  if(startLinks.start&&!startLinks.end)startEnd='end';

  let currentId=startId;
  let entry:Endpoint=startEnd;
  let merged:Line|undefined;
  const visited=new Set<string>();

  while(unused.has(currentId)&&!visited.has(currentId)){
   visited.add(currentId);unused.delete(currentId);
   const base=byId.get(currentId)!;
   const current=orient(base,entry);

   if(!merged)merged={...current,points:current.points.map(p=>({...p}))};
   else{
    const mp=merged.points.at(-1)!;
    const cp=current.points[0];
    const join={x:(mp.x+cp.x)/2,y:(mp.y+cp.y)/2};
    merged.points=[...merged.points.slice(0,-1),join,...current.points.slice(1).map(p=>({...p}))];
    merged.closed=Boolean(merged.closed||current.closed);
   }

   const exit:Endpoint=entry==='start'?'end':'start';
   const link=(links.get(currentId)??{})[exit];
   if(!link||!unused.has(link.to.lineId))break;

   currentId=link.to.lineId;
   entry=link.to.end;
  }

  if(merged)output.push(merged);
 }

 return output;
}

export function applyConnections(lines:Line[],connections:ConnectionCandidate[]):Line[]{
 const accepted=connections.filter(x=>x.status==='accepted');
 if(!accepted.length)return lines.map(l=>({...l,points:l.points.map(p=>({...p}))}));

 const byId=new Map(lines.map(l=>[l.id,l]));
 const graph=new Map<string,Set<string>>();
 const add=(a:string,b:string)=>{(graph.get(a)??(graph.set(a,new Set()),graph.get(a)!)).add(b);(graph.get(b)??(graph.set(b,new Set()),graph.get(b)!)).add(a)};
 for(const c of accepted)if(c.a!==c.b&&byId.has(c.a)&&byId.has(c.b))add(c.a,c.b);

 const seen=new Set<string>(),result:Line[]=[];
 for(const line of lines){
  if(seen.has(line.id))continue;
  const component:string[]=[line.id];seen.add(line.id);
  for(let i=0;i<component.length;i++)for(const n of graph.get(component[i])??[])if(!seen.has(n)){seen.add(n);component.push(n)}
  if(component.length===1){result.push({...line,points:line.points.map(p=>({...p}))});continue}
  const ids=new Set(component);
  const componentLines=lines.filter(l=>ids.has(l.id));
  const componentConnections=accepted.filter(c=>ids.has(c.a)&&ids.has(c.b));
  result.push(...mergeComponent(componentLines,componentConnections));
 }
 return result;
}
