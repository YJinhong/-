import type{Line,Point}from'../types';
export type GraphNode={id:string;point:Point;degree:number;lineIds:string[]};
export function buildSkeletonGraph(lines:Line[],radius=.018){
 const nodes:GraphNode[]=[];
 const find=(p:Point)=>nodes.findIndex(n=>Math.hypot(n.point.x-p.x,n.point.y-p.y)<=radius);
 for(const l of lines)for(const p of [l.points[0],l.points.at(-1)!]){
  const i=find(p);
  if(i<0)nodes.push({id:crypto.randomUUID(),point:{...p},degree:1,lineIds:[l.id]});
  else{nodes[i].degree++;if(!nodes[i].lineIds.includes(l.id))nodes[i].lineIds.push(l.id)}
 }
 return nodes;
}
export function rebuildGraph(lines:Line[],radius=.018){return buildSkeletonGraph(lines,radius)}
export function eulerTrail(lines:Line[]){
 if(!lines.length)return[];
 const remaining=new Map(lines.map(l=>[l.id,l])),result:Line[]=[];
 let current=lines[0];remaining.delete(current.id);result.push(current);
 while(remaining.size){
  const tail=current.points.at(-1)!;
  let best:Line|undefined,bestD=Infinity;
  for(const l of remaining.values()){const d=Math.hypot(l.points[0].x-tail.x,l.points[0].y-tail.y);if(d<bestD){bestD=d;best=l}}
  if(!best){const first=remaining.values().next().value as Line|undefined;if(!first)break;best=first}
  remaining.delete(best.id);result.push(best);current=best;
 }
 return result;
}
export function penLifts(order:Line[],threshold=.08){
 let lifts=0;for(let i=1;i<order.length;i++){const a=order[i-1].points.at(-1)!,b=order[i].points[0]!;if(Math.hypot(a.x-b.x,a.y-b.y)>threshold)lifts++}return lifts;
}
export function totalPathLength(lines:Line[]){return lines.reduce((s,l)=>s+l.points.slice(1).reduce((n,p,i)=>n+Math.hypot(p.x-l.points[i].x,p.y-l.points[i].y),0),0)}
