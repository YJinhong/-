import{PDFDocument,StandardFonts,rgb}from'pdf-lib';import JSZip from'jszip';import{saveAs}from'file-saver';import type{Project}from'../types';
import{supportStickEndpoint}from'../geometry/units';
export function svg(project:Project){const w=project.widthMm,h=project.heightMm;const body=project.lines.map(l=>'<polyline fill="none" stroke="black" stroke-linecap="round" stroke-linejoin="round" stroke-width="'+l.width+'" points="'+l.points.map(p=>((p.x+.5)*w)+','+((p.y+.5)*h)).join(' ')+'"/>').join('');const sticks=project.sticks.map(s=>{const a=s.angle*Math.PI/180;const endpoint=supportStickEndpoint(s,w,h),x2=endpoint.x,y2=endpoint.y;return '<line x1="'+((s.x+.5)*w)+'" y1="'+((s.y+.5)*h)+'" x2="'+((x2+.5)*w)+'" y2="'+((y2+.5)*h)+'" stroke="#36c275" stroke-width="1.2" stroke-dasharray="3 2"/>'}).join('');return '<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg" width="'+w+'mm" height="'+h+'mm" viewBox="0 0 '+w+' '+h+'"><rect width="100%" height="100%" fill="white"/>'+body+sticks+'</svg>'}
export function downloadSvg(p:Project){saveAs(new Blob([svg(p)],{type:'image/svg+xml'}),p.name+'.svg')}
export async function downloadPng(p:Project){const img=new Image();img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg(p));await new Promise<void>((resolve,reject)=>{img.onload=()=>resolve();img.onerror=()=>reject(new Error('Unable to render SVG to PNG'))});const scale=3,w=Math.max(1,Math.round(p.widthMm*scale)),h=Math.max(1,Math.round(p.heightMm*scale)),c=document.createElement('canvas');c.width=w;c.height=h;c.getContext('2d')!.drawImage(img,0,0,w,h);c.toBlob(b=>b?saveAs(b,p.name+'.png'):undefined,'image/png')}
function planText(p:Project){return ['SUGAR DRAW PRODUCTION PLAN','Project: '+p.name,'Size: '+p.widthMm+' × '+p.heightMm+' mm','Line segments: '+p.lines.length,'Total path length: '+p.lines.reduce((a,l)=>a+l.points.slice(1).reduce((n,q,i)=>n+Math.hypot((q.x-l.points[i].x)*p.widthMm,(q.y-l.points[i].y)*p.heightMm),0),0).toFixed(1)+' mm','Minimum line width setting: '+p.settings.minWidthMm+' mm','Support sticks: '+p.sticks.length,'Warnings: '+p.warnings.length,'','SUPPORT STICKS',...p.sticks.map((s,i)=>'#'+(i+1)+' · '+s.kind+' · '+Math.round(s.length)+' mm · '+Math.round(s.angle)+'° · score '+Math.round(s.score)),'','WARNINGS',...p.warnings.map(w=>w.severity.toUpperCase()+': '+w.message),'','NOTE: Structural analysis is geometric/heuristic and is not a material mechanics simulation.'].join('\n')}
export async function planPdf(p:Project){
 const doc=await PDFDocument.create();
 const font=await doc.embedFont(StandardFonts.Helvetica);
 const pageW=595,pageH=842,margin=36;
 const page=doc.addPage([pageW,pageH]);
 let y=pageH-margin;
 page.drawText('SUGAR DRAW PRODUCTION PLAN',{x:margin,y,size:20,font,color:rgb(.08,.08,.1)});
 y-=24;
 page.drawText(p.name.slice(0,70),{x:margin,y,size:11,font,color:rgb(.3,.3,.34)});
 y-=24;
 page.drawText('WORKING DRAWING',{x:margin,y,size:9,font,color:rgb(.35,.35,.4)});
 y-=12;
 const frameX=margin,frameY=300,frameW=pageW-margin*2,frameH=360;
 page.drawRectangle({x:frameX,y:frameY,width:frameW,height:frameH,borderWidth:1,borderColor:rgb(.65,.66,.7)});
 const sx=frameW/p.widthMm,sy=frameH/p.heightMm,scale=Math.min(sx,sy);
 const ox=frameX+(frameW-p.widthMm*scale)/2,oy=frameY+(frameH-p.heightMm*scale)/2;
 page.drawRectangle({x:ox,y:oy,width:p.widthMm*scale,height:p.heightMm*scale,borderWidth:.5,borderColor:rgb(.82,.83,.86)});
 const px=(q:{x:number;y:number})=>ox+(q.x+.5)*p.widthMm*scale;
 const py=(q:{x:number;y:number})=>oy+(q.y+.5)*p.heightMm*scale;
 for(const l of p.lines){
  for(let i=1;i<l.points.length;i++){
   const a=l.points[i-1],b=l.points[i];
   page.drawLine({start:{x:px(a),y:py(a)},end:{x:px(b),y:py(b)},thickness:Math.max(.6,Math.min(5,l.width*scale)),color:rgb(.05,.05,.06)});
  }
 }
 for(const s of p.sticks){
  const e=supportStickEndpoint(s,p.widthMm,p.heightMm);
  page.drawLine({start:{x:px(s),y:py(s)},end:{x:px(e),y:py(e)},thickness:.8,color:rgb(.1,.65,.4),dashArray:[3,2]});
 }
 y=280;
 const cols=[margin,190,350,470];
 const header=['ITEM','VALUE','ITEM','VALUE'];
 header.forEach((t,i)=>page.drawText(t,{x:cols[i],y,size:8,font,color:rgb(.4,.4,.44)}));
 y-=14;
 const rows=[
  ['Canvas',p.widthMm+' × '+p.heightMm+' mm','Lines',String(p.lines.length)],
  ['Min width',p.settings.minWidthMm+' mm','Sticks',String(p.sticks.length)],
  ['Path length',p.lines.reduce((a,l)=>a+l.points.slice(1).reduce((n,q,i)=>n+Math.hypot((q.x-l.points[i].x)*p.widthMm,(q.y-l.points[i].y)*p.heightMm),0),0).toFixed(1)+' mm','Warnings',String(p.warnings.length)],
 ];
 for(const row of rows){row.forEach((t,i)=>page.drawText(t.slice(0,24),{x:cols[i],y,size:9,font,color:rgb(.12,.12,.14)}));y-=15}
 y-=8;
 page.drawText('SUPPORT STICKS',{x:margin,y,size:10,font});y-=15;
 for(const s of p.sticks.slice(0,8)){page.drawText((s.kind+' · '+Math.round(s.length)+' mm · '+Math.round(s.angle)+'° · score '+Math.round(s.score)).slice(0,80),{x:margin,y,size:8,font});y-=12}
 y-=4;
 page.drawText('WARNINGS',{x:margin,y,size:10,font});y-=15;
 for(const w of p.warnings.slice(0,8)){page.drawText((w.severity.toUpperCase()+': '+w.message).slice(0,90),{x:margin,y,size:8,font});y-=12}
 page.drawText('Structural analysis is geometric/heuristic; it is not a material mechanics simulation.',{x:margin,y:24,size:7,font,color:rgb(.45,.45,.48)});
 saveAs(new Blob([await doc.save()],{type:'application/pdf'}),p.name+'-plan.pdf')
}
export function projectJson(p:Project){return JSON.stringify({version:1,exportedAt:new Date().toISOString(),project:p},null,2)}
export async function zipProjects(ps:Project[]){const z=new JSZip();for(const p of ps){z.file(p.name+'.svg',svg(p));const img=new Image();img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg(p));await new Promise<void>(r=>{img.onload=()=>r();img.onerror=()=>r()});const c=document.createElement('canvas'),scale=3;c.width=Math.max(1,Math.round(p.widthMm*scale));c.height=Math.max(1,Math.round(p.heightMm*scale));c.getContext('2d')!.drawImage(img,0,0,c.width,c.height);const png=await new Promise<Blob|null>(r=>c.toBlob(r,'image/png'));if(png)z.file(p.name+'.png',await png.arrayBuffer());const doc=await PDFDocument.create(),page=doc.addPage([595,842]),font=await doc.embedFont(StandardFonts.Helvetica);page.drawText('SUGAR DRAW PRODUCTION PLAN',{x:40,y:800,size:18,font});let y=770;for(const line of planText(p).split('\n').slice(1,42)){page.drawText(line.slice(0,105),{x:40,y,size:10,font});y-=16}z.file(p.name+'-plan.pdf',await doc.save());z.file(p.name+'.json',projectJson(p))}saveAs(await z.generateAsync({type:'blob'}),'SugarDraw_Export.zip')}