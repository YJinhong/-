import{PDFDocument,StandardFonts,rgb}from'pdf-lib';import JSZip from'jszip';import{saveAs}from'file-saver';import type{Project,Line}from'../types';
import{supportStickEndpoint}from'../geometry/units';
export function svg(project:Project){const w=project.widthMm,h=project.heightMm;const body=project.lines.map(l=>'<polyline fill="none" stroke="black" stroke-linecap="round" stroke-linejoin="round" stroke-width="'+l.width+'" points="'+l.points.map(p=>((p.x+.5)*w)+','+((p.y+.5)*h)).join(' ')+'"/>').join('');const sticks=project.sticks.map(s=>{const a=s.angle*Math.PI/180;const endpoint=supportStickEndpoint(s,w,h),x2=endpoint.x,y2=endpoint.y;return '<line x1="'+((s.x+.5)*w)+'" y1="'+((s.y+.5)*h)+'" x2="'+((x2+.5)*w)+'" y2="'+((y2+.5)*h)+'" stroke="#36c275" stroke-width="1.2" stroke-dasharray="3 2"/>'}).join('');return '<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg" width="'+w+'mm" height="'+h+'mm" viewBox="0 0 '+w+' '+h+'"><rect width="100%" height="100%" fill="white"/>'+body+sticks+'</svg>'}
export function downloadSvg(p:Project){saveAs(new Blob([svg(p)],{type:'image/svg+xml'}),p.name+'.svg')}
export async function downloadPng(p:Project){const img=new Image();img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg(p));await new Promise<void>((resolve,reject)=>{img.onload=()=>resolve();img.onerror=()=>reject(new Error('Unable to render SVG to PNG'))});const scale=3,w=Math.max(1,Math.round(p.widthMm*scale)),h=Math.max(1,Math.round(p.heightMm*scale)),c=document.createElement('canvas');c.width=w;c.height=h;c.getContext('2d')!.drawImage(img,0,0,w,h);c.toBlob(b=>b?saveAs(b,p.name+'.png'):undefined,'image/png')}
function planText(p:Project){return ['SUGAR DRAW PRODUCTION PLAN','Project: '+p.name,'Size: '+p.widthMm+' × '+p.heightMm+' mm','Line segments: '+p.lines.length,'Total path length: '+p.lines.reduce((a,l)=>a+l.points.slice(1).reduce((n,q,i)=>n+Math.hypot((q.x-l.points[i].x)*p.widthMm,(q.y-l.points[i].y)*p.heightMm),0),0).toFixed(1)+' mm','Minimum line width setting: '+p.settings.minWidthMm+' mm','Support sticks: '+p.sticks.length,'Warnings: '+p.warnings.length,'','SUPPORT STICKS',...p.sticks.map((s,i)=>'#'+(i+1)+' · '+s.kind+' · '+Math.round(s.length)+' mm · '+Math.round(s.angle)+'° · score '+Math.round(s.score)),'','WARNINGS',...p.warnings.map(w=>w.severity.toUpperCase()+': '+w.message),'','NOTE: Structural analysis is geometric/heuristic and is not a material mechanics simulation.'].join('\n')}
function pdfDimLine(page:any,x1:number,y1:number,x2:number,y2:number,label:string,font:any){
 const dx=x2-x1,dy=y2-y1,len=Math.hypot(dx,dy)||1,nx=-dy/len,ny=dx/len;
 page.drawLine({start:{x:x1,y:y1},end:{x:x2,y:y2},thickness:.55,color:rgb(.25,.25,.28)});
 page.drawLine({start:{x:x1-nx*4,y:y1-ny*4},end:{x:x1+nx*4,y:y1+ny*4},thickness:.55,color:rgb(.25,.25,.28)});
 page.drawLine({start:{x:x2-nx*4,y:y2-ny*4},end:{x:x2+nx*4,y:y2+ny*4},thickness:.55,color:rgb(.25,.25,.28)});
 const mx=(x1+x2)/2+nx*7,my=(y1+y2)/2+ny*7;
 page.drawText(label,{x:mx-font.widthOfTextAtSize(label,7)/2,y:my-2,size:7,font,color:rgb(.2,.2,.22)});
}
function pdfLabel(page:any,x:number,y:number,label:string,font:any){
 page.drawCircle({x,y,size:7,borderWidth:.6,borderColor:rgb(.15,.55,.35),color:rgb(.94,.98,.95)});
 page.drawText(label,{x:x-font.widthOfTextAtSize(label,6)/2,y:y-2,size:6,font,color:rgb(.08,.35,.22)});
}
export async function planPdfBytes(p:Project){
 const doc=await PDFDocument.create();
 const font=await doc.embedFont(StandardFonts.Helvetica);
 const pageW=595,pageH=842,margin=36;
 const page=doc.addPage([pageW,pageH]);
 page.drawText('SUGAR DRAW PRODUCTION PLAN',{x:margin,y:pageH-margin,size:20,font,color:rgb(.08,.08,.1)});
 page.drawText(p.name.slice(0,70),{x:margin,y:pageH-margin-24,size:11,font,color:rgb(.3,.3,.34)});
 page.drawText('WORKING DRAWING · PATH ORDER · SUPPORT DETAILS',{x:margin,y:pageH-margin-48,size:9,font,color:rgb(.35,.35,.4)});
 const frameX=margin,frameY=300,frameW=pageW-margin*2,frameH=360;
 page.drawRectangle({x:frameX,y:frameY,width:frameW,height:frameH,borderWidth:1,borderColor:rgb(.65,.66,.7)});
 const scale=Math.min(frameW/p.widthMm,frameH/p.heightMm);
 const ox=frameX+(frameW-p.widthMm*scale)/2,oy=frameY+(frameH-p.heightMm*scale)/2;
 page.drawRectangle({x:ox,y:oy,width:p.widthMm*scale,height:p.heightMm*scale,borderWidth:.5,borderColor:rgb(.82,.83,.86)});
 const px=(q:{x:number;y:number})=>ox+(q.x+.5)*p.widthMm*scale;
 const py=(q:{x:number;y:number})=>oy+(q.y+.5)*p.heightMm*scale;
 p.lines.forEach((l,idx)=>{
  for(let i=1;i<l.points.length;i++){const a=l.points[i-1],b=l.points[i];page.drawLine({start:{x:px(a),y:py(a)},end:{x:px(b),y:py(b)},thickness:Math.max(.6,Math.min(5,l.width*scale)),color:rgb(.05,.05,.06)})}
  if(l.points.length)pdfLabel(page,px(l.points[0]),py(l.points[0]),String(idx+1),font);
 });
 p.sticks.forEach((st,idx)=>{
  const en=supportStickEndpoint(st,p.widthMm,p.heightMm),x1=px(st),y1=py(st),x2=px(en),y2=py(en);
  page.drawLine({start:{x:x1,y:y1},end:{x:x2,y:y2},thickness:.8,color:rgb(.1,.65,.4),dashArray:[3,2]});
  const mx=(x1+x2)/2,my=(y1+y2)/2;pdfLabel(page,mx,my,'S'+(idx+1),font);
  const dx=x2-x1,dy=y2-y1,len=Math.hypot(dx,dy)||1,nx=-dy/len,ny=dx/len;
  page.drawText(st.length.toFixed(1)+' mm · '+st.angle.toFixed(1)+'°',{x:mx+nx*9,y:my+ny*9-2,size:6,font,color:rgb(.08,.42,.27)});
 });
 const dimGap=18;
 pdfDimLine(page,ox,oy-dimGap,ox+p.widthMm*scale,oy-dimGap,p.widthMm.toFixed(1)+' mm',font);
 pdfDimLine(page,ox-dimGap,oy,ox-dimGap,oy+p.heightMm*scale,p.heightMm.toFixed(1)+' mm',font);
 page.drawText('Scale: 1 drawing unit = '+scale.toFixed(2)+' pt/mm',{x:margin,y:286,size:7,font,color:rgb(.45,.45,.48)});
 let y=266;
 const cols=[margin,190,350,470];
 ['ITEM','VALUE','ITEM','VALUE'].forEach((t,i)=>page.drawText(t,{x:cols[i],y,size:8,font,color:rgb(.4,.4,.44)}));y-=14;
 const pathLength=p.lines.reduce((a,l)=>a+l.points.slice(1).reduce((n,q,i)=>n+Math.hypot((q.x-l.points[i].x)*p.widthMm,(q.y-l.points[i].y)*p.heightMm),0),0);
 const rows=[['Canvas',p.widthMm+' × '+p.heightMm+' mm','Lines',String(p.lines.length)],['Min width',p.settings.minWidthMm+' mm','Sticks',String(p.sticks.length)],['Path length',pathLength.toFixed(1)+' mm','Warnings',String(p.warnings.length)]];
 for(const row of rows){row.forEach((t,i)=>page.drawText(t.slice(0,24),{x:cols[i],y,size:9,font,color:rgb(.12,.12,.14)}));y-=15}
 y-=8;page.drawText('SUPPORT STICKS',{x:margin,y,size:10,font});y-=15;
 for(const st of p.sticks.slice(0,8)){page.drawText('S'+(p.sticks.indexOf(st)+1)+' · '+st.kind+' · '+st.length.toFixed(1)+' mm · '+st.angle.toFixed(1)+'° · score '+Math.round(st.score),{x:margin,y,size:8,font});y-=12}
 y-=4;page.drawText('DRAWING ORDER',{x:margin,y,size:10,font});y-=15;
 p.lines.slice(0,12).forEach((l,i)=>{page.drawText((i+1)+'. '+(l.closed?'closed path':'open path')+' · '+l.points.length+' points · '+l.width.toFixed(3)+' width',{x:margin,y,size:8,font});y-=12});
 y-=4;page.drawText('WARNINGS',{x:margin,y,size:10,font});y-=15;
 for(const w of p.warnings.slice(0,5)){page.drawText((w.severity.toUpperCase()+': '+w.message).slice(0,90),{x:margin,y,size:8,font});y-=12}
 page.drawText('Structural analysis is geometric/heuristic; it is not a material mechanics simulation.',{x:margin,y:24,size:7,font,color:rgb(.45,.45,.48)});

 // Page 2: detailed step-by-step production instructions.
 let detail=doc.addPage([pageW,pageH]);
 const stepPages=Math.max(1,Math.ceil(p.lines.length/18));
 let stepPage=0;
 const newStepPage=()=>{
  detail=doc.addPage([pageW,pageH]);
  stepPage++;
  detail.drawText('SUGAR DRAW · DETAILED PRODUCTION STEPS',{x:margin,y:pageH-margin,size:18,font,color:rgb(.08,.08,.1)});
  detail.drawText(p.name.slice(0,70),{x:margin,y:pageH-margin-22,size:10,font,color:rgb(.3,.3,.34)});
  detail.drawText('Steps '+(stepPage*18-17)+'–'+Math.min(stepPage*18,p.lines.length)+' of '+p.lines.length,{x:pageW-margin-150,y:pageH-margin-22,size:8,font,color:rgb(.4,.4,.44)});
  detail.drawText('Path sequence, segment length, nodes and pen-lift guidance',{x:margin,y:pageH-margin-48,size:9,font,color:rgb(.35,.35,.4)});
  detail.drawText('STEP',{x:margin,y:pageH-margin-70,size:8,font});
  detail.drawText('LINE / LENGTH',{x:90,y:pageH-margin-70,size:8,font});
  detail.drawText('START NODE',{x:220,y:pageH-margin-70,size:8,font});
  detail.drawText('END NODE',{x:325,y:pageH-margin-70,size:8,font});
  detail.drawText('ACTION',{x:430,y:pageH-margin-70,size:8,font});
  detail.drawText('Page '+(stepPage+1)+' · Steps '+(stepPage*18-17)+'–'+Math.min(stepPage*18,p.lines.length),{x:margin,y:24,size:7,font,color:rgb(.45,.45,.48)});
 };
 const segLength=(l:Line)=>{let n=0;for(let i=1;i<l.points.length;i++)n+=Math.hypot((l.points[i].x-l.points[i-1].x)*p.widthMm,(l.points[i].y-l.points[i-1].y)*p.heightMm);return n};
 const endpointConnections=(l:Line,at:'start'|'end')=>p.connections.filter(c=>(c.a===l.id&&c.aEnd===at)||(c.b===l.id&&c.bEnd===at)).length;
 const firstStepPage=()=>{
  stepPage=0;
  detail=doc.addPage([pageW,pageH]);
  detail.drawText('SUGAR DRAW · DETAILED PRODUCTION STEPS',{x:margin,y:pageH-margin,size:18,font,color:rgb(.08,.08,.1)});
  detail.drawText(p.name.slice(0,70),{x:margin,y:pageH-margin-22,size:10,font,color:rgb(.3,.3,.34)});
  detail.drawText('Steps 1–'+Math.min(18,p.lines.length)+' of '+p.lines.length,{x:pageW-margin-150,y:pageH-margin-22,size:8,font,color:rgb(.4,.4,.44)});
  detail.drawText('Path sequence, segment length, nodes and pen-lift guidance',{x:margin,y:pageH-margin-48,size:9,font,color:rgb(.35,.35,.4)});
  detail.drawText('STEP',{x:margin,y:pageH-margin-70,size:8,font});
  detail.drawText('LINE / LENGTH',{x:90,y:pageH-margin-70,size:8,font});
  detail.drawText('START NODE',{x:220,y:pageH-margin-70,size:8,font});
  detail.drawText('END NODE',{x:325,y:pageH-margin-70,size:8,font});
  detail.drawText('ACTION',{x:430,y:pageH-margin-70,size:8,font});
  detail.drawText('Page 2 · Steps 1–'+Math.min(18,p.lines.length),{x:margin,y:24,size:7,font,color:rgb(.45,.45,.48)});
 };
 firstStepPage();
 let dy=pageH-margin-88;
 p.lines.forEach((l,idx)=>{
  if(idx>0&&idx%18===0){newStepPage();dy=pageH-margin-88}
  const start=l.points[0],end=l.points[l.points.length-1],len=segLength(l),sc=endpointConnections(l,'start'),ec=endpointConnections(l,'end');
  const action=l.closed?'CLOSE':(ec>0?'CONTINUE':'LIFT');
  const bx=margin,by=dy-8,bw=43,bh=32;
  detail.drawRectangle({x:bx,y:by,width:bw,height:bh,borderWidth:.5,borderColor:rgb(.78,.79,.82)});
  if(l.points.length>1){
   const xs=l.points.map(q=>q.x),ys=l.points.map(q=>q.y),minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
   const ss=Math.min(35/Math.max(.001,maxX-minX),24/Math.max(.001,maxY-minY));
   const tx=(q:{x:number;y:number})=>bx+4+(q.x-minX)*ss+(35-(maxX-minX)*ss)/2;
   const ty=(q:{x:number;y:number})=>by+4+(maxY-q.y)*ss+(24-(maxY-minY)*ss)/2;
   for(let j=1;j<l.points.length;j++){const a=l.points[j-1],b=l.points[j];detail.drawLine({start:{x:tx(a),y:ty(a)},end:{x:tx(b),y:ty(b)},thickness:1,color:rgb(.08,.08,.09)})}
   detail.drawCircle({x:tx(l.points[0]),y:ty(l.points[0]),size:2.5,color:rgb(.1,.55,.35)});
   detail.drawCircle({x:tx(end),y:ty(end),size:2.5,color:rgb(.75,.25,.2)});
  }
  detail.drawText(String(idx+1),{x:margin+48,y:dy+8,size:8,font});
  detail.drawText(('L'+(idx+1)+' · '+len.toFixed(1)+' mm').slice(0,24),{x:90,y:dy+8,size:8,font});
  detail.drawText((start?('('+start.x.toFixed(3)+', '+start.y.toFixed(3)+') · '+sc+' link'):'—').slice(0,31),{x:220,y:dy+8,size:7,font});
  detail.drawText((end?('('+end.x.toFixed(3)+', '+end.y.toFixed(3)+') · '+ec+' link'):'—').slice(0,31),{x:325,y:dy+8,size:7,font});
  detail.drawText(action,{x:430,y:dy+8,size:7,font});
  detail.drawText('green=start · red=end',{x:90,y:dy-3,size:6,font,color:rgb(.45,.45,.48)});
  dy-=42;
 });
 const lastPage=detail;
 let ey=dy-8;
 if(ey<55)ey=55;
 detail.drawText('PEN CONTROL',{x:margin,y:ey,size:10,font});ey-=15;
 detail.drawText('START: begin at the numbered start node. CONTINUE: keep contact through accepted connections. LIFT: lift the tool after an open endpoint with no accepted connection.',{x:margin,y:ey,size:7,font});ey-=13;
 detail.drawText('Connection suggestions are geometric; manually verify every joint before production.',{x:margin,y:ey,size:7,font,color:rgb(.45,.45,.48)});
 return await doc.save()
}
export async function planPdf(p:Project){
 const bytes=await planPdfBytes(p);
 saveAs(new Blob([bytes],{type:'application/pdf'}),p.name+'-plan.pdf')
}
export function projectJson(p:Project){return JSON.stringify({version:1,exportedAt:new Date().toISOString(),project:p},null,2)}
export async function zipProjects(ps:Project[]){
 const z=new JSZip();
 for(const p of ps){
  z.file(p.name+'.svg',svg(p));
  const img=new Image();img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg(p));
  await new Promise<void>(r=>{img.onload=()=>r();img.onerror=()=>r()});
  const c=document.createElement('canvas'),scale=3;
  c.width=Math.max(1,Math.round(p.widthMm*scale));c.height=Math.max(1,Math.round(p.heightMm*scale));
  c.getContext('2d')!.drawImage(img,0,0,c.width,c.height);
  const png=await new Promise<Blob|null>(r=>c.toBlob(r,'image/png'));
  if(png)z.file(p.name+'.png',await png.arrayBuffer());
  z.file(p.name+'-plan.pdf',await planPdfBytes(p));
  z.file(p.name+'.json',projectJson(p));
 }
 saveAs(await z.generateAsync({type:'blob'}),'SugarDraw_Export.zip')
}