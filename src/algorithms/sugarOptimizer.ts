import type{Line,Point,OptimizationSettings}from'../types';import{dist,simplify}from'./geometry';
const poly=(p:Point[])=>p.slice(1).reduce((s,q,i)=>s+dist(p[i],q),0);
const area=(p:Point[])=>Math.abs(p.reduce((s,q,i)=>{const a=p[i-1]??p.at(-1)!;return s+a.x*q.y-q.x*a.y},0))/2;
const endpointDistance=(a:Line,b:Line)=>Math.min(dist(a.points[0],b.points[0]),dist(a.points[0],b.points.at(-1)!),dist(a.points.at(-1)!,b.points[0]),dist(a.points.at(-1)!,b.points.at(-1)!));
function cleanup(l:Line,s:OptimizationSettings){const pts=simplify(l.points,s.simplifyTolerance);const len=poly(pts);const closed=l.closed||dist(pts[0],pts.at(-1)!)<.012;return{...l,points:pts,closed,length:len,area:closed?area(pts):0}}
function connectionScore(a:Line,b:Line,s:OptimizationSettings){const d=endpointDistance(a,b),min=Math.min(poly(a.points),poly(b.points));const size=Math.max(.0001,min);const proximity=Math.max(0,1-d/Math.max(.0001,s.connectDistance));const sizeFactor=Math.min(1,size/.08);return proximity*.7+sizeFactor*.3}
export function optimize(lines:Line[],s:OptimizationSettings){
 const removed=lines.filter(l=>l.points.length<2||poly(l.points)<.006||l.width<s.minWidthMm/2);
 const out=lines.filter(l=>l.points.length>1&&poly(l.points)>=.006&&l.width>=s.minWidthMm/2).map(l=>cleanup({...l,width:Math.max(l.width,s.minWidthMm)},s));
 const candidates:{a:string;b:string;score:number}[]=[];
 for(let i=0;i<out.length;i++)for(let j=i+1;j<out.length;j++){const a=out[i],b=out[j],d=endpointDistance(a,b);if(d<=s.connectDistance){const score=connectionScore(a,b,s);if(score>=.35)candidates.push({a:a.id,b:b.id,score})}}
 return{lines:out,connections:candidates.sort((a,b)=>b.score-a.score),removed:removed.length}
}
export function sugarArtify(lines:Line[],s:OptimizationSettings){return optimize(lines,s)}
