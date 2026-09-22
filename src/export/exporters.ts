import{PDFDocument,StandardFonts,rgb}from'pdf-lib';import JSZip from'jszip';import{saveAs}from'file-saver';import type{Project,Line,ProductionPlan,ProductionStep}from'../types';
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
function fallbackProductionPlan(p:Project):ProductionPlan{
 const ordered=[...p.lines];
 const steps:ProductionStep[]=ordered.map((l,i)=>({
  id:'export-'+l.id,index:i+1,lineId:l.id,
  action:l.closed?'CLOSE':i===0?'DRAW':'LIFT',
  lengthMm:Math.round((l.points.slice(1).reduce((n,q,j)=>n+Math.hypot((q.x-l.points[j].x)*p.widthMm,(q.y-l.points[j].y)*p.heightMm),0))*10)/10,
  start:l.points[0],end:l.points[l.points.length-1],penLiftBefore:i>0,note:i===0?'Start from this endpoint and maintain a steady syrup flow.':'Lift cleanly, reposition to the next start point, then continue.'
 }));
 return {id:'export-plan',createdAt:Date.now(),estimatedPenLifts:Math.max(0,steps.length-1),totalLengthMm:steps.reduce((n,s)=>n+s.lengthMm,0),steps,summary:[]};
}
function effectiveProductionPlan(p:Project){return p.productionPlan??fallbackProductionPlan(p)}
export async function planPdfBytes(p:Project){
 const doc=await PDFDocument.create();
 const font=await doc.embedFont(StandardFonts.Helvetica); const plan=effectiveProductionPlan(p);
 const pageW=792,pageH=612,margin=24;
 const page=doc.addPage([pageW,pageH]);
 page.drawRectangle({x:18,y:18,width:pageW-36,height:pageH-36,borderWidth:.8,borderColor:rgb(.22,.23,.26)});page.drawText('SUGAR DRAW PRODUCTION PLAN',{x:margin,y:pageH-margin,size:20,font,color:rgb(.08,.08,.1)});
 page.drawText(p.name.slice(0,70),{x:margin,y:pageH-margin-24,size:11,font,color:rgb(.3,.3,.34)});
 page.drawText('WORKING DRAWING · PATH ORDER · SUPPORT DETAILS',{x:margin,y:pageH-margin-48,size:9,font,color:rgb(.35,.35,.4)});
 const frameX=margin,frameY=104,frameW=pageW-margin*2,frameH=440;
 page.drawRectangle({x:frameX,y:frameY,width:frameW,height:frameH,borderWidth:1,borderColor:rgb(.65,.66,.7)});
 const rotateArtwork=p.heightMm>p.widthMm;
 const artW=rotateArtwork?p.heightMm:p.widthMm,artH=rotateArtwork?p.widthMm:p.heightMm;
 const scale=Math.min((frameW-18)/artW,(frameH-18)/artH);
 const ox=frameX+(frameW-artW*scale)/2,oy=frameY+(frameH-artH*scale)/2;
 page.drawRectangle({x:ox,y:oy,width:artW*scale,height:artH*scale,borderWidth:.5,borderColor:rgb(.82,.83,.86)});
 const displayPoint=(q:{x:number;y:number})=>rotateArtwork?{x:(.5-q.y),y:q.x+.5}:{x:q.x+.5,y:q.y+.5};
 const px=(q:{x:number;y:number})=>ox+displayPoint(q).x*artW*scale;
 const py=(q:{x:number;y:number})=>oy+displayPoint(q).y*artH*scale;
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
 const dimGap=12;
 pdfDimLine(page,ox,oy-dimGap,ox+artW*scale,oy-dimGap,artW.toFixed(1)+' mm',font);
 pdfDimLine(page,ox-dimGap,oy,ox-dimGap,oy+artH*scale,artH.toFixed(1)+' mm',font);
 page.drawText('Scale 1:'+Math.max(1,Math.round(1/scale)).toString(),{x:margin,y:86,size:7,font,color:rgb(.45,.45,.48)});
 page.drawText('UNITS: mm · REV: A · '+(rotateArtwork?'VIEW ROTATED 90°':'NATIVE ORIENTATION'),{x:pageW-270,y:86,size:7,font,color:rgb(.35,.35,.4)});
 let y=72;
 const tbX=pageW-330,tbY=20,tbW=306,tbH=62;
 page.drawRectangle({x:tbX,y:tbY,width:tbW,height:tbH,borderWidth:.7,borderColor:rgb(.35,.36,.4)});
 page.drawText('SugarDraw · PRODUCTION PLAN',{x:tbX+8,y:tbY+43,size:9,font});
 page.drawText(p.name.slice(0,42),{x:tbX+8,y:tbY+31,size:8,font});
 page.drawText('SIZE  '+p.widthMm.toFixed(1)+' × '+p.heightMm.toFixed(1)+' mm',{x:tbX+8,y:tbY+18,size:7,font});
 page.drawText('PATH  '+plan.totalLengthMm.toFixed(1)+' mm',{x:tbX+130,y:tbY+18,size:7,font});
 page.drawText('LINES  '+p.lines.length+'   STICKS  '+p.sticks.length+'   WARNINGS  '+p.warnings.length,{x:tbX+8,y:tbY+7,size:6.5,font,color:rgb(.4,.4,.44)});
 page.drawText('DWG TYPE: SUGAR ART FABRICATION',{x:margin,y:58,size:7,font,color:rgb(.35,.35,.4)});
 page.drawText('Verify temperature, viscosity, adhesion and support strength before fabrication.',{x:margin,y:46,size:6.2,font,color:rgb(.4,.4,.44)});
 page.drawText('Structural analysis is geometric/heuristic; not a material mechanics simulation.',{x:margin,y:34,size:6.2,font,color:rgb(.45,.45,.48)});


 // Page 2: detailed step-by-step production instructions.
 let detail=doc.addPage([pageW,pageH]);
 let stepPage=0;
 const newStepPage=()=>{
  detail=doc.addPage([pageW,pageH]);
  stepPage++;
  detail.drawText('SUGAR DRAW · DETAILED PRODUCTION STEPS',{x:margin,y:pageH-margin,size:18,font,color:rgb(.08,.08,.1)});
  detail.drawText(p.name.slice(0,70),{x:margin,y:pageH-margin-22,size:10,font,color:rgb(.3,.3,.34)});
  detail.drawText('Steps '+(stepPage*18-17)+'–'+Math.min(stepPage*18,plan.steps.length)+' of '+plan.steps.length,{x:pageW-margin-150,y:pageH-margin-22,size:8,font,color:rgb(.4,.4,.44)});
  detail.drawText('Path sequence, segment length, nodes and pen-lift guidance',{x:margin,y:pageH-margin-48,size:9,font,color:rgb(.35,.35,.4)});
  detail.drawText('STEP',{x:margin,y:pageH-margin-70,size:8,font});
  detail.drawText('LINE / LENGTH',{x:90,y:pageH-margin-70,size:8,font});
  detail.drawText('START NODE',{x:220,y:pageH-margin-70,size:8,font});
  detail.drawText('END NODE',{x:325,y:pageH-margin-70,size:8,font});
  detail.drawText('ACTION',{x:430,y:pageH-margin-70,size:8,font});
  detail.drawText('Page '+(stepPage+1)+' · Steps '+(stepPage*18-17)+'–'+Math.min(stepPage*18,plan.steps.length),{x:margin,y:24,size:7,font,color:rgb(.45,.45,.48)});
 };
 const segLength=(l:Line)=>{let n=0;for(let i=1;i<l.points.length;i++)n+=Math.hypot((l.points[i].x-l.points[i-1].x)*p.widthMm,(l.points[i].y-l.points[i-1].y)*p.heightMm);return n};
 const endpointConnections=(l:Line,at:'start'|'end')=>p.connections.filter(c=>(c.a===l.id&&c.aEnd===at)||(c.b===l.id&&c.bEnd===at)).length;
 const firstStepPage=()=>{
  stepPage=0;
  detail=doc.addPage([pageW,pageH]);
  detail.drawText('SUGAR DRAW · DETAILED PRODUCTION STEPS',{x:margin,y:pageH-margin,size:18,font,color:rgb(.08,.08,.1)});
  detail.drawText(p.name.slice(0,70),{x:margin,y:pageH-margin-22,size:10,font,color:rgb(.3,.3,.34)});
  detail.drawText('Steps 1–'+Math.min(18,plan.steps.length)+' of '+plan.steps.length,{x:pageW-margin-150,y:pageH-margin-22,size:8,font,color:rgb(.4,.4,.44)});
  detail.drawText('Path sequence, segment length, nodes and pen-lift guidance',{x:margin,y:pageH-margin-48,size:9,font,color:rgb(.35,.35,.4)});
  detail.drawText('STEP',{x:margin,y:pageH-margin-70,size:8,font});
  detail.drawText('LINE / LENGTH',{x:90,y:pageH-margin-70,size:8,font});
  detail.drawText('START NODE',{x:220,y:pageH-margin-70,size:8,font});
  detail.drawText('END NODE',{x:325,y:pageH-margin-70,size:8,font});
  detail.drawText('ACTION',{x:430,y:pageH-margin-70,size:8,font});
  detail.drawText('Page 2 · Steps 1–'+Math.min(18,plan.steps.length),{x:margin,y:24,size:7,font,color:rgb(.45,.45,.48)});
 };
 firstStepPage();
 let dy=pageH-margin-88;
 plan.steps.forEach((step,idx)=>{
  if(idx>0&&idx%18===0){newStepPage();dy=pageH-margin-88}
  const l=p.lines.find(v=>v.id===step.lineId);
  const start=step.start,end=step.end;
  const bx=margin,by=dy-8,bw=43,bh=32;
  detail.drawRectangle({x:bx,y:by,width:bw,height:bh,borderWidth:.5,borderColor:rgb(.78,.79,.82)});
  if(l&&l.points.length>1){
   const xs=l.points.map(q=>q.x),ys=l.points.map(q=>q.y),minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
   const ss=Math.min(35/Math.max(.001,maxX-minX),24/Math.max(.001,maxY-minY));
   const tx=(q:{x:number;y:number})=>bx+4+(q.x-minX)*ss+(35-(maxX-minX)*ss)/2;
   const ty=(q:{x:number;y:number})=>by+4+(maxY-q.y)*ss+(24-(maxY-minY)*ss)/2;
   for(let j=1;j<l.points.length;j++){const a=l.points[j-1],b=l.points[j];detail.drawLine({start:{x:tx(a),y:ty(a)},end:{x:tx(b),y:ty(b)},thickness:1,color:rgb(.08,.08,.09)})}
   detail.drawCircle({x:tx(l.points[0]),y:ty(l.points[0]),size:2.5,color:rgb(.1,.55,.35)});
   detail.drawCircle({x:tx(l.points[l.points.length-1]),y:ty(l.points[l.points.length-1]),size:2.5,color:rgb(.75,.25,.2)});
  }
  detail.drawText(String(step.index),{x:margin+48,y:dy+8,size:8,font});
  detail.drawText((step.action+' · '+step.lengthMm.toFixed(1)+' mm').slice(0,24),{x:90,y:dy+8,size:8,font});
  detail.drawText(('('+start.x.toFixed(3)+', '+start.y.toFixed(3)+')').slice(0,31),{x:220,y:dy+8,size:7,font});
  detail.drawText(('('+end.x.toFixed(3)+', '+end.y.toFixed(3)+')').slice(0,31),{x:325,y:dy+8,size:7,font});
  detail.drawText(step.penLiftBefore?'LIFT':'START',{x:430,y:dy+8,size:7,font});
  detail.drawText((step.note||'').slice(0,74),{x:90,y:dy-3,size:6,font,color:rgb(.45,.45,.48)});
  dy-=42;
 });
 // Page 3: materials and production parameters.
 const materials=doc.addPage([pageW,pageH]);
 materials.drawText('SUGAR DRAW · MATERIALS & PRODUCTION PARAMETERS',{x:margin,y:pageH-margin,size:18,font,color:rgb(.08,.08,.1)});
 materials.drawText(p.name.slice(0,70),{x:margin,y:pageH-margin-22,size:10,font,color:rgb(.3,.3,.34)});
 let my=pageH-margin-54;
 const pathLengthMm=plan.totalLengthMm;
 const segmentCount=p.lines.reduce((n,l)=>n+Math.max(0,l.points.length-1),0);
 const connectionAccepted=p.connections.filter(x=>x.status==='accepted').length;
 const connectionPending=p.connections.filter(x=>x.status==='pending').length;
 const connectionRejected=p.connections.filter(x=>x.status==='rejected').length;
 const liftCount=plan.estimatedPenLifts;
 const recommendedSticks=p.sticks.filter(x=>x.kind==='recommended').length;
 const minWidth=Math.min(...p.lines.map(x=>x.width).filter(x=>Number.isFinite(x)),p.settings.minWidthMm);
 const maxWidth=Math.max(...p.lines.map(x=>x.width).filter(x=>Number.isFinite(x)),p.settings.minWidthMm);
 materials.drawText('PRODUCTION SUMMARY',{x:margin,y:my,size:11,font});my-=20;
 const summary=[
  ['Drawing size',p.widthMm.toFixed(1)+' × '+p.heightMm.toFixed(1)+' mm'],
  ['Total sugar path',pathLengthMm.toFixed(1)+' mm'],
  ['Line objects',String(p.lines.length)],
  ['Path segments',String(segmentCount)],
  ['Line width range',minWidth.toFixed(3)+' – '+maxWidth.toFixed(3)],
  ['Estimated pen lifts',String(liftCount)],
  ['Accepted connections',String(connectionAccepted)],
  ['Pending / rejected',connectionPending+' / '+connectionRejected],
  ['Support sticks',String(p.sticks.length)],
  ['Recommended sticks',String(recommendedSticks)],
  ['Warnings',String(p.warnings.length)]
 ];
 summary.forEach(([k,v])=>{materials.drawText(k,{x:margin,y:my,size:9,font});materials.drawText(v,{x:250,y:my,size:9,font});my-=16});
 my-=10;materials.drawText('MATERIAL / SETUP CHECKLIST',{x:margin,y:my,size:11,font});my-=18;
 const checklist=[
  'Sugar medium: prepare enough for the calculated path length plus process loss.',
  'Applicator/nozzle: select a tip that can reliably maintain the configured minimum line width.',
  'Base sheet: use a clean, level, heat-safe working surface.',
  'Support sticks: prepare at least '+recommendedSticks+' recommended support sticks; verify actual fit manually.',
  'Keep the production drawing visible and follow the numbered path sequence.'
 ];
 checklist.forEach((t,i)=>{materials.drawText((i+1)+'. '+t.slice(0,92),{x:margin,y:my,size:8,font});my-=14});
 my-=10;materials.drawText('SUPPORT STICK SCHEDULE',{x:margin,y:my,size:11,font});my-=17;
 if(!p.sticks.length){materials.drawText('No support sticks were recommended by the current geometric analysis.',{x:margin,y:my,size:8,font});my-=14}
 p.sticks.slice(0,20).forEach((st,i)=>{materials.drawText('S'+(i+1)+'  '+st.kind+'  '+st.length.toFixed(1)+' mm  angle '+st.angle.toFixed(1)+'°  score '+Math.round(st.score),{x:margin,y:my,size:8,font});my-=13});
 my-=8;materials.drawText('RISK / VERIFICATION NOTES',{x:margin,y:my,size:11,font});my-=17;
 const notes=[
  'Structural warnings are geometric heuristics, not material-strength calculations.',
  'Connection candidates are geometric suggestions; confirm adhesion and joint strength during fabrication.',
  'Actual sugar viscosity, temperature, cooling time and stick adhesion can change the practical result.',
  'Do not treat the calculated stick score as a guaranteed load-bearing capacity.'
 ];
 notes.forEach(t=>{materials.drawText('• '+t.slice(0,95),{x:margin,y:my,size:8,font});my-=14});
 materials.drawText('Generated by SugarDraw · verify all physical parameters before production.',{x:margin,y:24,size:7,font,color:rgb(.45,.45,.48)});
 let ey=dy-8;
 if(ey<78){detail=doc.addPage([pageW,pageH]);detail.drawText('SUGAR DRAW · PEN CONTROL & PRODUCTION NOTES',{x:margin,y:pageH-margin,size:18,font,color:rgb(.08,.08,.1)});ey=pageH-margin-48}
 detail.drawText('PEN CONTROL',{x:margin,y:ey,size:10,font});ey-=15;
 detail.drawText('START: begin at the numbered start node. CONTINUE: keep contact through accepted connections. LIFT: lift the tool after an open endpoint with no accepted connection.',{x:margin,y:ey,size:7,font});ey-=13;
 detail.drawText('Connection suggestions are geometric; manually verify every joint before production.',{x:margin,y:ey,size:7,font,color:rgb(.45,.45,.48)});
 return await doc.save()
}
export async function planPdf(p:Project){
 const bytes=await planPdfBytes(p);
 saveAs(new Blob([bytes as unknown as BlobPart],{type:'application/pdf'}),p.name+'-plan.pdf')
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