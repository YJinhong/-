import type{Line,Point}from'../types';
export type GraphNode={id:string;point:Point;degree:number;lineIds:string[]};
export type GraphEdge={lineId:string;a:string;b:string};
export type PathResult={order:Line[];penLifts:number;length:number;trails?:Line[][]};

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
 const nodes=buildSkeletonGraph(lines,radius),nodeFor=(p:Point)=>{let best=0,bd=Infinity;nodes.forEach((n,i)=>{const z=d(n.point,p);if(z<bd){bd=z;best=i}});return best};
 return lines.map(l=>{const [a,b]=ends(l);return{lineId:l.id,a:nodes[nodeFor(a)].id,b:nodes[nodeFor(b)].id}});
}
function reverse(l:Line):Line{return{...l,points:[...l.points].reverse()}}
function componentEdges(lines:Line[],radius=.018){
 const edges=graphEdges(lines,radius),adj=new Map<string,GraphEdge[]>();
 for(const e of edges){(adj.get(e.a)??(adj.set(e.a,[]),adj.get(e.a)!)).push(e);(adj.get(e.b)??(adj.set(e.b,[]),adj.get(e.b)!)).push(e)}
 const seen=new Set<string>(),out:GraphEdge[][]=[];
 for(const e of edges)if(!seen.has(e.lineId)){const comp:GraphEdge[]=[];const q=[e.a,e.b];seen.add(e.lineId);while(q.length){const n=q.pop()!;for(const z of adj.get(n)??[])if(!seen.has(z.lineId)){seen.add(z.lineId);comp.push(z);q.push(z.a,z.b)}}out.push([e,...comp])}
 return out;
}
function eulerFromEdges(lines:Line[],edges:GraphEdge[],start:string):Line[]{
 const byId=new Map(lines.map(l=>[l.id,l])),adj=new Map<string,{edge:GraphEdge;other:string}[]>();
 for(const e of edges){(adj.get(e.a)??(adj.set(e.a,[]),adj.get(e.a)!)).push({edge:e,other:e.b});(adj.get(e.b)??(adj.set(e.b,[]),adj.get(e.b)!)).push({edge:e,other:e.a})}
 const used=new Set<string>(),stack:{node:string;edge:GraphEdge|null}[]=[{node:start,edge:null}],circuit:{edge:GraphEdge;from:string;to:string}[]=[];
 while(stack.length){const top=stack.at(-1)!;const next=(adj.get(top.node)??[]).find(z=>!used.has(z.edge.lineId));if(next){used.add(next.edge.lineId);stack.push({node:next.other,edge:next.edge})}else{const done=stack.pop()!;if(done.edge)circuit.push({edge:done.edge,from:done.node,to:top.node})}}
 const ordered:Line[]=[];for(let i=circuit.length-1;i>=0;i--){const z=circuit[i],l=byId.get(z.edge.lineId)!;const oriented=z.edge.a===z.from&&z.edge.b===z.to?l:reverse(l);ordered.push(oriented)}return ordered;
}
export function eulerTrail(lines:Line[],radius=.018):Line[]{
 if(!lines.length)return[];
 const edges=graphEdges(lines,radius),nodes=buildSkeletonGraph(lines,radius),odd=nodes.filter(n=>n.degree%2===1);
 if(odd.length!==0&&odd.length!==2)return[];
 const start=odd[0]?.id??nodes[0]?.id;
 return start?eulerFromEdges(lines,edges,start):[];
}
export function trailDecomposition(lines:Line[],radius=.018):Line[][]{
 if(!lines.length)return[];
 const remaining=new Map(lines.map(l=>[l.id,l])),trails:Line[][]=[];
 while(remaining.size){
  const batch=[...remaining.values()],nodes=buildSkeletonGraph(batch,radius),odd=nodes.filter(n=>n.degree%2===1);
  const start=(odd[0]?.id??nodes[0]?.id);if(!start)break;
  const edges=graphEdges(batch,radius),trail=eulerFromEdges(batch,edges,start);
  if(!trail.length)break;
  trails.push(trail);
  trail.forEach(l=>remaining.delete(l.id));
 }
 return trails;
}
export function minimumPenLiftPath(lines:Line[],radius=.018):PathResult{
 if(!lines.length)return{order:[],penLifts:0,length:0,trails:[]};
 const trails=trailDecomposition(lines,radius);
 return{order:trails.flat(),penLifts:Math.max(0,trails.length-1),length:totalPathLength(trails.flat()),trails};
}
export function penLifts(order:Line[],threshold=.08){let lifts=0;for(let i=1;i<order.length;i++)if(d(order[i-1].points.at(-1)!,order[i].points[0]!)>threshold)lifts++;return lifts}
export function totalPathLength(lines:Line[]){return lines.reduce((s,l)=>s+l.points.slice(1).reduce((n,p,i)=>n+d(l.points[i],p),0),0)}
