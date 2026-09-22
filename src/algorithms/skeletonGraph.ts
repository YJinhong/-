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
 const nodes:{id:string;point:Point}[]=[];
 const nodeFor=(p:Point)=>{
  const i=nodes.findIndex(n=>d(n.point,p)<=radius);
  if(i>=0)return nodes[i].id;
  const id=crypto.randomUUID();nodes.push({id,point:{...p}});return id;
 };
 return lines.map(l=>{const[a,b]=ends(l);return{lineId:l.id,a:nodeFor(a),b:nodeFor(b)}});
}
function reverse(l:Line):Line{return{...l,points:[...l.points].reverse()}}
function eulerFromEdges(lines:Line[],edges:GraphEdge[],start:string):Line[]{
 const byId=new Map(lines.map(l=>[l.id,l])),adj=new Map<string,{edge:GraphEdge;other:string}[]>();
 for(const e of edges){
  (adj.get(e.a)??(adj.set(e.a,[]),adj.get(e.a)!)).push({edge:e,other:e.b});
  (adj.get(e.b)??(adj.set(e.b,[]),adj.get(e.b)!)).push({edge:e,other:e.a});
 }
 const used=new Set<string>();
 const stack:{node:string;via:{edge:GraphEdge;from:string;to:string}|null}[]=[{node:start,via:null}];
 const circuit:{edge:GraphEdge;from:string;to:string}[]=[];
 while(stack.length){
  const top=stack.at(-1)!;
  const next=(adj.get(top.node)??[]).find(z=>!used.has(z.edge.lineId));
  if(next){
   used.add(next.edge.lineId);
   stack.push({node:next.other,via:{edge:next.edge,from:top.node,to:next.other}});
  }else{
   const done=stack.pop()!;
   if(done.via)circuit.push(done.via);
  }
 }
 const ordered:Line[]=[];
 for(let i=circuit.length-1;i>=0;i--){
  const z=circuit[i],l=byId.get(z.edge.lineId);
  if(!l)continue;
  ordered.push(z.edge.a===z.from&&z.edge.b===z.to?l:reverse(l));
 }
 return ordered;
}
export function eulerTrail(lines:Line[],radius=.018):Line[]{
 if(!lines.length)return[];
 const edges=graphEdges(lines,radius),nodes=buildSkeletonGraph(lines,radius),odd=nodes.filter(n=>n.degree%2===1);
 if(odd.length!==0&&odd.length!==2)return[];
 const start=odd[0]?.id??nodes[0]?.id;
 return start?eulerFromEdges(lines,edges,start):[];
}
function componentEdges(edges:GraphEdge[]):GraphEdge[][]{
 const byNode=new Map<string,GraphEdge[]>();
 for(const e of edges){(byNode.get(e.a)??(byNode.set(e.a,[]),byNode.get(e.a)!)).push(e);(byNode.get(e.b)??(byNode.set(e.b,[]),byNode.get(e.b)!)).push(e)}
 const seen=new Set<string>(),out:GraphEdge[][]=[];
 for(const e of edges){
  if(seen.has(e.lineId))continue;
  const stack=[e.a],ids:string[]=[];seen.add(e.lineId);
  while(stack.length){
   const n=stack.pop()!;for(const x of byNode.get(n)??[])if(!seen.has(x.lineId)){seen.add(x.lineId);ids.push(x.lineId);stack.push(x.a===n?x.b:x.a)}
  }
  ids.push(e.lineId);
  const set=new Set(ids);out.push(edges.filter(x=>set.has(x.lineId)));
 }
 return out;
}

function minimumTrailsForComponent(lines:Line[],edges:GraphEdge[]):Line[][]{
 if(!edges.length)return[];
 const degree=new Map<string,number>();
 const inc=(n:string)=>degree.set(n,(degree.get(n)??0)+1);
 edges.forEach(e=>{inc(e.a);inc(e.b)});
 const odd=[...degree.entries()].filter(([,v])=>v%2===1).map(([n])=>n);
 const artificial=new Set<string>();
 const work=edges.map(e=>({...e}));
 for(let i=0;i+1<odd.length;i+=2){
  const id=crypto.randomUUID();work.push({lineId:id,a:odd[i],b:odd[i+1]});artificial.add(id);
 }
 const byNode=new Map<string,GraphEdge[]>();
 for(const e of work){(byNode.get(e.a)??(byNode.set(e.a,[]),byNode.get(e.a)!)).push(e);(byNode.get(e.b)??(byNode.set(e.b,[]),byNode.get(e.b)!)).push(e)}
 const unused=new Set(work.map(e=>e.lineId)),byId=new Map(lines.map(l=>[l.id,l]));
 const adj=(n:string)=>byNode.get(n)??[];
 const start=[...byNode.keys()][0];if(!start)return[];
 const stack:{node:string;edge:GraphEdge|null;from:string}[]=[{node:start,edge:null,from:start}],circuit:{edge:GraphEdge;from:string;to:string}[]=[];
 while(stack.length){
  const top=stack.at(-1)!;const e=adj(top.node).find(x=>unused.has(x.lineId));
  if(e){unused.delete(e.lineId);const to=e.a===top.node?e.b:e.a;stack.push({node:to,edge:e,from:top.node})}
  else{const done=stack.pop()!;if(done.edge)circuit.push({edge:done.edge,from:done.from,to:done.node})}
 }
 const directed=circuit.reverse(),trails:{edge:GraphEdge;from:string;to:string}[][]=[];let current:{edge:GraphEdge;from:string;to:string}[]=[];
 for(const step of directed){
  if(artificial.has(step.edge.lineId)){
   if(current.length)trails.push(current);current=[];
  }else current.push(step);
 }
 if(current.length)trails.push(current);
 return trails.map(t=>t.map(z=>{
  const l=byId.get(z.edge.lineId)!;
  return z.edge.a===z.from&&z.edge.b===z.to?l:reverse(l);
 })).filter(t=>t.length);
}

export function trailDecomposition(lines:Line[],radius=.018):Line[][]{
 if(!lines.length)return[];
 const edges=graphEdges(lines,radius),byId=new Map(lines.map(l=>[l.id,l])),components=componentEdges(edges),trails:Line[][]=[];
 for(const component of components){
  const componentLines=component.map(e=>byId.get(e.lineId)!).filter(Boolean);
  trails.push(...minimumTrailsForComponent(componentLines,component));
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
