import type{Point}from'../types';

/** Project coordinates are normalized to [-0.5, 0.5] on each axis. */
export function pxPerMm(canvasWidth:number,canvasHeight:number,widthMm:number,heightMm:number){
 const mobile=typeof window!=='undefined'&&window.innerWidth<=850;
 if(mobile){
  // Mobile uses the available width as the primary drawing scale. The workspace
  // itself is the viewport; the drawing has no page/frame boundary and can pan freely.
  const fit=Math.max(260,canvasWidth*.90);
  return fit/Math.max(.001,widthMm);
 }
 const fit=Math.min(700,Math.max(420,Math.min(canvasWidth,canvasHeight)*.42));
 return fit/Math.max(.001,widthMm,heightMm);
}
export function projectScales(canvasWidth:number,canvasHeight:number,widthMm:number,heightMm:number){
 const ppm=pxPerMm(canvasWidth,canvasHeight,widthMm,heightMm);
 return {ppm,sx:widthMm*ppm,sy:heightMm*ppm};
}
export function normalizedToMm(p:Point,widthMm:number,heightMm:number){return{x:p.x*widthMm,y:p.y*heightMm};}
export function mmToNormalized(p:Point,widthMm:number,heightMm:number){return{x:p.x/Math.max(.001,widthMm),y:p.y/Math.max(.001,heightMm)};}
export function distanceMm(a:Point,b:Point,widthMm:number,heightMm:number){const dx=(b.x-a.x)*widthMm,dy=(b.y-a.y)*heightMm;return Math.hypot(dx,dy);}
export function polylineLengthMm(points:Point[],widthMm:number,heightMm:number){return points.slice(1).reduce((sum,b,i)=>sum+distanceMm(points[i],b,widthMm,heightMm),0);}
export function lineLengthMm(points:Point[],widthMm:number,heightMm:number){return polylineLengthMm(points,widthMm,heightMm);}
export function supportStickEndpoint(s:{x:number;y:number;length:number;angle:number},widthMm:number,heightMm:number){const a=s.angle*Math.PI/180;return{x:s.x+Math.cos(a)*s.length/Math.max(.001,widthMm),y:s.y+Math.sin(a)*s.length/Math.max(.001,heightMm)};}
