import type{Line,Point}from'../types';
export type GraphNode={id:string;point:Point;degree:number;lineIds:string[]};
export type GraphEdge={lineId:string;a:string;b:string};
export type PathResult={order:Line[];penLifts:number;length:number};

const d=(a:Point,b:Point)=>Math.hypot(a.x-b.x,a.y-b.y);
const ends=(l:Line)=>[l.points[0],l.points.at(-1)!] as const;

export function buildSkeletonGraph(lines:Line[],radius=.018){
 const nodes:GraphNode[]=[];
 const find=(p:Point)=>nodes.findIndex(n=>d(n.point,p)<=radius);
 for(const l of lines)for(const p of ends(l)){
  const i=find(p);
  if(i<0)nodes.push({id:crypto.randomUUID(),point:{...p},degree:1,lineIds:[l.id]});
  else{nodes[i].degree++;if(!nodes[i].lineIds.includes(l.id))nodes[i].lineIds.push(l.id)}
 }
 return nodes;
}
export function rebuildGraph(lines:Line[],radius=.018){return buildSkeletonGraph(lines,radius)}
export function graphEdges(lines:Line[],radius=.018):GraphEdge[]{
 const nodes=buildSkeletonGraph(lines,radius),nodeFor=(p:Point)=>nodes.reduce((best,n,i)=>d(n.point,p)<d(n.point,nodes[best]?.point??{x:99,y:99})?i:best,0);
 return lines.map(l=>{const [a,b]=ends(l);return{lineId:l.id,a:nodes[nodeFor(a)].id,b:nodes[nodeFor(b)].id}});
}
function reverse(l:Line):Line{return{...l,points:[...l.points].reverse()}}
function connectedStart(lines:Line[],tail:Point){let best=-1,bestD=Infinity,rev=false;for(let i=0;i<lines.length;i++){const [a,b]=ends(lines[i]),da=d(a,tail),db=d(b,tail);if(da<bestD){best=i;bestD=da;rev=false}if(db<bestD){best=i;bestD=db;rev=true}}return{index:best,reverse:rev,distance:bestD}}
export function eulerTrail(lines:Line[]):Line[]{
 if(!lines.length)return[];
 const unused=[...lines],out:Line[]=[];
 let current=unused.shift()!;
 out.push(current);
 while(unused.length){
  const pick=connectedStart(unused,current.points.at(-1)!);
  if(pick.index<0)break;
  const next=unused.splice(pick.index,1)[0];
  current=pick.reverse?reverse(next):next;
  out.push(current);
 }
 return out;
}
export function minimumPenLiftPath(lines:Line[]):PathResult{
 if(!lines.length)return{order:[],penLifts:0,length:0};
 const components:Line[][]=[];const remaining=[...lines];const threshold=.08;
 while(remaining.length){
  const seed=remaining.shift()!;const comp=[seed];let expanded=true;
  while(expanded){expanded=false;for(let i=remaining.length-1;i>=0;i--){const l=remaining[i];const touches=comp.some(c=>ends(c).some(a=>ends(l).some(b=>d(a,b)<=threshold)));if(touches){comp.push(l);remaining.splice(i,1);expanded=true}}}
  components.push(comp);
 }
 const order=components.flatMap(c=>eulerTrail(c));
 return{order,penLifts:Math.max(0,components.length-1),length:totalPathLength(order)};
}
export function penLifts(order:Line[],threshold=.08){let lifts=0;for(let i=1;i<order.length;i++){if(d(order[i-1].points.at(-1)!,order[i].points[0]!)>threshold)lifts++}return lifts}
export function totalPathLength(lines:Line[]){return lines.reduce((s,l)=>s+l.points.slice(1).reduce((n,p,i)=>n+d(l.points[i],p),0),0)}
