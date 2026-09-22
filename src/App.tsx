import{useEffect,useRef,useState}from'react';
import type{PointerEvent as ReactPointerEvent,ReactNode}from'react';
import{saveAs}from'file-saver';
import{Upload,Undo2,Redo2,Grid3X3,MousePointer2,PenTool,Link2,Ruler,Move,ZoomIn,Download,Sun,Moon,Play,Pause,Check,AlertTriangle,Layers,FolderOpen,CheckCircle2,XCircle,RefreshCw,Image as ImageIcon,Plus,Trash2}from'lucide-react';
import type{Line,Project,BatchJob,ConnectionCandidate,CADConstraint,ProductionPlan}from'./types';
import{optimize}from'./algorithms/sugarOptimizer';
import{sugarArtify}from'./ai/sugarArtify';
import{analyze,recommendSticks}from'./algorithms/structure';
import{minimumPenLiftPath,rebuildGraph,penLifts,totalPathLength}from'./algorithms/skeletonGraph';
import{findConnectionCandidates,applyConnections}from'./algorithms/connections';
import{saveProject,listProjects,deleteProject}from'./storage/projectStore';
import{projectScales,polylineLengthMm,supportStickEndpoint}from'./geometry/units';
import{downloadSvg,downloadPng,planPdf,zipProjects,projectJson}from'./export/exporters';
import{BatchProcessor}from'./batch/batchProcessor';
import{solveConstraints,diagnoseConstraints}from'./cad/constraintSolver';

const defaults={detail:'balanced' as const,minWidthMm:3.5,connectDistance:.06,simplifyTolerance:.015};
const blank=():Project=>({id:crypto.randomUUID(),name:'Untitled Sugar Art',createdAt:Date.now(),updatedAt:Date.now(),productionPlan:undefined,lines:[],widthMm:300,heightMm:250,settings:defaults,warnings:[],sticks:[],connections:[],history:[],constraints:[]});
const cloneLines=(lines:Line[])=>lines.map(l=>({...l,points:l.points.map(p=>({...p}))}));
const normalize=(p:Project):Project=>({...p,productionPlan:p.productionPlan??undefined,constraints:p.constraints??[],connections:p.connections??[],history:p.history??[],warnings:p.warnings??[],sticks:p.sticks??[],settings:{...defaults,...p.settings}});

export default function App(){
 const[menu,setMenu]=useState<'file'|'edit'|'view'|null>(null),[cursor,setCursor]=useState<'select'|'draw'|'connect'|'measure'|'pan'>('select'),[dark,setDark]=useState(true),[originalImage,setOriginalImage]=useState<HTMLImageElement|null>(null),[p,setP]=useState(blank),[projects,setProjects]=useState<Project[]>([]),[playing,setPlaying]=useState(false),[playIndex,setPlayIndex]=useState(0),[productionPlan,setProductionPlan]=useState<ProductionPlan|null>(null),[productionHydrated,setProductionHydrated]=useState(false),[productionSelected,setProductionSelected]=useState(0),[productionPreview,setProductionPreview]=useState(true),[zoom,setZoom]=useState(1),[grid,setGrid]=useState(true),[snap,setSnap]=useState(true),[batchOpen,setBatchOpen]=useState(false),[batchJobs,setBatchJobs]=useState<BatchJob[]>([]),[batchPaused,setBatchPaused]=useState(false),[batchFiles,setBatchFiles]=useState<File[]>([]),[viewMode,setViewMode]=useState<'result'|'original'|'overlay'>('result'),[overlayOpacity,setOverlayOpacity]=useState(.5),[selectedLine,setSelectedLine]=useState<string|null>(null),[selectedLines,setSelectedLines]=useState<string[]>([]),[relationLine,setRelationLine]=useState<string|null>(null),[selectionBox,setSelectionBox]=useState<{start:{x:number;y:number};end:{x:number;y:number}}|null>(null),[selectedNode,setSelectedNode]=useState<{lineId:string;index:number}|null>(null),[connectStart,setConnectStart]=useState<string|null>(null),[dragging,setDragging]=useState(false),[nodeDragging,setNodeDragging]=useState(false),[dragStart,setDragStart]=useState({x:0,y:0}),[showNodes,setShowNodes]=useState(true),[selectedGraphNode,setSelectedGraphNode]=useState<string|null>(null),[graphDragging,setGraphDragging]=useState(false),[graphDragLast,setGraphDragLast]=useState<{x:number;y:number}|null>(null),[selectedStick,setSelectedStick]=useState<string|null>(null),[stickDragging,setStickDragging]=useState(false),[measureStart,setMeasureStart]=useState<{x:number;y:number}|null>(null),[measureEnd,setMeasureEnd]=useState<{x:number;y:number}|null>(null),[cursorPoint,setCursorPoint]=useState<{x:number;y:number}|null>(null),[pan,setPan]=useState({x:0,y:0}),[panDragging,setPanDragging]=useState(false),[panStart,setPanStart]=useState({x:0,y:0}),[projectSearch,setProjectSearch]=useState(''),[projectSort,setProjectSort]=useState<'updated'|'name'>('updated'),[diagnosticHover,setDiagnosticHover]=useState<string|null>(null),[diagnosticFocus,setDiagnosticFocus]=useState<string|null>(null),[redoStack,setRedoStack]=useState<ReturnType<typeof snapshot>[]>([]),canvas=useRef<HTMLCanvasElement>(null),historyNavigation=useRef(false),raf=useRef<number|null>(null),batchProcessor=useRef<BatchProcessor|null>(null),batchFilesRef=useRef<File[]>([]);
 useEffect(()=>{listProjects().then(xs=>{const n=xs.map(normalize);setProjects(n);if(n.length){const first=n[0];setP(first);setProductionPlan(first.productionPlan??null);setProductionSelected(0)}setProductionHydrated(true)})},[]); useEffect(()=>{const onKey=(e:KeyboardEvent)=>{
  const mod=e.ctrlKey||e.metaKey;
  if(mod&&e.key.toLowerCase()==='z'){e.preventDefault();if(e.shiftKey)redo();else undo();return}
  if(mod&&e.key.toLowerCase()==='y'){e.preventDefault();redo();return}
  if(e.key==='Delete'||e.key==='Backspace'){if((e.target as HTMLElement)?.tagName==='INPUT')return;if(selectedLines.length){e.preventDefault();deleteSelected();}}
  if(productionPreview&&productionPlan&&(e.key==='ArrowLeft'||e.key==='ArrowRight')){e.preventDefault();const delta=e.key==='ArrowLeft'?-1:1;const next=Math.max(0,Math.min(productionPlan.steps.length-1,productionSelected+delta));const s=productionPlan.steps[next];if(s){setProductionSelected(next);focusProductionStep(s)}return}if(e.key==='Escape'){setSelectedLine(null);setSelectedLines([]);setRelationLine(null);setSelectedNode(null);setDiagnosticFocus(null);setDiagnosticHover(null)}
 };window.addEventListener('keydown',onKey);return()=>window.removeEventListener('keydown',onKey)},[p.history,selectedLines]);
 useEffect(()=>{if(historyNavigation.current){historyNavigation.current=false;return}setRedoStack([])},[p.updatedAt]);
 useEffect(()=>{if(!p.imageData){setOriginalImage(null);return}const img=new Image();img.onload=()=>setOriginalImage(img);img.src=p.imageData},[p.imageData]);
 useEffect(()=>{const t=window.setTimeout(()=>saveProject(p),250);setProjects(x=>[p,...x.filter(a=>a.id!==p.id)]);return()=>clearTimeout(t)},[p]); useEffect(()=>{if(!productionHydrated)return;setP(q=>{const same=(q.productionPlan?.id??null)===(productionPlan?.id??null)&&JSON.stringify(q.productionPlan?.steps??[])===JSON.stringify(productionPlan?.steps??[]);return same?q:{...q,productionPlan:productionPlan??undefined,updatedAt:Date.now()}})},[productionPlan,productionHydrated]);
 useEffect(()=>{if(!playing){if(raf.current)cancelAnimationFrame(raf.current);return}const order=minimumPenLiftPath(p.lines).order;let last=performance.now();const tick=(now:number)=>{const dt=Math.min(50,now-last);last=now;setPlayIndex(i=>{const speed=Math.max(1,order.length/18);const n=Math.min(order.length,i+dt/1000*speed);if(n>=order.length){setPlaying(false);return order.length}return n});raf.current=requestAnimationFrame(tick)};raf.current=requestAnimationFrame(tick);return()=>{if(raf.current)cancelAnimationFrame(raf.current)}},[playing,p.lines.length]);
 useEffect(()=>{const c=canvas.current;if(!c)return;const dpr=window.devicePixelRatio||1,w=c.clientWidth,h=c.clientHeight;c.width=w*dpr;c.height=h*dpr;const x=c.getContext('2d')!;x.setTransform(dpr,0,0,dpr,0,0);x.fillStyle=dark?'#101216':'#f4f5f7';x.fillRect(0,0,w,h);x.save();x.translate(w/2+pan.x,h/2+pan.y);x.scale(zoom,zoom);
  const {sx,sy,ppm}=projectScales(w,h,p.widthMm,p.heightMm);
  if(grid){const gridMm=10,stepX=gridMm*ppm,stepY=gridMm*ppm; x.strokeStyle=dark?'#272b32':'#d9dde4';x.lineWidth=1;const halfW=Math.max(700,w/(2*zoom)),halfH=Math.max(500,h/(2*zoom));for(let i=-Math.ceil(halfW/stepX)*stepX;i<=halfW;i+=stepX){x.beginPath();x.moveTo(i,-halfH);x.lineTo(i,halfH);x.stroke()}for(let i=-Math.ceil(halfH/stepY)*stepY;i<=halfH;i+=stepY){x.beginPath();x.moveTo(-halfW,i);x.lineTo(halfW,i);x.stroke()}}
  const drawLine=(l:Line,stroke='#171717',width=Math.max(1,l.width*ppm),alpha=1)=>{x.globalAlpha=alpha;x.strokeStyle=stroke;x.lineWidth=width;x.lineCap='round';x.lineJoin='round';x.beginPath();l.points.forEach((q,i)=>i?x.lineTo(q.x*sx,q.y*sy):x.moveTo(q.x*sx,q.y*sy));x.stroke();x.globalAlpha=1};
  if(originalImage&&viewMode!=='result'){const iw=originalImage.naturalWidth||originalImage.width,ih=originalImage.naturalHeight||originalImage.height,scale=Math.min(1400/iw,1000/ih),dw=iw*scale,dh=ih*scale;x.globalAlpha=viewMode==='overlay'?overlayOpacity:.92;x.drawImage(originalImage,-dw/2,-dh/2,dw,dh);x.globalAlpha=1}
  const canvasDiagnostics=diagnoseConstraints(p.lines,(p.constraints??[]),p.widthMm,p.heightMm,12);
  const canvasConflictIds=new Set(canvasDiagnostics.filter(d=>d.severity==='conflict').map(d=>d.id));
  const canvasWarningIds=new Set(canvasDiagnostics.filter(d=>d.severity==='warning').map(d=>d.id));
  const canvasLineIssues=new Map<string,{conflict:boolean;warning:boolean;ids:string[]}>();
  (p.constraints??[]).filter(v=>v.enabled!==false).forEach(v=>{
    const d=canvasDiagnostics.find(q=>q.id===v.id); if(!d||d.severity==='ok')return;
    const prev=canvasLineIssues.get(v.lineId)||{conflict:false,warning:false,ids:[]};
    prev.conflict ||= d.severity==='conflict'; prev.warning ||= d.severity==='warning'; prev.ids.push(v.id);
    canvasLineIssues.set(v.lineId,prev);
    if(v.referenceLineId){
      const ref=canvasLineIssues.get(v.referenceLineId)||{conflict:false,warning:false,ids:[]};
      ref.conflict ||= d.severity==='conflict'; ref.warning ||= d.severity==='warning'; ref.ids.push(v.id);
      canvasLineIssues.set(v.referenceLineId,ref);
    }
  });
  p.lines.forEach(l=>{
    const selected=selectedLines.includes(l.id), issue=canvasLineIssues.get(l.id), previewTarget=productionPlan?.steps[productionSelected]?.lineId, previewDim=productionPreview&&productionPlan&&!playing&&previewTarget&&previewTarget!==l.id;
    const issueStroke=issue?.conflict?'#ef5350':issue?.warning?'#f59e0b':undefined;
    drawLine(l,issueStroke??(selected?(dark?'#60a5fa':'#2563eb'):(dark?'#f1f3f5':'#171717')),issue?Math.max(3,l.width*2.2):(selected?Math.max(2.5,l.width*1.8):Math.max(1,l.width*1.5)),viewMode==='original'?.15:previewDim?.18:1);
    if(issue){
      x.save(); x.globalAlpha=diagnosticFocus&&issue.ids.includes(diagnosticFocus)?0.38:diagnosticHover&&issue.ids.includes(diagnosticHover)?0.30:0.16;
      x.strokeStyle=issueStroke!; x.lineWidth=Math.max(8,l.width*4); x.lineCap='round';
      x.beginPath(); l.points.forEach((q,i)=>i?x.lineTo(q.x*sx,q.y*sy):x.moveTo(q.x*sx,q.y*sy)); x.stroke();
      x.globalAlpha=1; x.fillStyle=issueStroke!;
      const a=l.points[0], b=l.points.at(-1)!;
      x.beginPath(); x.arc(a.x*sx,a.y*sy,6,0,Math.PI*2); x.fill();
      x.beginPath(); x.arc(b.x*sx,b.y*sy,6,0,Math.PI*2); x.fill();
      const label=(issue.conflict?'CONFLICT':'WARNING')+' · '+issue.ids.length;
      x.font='700 10px system-ui'; x.textAlign='left'; x.textBaseline='middle';
      x.fillText(label,a.x*sx+9,a.y*sy-9);
      x.restore();
    }
    if(selected){
      x.save();x.globalAlpha=.22;x.strokeStyle=dark?'#60a5fa':'#2563eb';x.lineWidth=Math.max(7,l.width*3);x.lineCap='round';x.beginPath();l.points.forEach((q,i)=>i?x.lineTo(q.x*sx,q.y*sy):x.moveTo(q.x*sx,q.y*sy));x.stroke();x.restore()
    }
  });  // Draw explicit A → B conflict relations between constraints and their geometry.
  const drawArrow=(ax:number,ay:number,bx:number,by:number,color:string,hoverId?:string)=>{
    const dx=bx-ax,dy=by-ay,len=Math.hypot(dx,dy)||1,ux=dx/len,uy=dy/len;
    const hot=hoverId?diagnosticHover===hoverId:false;
    x.save();x.strokeStyle=color;x.fillStyle=color;x.lineWidth=hot?3:2;x.globalAlpha=hot?.95:1;x.setLineDash([5,4]);
    x.beginPath();x.moveTo(ax,ay);x.lineTo(bx-ux*9,by-uy*9);x.stroke();x.setLineDash([]);
    const px=-uy,py=ux;x.beginPath();x.moveTo(bx,by);x.lineTo(bx-ux*9+px*4,by-uy*9+py*4);x.lineTo(bx-ux*9-px*4,by-uy*9-py*4);x.closePath();x.fill();x.restore();
  };
  canvasDiagnostics.filter(d=>d.severity!=='ok').forEach(d=>{
    const c=(p.constraints??[]).find(v=>v.id===d.id); if(!c)return;
    const owner=p.lines.find(v=>v.id===c.lineId); if(!owner)return;
    const a=owner.points[0],b=owner.points.at(-1)!;
    const ox=(a.x+b.x)*.5*sx,oy=(a.y+b.y)*.5*sy;
    const color=d.severity==='conflict'?'#ef5350':'#f59e0b';
    d.conflictingIds.filter(id=>id!==d.id).forEach(id=>{
      const rc=(p.constraints??[]).find(v=>v.id===id);
      const other=rc?.referenceLineId===c.lineId?p.lines.find(v=>v.id===rc?.lineId):rc?.lineId===c.referenceLineId?p.lines.find(v=>v.id===rc?.referenceLineId):rc?p.lines.find(v=>v.id===rc.lineId):undefined;
      if(!other)return;
      const q=other.points[0],r=other.points.at(-1)!;
      drawArrow(ox,oy,(q.x+r.x)*.5*sx,(q.y+r.y)*.5*sy,color,d.id);
    });
    const gx=ox,gy=oy-28;
    x.save();x.fillStyle=dark?'rgba(16,18,22,.9)':'rgba(255,255,255,.94)';x.beginPath();x.roundRect(gx-38,gy-9,76,18,5);x.fill();
    x.fillStyle=color;x.font='700 9px system-ui';x.textAlign='center';x.textBaseline='middle';
    const chainLabel=[d.id,...d.conflictingIds.filter(id=>id!==d.id).slice(0,2)].map(id=>{
      const rc=(p.constraints??[]).find(v=>v.id===id);
      return rc?constraintLabel(rc)+' '+rc.type:'geometry';
    });
    const labelText=chainLabel.length>1?chainLabel.join(' → '):constraintLabel(c)+' '+c.type+' → geometry';
    const maxChars=32,shortLabel=labelText.length>maxChars?labelText.slice(0,maxChars-1)+'…':labelText;
    const tw=x.measureText(shortLabel).width+14;
    x.fillStyle=dark?'rgba(16,18,22,.92)':'rgba(255,255,255,.96)';
    x.beginPath();x.roundRect(gx-tw/2,gy-10,tw,20,5);x.fill();
    x.fillStyle=color;x.fillText(shortLabel,gx,gy);x.restore();
  });
  const relationCad=p.lines.find(l=>l.id===relationLine);
  if(relationCad&&relationCad.points.length>1){const ra=relationCad.points[0],rb=relationCad.points.at(-1)!;x.save();x.strokeStyle=dark?'#60a5fa':'#2563eb';x.lineWidth=2.5;x.setLineDash([7,5]);x.beginPath();x.moveTo(ra.x*sx,ra.y*sy);x.lineTo(rb.x*sx,rb.y*sy);x.stroke();x.setLineDash([]);x.fillStyle=dark?'#60a5fa':'#2563eb';x.beginPath();x.arc(ra.x*sx,ra.y*sy,5,0,Math.PI*2);x.fill();x.restore()}
  const relationConstraints=(p.constraints??[]).filter(c=>(c.type==='parallel'||c.type==='perpendicular'||c.type==='equalLength')&&c.referenceLineId);
  relationConstraints.forEach(c=>{const owner=p.lines.find(l=>l.id===c.lineId);const other=p.lines.find(l=>l.id===c.referenceLineId);if(!owner||!other)return;const a=owner.points[0],b=owner.points.at(-1)!,q=other.points[0],r=other.points.at(-1)!;x.save();x.strokeStyle=c.type==='parallel'?(dark?'#22c55e':'#15803d'):c.type==='perpendicular'?(dark?'#a78bfa':'#7c3aed'):(dark?'#f97316':'#c2410c');x.lineWidth=2;x.setLineDash([3,4]);x.beginPath();x.moveTo(a.x*sx,a.y*sy);x.lineTo(q.x*sx,q.y*sy);x.stroke();x.setLineDash([]);x.fillStyle=x.strokeStyle;x.font='700 12px system-ui';x.fillText(c.type==='parallel'?'∥':c.type==='perpendicular'?'⊥':'=',(a.x*sx+q.x*sx)/2,(a.y*sy+q.y*sy)/2);x.restore()});
  const selectedCad=p.lines.find(l=>l.id===selectedLine);
  if(selectedCad&&selectedCad.points.length>1){
   const a=selectedCad.points[0],b=selectedCad.points.at(-1)!;
   const ax=a.x*sx,ay=a.y*sy,bx=b.x*sx,by=b.y*sy;
   const dx=(b.x-a.x)*p.widthMm,dy=(b.y-a.y)*p.heightMm,len=Math.hypot(dx,dy),ang=Math.atan2(dy,dx)*180/Math.PI;
   const ox=-(by-ay),oy=bx-ax,n=Math.hypot(ox,oy)||1,gap=22;
   const ex=ax+ox/n*gap,ey=ay+oy/n*gap,fx=bx+ox/n*gap,fy=by+oy/n*gap;
   x.save();x.strokeStyle=dark?'#f59e0b':'#9a6700';x.fillStyle=dark?'#f59e0b':'#9a6700';x.lineWidth=1.5;
   x.setLineDash([5,4]);x.beginPath();x.moveTo(ax,ay);x.lineTo(ex,ey);x.moveTo(bx,by);x.lineTo(fx,fy);x.stroke();x.setLineDash([]);
   x.beginPath();x.moveTo(ex,ey);x.lineTo(fx,fy);x.stroke();
   const arrow=(px:number,py:number,theta:number)=>{x.beginPath();x.moveTo(px,py);x.lineTo(px-8*Math.cos(theta-.45),py-8*Math.sin(theta-.45));x.lineTo(px-8*Math.cos(theta+.45),py-8*Math.sin(theta+.45));x.closePath();x.fill()};
   const theta=Math.atan2(fy-ey,fx-ex);arrow(ex,ey,theta);arrow(fx,fy,theta+Math.PI);
   const label=len.toFixed(1)+' mm',tw=x.measureText(label).width+16,mx=(ex+fx)/2,my=(ey+fy)/2-10;
   x.fillStyle=dark?'rgba(16,18,22,.94)':'rgba(255,255,255,.96)';x.beginPath();x.roundRect(mx-tw/2,my-10,tw,20,5);x.fill();x.fillStyle=dark?'#f1f3f5':'#171717';x.font='600 11px system-ui';x.textAlign='center';x.textBaseline='middle';x.fillText(label,mx,my);
   const activeConstraints=(p.constraints??[]).filter(v=>v.lineId===selectedCad.id),hasLength=activeConstraints.some(v=>v.type==='length'),hasAngle=activeConstraints.some(v=>v.type==='angle'),hasH=activeConstraints.some(v=>v.type==='horizontal'),hasV=activeConstraints.some(v=>v.type==='vertical'),hasX=activeConstraints.some(v=>v.type==='x'),hasY=activeConstraints.some(v=>v.type==='y');
   if((hasH&&hasV)||(hasLength&&hasH&&hasV)){x.fillStyle='#ef5350';x.font='700 11px system-ui';x.textAlign='left';x.fillText('Constraint conflict',Math.min(ax,bx)+12,Math.min(ay,by)-16)}
   if(hasLength&&Math.abs(len-(activeConstraints.find(v=>v.type==='length')?.value??len))>.2){x.fillStyle='#ef5350';x.font='700 11px system-ui';x.fillText('Length conflict',Math.min(ax,bx)+12,Math.min(ay,by)-30)}
   if(hasAngle&&Math.abs((((ang-(activeConstraints.find(v=>v.type==='angle')?.value??ang)+180)%360)-180))>.5){x.fillStyle='#ef5350';x.font='700 11px system-ui';x.fillText('Angle conflict',Math.min(ax,bx)+12,Math.min(ay,by)-44)}
   const angleLabel=ang.toFixed(1)+'°',atw=x.measureText(angleLabel).width+14;x.fillStyle=dark?'rgba(16,18,22,.94)':'rgba(255,255,255,.96)';x.beginPath();x.roundRect((ax+bx)/2-atw/2,(ay+by)/2+14,atw,20,5);x.fill();x.fillStyle=dark?'#f59e0b':'#9a6700';x.fillText(angleLabel,(ax+bx)/2,(ay+by)/2+24);
   x.restore();
  }

  p.connections.filter(c=>c.status==='pending').forEach(c=>{const a=p.lines.find(l=>l.id===c.a),b=p.lines.find(l=>l.id===c.b);if(!a||!b)return;const ap=c.aEnd==='start'?a.points[0]:a.points.at(-1)!,bp=c.bEnd==='start'?b.points[0]:b.points.at(-1)!;x.save();x.setLineDash([8,6]);x.strokeStyle='#d99b28';x.lineWidth=2;x.beginPath();x.moveTo(ap.x*sx,ap.y*sy);x.lineTo(bp.x*sx,bp.y*sy);x.stroke();x.setLineDash([]);x.fillStyle='#d99b28';x.beginPath();x.arc(ap.x*sx,ap.y*sy,5,0,Math.PI*2);x.fill();x.beginPath();x.arc(bp.x*sx,bp.y*sy,5,0,Math.PI*2);x.fill();x.restore()});
  // Structural-risk overlay: warnings are heuristic geometry checks, not material-strength calculations.
  p.warnings.forEach(w=>{
    const target=w.lineIds.map(id=>p.lines.find(l=>l.id===id)).find(Boolean);
    if(!target||!target.points.length)return;
    const mid=target.points[Math.floor((target.points.length-1)/2)]??target.points[0];
    const px=mid.x*sx,py=mid.y*sy;
    const high=w.severity==='high',color=high?'#ef5350':w.severity==='medium'?'#f59e0b':'#38bdf8';
    x.save();x.fillStyle=color;x.strokeStyle=dark?'#101216':'#fff';x.lineWidth=2;
    x.beginPath();x.moveTo(px,py-10);x.lineTo(px+10,py+8);x.lineTo(px-10,py+8);x.closePath();x.fill();x.stroke();
    x.fillStyle=dark?'#fff':'#111';x.font='700 11px system-ui';x.textAlign='center';x.textBaseline='middle';x.fillText('!',px,py+3);
    if(diagnosticHover===w.id||diagnosticFocus===w.id){
      const label=w.severity.toUpperCase()+' · '+w.message;
      const tw=Math.min(320,Math.max(120,x.measureText(label).width+18));
      x.fillStyle=dark?'rgba(16,18,22,.96)':'rgba(255,255,255,.97)';x.beginPath();x.roundRect(px-tw/2,py-34,tw,20,5);x.fill();
      x.fillStyle=color;x.fillText(label.slice(0,80),px,py-24);
    }
    x.restore();
  });
  if(showNodes){const graph=rebuildGraph(p.lines);graph.forEach(n=>{const selected=n.id===selectedGraphNode;const r=selected?9:n.degree>=3?7:n.degree===1?5:4;x.fillStyle=selected?'#ffffff':n.degree>=3?'#f59e0b':n.degree===1?'#38bdf8':'#a78bfa';x.strokeStyle=selected?'#f59e0b':dark?'#101216':'#f4f5f7';x.lineWidth=selected?3:2;x.beginPath();x.arc(n.point.x*sx,n.point.y*sy,r,0,Math.PI*2);x.fill();x.stroke();if(selected){x.strokeStyle='#f59e0b';x.beginPath();x.arc(n.point.x*sx,n.point.y*sy,14,0,Math.PI*2);x.stroke()}})}
  p.sticks.forEach(s=>{const selected=s.id===selectedStick,a=s.angle*Math.PI/180;x.strokeStyle=s.kind==='recommended'?'#36c275':s.kind==='avoid'?'#ef5350':'#e2aa2f';x.lineWidth=selected?7:5;x.beginPath();x.moveTo(s.x*sx,s.y*sy);x.lineTo(supportStickEndpoint(s,p.widthMm,p.heightMm).x*sx,supportStickEndpoint(s,p.widthMm,p.heightMm).y*sy);x.stroke();if(selected){x.strokeStyle='#fff';x.lineWidth=2;x.beginPath();x.arc(s.x*sx,s.y*sy,9,0,Math.PI*2);x.stroke()}});
  if(productionPreview&&productionPlan&&productionPlan.steps[productionSelected]&&!playing){const step=productionPlan.steps[productionSelected];const target=p.lines.find(l=>l.id===step.lineId);if(target){x.save();drawLine(target,'#6d5dfc',Math.max(4,target.width*2.2));const sp=target.points[0],ep=target.points.at(-1)!;const sxp=sp.x*sx,syp=sp.y*sy,exp=ep.x*sx,eyp=ep.y*sy;x.fillStyle='#35d07f';x.beginPath();x.arc(sxp,syp,8,0,Math.PI*2);x.fill();x.fillStyle='#ef5350';x.beginPath();x.arc(exp,eyp,8,0,Math.PI*2);x.fill();const q=target.points[Math.max(0,target.points.length-2)]??sp;const dx=(ep.x-q.x)*sx,dy=(ep.y-q.y)*sy,dl=Math.hypot(dx,dy)||1,ux=dx/dl,uy=dy/dl;const ax=exp-ux*13,ay=eyp-uy*13;x.strokeStyle='#6d5dfc';x.lineWidth=3;x.beginPath();x.moveTo(ax,ay);x.lineTo(exp,eyp);x.stroke();x.beginPath();x.moveTo(exp,eyp);x.lineTo(exp-ux*11-uy*6,eyp-uy*11+ux*6);x.moveTo(exp,eyp);x.lineTo(exp-ux*11+uy*6,eyp-uy*11-ux*6);x.stroke();if(step.penLiftBefore&&productionSelected>0){const prev=productionPlan.steps[productionSelected-1];const pl=p.lines.find(l=>l.id===prev.lineId);if(pl){const a0=pl.points.at(-1)!,b0=sp;const ax0=a0.x*sx,ay0=a0.y*sy,bx0=b0.x*sx,by0=b0.y*sy;x.setLineDash([6,5]);x.strokeStyle='#f5b642';x.lineWidth=2;x.beginPath();x.moveTo(ax0,ay0);x.lineTo(bx0,by0);x.stroke();x.setLineDash([]);x.fillStyle='#f5b642';x.font='bold 11px sans-serif';x.fillText('LIFT', (ax0+bx0)/2+5,(ay0+by0)/2-5)}}const stick=step.supportStickId&&p.sticks.find(s=>s.id===step.supportStickId);if(stick){const se=supportStickEndpoint(stick,p.widthMm,p.heightMm),sx1=stick.x*sx,sy1=stick.y*sy, sx2=se.x*sx,sy2=se.y*sy;x.strokeStyle='#ff9f43';x.lineWidth=6;x.beginPath();x.moveTo(sx1,sy1);x.lineTo(sx2,sy2);x.stroke();x.fillStyle='#ff9f43';x.beginPath();x.arc(sx1,sy1,6,0,Math.PI*2);x.fill()}x.fillStyle='#fff';x.strokeStyle='#222';x.lineWidth=3;x.font='bold 12px sans-serif';const label=step.index+'. '+step.action+' · '+step.lengthMm+' mm';const lx=Math.min(Math.max(8,sxp+10),c.clientWidth-170),ly=Math.max(20,syp-12);x.strokeText(label,lx,ly);x.fillText(label,lx,ly);x.font='10px sans-serif';x.fillStyle='#35d07f';x.fillText('START',sxp+10,syp-10);x.fillStyle='#ef5350';x.fillText('END',exp+10,eyp-10);if(stick)x.fillText('SUPPORT',stick.x*sx+10,stick.y*sy-10);x.restore()}}
 if(playing&&p.lines.length){const order=minimumPenLiftPath(p.lines).order;const count=Math.floor(playIndex),frac=playIndex-count;for(let i=0;i<count;i++)drawLine(order[i],'#6d5dfc',Math.max(2,order[i].width*2));if(count<order.length){const l=order[count],pts=l.points;drawLine(l,'#6d5dfc',Math.max(2,l.width*2),.25);if(pts.length>1){const segs=pts.slice(1).map((b,i)=>Math.hypot(b.x-pts[i].x,b.y-pts[i].y)),total=segs.reduce((a,b)=>a+b,0)||1;let target=total*frac,seg=0;while(seg<segs.length-1&&target>segs[seg])target-=segs[seg++];const a=pts[seg],b=pts[seg+1],u=target/(segs[seg]||1),q={x:a.x+(b.x-a.x)*u,y:a.y+(b.y-a.y)*u};x.fillStyle='#fff';x.beginPath();x.arc(q.x*sx,q.y*sy,6,0,Math.PI*2);x.fill()}}}
  if(selectionBox){const a=selectionBox.start,b=selectionBox.end;x.save();x.fillStyle=dark?'rgba(96,165,250,.10)':'rgba(37,99,235,.10)';x.strokeStyle=dark?'#60a5fa':'#2563eb';x.setLineDash([6,4]);const rx=Math.min(a.x,b.x)*sx,ry=Math.min(a.y,b.y)*sy,rw=Math.abs(a.x-b.x)*sx,rh=Math.abs(a.y-b.y)*sy;x.fillRect(rx,ry,rw,rh);x.strokeRect(rx,ry,rw,rh);x.restore()}
  x.restore();
  if(measureStart&&measureEnd){
   const a={x:measureStart.x*sx,y:measureStart.y*sy},b={x:measureEnd.x*sx,y:measureEnd.y*sy};
   const ax=w/2+pan.x+a.x*zoom,ay=h/2+pan.y+a.y*zoom,bx=w/2+pan.x+b.x*zoom,by=h/2+pan.y+b.y*zoom;
   const dx=Math.abs(measureEnd.x-measureStart.x)*p.widthMm,dy=Math.abs(measureEnd.y-measureStart.y)*p.heightMm,d=Math.hypot(dx,dy);
   const off=Math.max(24,Math.min(70,Math.hypot(bx-ax,by-ay)*.18));
   x.save();x.strokeStyle=dark?'#ffd166':'#9a6700';x.fillStyle=dark?'#ffd166':'#9a6700';x.lineWidth=1.5;
   x.setLineDash([7,5]);x.beginPath();x.moveTo(ax,ay);x.lineTo(bx,by);x.stroke();x.setLineDash([]);
   const dimY=by+(by>=ay?off:-off),dimX=bx+(bx>=ax?off:-off);
   x.globalAlpha=.6;x.beginPath();x.moveTo(ax,ay);x.lineTo(ax,dimY);x.moveTo(bx,by);x.lineTo(bx,dimY);x.moveTo(ax,ay);x.lineTo(dimX,ay);x.moveTo(bx,by);x.lineTo(dimX,by);x.stroke();x.globalAlpha=1;
   x.beginPath();x.moveTo(ax,dimY);x.lineTo(bx,dimY);x.moveTo(dimX,ay);x.lineTo(dimX,by);x.stroke();
   const arrow=(px:number,py:number,ang:number)=>{x.beginPath();x.moveTo(px,py);x.lineTo(px-9*Math.cos(ang-.45),py-9*Math.sin(ang-.45));x.lineTo(px-9*Math.cos(ang+.45),py-9*Math.sin(ang+.45));x.closePath();x.fill()};
   arrow(ax,dimY,Math.atan2(0,bx-ax));arrow(bx,dimY,Math.atan2(0,ax-bx));arrow(dimX,ay,Math.atan2(by-ay,0));arrow(dimX,by,Math.atan2(ay-by,0));
   x.fillStyle=dark?'#fff':'#111';x.strokeStyle='#f59e0b';x.lineWidth=2;
   for(const q of [[ax,ay],[bx,by]]){x.beginPath();x.arc(q[0],q[1],5,0,Math.PI*2);x.fill();x.stroke()}
   const labels:Array<[string,number,number]>=[[dx.toFixed(1)+' mm',(ax+bx)/2,dimY+(dimY>ay?16:-10)],[dy.toFixed(1)+' mm',dimX+(dimX>ax?16:-16),(ay+by)/2],[d.toFixed(1)+' mm',(ax+bx)/2,(ay+by)/2-12]];
   x.font='600 11px system-ui';x.textAlign='center';x.textBaseline='middle';
   for(const [txt,lx,ly] of labels){const tw=x.measureText(txt).width+12;x.fillStyle=dark?'rgba(16,18,22,.94)':'rgba(255,255,255,.95)';x.beginPath();x.roundRect(lx-tw/2,ly-10,tw,20,5);x.fill();x.fillStyle=dark?'#f1f3f5':'#171717';x.fillText(txt,lx,ly)}
   x.restore();
  }
  x.save();x.font='10px system-ui';x.lineWidth=1;
  const topH=28,leftW=42,halfW=p.widthMm/2,halfH=p.heightMm/2;
  x.fillStyle=dark?'rgba(16,18,22,.96)':'rgba(244,245,247,.97)';x.fillRect(leftW,0,w-leftW,topH);x.fillRect(0,topH,leftW,h-topH);
  const rulerStroke=dark?'#363b44':'#c7ccd4',text=dark?'#aeb4bf':'#5d6570',tickStep=(range:number)=>range>500?50:range>250?25:range>100?10:5;
  const drawRuler=(horizontal:boolean)=>{const range=horizontal?p.widthMm:p.heightMm,step=tickStep(range),start=-Math.ceil(range/2/step)*step,end=Math.ceil(range/2/step)*step;for(let mm=start;mm<=end+step*.01;mm+=step){const pos=horizontal?w/2+pan.x+mm*ppm*zoom:h/2+pan.y+mm*ppm*zoom;x.strokeStyle=rulerStroke;x.beginPath();if(horizontal){x.moveTo(pos,topH-10);x.lineTo(pos,topH);x.textAlign='center';x.fillText(String(Math.round(mm)),pos,11)}else{x.moveTo(leftW-10,pos);x.lineTo(leftW,pos);x.textAlign='right';x.fillText(String(Math.round(mm)),leftW-12,pos+3)}x.stroke()}};
  drawRuler(true);drawRuler(false);
  const bx1=w/2+pan.x-halfW*ppm*zoom,bx2=w/2+pan.x+halfW*ppm*zoom,by1=h/2+pan.y-halfH*ppm*zoom,by2=h/2+pan.y+halfH*ppm*zoom;
  x.strokeStyle=dark?'#667080':'#8a919c';x.setLineDash([5,4]);x.strokeRect(bx1,by1,bx2-bx1,by2-by1);x.setLineDash([]);
  const ox=w/2+pan.x,oy=h/2+pan.y;x.strokeStyle=dark?'#596171':'#9aa1ab';x.beginPath();x.moveTo(ox,topH);x.lineTo(ox,h);x.moveTo(leftW,oy);x.lineTo(w,oy);x.stroke();
  x.fillStyle=dark?'#f59e0b':'#9a6700';x.font='600 10px system-ui';x.textAlign='left';x.fillText('0',ox+4,topH+11);x.fillStyle=dark?'#707784':'#8a919c';x.fillText('mm',w-18,19);x.fillText('mm',5,topH+12);x.restore();
 },[p,zoom,pan,dark,grid,playing,playIndex,viewMode,overlayOpacity,measureStart,measureEnd,cursorPoint,selectedLines,selectionBox,diagnosticFocus,diagnosticHover]);
 function deleteSelected(){if(!selectedLines.length)return;setP(q=>{const nextLines=q.lines.filter(l=>!selectedLines.includes(l.id));const nextSticks=q.sticks.filter(s=>nextLines.some(l=>l.points.some(pt=>Math.hypot(pt.x-s.x,pt.y-s.y)<.06)));return{...q,lines:nextLines,connections:q.connections.filter(c=>!selectedLines.includes(c.a)&&!selectedLines.includes(c.b)),sticks:nextSticks,history:[...q.history,snapshot('Delete selected',q.lines,q.sticks,q.productionPlan,q.constraints)],updatedAt:Date.now()}});setSelectedLines([]);setSelectedLine(null)}
 function snapshot(label:string,lines=p.lines,sticks=p.sticks,production=p.productionPlan,constraints=p.constraints){return{id:crypto.randomUUID(),createdAt:Date.now(),label,lines:cloneLines(lines),sticks:sticks.map(s=>({...s})),constraints:(constraints??[]).map(c=>({...c})),productionPlan:production?JSON.parse(JSON.stringify(production)):undefined}}
 async function importFiles(fs:FileList|null){if(!fs)return;const files=Array.from(fs);if(!files.length)return;batchFilesRef.current=files;setBatchFiles(files);setBatchOpen(true);setBatchPaused(false);const processor=new BatchProcessor();batchProcessor.current=processor;const meta=await Promise.all(files.map(f=>new Promise<{thumbnail:string;width?:number;height?:number}>(resolve=>{const fr=new FileReader();fr.onload=()=>{const src=String(fr.result);const img=new Image();img.onload=()=>resolve({thumbnail:src,width:img.naturalWidth,height:img.naturalHeight});img.onerror=()=>resolve({thumbnail:src});img.src=src};fr.readAsDataURL(f)})));setBatchJobs(files.map((f,i)=>({id:crypto.randomUUID(),fileName:f.name,size:f.size,status:'queued',progress:0,sourceIndex:i,...meta[i]})));const results=await processor.runWithResults(files,p.settings.detail,j=>setBatchJobs(j.map((job,i)=>({...job,...meta[job.sourceIndex??i]}))));
const created:Project[]=[];
for(let i=0;i<files.length;i++){
  const r=results[i];if(!r)continue;
  const lines=cloneLines(r.lines);
  const graph=rebuildGraph(lines);
  const connections=findConnectionCandidates(lines,p.settings.connectDistance);
  const warnings=[...analyze(lines),...graph.filter(n=>n.degree>=3).map(n=>({id:crypto.randomUUID(),severity:'low' as const,message:'Junction node detected; review the joint before cooking.',lineIds:n.lineIds}))];
  const now=Date.now();
  const project:Project={...blank(),id:crypto.randomUUID(),name:files[i].name.replace(/\.[^.]+$/,''),createdAt:now,updatedAt:now,originalName:files[i].name,imageData:meta[i].thumbnail,lines,connections,warnings,sticks:recommendSticks(lines),settings:{...p.settings},history:[]};
  created.push(project);
  await saveProject(project);
  setBatchJobs(js=>js.map(j=>j.sourceIndex===i?{...j,projectId:project.id}:j));
}
if(created.length){
  setProjects(xs=>[...created,...xs.filter(x=>!created.some(n=>n.id===x.id))]);
  setP(created[created.length-1]);
}
processor.dispose();batchProcessor.current=null}
function pauseBatch(){const x=batchProcessor.current;if(!x)return;if(batchPaused){x.resume();setBatchPaused(false)}else{x.pause();setBatchPaused(true)}}
function cancelBatch(){batchProcessor.current?.cancel();setBatchPaused(false)}
async function retryBatch(id:string){const job=batchJobs.find(j=>j.id===id),idx=job?.sourceIndex;if(!job||idx===undefined)return;const file=batchFilesRef.current[idx];if(!file)return;const processor=new BatchProcessor();setBatchJobs(js=>js.map(j=>j.id===id?{...j,status:'processing',progress:5,error:undefined}:j));try{const lines=await processor.process(file,p.settings.detail);setBatchJobs(js=>js.map(j=>j.id===id?{...j,status:'done',progress:100,lines}:j));openBatchResult({...job,status:'done',progress:100,lines})}catch(e){setBatchJobs(js=>js.map(j=>j.id===id?{...j,status:'error',error:e instanceof Error?e.message:String(e)}:j))}finally{processor.dispose()}}
function removeBatch(id:string){setBatchJobs(js=>js.filter(j=>j.id!==id))}
async function openBatchResult(job:BatchJob){
  if(job.projectId){
    const saved=projects.find(x=>x.id===job.projectId);
    if(saved){setP(normalize(saved));setBatchOpen(false);return}
    const stored=await listProjects();
    const found=stored.map(normalize).find(x=>x.id===job.projectId);
    if(found){setP(found);setProjects(xs=>[found,...xs.filter(x=>x.id!==found.id)]);setBatchOpen(false);return}
  }
  if(!job.lines||job.sourceIndex===undefined)return;
  const file=batchFilesRef.current[job.sourceIndex];
  let imageData=job.thumbnail;
  if(file)imageData=await new Promise<string>(resolve=>{const fr=new FileReader();fr.onload=()=>resolve(String(fr.result));fr.readAsDataURL(file)});
  const now=Date.now();
  const project:Project={...blank(),id:crypto.randomUUID(),name:job.fileName.replace(/\.[^.]+$/,''),createdAt:now,updatedAt:now,originalName:job.fileName,imageData,lines:cloneLines(job.lines),connections:findConnectionCandidates(job.lines,p.settings.connectDistance),warnings:analyze(job.lines),sticks:recommendSticks(job.lines),settings:{...p.settings}};
  await saveProject(project);
  setProjects(xs=>[project,...xs.filter(x=>x.id!==project.id)]);
  setP(project);setBatchOpen(false)
}
function rebuildTopology(){setP(q=>{const graph=rebuildGraph(q.lines),connections=findConnectionCandidates(q.lines,q.settings.connectDistance),warnings=[...analyze(q.lines),...graph.filter(n=>n.degree>=3).map(n=>({id:crypto.randomUUID(),severity:'low' as const,message:'Junction node detected; review the joint before cooking.',lineIds:n.lineIds}))];return{...q,connections,warnings,sticks:recommendSticks(q.lines),updatedAt:Date.now()}})}
 function buildProductionPlan(project:Project):ProductionPlan{
  const path=minimumPenLiftPath(project.lines).order;
  let total=0;
  const steps=path.map((l,i)=>{
   const start=l.points[0],end=l.points.at(-1)!;
   const lengthMm=Math.round(polylineLengthMm(l.points,project.widthMm,project.heightMm)*10)/10;
   total+=lengthMm;
   const attached=project.sticks.find(stick=>Math.hypot(stick.x-start.x,stick.y-start.y)<.06);
   return {
    id:crypto.randomUUID(),index:i+1,lineId:l.id,
    action:(l.closed?'CLOSE':attached?'SUPPORT':i===0?'DRAW':'LIFT') as 'DRAW'|'LIFT'|'CLOSE'|'SUPPORT',
    lengthMm,start,end,penLiftBefore:i>0,supportStickId:attached?.id,
    note:l.closed?'Close this contour smoothly.':attached?'Place/check support before continuing this span.':i===0?'Start from this endpoint and maintain a steady syrup flow.':'Lift cleanly, reposition to the next start point, then continue.'
   };
  });
  const lifts=Math.max(0,path.length-1);
  return {
   id:crypto.randomUUID(),createdAt:Date.now(),estimatedPenLifts:lifts,totalLengthMm:Math.round(total*10)/10,steps,
   summary:[path.length+' drawing segments',lifts+' estimated pen lifts',Math.round(total*10)/10+' mm total path',project.sticks.length+' support sticks',project.warnings.filter(w=>w.severity==='high').length+' high-risk warnings']
  };
 }
 function focusProductionStep(step:ProductionPlan['steps'][number]){
  const idx=p.lines.findIndex(l=>l.id===step.lineId);
  setProductionSelected(Math.max(0,step.index-1));
  if(idx>=0){setSelectedLine(step.lineId);setSelectedLines([step.lineId]);setViewMode('result')}
 }
 function rebuildProductionPlan(){setProductionPlan(buildProductionPlan(p));setProductionSelected(0)}
 function moveProductionStep(from:number,to:number){
  setProductionPlan(q=>{
   if(!q||to<0||to>=q.steps.length)return q;
   const steps=[...q.steps],moved=steps.splice(from,1)[0];
   if(!moved)return q;
   steps.splice(to,0,moved);
   return {...q,steps:steps.map((step,i)=>({...step,index:i+1,penLiftBefore:i>0}))};
  });
 }
 function deleteProductionStep(index:number){
  setProductionPlan(q=>{
   if(!q)return q;
   const steps=q.steps.filter((_,i)=>i!==index).map((step,i)=>({...step,index:i+1,penLiftBefore:i>0}));
   return {...q,steps,estimatedPenLifts:Math.max(0,steps.length-1)};
  });
 }
 function runOptimize(){const r=sugarArtify(p.lines,p.settings);const path=minimumPenLiftPath(r.lines);const lines=path.order;const connections=findConnectionCandidates(lines,p.settings.connectDistance);const graph=rebuildGraph(lines);setP(q=>({...q,lines,connections,warnings:[...analyze(lines),...graph.filter(n=>n.degree>=3).map(n=>({id:crypto.randomUUID(),severity:'low' as const,message:'Junction node detected; review the joint before cooking.',lineIds:n.lineIds}))],sticks:recommendSticks(lines),history:[...q.history,snapshot('Sugar Artify + graph rebuild',q.lines,q.sticks,q.productionPlan,q.constraints)],updatedAt:Date.now()}))}
 function acceptConnection(id:string){setP(q=>{const connections=q.connections.map(c=>c.id===id?{...c,status:'accepted' as const}:c);return{...q,connections,updatedAt:Date.now()}})}
 function rejectConnection(id:string){setP(q=>({...q,connections:q.connections.map(c=>c.id===id?{...c,status:'rejected' as const}:c),updatedAt:Date.now()}))}
 function acceptAll(){setP(q=>({...q,connections:q.connections.map(c=>c.status==='pending'?{...c,status:'accepted' as const}:c),updatedAt:Date.now()}))}
 function applyAccepted(){setP(q=>{const before=cloneLines(q.lines),lines=applyConnections(q.lines,q.connections);const ordered=minimumPenLiftPath(lines).order,connections=findConnectionCandidates(ordered,q.settings.connectDistance).filter(c=>!q.connections.some(old=>old.a===c.a&&old.b===c.b&&old.status==='rejected'));return{...q,lines:ordered,connections,warnings:analyze(ordered),sticks:recommendSticks(ordered),history:[...q.history,snapshot('Apply accepted connections',before,q.sticks,q.productionPlan,q.constraints)],updatedAt:Date.now()}})}
 function undo(){
  const h=p.history.at(-1);if(!h)return;
  historyNavigation.current=true;
  setRedoStack(r=>[...r,snapshot('Redo',p.lines,p.sticks)]);
  setP(q=>({...q,lines:cloneLines(h.lines),sticks:h.sticks?.map(s=>({...s}))??q.sticks,constraints:h.constraints?.map(c=>({...c}))??q.constraints,connections:findConnectionCandidates(h.lines,q.settings.connectDistance),warnings:analyze(h.lines),productionPlan:h.productionPlan,history:q.history.slice(0,-1),updatedAt:Date.now()}));setProductionPlan(h.productionPlan?JSON.parse(JSON.stringify(h.productionPlan)):null);setProductionSelected(0);
}
function redo(){
  const h=redoStack.at(-1);if(!h)return;
  historyNavigation.current=true;
  setRedoStack(r=>r.slice(0,-1));
  setP(q=>({...q,lines:cloneLines(h.lines),sticks:h.sticks?.map(s=>({...s}))??q.sticks,constraints:h.constraints?.map(c=>({...c}))??q.constraints,connections:findConnectionCandidates(h.lines,q.settings.connectDistance),warnings:analyze(h.lines),productionPlan:h.productionPlan,history:[...q.history,snapshot('Undo',q.lines,q.sticks,q.productionPlan,q.constraints)],updatedAt:Date.now()}));setProductionPlan(h.productionPlan?JSON.parse(JSON.stringify(h.productionPlan)):null);setProductionSelected(0);
}
 function canvasPoint(e:ReactPointerEvent<HTMLCanvasElement>){const c=canvas.current!,r=c.getBoundingClientRect(),{sx,sy}=projectScales(r.width,r.height,p.widthMm,p.heightMm);return{x:(e.clientX-r.left-r.width/2-pan.x)/(sx*zoom),y:(e.clientY-r.top-r.height/2-pan.y)/(sy*zoom)}}
 function snapPoint(pt:{x:number;y:number}){if(!snap)return pt;const stepX=1/Math.max(.001,p.widthMm),stepY=1/Math.max(.001,p.heightMm);let out={x:Math.round(pt.x/stepX)*stepX,y:Math.round(pt.y/stepY)*stepY};let bd=Math.min(stepX,stepY)*.72;for(const l of p.lines)for(const q of l.points){const d=Math.hypot((q.x-pt.x)*p.widthMm,(q.y-pt.y)*p.heightMm);if(d<bd){out={...q};bd=d}}return out}
 function constrainLine(line:Line,type:CADConstraint['type'],value?:number):Line{
  const pts=line.points.map(q=>({...q}));if(pts.length<2)return line;
  const a=pts[0],b=pts[pts.length-1],sx=p.widthMm,sy=p.heightMm;
  if(type==='horizontal'){const y=a.y;for(const q of pts)q.y=y}
  if(type==='vertical'){const x=a.x;for(const q of pts)q.x=x}
  if(type==='length'&&value&&value>0){const dx=(b.x-a.x)*sx,dy=(b.y-a.y)*sy,len=Math.hypot(dx,dy);if(len>.0001){const k=value/len;for(let i=1;i<pts.length;i++){const rx=(pts[i].x-a.x)*sx,ry=(pts[i].y-a.y)*sy;pts[i].x=a.x+(rx*k)/sx;pts[i].y=a.y+(ry*k)/sy}}}
  if(type==='angle'&&value!==undefined){const rad=value*Math.PI/180,dx=(b.x-a.x)*sx,dy=(b.y-a.y)*sy,len=Math.hypot(dx,dy);if(len>.0001){const nx=Math.cos(rad)*len,ny=Math.sin(rad)*len,rot=Math.atan2(ny,nx)-Math.atan2(dy,dx);for(let i=1;i<pts.length;i++){const rx=(pts[i].x-a.x)*sx,ry=(pts[i].y-a.y)*sy;pts[i].x=a.x+(rx*Math.cos(rot)-ry*Math.sin(rot))/sx;pts[i].y=a.y+(rx*Math.sin(rot)+ry*Math.cos(rot))/sy}}}
  if(type==='x'&&value!==undefined){const target=value/sx,dx=target-a.x;for(const q of pts)q.x+=dx}
  if(type==='y'&&value!==undefined){const target=value/sy,dy=target-a.y;for(const q of pts)q.y+=dy}
  return {...line,points:pts};
 }
 function applyConstraint(type:CADConstraint['type'],value?:number){if(!selectedLine)return;const line=p.lines.find(l=>l.id===selectedLine);if(!line)return;const next=applyActiveConstraints(constrainLine(line,type,value),[...p.constraints??[],{id:'tmp',lineId:line.id,type,value,createdAt:Date.now()}],p.widthMm,p.heightMm,p.lines);const cst:CADConstraint={id:crypto.randomUUID(),lineId:line.id,type,value,createdAt:Date.now()};setP(q=>({...q,lines:q.lines.map(l=>l.id===line.id?next:l),constraints:[...(q.constraints??[]).filter(c=>!(c.lineId===line.id&&c.type===type)),cst],history:[...q.history,snapshot('CAD '+type,q.lines,q.sticks)],updatedAt:Date.now()}))}
 function applyActiveConstraints(line:Line,constraints:CADConstraint[],widthMm:number,heightMm:number,allLines:Line[]=[]):Line{
 const seed=allLines.map(l=>l.id===line.id?line:l);
 return solveConstraints(seed,constraints,widthMm,heightMm,8).lines.find(l=>l.id===line.id)??line;
}
 function setConstraintValue(type:CADConstraint['type'],value:number){if(!selectedLine||!Number.isFinite(value))return;const line=p.lines.find(l=>l.id===selectedLine);if(!line)return;const now=Date.now(),base=(p.constraints??[]).filter(c=>!(c.lineId===selectedLine&&c.type===type)),existing=(p.constraints??[]).find(c=>c.lineId===selectedLine&&c.type===type),constraint:CADConstraint={id:existing?.id??crypto.randomUUID(),lineId:selectedLine,type,value,createdAt:existing?.createdAt??now};const next=applyActiveConstraints(constrainLine(line,type,value),[...base,constraint],p.widthMm,p.heightMm,p.lines);setP(q=>({...q,lines:q.lines.map(l=>l.id===selectedLine?next:l),constraints:[...base,constraint],history:[...q.history,snapshot('Edit CAD '+type,q.lines,q.sticks)],updatedAt:now}))}
 function applyRelation(type:'parallel'|'perpendicular'|'equalLength',source:Line,target:Line){
  const a=source.points[0],b=source.points.at(-1)!,c0=target.points[0],d=target.points.at(-1)!;
  const sdx=(b.x-a.x)*p.widthMm,sdy=(b.y-a.y)*p.heightMm,sl=Math.hypot(sdx,sdy)||1;
  const tdx=(d.x-c0.x)*p.widthMm,tdy=(d.y-c0.y)*p.heightMm,tl=Math.hypot(tdx,tdy)||1;
  const ang=(type==='perpendicular'?Math.atan2(sdy,sdx)+Math.PI/2:Math.atan2(sdy,sdx));
  const len=type==='equalLength'?sl:tl,scale=len/tl;
  const nx=Math.cos(ang)*len,ny=Math.sin(ang)*len;
  const points=target.points.map(q=>{const rx=(q.x-c0.x)*p.widthMm,ry=(q.y-c0.y)*p.heightMm;return{x:c0.x+(rx*Math.cos(ang-Math.atan2(tdy,tdx))-ry*Math.sin(ang-Math.atan2(tdy,tdx)))*scale/p.widthMm,y:c0.y+(rx*Math.sin(ang-Math.atan2(tdy,tdx))+ry*Math.cos(ang-Math.atan2(tdy,tdx)))*scale/p.heightMm}});
  points[0]={...c0};points[points.length-1]={x:c0.x+nx/p.widthMm,y:c0.y+ny/p.heightMm};return {...target,points}
 }
 function selectedBounds(lines:Line[]){const xs:number[]=[],ys:number[]=[];for(const l of lines)for(const q of l.points){xs.push(q.x*p.widthMm);ys.push(q.y*p.heightMm)}if(!xs.length)return null;return{minX:Math.min(...xs),maxX:Math.max(...xs),minY:Math.min(...ys),maxY:Math.max(...ys),cx:(Math.min(...xs)+Math.max(...xs))/2,cy:(Math.min(...ys)+Math.max(...ys))/2};}
 function transformSelected(mode:'left'|'right'|'top'|'bottom'|'centerX'|'centerY'|'distributeX'|'distributeY'|'scaleUp'|'scaleDown'){
  if(selectedLines.length<2)return;
  const chosen=p.lines.filter(l=>selectedLines.includes(l.id)),b=selectedBounds(chosen);if(!b)return;
  const ordered=chosen.map(l=>({l,b:selectedBounds([l])!}));
  let lines=p.lines.map(l=>({...l,points:l.points.map(q=>({...q}))}));
  if(mode==='distributeX'||mode==='distributeY'){
   const axis=mode==='distributeX'?'cx':'cy', items=ordered.slice().sort((a,z)=>a.b[axis]-z.b[axis]);if(items.length<3)return;
   const start=items[0].b[axis],end=items.at(-1)!.b[axis],step=(end-start)/(items.length-1);
   items.forEach((item,i)=>{if(i===0||i===items.length-1)return;const delta=start+step*i-item.b[axis];const ids=new Set([item.l.id]);lines=lines.map(l=>ids.has(l.id)?{...l,points:l.points.map(q=>({x:q.x+(mode==='distributeX'?delta/p.widthMm:0),y:q.y+(mode==='distributeY'?delta/p.heightMm:0)}))}:l)});
  }else{
   let factor=1;if(mode==='scaleUp')factor=1.1;if(mode==='scaleDown')factor=.9;
   const targetX=mode==='left'?b.minX:mode==='right'?b.maxX:mode==='centerX'?b.cx:null,targetY=mode==='top'?b.minY:mode==='bottom'?b.maxY:mode==='centerY'?b.cy:null;
   lines=lines.map(l=>{if(!selectedLines.includes(l.id))return l;let dx=0,dy=0;const lb=selectedBounds([l])!;if(targetX!==null){const anchor=mode==='left'?lb.minX:mode==='right'?lb.maxX:lb.cx;dx=(targetX-anchor)/p.widthMm}if(targetY!==null){const anchor=mode==='top'?lb.minY:mode==='bottom'?lb.maxY:lb.cy;dy=(targetY-anchor)/p.heightMm}
    if(mode==='scaleUp'||mode==='scaleDown'){return{...l,points:l.points.map(q=>({x:(b.cx+(q.x*p.widthMm-b.cx)*factor)/p.widthMm,y:(b.cy+(q.y*p.heightMm-b.cy)*factor)/p.heightMm}))}}
    return{...l,points:l.points.map(q=>({x:q.x+dx,y:q.y+dy}))}
   });
  }
  const solved=solveConstraints(lines,p.constraints??[],p.widthMm,p.heightMm,8).lines;
  setP(q=>({...q,lines:solved,connections:findConnectionCandidates(solved,q.settings.connectDistance),warnings:analyze(solved),sticks:recommendSticks(solved),history:[...q.history,snapshot('Group '+mode,q.lines,q.sticks)],updatedAt:Date.now()}));
 }
 function updateConstraintValue(id:string,value:number,value2?:number){
  if(!Number.isFinite(value))return;
  setP(q=>{const constraints=(q.constraints??[]).map(c=>c.id===id?{...c,value,value2:c.type==='fixedPoint'?value2??c.value2:c.value2}:c);const lines=solveConstraints(q.lines,constraints,q.widthMm,q.heightMm,8).lines;return{...q,constraints,lines,connections:findConnectionCandidates(lines,q.settings.connectDistance),warnings:analyze(lines),history:[...q.history,snapshot('Edit CAD constraint',q.lines,q.sticks)],updatedAt:Date.now()}});
 }
 function constraintDiagnostics(){return diagnoseConstraints(p.lines,(p.constraints??[]),p.widthMm,p.heightMm,12)}
 function diagnosticUnit(c:CADConstraint){return c.type==='angle'?'°':'mm'}
 function locateConstraint(id:string){const c=(p.constraints??[]).find(x=>x.id===id);if(!c)return;setDiagnosticFocus(id);setSelectedLine(c.lineId);setSelectedLines(c.referenceLineId?[c.lineId,c.referenceLineId]:[c.lineId]);setRelationLine(c.referenceLineId??null);setSelectedNode(null)}
 function disableDiagnosticGroup(ids:string[]){const set=new Set(ids);setP(q=>{const constraints=(q.constraints??[]).map(c=>set.has(c.id)?{...c,enabled:false}:c);const lines=solveConstraints(q.lines,constraints,q.widthMm,q.heightMm,12).lines;return{...q,constraints,lines,connections:findConnectionCandidates(lines,q.settings.connectDistance),warnings:analyze(lines),sticks:recommendSticks(lines),history:[...q.history,snapshot('Disable CAD conflict group',q.lines,q.sticks)],updatedAt:Date.now()}});setDiagnosticFocus(null)}
 function diagnosticGraph(ds:any[],active:CADConstraint[]){
  const bad=ds.filter(d=>d.severity!=='ok');
  if(!bad.length)return <div className="diagnosticGraph"><small>No conflict graph: all active constraints are resolved.</small></div>;
  const ids=Array.from(new Set(bad.flatMap(d=>[d.id,...d.conflictingIds])));
  const nodes=ids.map((id,i)=>({id,i,c:active.find(x=>x.id===id)!})).filter(n=>n.c);
  const width=520,height=Math.max(180,Math.ceil(nodes.length/3)*92);
  const pos=(i:number)=>({x:70+(i%3)*190,y:42+Math.floor(i/3)*82});
  return <div className="diagnosticGraph"><div className="row"><b>Conflict Graph</b><small>{nodes.length} constraints · click a node to locate</small></div><svg viewBox={`0 0 ${width} ${height}`} style={{width:'100%',height:'auto',background:'rgba(127,127,127,.06)',borderRadius:8}}>
   {bad.flatMap(d=>d.conflictingIds.map((id:string)=>[d.id,id] as const)).filter(([a,b])=>a!==b).map(([a,b],i)=>{
    const A=nodes.find(n=>n.id===a),B=nodes.find(n=>n.id===b);if(!A||!B)return null;const pa=pos(A.i),pb=pos(B.i);
    return <line key={i} x1={pa.x} y1={pa.y} x2={pb.x} y2={pb.y} stroke="currentColor" strokeOpacity=".3" strokeWidth="2"/>})}
   {nodes.map(n=>{const d=ds.find(x=>x.id===n.id),q=pos(n.i);return <g key={n.id} onClick={()=>locateConstraint(n.id)} style={{cursor:'pointer'}}><circle cx={q.x} cy={q.y} r="25" fill={d?.severity==='conflict'?'#ef5350':'#f59e0b'} fillOpacity=".18" stroke={d?.severity==='conflict'?'#ef5350':'#f59e0b'} strokeWidth="2"/><text x={q.x} y={q.y-3} textAnchor="middle" fontSize="11" fill="currentColor">{constraintLabel(n.c)}</text><text x={q.x} y={q.y+12} textAnchor="middle" fontSize="9" fill="currentColor">{n.c.type}</text></g>})}
  </svg></div>;
}
 function constraintResidual(c:CADConstraint){const result=solveConstraints(p.lines,(p.constraints??[]).filter(x=>x.enabled!==false),p.widthMm,p.heightMm,12);return result.residuals.find(r=>r.id===c.id)?.error??0;}
 function toggleConstraint(id:string){setP(q=>{const constraints=(q.constraints??[]).map(c=>c.id===id?{...c,enabled:c.enabled===false}:c);const lines=solveConstraints(q.lines,constraints,q.widthMm,q.heightMm,12).lines;return{...q,constraints,lines,connections:findConnectionCandidates(lines,q.settings.connectDistance),warnings:analyze(lines),sticks:recommendSticks(lines),history:[...q.history,snapshot('Toggle CAD constraint',q.lines,q.sticks)],updatedAt:Date.now()}})}
 function rotateSelected(deg:number){if(selectedLines.length<2)return;const chosen=p.lines.filter(l=>selectedLines.includes(l.id)),b=selectedBounds(chosen);if(!b)return;const a=deg*Math.PI/180;const lines=p.lines.map(l=>{if(!selectedLines.includes(l.id))return l;return{...l,points:l.points.map(q=>{const X=q.x*p.widthMm-b.cx,Y=q.y*p.heightMm-b.cy;return{x:(b.cx+X*Math.cos(a)-Y*Math.sin(a))/p.widthMm,y:(b.cy+X*Math.sin(a)+Y*Math.cos(a))/p.heightMm}})}});const solved=solveConstraints(lines,p.constraints??[],p.widthMm,p.heightMm,12).lines;setP(q=>({...q,lines:solved,connections:findConnectionCandidates(solved,q.settings.connectDistance),warnings:analyze(solved),sticks:recommendSticks(solved),history:[...q.history,snapshot('Rotate group',q.lines,q.sticks)],updatedAt:Date.now()}))}
 function constraintLabel(c:CADConstraint){return c.type==='parallel'?'∥':c.type==='perpendicular'?'⊥':c.type==='equalLength'?'=':c.type==='horizontalDistance'?'ΔX':c.type==='verticalDistance'?'ΔY':c.type==='fixedPoint'?'FIX':c.type==='horizontal'?'H':c.type==='vertical'?'V':c.type==='length'?'L':c.type==='angle'?'A':c.type==='x'?'X':'Y'}
 function removeConstraint(id:string){setP(q=>{const removed=(q.constraints??[]).find(c=>c.id===id);if(!removed)return q;const constraints=(q.constraints??[]).filter(c=>c.id!==id);const lines=q.lines.map(l=>{if(l.id!==removed.lineId)return l;return applyActiveConstraints(l,constraints,q.widthMm,q.heightMm,q.lines)});return{...q,lines,constraints,history:[...q.history,snapshot('Remove CAD '+removed.type,q.lines,q.sticks)],updatedAt:Date.now()}})}
 function addTwoLineDistance(type:'horizontalDistance'|'verticalDistance'){
  if(!selectedLine||!relationLine||selectedLine===relationLine)return;
  const a=p.lines.find(v=>v.id===selectedLine),b=p.lines.find(v=>v.id===relationLine);if(!a||!b)return;
  const pa=a.points[0],pb=b.points[0],value=type==='horizontalDistance'?Math.abs((pb.x-pa.x)*p.widthMm):Math.abs((pb.y-pa.y)*p.heightMm),now=Date.now();
  setP(q=>({...q,constraints:[...(q.constraints??[]),{id:crypto.randomUUID(),lineId:b.id,type,value,referenceLineId:a.id,createdAt:now}],history:[...q.history,snapshot('CAD '+type,q.lines,q.sticks)],updatedAt:now}))
 }
 function addDistanceConstraint(type:'horizontalDistance'|'verticalDistance'){
  if(!selectedLine)return;const l=p.lines.find(v=>v.id===selectedLine);if(!l||l.points.length<2)return;
  const a=l.points[0],b=l.points.at(-1)!;const value=(type==='horizontalDistance'?Math.abs((b.x-a.x)*p.widthMm):Math.abs((b.y-a.y)*p.heightMm));
  const now=Date.now();setP(q=>({...q,constraints:[...(q.constraints??[]).filter(c=>!(c.lineId===l.id&&c.type===type)),{id:crypto.randomUUID(),lineId:l.id,type,value,createdAt:now}],history:[...q.history,snapshot('CAD '+type,q.lines,q.sticks)],updatedAt:now}))
 }
 function addFixedPoint(){
  if(!selectedLine)return;const l=p.lines.find(v=>v.id===selectedLine);if(!l)return;const a=l.points[0],now=Date.now();
  setP(q=>({...q,constraints:[...(q.constraints??[]).filter(c=>!(c.lineId===l.id&&c.type==='fixedPoint')),{id:crypto.randomUUID(),lineId:l.id,type:'fixedPoint',value:a.x*p.widthMm,value2:a.y*p.heightMm,createdAt:now}],history:[...q.history,snapshot('CAD fixed point',q.lines,q.sticks)],updatedAt:now}))
 }
 function addRelation(type:'parallel'|'perpendicular'|'equalLength'){
  if(!selectedLine||!relationLine||selectedLine===relationLine)return;
  const source=p.lines.find(l=>l.id===selectedLine),target=p.lines.find(l=>l.id===relationLine);if(!source||!target)return;
  const next=applyRelation(type,source,target),now=Date.now();
  setP(q=>({...q,lines:q.lines.map(l=>l.id===target.id?next:l),constraints:[...(q.constraints??[]).filter(c=>!(c.lineId===target.id&&c.referenceLineId===source.id&&c.type===type)),{id:crypto.randomUUID(),lineId:target.id,type,referenceLineId:source.id,createdAt:now}],history:[...q.history,snapshot('CAD '+type,q.lines,q.sticks)],updatedAt:now}));
 }
 function lineGeometry(line:Line){const a=line.points[0],b=line.points.at(-1)!;const dx=(b.x-a.x)*p.widthMm,dy=(b.y-a.y)*p.heightMm;return{sx:a.x*p.widthMm,sy:a.y*p.heightMm,ex:b.x*p.widthMm,ey:b.y*p.heightMm,dx,dy,length:Math.hypot(dx,dy),angle:Math.atan2(dy,dx)*180/Math.PI}}
 function promptConstraint(type:CADConstraint['type']){if(!selectedLine)return;const labels:Record<CADConstraint['type'],string>={length:'Target length (mm)',horizontal:'Horizontal (no value)',vertical:'Vertical (no value)',angle:'Target angle (degrees)',x:'Start X coordinate (mm)',y:'Start Y coordinate (mm)',parallel:'Parallel to reference line',perpendicular:'Perpendicular to reference line',equalLength:'Equal to reference line',horizontalDistance:'Horizontal distance (mm)',verticalDistance:'Vertical distance (mm)',fixedPoint:'Fixed point'};const raw=type==='horizontal'||type==='vertical'?undefined:window.prompt(labels[type],String(type==='length'?50:type==='angle'?0:0));if(type==='horizontal'||type==='vertical'||raw!==null){const value=raw===undefined?undefined:Number(raw);if(value===undefined||Number.isFinite(value))applyConstraint(type,value)}}
 function splitSelected(){if(!selectedLine)return;const l=p.lines.find(x=>x.id===selectedLine);if(!l||l.points.length<4)return;const mid=Math.floor(l.points.length/2);const a={...l,id:crypto.randomUUID(),points:l.points.slice(0,mid+1)},b={...l,id:crypto.randomUUID(),points:l.points.slice(mid)};setP(q=>({...q,lines:[...q.lines.filter(x=>x.id!==selectedLine),a,b],connections:[],history:[...q.history,snapshot('Split line',q.lines)],updatedAt:Date.now()}));setSelectedLine(a.id)}
function mergeSelected(){if(!selectedLine)return;const base=p.lines.find(x=>x.id===selectedLine);if(!base)return;const other=p.lines.find(x=>x.id!==selectedLine&&Math.min(Math.hypot(base.points[0].x-x.points.at(-1)!.x,base.points[0].y-x.points.at(-1)!.y),Math.hypot(base.points.at(-1)!.x-x.points[0].x,base.points.at(-1)!.y-x.points[0].y))<p.settings.connectDistance);if(!other)return;const merged={...base,id:crypto.randomUUID(),points:[...base.points,...other.points]};setP(q=>({...q,lines:[...q.lines.filter(x=>x.id!==base.id&&x.id!==other.id),merged],connections:[],history:[...q.history,snapshot('Merge lines',q.lines)],updatedAt:Date.now()}));setSelectedLine(merged.id)}
function measureSelected(){if(!selectedLine)return;const l=p.lines.find(x=>x.id===selectedLine);if(!l||l.points.length<2)return;setCursor('measure');setMeasureStart(l.points[0]);setMeasureEnd(l.points.at(-1)!)}
useEffect(()=>{const onKey=(e:KeyboardEvent)=>{if(e.key==='Escape'){setSelectionBox(null);setSelectedLines([]);setSelectedLine(null);setRelationLine(null);return}if((e.key==='Delete'||e.key==='Backspace')&&selectedLines.length){e.preventDefault();setP(q=>{const ids=new Set(selectedLines);return{...q,lines:q.lines.filter(l=>!ids.has(l.id)),connections:q.connections.filter(c=>!ids.has(c.a)&&!ids.has(c.b)),constraints:(q.constraints??[]).filter(c=>!ids.has(c.lineId)&&!(c.referenceLineId&&ids.has(c.referenceLineId))),history:[...q.history,snapshot('Delete selected lines',q.lines,q.sticks)],updatedAt:Date.now()}});setSelectedLines([]);setSelectedLine(null);setRelationLine(null)}};window.addEventListener('keydown',onKey);return()=>window.removeEventListener('keydown',onKey)},[selectedLines]);
 function highlightedGraphLineIds(){if(!selectedGraphNode)return new Set<string>();const n=rebuildGraph(p.lines).find(n=>n.id===selectedGraphNode);return new Set(n?.lineIds??[])}
function graphNodeAt(pt:{x:number;y:number}){const nodes=rebuildGraph(p.lines);let best:any=null,bd=.035;for(const n of nodes){const d=Math.hypot(n.point.x-pt.x,n.point.y-pt.y);if(d<bd){bd=d;best=n}}return best}
function hitNode(pt:{x:number;y:number}){let best:{lineId:string;index:number}|null=null,bd=.028;for(const l of p.lines)for(let i=0;i<l.points.length;i++){const q=l.points[i],d=Math.hypot(q.x-pt.x,q.y-pt.y);if(d<bd){bd=d;best={lineId:l.id,index:i}}}return best}
 function hitLine(pt:{x:number;y:number}){let best:string|null=null,bd=.035;for(const l of p.lines)for(const q of l.points){const d=Math.hypot(q.x-pt.x,q.y-pt.y);if(d<bd){bd=d;best=l.id}}return best}
 function pointToSegmentDistance(pt:{x:number;y:number},a:{x:number;y:number},b:{x:number;y:number}){const vx=b.x-a.x,vy=b.y-a.y,wx=pt.x-a.x,wy=pt.y-a.y,t=Math.max(0,Math.min(1,(wx*vx+wy*vy)/(vx*vx+vy*vy||1))),q={x:a.x+vx*t,y:a.y+vy*t};return Math.hypot(pt.x-q.x,pt.y-q.y)}
 function diagnosticHit(pt:{x:number;y:number}):string|null{
  const ds=diagnoseConstraints(p.lines,(p.constraints??[]),p.widthMm,p.heightMm,12).filter(d=>d.severity!=='ok');
  let best:{id:string;distance:number}|null=null;
  const consider=(id:string,distance:number,limit:number)=>{if(distance<=limit&&(!best||distance<best.distance))best={id,distance}};
  for(const d of ds){
   const c=(p.constraints??[]).find(v=>v.id===d.id);if(!c)continue;
   const owner=p.lines.find(v=>v.id===c.lineId);if(!owner)continue;
   for(let i=1;i<owner.points.length;i++)consider(d.id,pointToSegmentDistance(pt,owner.points[i-1],owner.points[i]),.055);
   const refs=d.conflictingIds.filter(id=>id!==d.id);
   for(const id of refs){
    const rc=(p.constraints??[]).find(v=>v.id===id);if(!rc)continue;
    const other=p.lines.find(v=>v.id===rc.lineId);if(!other)continue;
    const a=owner.points[0],b=owner.points.at(-1)!,q=other.points[0],r=other.points.at(-1)!;
    consider(d.id,Math.hypot(pt.x-(a.x+b.x)/2,pt.y-(a.y+b.y)/2),.075);
    consider(d.id,Math.hypot(pt.x-(q.x+r.x)/2,pt.y-(q.y+r.y)/2),.075);
    consider(d.id,pointToSegmentDistance(pt,{x:(a.x+b.x)/2,y:(a.y+b.y)/2},{x:(q.x+r.x)/2,y:(q.y+r.y)/2}),.045);
   }
  }
  return best?.id??null;
 }
 function hitStick(pt:{x:number;y:number}){let best:string|null=null,bd=.035;for(const s of p.sticks){const a=s.angle*Math.PI/180,b={x:s.x+Math.cos(a)*s.length/100,y:s.y+Math.sin(a)*s.length/100};const vx=b.x-s.x,vy=b.y-s.y,wx=pt.x-s.x,wy=pt.y-s.y,t=Math.max(0,Math.min(1,(wx*vx+wy*vy)/(vx*vx+vy*vy||1))),q={x:s.x+vx*t,y:s.y+vy*t},d=Math.hypot(pt.x-q.x,pt.y-q.y);if(d<bd){bd=d;best=s.id}}return best}
 function stickCollision(s:NonNullable<Project['sticks']>[number],lines:Line[]){const e=supportStickEndpoint(s,p.widthMm,p.heightMm),a={x:s.x,y:s.y},b={x:e.x,y:e.y};let nearest=Infinity;for(const l of lines)for(const q of l.points){nearest=Math.min(nearest,Math.hypot(q.x-a.x,q.y-a.y),Math.hypot(q.x-b.x,q.y-b.y))}const outside=a.x<0||a.x>1||a.y<0||a.y>1||b.x<0||b.x>1||b.y<0||b.y>1;return{nearest,outside,collision:nearest<.025||outside}} 
function updateStick(id:string,patch:Partial<NonNullable<Project['sticks']>[number]>){setP(q=>({...q,sticks:q.sticks.map(s=>{if(s.id!==id)return s;const n={...s,...patch},check=stickCollision(n,q.lines);let nearest=Infinity;for(const l of q.lines)for(const pt of l.points)nearest=Math.min(nearest,Math.hypot(n.x-pt.x,n.y-pt.y));const geometry=Math.max(0,Math.min(100,70-Math.min(45,nearest*120)+Math.min(20,n.length/4)+(n.kind==='avoid'?-20:0)-(check.collision?25:0)));return{...n,score:Math.round(geometry)}}),updatedAt:Date.now()}))}
 function addStick(){const s={id:crypto.randomUUID(),x:0,y:0,length:40,angle:90,score:50,kind:'optional' as const};setP(q=>({...q,sticks:[...q.sticks,s],history:[...q.history,snapshot('Add support stick',q.lines)],updatedAt:Date.now()}));setSelectedStick(s.id)}
 function deleteStick(){if(!selectedStick)return;setP(q=>({...q,sticks:q.sticks.filter(s=>s.id!==selectedStick),history:[...q.history,snapshot('Delete support stick',q.lines)],updatedAt:Date.now()}));setSelectedStick(null)}
 function drawPoint(ev:ReactPointerEvent<HTMLCanvasElement>){if(cursor==='pan'){setPanDragging(true);setPanStart({x:ev.clientX-pan.x,y:ev.clientY-pan.y});return}const raw=canvasPoint(ev),pt=snapPoint(raw);
 if(cursor==='measure'){setMeasureStart(pt);setMeasureEnd(pt);return}
 if(graphDragging&&selectedGraphNode&&graphDragLast){const gn=rebuildGraph(p.lines).find(n=>n.id===selectedGraphNode);if(gn){const dx=pt.x-graphDragLast.x,dy=pt.y-graphDragLast.y;setP(q=>{const ids=new Set(gn.lineIds),raw=q.lines.map(l=>{if(!ids.has(l.id))return l;const points=l.points.map(z=>({...z}));if(Math.hypot(points[0].x-gn.point.x,points[0].y-gn.point.y)<=.04){points[0].x+=dx;points[0].y+=dy}const z=points.length-1;if(Math.hypot(points[z].x-gn.point.x,points[z].y-gn.point.y)<=.04){points[z].x+=dx;points[z].y+=dy}return{...l,points}}),lines=raw.map(l=>ids.has(l.id)?applyActiveConstraints(l,q.constraints??[],q.widthMm,q.heightMm,raw):l);return{...q,lines,connections:findConnectionCandidates(lines,q.settings.connectDistance),warnings:analyze(lines),sticks:recommendSticks(lines),updatedAt:Date.now()}});setGraphDragLast(pt)}return}
 if(cursor==='select'){
   const diagnosticId=diagnosticHit(pt);
   if(diagnosticId){locateConstraint(diagnosticId);setDiagnosticHover(diagnosticId);return}
   const sid=hitStick(pt);if(sid){setSelectedStick(sid);setStickDragging(true);setDragStart(pt);setSelectedGraphNode(null);return}
   const gn=graphNodeAt(pt);if(gn){setSelectedGraphNode(gn.id);setSelectedLine(gn.lineIds[0]??null);setSelectedLines(gn.lineIds);setSelectedNode(null);setGraphDragging(true);setGraphDragLast(pt);return}
   setSelectedGraphNode(null);const node=hitNode(pt);
   if(node){setSelectedNode(node);setSelectedLine(node.lineId);setSelectedLines([node.lineId]);setNodeDragging(true);setDragStart(pt);return}
   const id=hitLine(pt);
   if(id){
     if(ev.shiftKey||ev.ctrlKey){const next=selectedLines.includes(id)?selectedLines.filter(x=>x!==id):[...selectedLines,id];setSelectedLines(next);setSelectedLine(next.at(-1)??null);setRelationLine(next.length>=2?next.at(-2)??null:null);setSelectedNode(null);return}
     setSelectedLines([id]);setSelectedLine(id);setRelationLine(null);setSelectedNode(null);setDragging(true);setDragStart(pt);return
   }
   setSelectedLines([]);setSelectedLine(null);setRelationLine(null);setSelectedNode(null);setSelectionBox({start:pt,end:pt});return
 }
 if(cursor==='connect'){const id=hitLine(pt);if(id){if(!connectStart)setConnectStart(id);else if(connectStart!==id){setP(q=>{const aa=q.lines.find(l=>l.id===connectStart),bb=q.lines.find(l=>l.id===id);if(!aa||!bb)return q;const cc=findConnectionCandidates([aa,bb],q.settings.connectDistance)[0];return cc?{...q,connections:[...q.connections,cc],updatedAt:Date.now()}:q});setConnectStart(null)}}return}
 if(cursor==='draw')setP(q=>({...q,lines:[...q.lines,{id:crypto.randomUUID(),points:[pt,{x:pt.x+.04,y:pt.y+.04}],width:q.settings.minWidthMm}],connections:[],history:[...q.history,snapshot('Draw',q.lines)],updatedAt:Date.now()}))}

 function movePoint(ev:ReactPointerEvent<HTMLCanvasElement>){if(!panDragging){const cp=canvasPoint(ev);setCursorPoint(cp);if(cursor==='select')setDiagnosticHover(diagnosticHit(cp));}if(panDragging){setPan({x:ev.clientX-panStart.x,y:ev.clientY-panStart.y});return}const raw=canvasPoint(ev),q=snapPoint(raw),dx=q.x-dragStart.x,dy=q.y-dragStart.y;if(cursor==='measure'&&measureStart){setMeasureEnd(raw);return;}if(selectionBox){setSelectionBox(b=>b?{...b,end:raw}:null);return;}if(stickDragging&&selectedStick){setDragStart(q);setP(v=>({...v,sticks:v.sticks.map(s=>s.id===selectedStick?{...s,x:s.x+dx,y:s.y+dy}:s),updatedAt:Date.now()}));return;}if(nodeDragging&&selectedNode){setDragStart(q);setP(v=>({...v,lines:v.lines.map(l=>{if(l.id!==selectedNode.lineId)return l;const moved={...l,points:l.points.map((pt,i)=>i===selectedNode.index?{x:q.x,y:q.y}:pt)};return applyActiveConstraints(moved,v.constraints??[],v.widthMm,v.heightMm,v.lines)}),updatedAt:Date.now()}));return}if(!dragging||!selectedLines.length)return;setDragStart(q);setP(v=>({...v,lines:v.lines.map(l=>{if(!selectedLines.includes(l.id))return l;const moved={...l,points:l.points.map(pt=>({x:pt.x+dx,y:pt.y+dy}))};return applyActiveConstraints(moved,v.constraints??[],v.widthMm,v.heightMm,v.lines)}),updatedAt:Date.now()}))}
 function endPoint(ev?:ReactPointerEvent<HTMLCanvasElement>){setPanDragging(false);if(cursor==='measure'&&measureStart&&ev){setMeasureEnd(canvasPoint(ev));return}if(selectionBox){const a=selectionBox.start,b=selectionBox.end;const minX=Math.min(a.x,b.x),maxX=Math.max(a.x,b.x),minY=Math.min(a.y,b.y),maxY=Math.max(a.y,b.y);const ids=p.lines.filter(l=>l.points.some(q=>q.x>=minX&&q.x<=maxX&&q.y>=minY&&q.y<=maxY)).map(l=>l.id);setSelectedLines(ids);setSelectedLine(ids.at(-1)??null);setRelationLine(ids.length>=2?ids.at(-2)??null:null);setSelectionBox(null);setDragging(false);setNodeDragging(false);setStickDragging(false);return}setDragging(false);setNodeDragging(false);setStickDragging(false);if(!snap)return;setP(q=>{const lines=q.lines.map(l=>({...l,points:l.points.map(pt=>({...pt}))}));let changed=false;for(let i=0;i<lines.length;i++)for(let j=i+1;j<lines.length;j++){for(const ai of [0,lines[i].points.length-1])for(const bj of [0,lines[j].points.length-1]){const a=lines[i].points[ai],b=lines[j].points[bj];if(Math.hypot(a.x-b.x,a.y-b.y)<.012){const m={x:(a.x+b.x)/2,y:(a.y+b.y)/2};lines[i].points[ai]=m;lines[j].points[bj]=m;changed=true}}}if(!changed)return q;const graph=rebuildGraph(lines),warnings=[...analyze(lines),...graph.filter(n=>n.degree>=3).map(n=>({id:crypto.randomUUID(),severity:'low' as const,message:'Junction node detected; review the joint before cooking.',lineIds:n.lineIds}))];return{...q,lines,connections:findConnectionCandidates(lines,q.settings.connectDistance),warnings,sticks:recommendSticks(lines),history:[...q.history,snapshot('Snap and merge endpoints',q.lines)],updatedAt:Date.now()}})}

 function exportProjectJson(){const blob=new Blob([projectJson(p)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=p.name+'.sugardraw.json';a.click();URL.revokeObjectURL(a.href)}
async function importProjectJson(file:File){
 try{
  const data=JSON.parse(await file.text());
  const raw=data?.project??data;
  if(!raw||typeof raw!=='object'||!Array.isArray(raw.lines))throw new Error('Invalid SugarDraw project file');
  const now=Date.now();
  const imported=normalize({...raw,id:crypto.randomUUID(),name:String(raw.name||file.name.replace(/\.sugardraw\.json$|\.json$/i,'')),createdAt:now,updatedAt:now});
  await saveProject(imported);
  setProjects(xs=>[imported,...xs.filter(x=>x.id!==imported.id)]);
  setP(imported);setSelectedLine(null);setSelectedLines([]);setRelationLine(null);setSelectedNode(null);setSelectedStick(null);
 }catch(e){alert('Unable to import project: '+(e instanceof Error?e.message:String(e)))}
}
function newProject(){const n=blank();setP(n);setSelectedLine(null);setSelectedLines([]);setRelationLine(null);setSelectedNode(null);setSelectedStick(null)}
function duplicateProject(){const now=Date.now(),n={...p,id:crypto.randomUUID(),name:p.name+' Copy',createdAt:now,updatedAt:now,lines:cloneLines(p.lines),sticks:p.sticks.map(s=>({...s,id:crypto.randomUUID()})),connections:p.connections.map(c=>({...c,id:crypto.randomUUID()})),history:p.history.map(v=>({...v,id:crypto.randomUUID(),lines:cloneLines(v.lines),sticks:v.sticks?.map(s=>({...s})),constraints:v.constraints?.map(c=>({...c})),productionPlan:v.productionPlan?JSON.parse(JSON.stringify(v.productionPlan)):undefined})),constraints:p.constraints?.map(c=>({...c})),productionPlan:p.productionPlan?JSON.parse(JSON.stringify(p.productionPlan)):undefined};setP(n);setProductionPlan(n.productionPlan??null);setProductionSelected(0)}
function deleteCurrentProject(){if(!confirm('Delete this project?'))return;const id=p.id;deleteProject(id).then(()=>{setProjects(xs=>xs.filter(x=>x.id!==id));setP(blank())})}
function renameProject(){const name=window.prompt('Project name',p.name);if(name?.trim())setP(q=>({...q,name:name.trim(),updatedAt:Date.now()}))}
function saveVersion(label='Manual version'){setP(q=>({...q,history:[...q.history,snapshot(label,q.lines,q.sticks,q.productionPlan)],updatedAt:Date.now()}))}
function restoreVersion(id:string){const v=p.history.find(x=>x.id===id);if(!v)return;setP(q=>({...q,lines:cloneLines(v.lines),sticks:v.sticks?.map(s=>({...s}))??q.sticks,constraints:v.constraints?.map(c=>({...c}))??q.constraints,connections:findConnectionCandidates(v.lines,q.settings.connectDistance),productionPlan:v.productionPlan?JSON.parse(JSON.stringify(v.productionPlan)):undefined,history:[...q.history,snapshot('Before restore',q.lines,q.sticks,q.productionPlan,q.constraints)],updatedAt:Date.now()}));setProductionPlan(v.productionPlan?JSON.parse(JSON.stringify(v.productionPlan)):null);setProductionSelected(0)}
function duplicateVersion(id:string){const v=p.history.find(x=>x.id===id);if(!v)return;setP(q=>({...q,history:[...q.history,{...v,id:crypto.randomUUID(),createdAt:Date.now(),label:v.label+' Copy',lines:cloneLines(v.lines),sticks:v.sticks?.map(s=>({...s}))??[],constraints:v.constraints?.map(c=>({...c})),productionPlan:v.productionPlan?JSON.parse(JSON.stringify(v.productionPlan)):undefined}],updatedAt:Date.now()}))}
 const pathResult=minimumPenLiftPath(p.lines),drawingOrder=pathResult.order,pending=p.connections.filter(c=>c.status==='pending'),accepted=p.connections.filter(c=>c.status==='accepted'),rejected=p.connections.filter(c=>c.status==='rejected'),progress=drawingOrder.length?Math.min(100,Math.round(playIndex/drawingOrder.length*100)):0;
 return <div className={dark?'app dark':'app'}><header><div className="brand"><div className="logo">S</div><div><b>SugarDraw</b><small>Buildable sugar art</small></div></div><nav className="menuBar">
 <div className="menuWrap"><button onClick={()=>setMenu(menu==='file'?null:'file')}>File</button>{menu==='file'&&<div className="menuPopup">
  <button onClick={()=>{newProject();setMenu(null)}}>New Project</button><button onClick={()=>{duplicateProject();setMenu(null)}}>Duplicate Project</button>
  <button onClick={()=>document.getElementById('projectJsonImport')?.click()}>Import Project JSON</button>
  <button onClick={()=>{exportProjectJson();setMenu(null)}}>Export Project JSON</button><button onClick={()=>{downloadSvg(p);setMenu(null)}}>Export SVG</button><button onClick={()=>{downloadPng(p);setMenu(null)}}>Export PNG</button><button onClick={async()=>{await planPdf(p);setMenu(null)}}>Production Plan PDF</button><button onClick={async()=>{await zipProjects([p]);setMenu(null)}}>Export ZIP</button>
 </div>}</div>
 <div className="menuWrap"><button onClick={()=>setMenu(menu==='edit'?null:'edit')}>Edit</button>{menu==='edit'&&<div className="menuPopup">
  <button onClick={()=>{undo();setMenu(null)}} disabled={!p.history.length}>Undo <span>Ctrl+Z</span></button><button onClick={()=>{redo();setMenu(null)}} disabled={!redoStack.length}>Redo <span>Ctrl+Y</span></button>
  <button onClick={()=>{setSelectedLines(p.lines.map(l=>l.id));setMenu(null)}}>Select All <span>Ctrl+A</span></button>
  <button onClick={()=>{setSelectedLines([]);setSelectedLine(null);setRelationLine(null);setMenu(null)}}>Clear Selection <span>Esc</span></button>
 </div>}</div>
 <div className="menuWrap"><button onClick={()=>setMenu(menu==='view'?null:'view')}>View</button>{menu==='view'&&<div className="menuPopup">
  <button onClick={()=>setGrid(v=>!v)}>Grid <span>{grid?'On':'Off'}</span></button><button onClick={()=>setSnap(v=>!v)}>Snap <span>{snap?'On':'Off'}</span></button><button onClick={()=>setShowNodes(v=>!v)}>Nodes <span>{showNodes?'On':'Off'}</span></button><button onClick={()=>{setZoom(1);setPan({x:0,y:0});setMenu(null)}}>Fit / Reset View</button><button onClick={()=>{setDark(v=>!v);setMenu(null)}}>{dark?'Light theme':'Dark theme'}</button>
 </div>}</div>
 <button onClick={undo} disabled={!p.history.length} title="Undo (Ctrl+Z)"><Undo2/></button><button onClick={redo} disabled={!redoStack.length} title="Redo (Ctrl+Y / Ctrl+Shift+Z)"><Redo2/></button><button onClick={()=>downloadSvg(p)}><Download/></button></nav><div className="topActions"><button onClick={()=>setDark(v=>!v)}>{dark?<Sun/>:<Moon/>}</button><button onClick={()=>setBatchOpen(v=>!v)}><Layers/> Batch</button><button className="primary" onClick={()=>document.getElementById('files')?.click()}><Upload/> Import</button><input id="files" hidden type="file" multiple accept=".png,.jpg,.jpeg,image/png,image/jpeg" onChange={e=>importFiles(e.target.files)}/></div></header>
 <main><aside className="toolbar"><Tool icon={<MousePointer2/>} active={cursor==='select'} on={()=>setCursor('select')} label="Select"/><Tool icon={<PenTool/>} active={cursor==='draw'} on={()=>setCursor('draw')} label="Draw"/><Tool icon={<Link2/>} active={cursor==='connect'} on={()=>setCursor('connect')} label="Connect"/><Tool icon={<Ruler/>} active={cursor==='measure'} on={()=>setCursor('measure')} label="Measure"/><Tool icon={<Move/>} active={cursor==='pan'} on={()=>setCursor('pan')} label="Pan"/><Tool icon={<ZoomIn/>} on={()=>setZoom(z=>Math.min(4,z+.2))} label="Zoom"/><Tool icon={<Grid3X3/>} active={grid} on={()=>setGrid(v=>!v)} label="Grid"/><Tool icon={<Link2/>} active={snap} on={()=>setSnap(v=>!v)} label="Snap"/><Tool icon={<Grid3X3/>} active={showNodes} on={()=>setShowNodes(v=>!v)} label="Nodes"/><button className="tool" onClick={()=>{setZoom(1);setPan({x:0,y:0})}}><RefreshCw/><small>Fit</small></button></aside>
 <section className="workspace"><div className="canvasWrap" onWheel={e=>{e.preventDefault();const r=e.currentTarget.getBoundingClientRect(),px=e.clientX-r.left-r.width/2,py=e.clientY-r.top-r.height/2,{sx,sy}=projectScales(r.width,r.height,p.widthMm,p.heightMm),next=Math.max(.35,Math.min(4,zoom*(e.deltaY<0?1.1:.9))),wx=(px-pan.x)/(sx*zoom),wy=(py-pan.y)/(sy*zoom);setZoom(next);setPan({x:px-wx*sx*next,y:py-wy*sy*next})}}><canvas ref={canvas} onPointerDown={drawPoint} onPointerMove={movePoint} onPointerUp={e=>{setGraphDragging(false);setGraphDragLast(null);endPoint(e)}} onPointerLeave={()=>{setCursorPoint(null);setDiagnosticHover(null);endPoint()}}/></div><div className="status"><span>Zoom {Math.round(zoom*100)}%</span><span>{grid?'Grid on':'Grid off'}</span><span>Graph: {p.lines.length} segments · {pending.length} pending</span><span>{cursorPoint?'X '+(cursorPoint.x*p.widthMm).toFixed(1)+' · Y '+(cursorPoint.y*p.heightMm).toFixed(1)+' mm':p.widthMm+'×'+p.heightMm+' mm · Path '+p.lines.reduce((n,l)=>n+polylineLengthMm(l.points,p.widthMm,p.heightMm),0).toFixed(1)+' mm · '+penLifts(p.lines)+' pen lifts'}</span><span className="saved"><Check/> Saved locally</span></div></section>
 <aside className="panel"><div className="tabs"><b>Connections & Path</b></div><section><h3>Optimization</h3><label>Detail<select value={p.settings.detail} onChange={e=>setP(q=>({...q,settings:{...q.settings,detail:e.target.value as 'low'|'balanced'|'high'}}))}><option value="low">Simple</option><option value="balanced">Balanced</option><option value="high">Detailed</option></select></label><label>Minimum width<input type="number" step=".1" value={p.settings.minWidthMm} onChange={e=>setP(q=>({...q,settings:{...q.settings,minWidthMm:+e.target.value}}))}/> mm</label><label>Connection distance<input type="number" step=".005" value={p.settings.connectDistance} onChange={e=>setP(q=>({...q,settings:{...q.settings,connectDistance:+e.target.value}}))}/></label><div className="viewModes"><button className={viewMode==='result'?'active':''} onClick={()=>setViewMode('result')}>Result</button><button className={viewMode==='original'?'active':''} onClick={()=>setViewMode('original')}>Original</button><button className={viewMode==='overlay'?'active':''} onClick={()=>setViewMode('overlay')}>Overlay</button></div>{viewMode==='overlay'&&<label>Overlay opacity<input type="range" min="0" max="1" step=".05" value={overlayOpacity} onChange={e=>setOverlayOpacity(+e.target.value)}/><span>{Math.round(overlayOpacity*100)}%</span></label>}<button className="wide primary" onClick={runOptimize}>Sugar Artify + Rebuild Graph</button></section>
 <section><div className="sectionTitle"><h3>Structural Risk</h3><span>{p.warnings.length} warnings</span></div>{p.warnings.length?<><div className="riskLegend"><span>● High</span><span>● Medium</span><span>● Low</span></div>{p.warnings.map(w=><button className="warningRow" key={w.id} onMouseEnter={()=>setDiagnosticHover(w.id)} onMouseLeave={()=>setDiagnosticHover(null)} onClick={()=>{setDiagnosticFocus(w.id);const id=w.lineIds[0];if(id){setSelectedLine(id);setSelectedLines([id])}}}><b>{w.severity.toUpperCase()}</b><span>{w.message}</span></button>)}</>:<small>No structural warnings. Geometric heuristic only.</small>}</section>
 <section><div className="sectionTitle"><h3>Production Plan V2</h3><div className="row"><button onClick={rebuildProductionPlan}>Generate</button><button disabled={!productionPlan} onClick={()=>productionPlan&&saveAs(new Blob([JSON.stringify(productionPlan,null,2)],{type:'application/json'}),p.name+'-production-plan.json')}>Save</button></div></div>{productionPlan?<><div className="planStats"><b>{productionPlan.steps.length}</b><span>steps</span><b>{productionPlan.estimatedPenLifts}</b><span>pen lifts</span><b>{productionPlan.totalLengthMm}</b><span>mm path</span></div><div className="row productionControls"><button disabled={productionSelected<=0} onClick={()=>{const s=productionPlan.steps[productionSelected-1];if(s)focusProductionStep(s)}}>← Previous</button><button disabled={productionSelected>=productionPlan.steps.length-1} onClick={()=>{const s=productionPlan.steps[productionSelected+1];if(s)focusProductionStep(s)}}>Next →</button><button onClick={()=>setProductionPreview(v=>!v)}>{productionPreview?'Hide Preview':'Show Preview'}</button></div><div className="productionSteps">{productionPlan.steps.map((s,i)=><div className={'productionStep '+(i===productionSelected?'selected':'')} key={s.id} onClick={()=>focusProductionStep(s)}><b>{s.index}. {s.action}</b><span>{s.lengthMm} mm</span><small>{s.note}</small><div className="row"><button disabled={i===0} onClick={e=>{e.stopPropagation();moveProductionStep(i,i-1)}}>↑</button><button disabled={i===productionPlan.steps.length-1} onClick={e=>{e.stopPropagation();moveProductionStep(i,i+1)}}>↓</button><button onClick={e=>{e.stopPropagation();deleteProductionStep(i)}}>Delete</button></div></div>)}</div><div className="row"><button onClick={()=>setProductionPlan(q=>q?{...q,steps:[...q.steps,{id:crypto.randomUUID(),index:q.steps.length+1,lineId:'manual',action:'LIFT',lengthMm:0,start:{x:0,y:0},end:{x:0,y:0},penLiftBefore:true,note:'Manual step — edit this instruction before production.'}],estimatedPenLifts:q.estimatedPenLifts+1}:q)}>+ Manual Step</button><button className="wide primary" onClick={()=>planPdf(p)}>Export Production Plan PDF</button></div></>:<small>Generate a production plan from the current drawing path.</small>}</section>
 <section><div className="sectionTitle"><h3>Connection Candidates</h3><span>{pending.length} pending</span></div>{pending.length>0&&<button className="wide" onClick={acceptAll}><CheckCircle2/> Accept all</button>}{pending.map((c:ConnectionCandidate,i)=><div className="connection" key={c.id}><div><b>Candidate {i+1}</b><small>{c.distance.toFixed(3)}u · {Math.round(c.angle)}° · {c.reason}</small></div><div className="row"><button onClick={()=>acceptConnection(c.id)} title="Accept"><CheckCircle2/></button><button onClick={()=>rejectConnection(c.id)} title="Reject"><XCircle/></button></div></div>)}{accepted.length>0&&<button className="wide primary" onClick={applyAccepted}><Link2/> Apply accepted ({accepted.length})</button>}{rejected.length>0&&<small>{rejected.length} rejected</small>}</section>
 <section><h3>Node Editor</h3><div className="nodeInfo">{selectedNode?'Node '+(selectedNode.index+1)+' selected':selectedLines.length?selectedLines.length+' line'+(selectedLines.length===1?'':'s')+' selected · Shift/Ctrl-click to add or remove':'Click a line or drag an empty area to box-select'}</div><div className="editorActions"><button disabled={!selectedNode} onClick={()=>{if(!selectedNode)return;setP(q=>({...q,lines:q.lines.map(l=>l.id===selectedNode.lineId?{...l,points:l.points.filter((_,i)=>i!==selectedNode.index)}:l).filter(l=>l.points.length>1),connections:[],history:[...q.history,snapshot('Delete node',q.lines)],updatedAt:Date.now()}));setSelectedNode(null)}}>Delete node</button><button disabled={!selectedNode} onClick={()=>{if(!selectedNode)return;setP(q=>{const l=q.lines.find(x=>x.id===selectedNode.lineId);if(!l)return q;const i=selectedNode.index,n=Math.min(i+1,l.points.length-1),a=l.points[i],bb=l.points[n],mid={x:(a.x+bb.x)/2,y:(a.y+bb.y)/2};return{...q,lines:q.lines.map(x=>x.id===l.id?{...x,points:[...x.points.slice(0,n),mid,...x.points.slice(n)]}:x),connections:[],history:[...q.history,snapshot('Add node',q.lines)],updatedAt:Date.now()}})}}>Add node</button></div></section><section><h3>Measurement / CAD</h3><div className="metric">{measureStart&&measureEnd?(()=>{const dx=Math.abs(measureEnd.x-measureStart.x)*p.widthMm,dy=Math.abs(measureEnd.y-measureStart.y)*p.heightMm,d=Math.hypot(dx,dy);return <><b>{(measureStart.x*p.widthMm).toFixed(1)}</b><span>X1 mm</span><b>{(measureStart.y*p.heightMm).toFixed(1)}</b><span>Y1 mm</span><b>{(measureEnd.x*p.widthMm).toFixed(1)}</b><span>X2 mm</span><b>{(measureEnd.y*p.heightMm).toFixed(1)}</b><span>Y2 mm</span><b>{dx.toFixed(1)}</b><span>ΔX</span><b>{dy.toFixed(1)}</b><span>ΔY</span><b>{d.toFixed(1)}</b><span>Direct</span></>})():<span>Origin 0,0 · snapping grid 1 mm.</span>}</div>{selectedLine&&(()=>{const l=p.lines.find(x=>x.id===selectedLine);return l?<small className="pathMeta">Selected path: {polylineLengthMm(l.points,p.widthMm,p.heightMm).toFixed(1)} mm</small>:null})()}<button className="wide" onClick={()=>{setMeasureStart(null);setMeasureEnd(null)}}>Clear measurement</button></section><section><h3>CAD Relations</h3><small>Select a line, then Shift/Ctrl-click another line to multi-select. With two selected lines, the earlier selection is the CAD relation target.</small><div className="metric"><b>{selectedLine?'Source selected':'Source none'}</b><span>{relationLine?'Target selected':'Target none'}</span></div><section><h3>CAD Object</h3>{selectedLine&&(()=>{const l=p.lines.find(x=>x.id===selectedLine);if(!l)return null;const g=lineGeometry(l);return <><div className="metric"><b>{g.length.toFixed(1)}</b><span>mm length</span><b>{g.angle.toFixed(1)}°</b><span>angle</span></div><div className="row"><label>X1 <input type="number" step="0.1" value={g.sx.toFixed(1)} onChange={e=>setConstraintValue('x',+e.target.value)}/></label><label>Y1 <input type="number" step="0.1" value={g.sy.toFixed(1)} onChange={e=>setConstraintValue('y',+e.target.value)}/></label></div><div className="row"><label>Length <input type="number" min="0.1" step="0.1" value={g.length.toFixed(1)} onChange={e=>setConstraintValue('length',+e.target.value)}/></label><label>Angle <input type="number" step="0.1" value={g.angle.toFixed(1)} onChange={e=>setConstraintValue('angle',+e.target.value)}/></label></div><div className="row"><button onClick={()=>promptConstraint('horizontal')}>Horizontal</button><button onClick={()=>promptConstraint('vertical')}>Vertical</button></div><div className="row"><button disabled={!selectedLine||!relationLine} onClick={()=>addRelation('parallel')}>Parallel</button><button disabled={!selectedLine||!relationLine} onClick={()=>addRelation('perpendicular')}>Perpendicular</button><button disabled={!selectedLine||!relationLine} onClick={()=>addRelation('equalLength')}>Equal Length</button></div><div className="row"><button disabled={!selectedLine||!relationLine} onClick={()=>addTwoLineDistance('horizontalDistance')}>H Distance</button><button disabled={!selectedLine||!relationLine} onClick={()=>addTwoLineDistance('verticalDistance')}>V Distance</button></div><div className="row"><button onClick={()=>addDistanceConstraint('horizontalDistance')}>H Distance</button><button onClick={()=>addDistanceConstraint('verticalDistance')}>V Distance</button><button onClick={addFixedPoint}>Fixed Point</button></div><div className="row"><button onClick={()=>promptConstraint('x')}>Lock X</button><button onClick={()=>promptConstraint('y')}>Lock Y</button></div></>})()}<h3>Constraint Editor</h3>{(()=>{const cs=(p.constraints??[]).filter(c=>c.lineId===selectedLine||c.lineId===relationLine);if(!cs.length)return <small>No constraints on the selected objects.</small>;return <>{cs.map(c=>{const err=constraintResidual(c);const relation=c.referenceLineId?('↔ '+(p.lines.find(l=>l.id===c.referenceLineId)?.id.slice(0,6)??'object')):'';return <div className="version" key={c.id}><div><b>{constraintLabel(c)} · {c.type}</b><small>{relation} {c.enabled===false?'◌ disabled':err>.05?'⚠ conflict':'✓ resolved'}</small></div>{c.value!==undefined&&c.type!=='fixedPoint'&&<input type="number" step="0.1" value={c.value} onChange={e=>updateConstraintValue(c.id,+e.target.value)}/>} {c.type==='fixedPoint'&&<div className="row"><input type="number" step="0.1" value={c.value??0} onChange={e=>updateConstraintValue(c.id,+e.target.value,c.value2)}/><input type="number" step="0.1" value={c.value2??0} onChange={e=>updateConstraintValue(c.id,c.value??0,+e.target.value)}/></div>}<div className="row"><button onClick={()=>toggleConstraint(c.id)}>{c.enabled===false?'Enable':'Disable'}</button><button onClick={()=>removeConstraint(c.id)}>Remove</button></div></div>})}</>})()}<h3>Constraint Diagnostics</h3>{(()=>{const ds=constraintDiagnostics(),active=(p.constraints??[]).filter(c=>c.enabled!==false),conflicts=ds.filter(d=>d.severity==='conflict'),warnings=ds.filter(d=>d.severity==='warning');if(!active.length)return <small>No active constraints to diagnose.</small>;return <>{diagnosticGraph(ds,active)}<div className="metric"><b>{conflicts.length}</b><span>conflicts</span><b>{warnings.length}</b><span>warnings</span><b>{ds.filter(d=>d.severity==='ok').length}</b><span>resolved</span></div>{conflicts.length===0&&warnings.length===0?<small>All active CAD constraints are currently consistent.</small>:<>{[...conflicts,...warnings].map(d=>{const cc=active.find(x=>x.id===d.id)!;const chain=Array.from(new Set([d.id,...d.conflictingIds]));return <div className="version" key={d.id} style={diagnosticFocus===d.id?{outline:'2px solid #ef5350',outlineOffset:2}:undefined}><div><b>{d.severity==='conflict'?'⚠ Conflict':'△ Warning'} · {constraintLabel(cc)} {cc.type}</b><small>Residual {d.error.toFixed(2)} {diagnosticUnit(cc)} · relief {d.improvement.toFixed(2)} {diagnosticUnit(cc)} · priority {d.priority}</small><small>Chain: {chain.map(id=>active.find(x=>x.id===id)).filter(Boolean).map(x=>constraintLabel(x!)+' '+x!.type).join(' ↔ ')}</small>{d.recommendedDisable&&<small style={{color:'#f59e0b'}}>Suggested resolution: disable this constraint and re-solve.</small>}</div><div className="row"><button onClick={()=>locateConstraint(d.id)}>Locate</button><button onClick={()=>disableDiagnosticGroup(chain)}>Disable group</button><button onClick={()=>toggleConstraint(d.id)}>Disable</button></div></div>})}</>}</>})()}
<h3>Group Transform</h3><small>{selectedLines.length<2?'Select at least 2 lines.':'Transform '+selectedLines.length+' selected lines; CAD constraints are re-solved after each operation.'}</small><div className="row"><button disabled={selectedLines.length<2} onClick={()=>transformSelected('left')}>Align Left</button><button disabled={selectedLines.length<2} onClick={()=>transformSelected('right')}>Align Right</button></div><div className="row"><button disabled={selectedLines.length<2} onClick={()=>transformSelected('top')}>Align Top</button><button disabled={selectedLines.length<2} onClick={()=>transformSelected('bottom')}>Align Bottom</button></div><div className="row"><button disabled={selectedLines.length<2} onClick={()=>transformSelected('centerX')}>Center X</button><button disabled={selectedLines.length<2} onClick={()=>transformSelected('centerY')}>Center Y</button></div><div className="row"><button disabled={selectedLines.length<3} onClick={()=>transformSelected('distributeX')}>Distribute X</button><button disabled={selectedLines.length<3} onClick={()=>transformSelected('distributeY')}>Distribute Y</button></div><div className="row"><button disabled={selectedLines.length<2} onClick={()=>transformSelected('scaleUp')}>Scale +10%</button><button disabled={selectedLines.length<2} onClick={()=>transformSelected('scaleDown')}>Scale −10%</button></div><div className="row"><button disabled={selectedLines.length<2} onClick={()=>rotateSelected(-15)}>Rotate −15°</button><button disabled={selectedLines.length<2} onClick={()=>rotateSelected(15)}>Rotate +15°</button></div>{selectedStick&&p.sticks.find(s=>s.id===selectedStick)&&(()=>{const s=p.sticks.find(s=>s.id===selectedStick)!,check=stickCollision(s,p.lines);return <div className="stickEditor"><div className={check.collision?'stickAlert':'stickOk'}>{check.outside?'⚠ Support endpoint leaves work area':check.nearest<.025?'⚠ Support overlaps nearby geometry':'✓ Placement clear'} · nearest {check.nearest.toFixed(3)}u</div><label>Length<input type="range" min="20" max="100" value={s.length} onChange={e=>updateStick(s.id,{length:+e.target.value})}/><input type="number" min="20" max="100" value={s.length} onChange={e=>updateStick(s.id,{length:+e.target.value})}/> mm</label><label>Angle<input type="range" min="-180" max="180" value={s.angle} onChange={e=>updateStick(s.id,{angle:+e.target.value})}/><input type="number" min="-180" max="180" value={s.angle} onChange={e=>updateStick(s.id,{angle:+e.target.value})}/>°</label><label>Type<select value={s.kind} onChange={e=>updateStick(s.id,{kind:e.target.value as 'recommended'|'optional'|'avoid'})}><option value="recommended">Recommended</option><option value="optional">Optional</option><option value="avoid">Avoid</option></select></label><div className="row"><b>Score {Math.round(s.score)}/100</b><button onClick={deleteStick}><Trash2/> Delete</button></div></div>})()}</section>
 </section>

<section><div className="sectionTitle"><h3>Project</h3><button onClick={newProject}><Plus/></button></div><input value={p.name} onChange={e=>setP(q=>({...q,name:e.target.value,updatedAt:Date.now()}))}/><div className="row"><button onClick={renameProject}>Rename</button><button onClick={duplicateProject}>Duplicate</button><button onClick={deleteCurrentProject}><Trash2/></button></div><div className="row"><input value={p.widthMm} type="number" onChange={e=>setP(q=>({...q,widthMm:+e.target.value}))}/><span>×</span><input value={p.heightMm} type="number" onChange={e=>setP(q=>({...q,heightMm:+e.target.value}))}/><span>mm</span></div><button className="wide" onClick={()=>downloadSvg(p)}>Export SVG</button><button className="wide" onClick={()=>downloadPng(p)}>Export PNG</button><button className="wide" onClick={exportProjectJson}>Export Project JSON</button><label className="wide fileButton">Import Project JSON<input id="projectJsonImport" hidden type="file" accept=".json,.sugardraw.json" onChange={e=>{const f=e.target.files?.[0];if(f)importProjectJson(f);e.currentTarget.value=''}}/></label><button className="wide" onClick={()=>planPdf(p)}>Production Plan PDF</button><button className="wide" onClick={()=>zipProjects([p])}>Export ZIP (SVG + PNG + PDF + JSON)</button></section><section><div className="sectionTitle"><h3>Saved Projects</h3><span>{projects.length}</span></div><input placeholder="Search projects" value={projectSearch} onChange={e=>setProjectSearch(e.target.value)}/><select value={projectSort} onChange={e=>setProjectSort(e.target.value as 'updated'|'name')}><option value="updated">Recently updated</option><option value="name">Name</option></select>{projects.filter(x=>x.name.toLowerCase().includes(projectSearch.toLowerCase())).sort((a,b)=>projectSort==='name'?a.name.localeCompare(b.name):b.updatedAt-a.updatedAt).map(x=><button className="project" key={x.id} onClick={()=>{const next=normalize(x);setP(next);setProductionPlan(next.productionPlan??null);setProductionSelected(0)}}><FolderOpen/> <span>{x.name}</span></button>)}</section><section><div className="sectionTitle"><h3>Version History</h3><button onClick={()=>saveVersion()}><Plus/></button></div>{p.history.length===0?<small>No versions yet.</small>:p.history.slice().reverse().slice(0,10).map((v,i)=><div className="version" key={v.id}><b>v{p.history.length-i}</b><span>{v.label}</span><small>{new Date(v.createdAt).toLocaleString()}</small><button onClick={()=>restoreVersion(v.id)}>Restore</button><button onClick={()=>duplicateVersion(v.id)}>Duplicate</button></div>)}</section></aside></main>
 {batchOpen&&<div className="batchPanel"><div className="batchHead"><b>Batch Processing</b><div className="row"><button onClick={pauseBatch}>{batchPaused?<Play/>:<Pause/>}{batchPaused?' Resume':' Pause'}</button><button onClick={cancelBatch}><XCircle/> Cancel</button><button onClick={()=>setBatchJobs([])}>Clear</button><button onClick={()=>setBatchOpen(false)}>×</button></div></div>{batchJobs.length===0?<p>Import multiple PNG/JPEG files to start a local worker queue.</p>:batchJobs.map(j=><div className="job" key={j.id}>{j.thumbnail&&<img src={j.thumbnail} alt="" width="48" height="48"/>}<div className="jobInfo"><b>{j.fileName}</b><small>{Math.round(j.size/1024)} KB · {j.width&&j.height?j.width+'×'+j.height+' · ':''}{j.status}</small><div className="bar"><i style={{width:j.progress+'%'}}/></div>{j.error&&<small className="errorText">{j.error}</small>}</div><div className="jobActions">{j.status==='done'&&<button onClick={()=>openBatchResult(j)}><FolderOpen/></button>}{j.status==='error'&&<button onClick={()=>retryBatch(j.id)}><RefreshCw/></button>}{j.status!=='processing'&&<button onClick={()=>removeBatch(j.id)}><Trash2/></button>}</div></div>)}</div>}{playing&&<div className="player"><Play/> Drawing simulation · {progress}%</div>}<footer><button onClick={()=>{setPlayIndex(0);setPlaying(true)}} disabled={!drawingOrder.length}><Play/> Play Drawing Simulation</button><button onClick={()=>setPlaying(v=>!v)} disabled={!drawingOrder.length}>{playing?'Pause':'Resume'}</button><button onClick={()=>setPlayIndex(0)} disabled={!drawingOrder.length}>Reset</button><span>{drawingOrder.length?'Step '+Math.min(playIndex+1,drawingOrder.length)+' / '+drawingOrder.length+' · '+progress+'%':'No drawing path'}</span><span>Local processing · Graph/path reconstruction is geometric; structural analysis is heuristic, not material simulation.</span></footer></div>
}
function Tool({icon,label,on,active}:{icon:ReactNode;label:string;on:()=>void;active?:boolean}){return <button className={active?'tool active':'tool'} onClick={on}>{icon}<small>{label}</small></button>}
