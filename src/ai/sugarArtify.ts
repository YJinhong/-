import type{Line,OptimizationSettings}from'../types';
import{optimize}from'../algorithms/sugarOptimizer';
import{dist,simplify}from'../algorithms/geometry';

type Importance='primary'|'secondary'|'detail';

const pathLength=(pts:Line['points'])=>pts.slice(1).reduce((s,p,i)=>s+dist(pts[i],p),0);
const polygonArea=(pts:Line['points'])=>Math.abs(pts.reduce((s,p,i)=>{
  const a=pts[i-1]??pts.at(-1)!;
  return s+a.x*p.y-p.x*a.y;
},0))/2;
const bounds=(l:Line[])=>{
  const pts=l.flatMap(x=>x.points);
  if(!pts.length)return{x:0,y:0,w:1,h:1};
  const xs=pts.map(p=>p.x),ys=pts.map(p=>p.y);
  return{x:Math.min(...xs),y:Math.min(...ys),w:Math.max(...xs)-Math.min(...xs),h:Math.max(...ys)-Math.min(...ys)};
};
const center=(l:Line[])=>{
  const b=bounds(l);
  return{x:b.x+b.w/2,y:b.y+b.h/2};
};
const lineCenter=(l:Line)=>{
  const xs=l.points.map(p=>p.x),ys=l.points.map(p=>p.y);
  return{x:(Math.min(...xs)+Math.max(...xs))/2,y:(Math.min(...ys)+Math.max(...ys))/2};
};
const neighborDistance=(a:Line,b:Line)=>{
  let best=Infinity;
  for(const p of a.points)for(const q of b.points)best=Math.min(best,dist(p,q));
  return best;
};
const curvature=(l:Line)=>{
  if(l.points.length<3)return 0;
  let turns=0,total=0;
  for(let i=1;i<l.points.length-1;i++){
    const a=l.points[i-1],b=l.points[i],c=l.points[i+1];
    const u=Math.atan2(b.y-a.y,b.x-a.x),v=Math.atan2(c.y-b.y,c.x-b.x);
    let d=Math.abs(v-u);
    if(d>Math.PI)d=2*Math.PI-d;
    turns+=d;total++;
  }
  return total?turns/total:0;
};

function classify(lines:Line[]):Map<string,Importance>{
  const result=new Map<string,Importance>();
  if(!lines.length)return result;
  const total=lines.reduce((s,l)=>s+pathLength(l.points),0)||1;
  const maxLength=Math.max(...lines.map(l=>pathLength(l.points)),.001);
  const global=bounds(lines),subjectCenter=center(lines);
  const scale=Math.max(global.w,global.h,.1);
  const density=(l:Line)=>{
    let n=0;
    for(const other of lines)if(other!==l&&neighborDistance(l,other)<Math.max(.025,scale*.045))n++;
    return Math.min(1,n/5);
  };
  for(const l of lines){
    const len=pathLength(l.points);
    const area=l.closed?polygonArea(l.points):0;
    const box=bounds([l]);
    const compact=area>0?Math.min(1,area/Math.max(.0001,box.w*box.h)):0;
    const central=1-Math.min(1,dist(lineCenter(l),subjectCenter)/(scale*.72));
    const boundary=(box.w>=global.w*.55||box.h>=global.h*.55)?1:0;
    const long=Math.min(1,len/Math.max(.001,maxLength*.48));
    const substantial=Math.min(1,len/Math.max(.001,total*.045));
    const texturePenalty=curvature(l)>.75&&len<maxLength*.18?.22:0;
    const score=long*.27+substantial*.23+compact*.18+central*.10+boundary*.16+density(l)*.06-texturePenalty;
    const kind:Importance=score>=.52||boundary>0? 'primary':score>=.25?'secondary':'detail';
    result.set(l.id,kind);
  }
  return result;
}

function keepByDetail(kind:Importance,settings:OptimizationSettings,score:number){
  if(settings.detail==='low')return kind==='primary';
  if(settings.detail==='balanced')return kind!=='detail'||score>=.34;
  return kind!=='detail'||score>=.17;
}

export function sugarArtify(lines:Line[],settings:OptimizationSettings){
  const base=optimize(lines,settings).lines;
  if(!base.length)return{lines:[],removed:lines.length};
  const kinds=classify(base);
  const scores=new Map<string,number>();
  const total=base.reduce((s,l)=>s+pathLength(l.points),0)||1;
  const maxLength=Math.max(...base.map(l=>pathLength(l.points)),.001);
  for(const l of base){
    const len=pathLength(l.points);
    const score=Math.min(1,.55*(len/maxLength)+.45*(len/total));
    scores.set(l.id,score);
  }
  const kept=base.filter(l=>keepByDetail(kinds.get(l.id)??'detail',settings,scores.get(l.id)??0));
  const finalLines=kept.map(l=>{
    const pts=simplify(l.points,settings.simplifyTolerance);
    return{...l,points:pts,width:Math.max(settings.minWidthMm,l.width)};
  });
  return{lines:finalLines,removed:lines.length-finalLines.length};
}

export function sugarArtifyReport(lines:Line[],settings:OptimizationSettings){
  const result=sugarArtify(lines,settings);
  const kinds=classify(optimize(lines,settings).lines);
  return{...result,primary:[...kinds].filter(([,k])=>k==='primary').length,secondary:[...kinds].filter(([,k])=>k==='secondary').length,detail:[...kinds].filter(([,k])=>k==='detail').length};
}
