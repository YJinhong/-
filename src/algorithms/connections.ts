import type{Endpoint,Line,ConnectionCandidate,Point}from'../types';import{dist}from'./geometry';
function endpointPoint(l:Line,e:Endpoint){return e==='start'?l.points[0]:l.points.at(-1)!}
function angle(a:Point,b:Point){return Math.atan2(b.y-a.y,b.x-a.x)*180/Math.PI}
function reverse(l:Line):Line{return{...l,points:[...l.points].reverse()}}
function orient(l:Line,e:Endpoint){return e==='end'?l:reverse(l)}
export function findConnectionCandidates(lines:Line[],maxDistance=.06):ConnectionCandidate[]{const out:ConnectionCandidate[]=[];for(let i=0;i<lines.length;i++)for(let j=i+1;j<lines.length;j++){let best:ConnectionCandidate|undefined;for(const aEnd of ['start','end'] as Endpoint[])for(const bEnd of ['start','end'] as Endpoint[]){const a=endpointPoint(lines[i],aEnd),b=endpointPoint(lines[j],bEnd),d=dist(a,b);if(d>maxDistance)continue;const candidate={id:crypto.randomUUID(),a:lines[i].id,b:lines[j].id,aEnd,bEnd,distance:d,angle:Math.abs(angle(a,b)),reason:d<maxDistance*.45?'very close endpoints':'close endpoints',status:'pending' as const};if(!best||d<best.distance)best=candidate}if(best)out.push(best)}return out.sort((a,b)=>a.distance-b.distance)}

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

 for(const c of connections){
  if(c.a===c.b||!byId.has(c.a)||!byId.has(c.b))continue;
  setLink(c.a,c.aEnd,{to:{lineId:c.b,end:c.bEnd},distance:c.distance});
  setLink(c.b,c.bEnd,{to:{lineId:c.a,end:c.aEnd},distance:c.distance});
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
  let entry:startEnd extends Endpoint?Endpoint:Endpoint=startEnd;
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
