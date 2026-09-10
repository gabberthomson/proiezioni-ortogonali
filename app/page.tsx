"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { Box, RotateCcw, School, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";

type V3 = [number, number, number];
type Edge = [number, number];
type Mode = "front" | "top" | "side";
type Shape = { name: string; short: string; vertices: V3[]; edges: Edge[]; faces: number[][]; mesh?: boolean };
const FACE_COLORS:Record<Mode,string>={front:"#42a8ce",side:"#df5b61",top:"#f2a323"};

const extrudedFaces = (n:number) => [
  [...Array(n)].map((_,i)=>n-1-i),
  [...Array(n)].map((_,i)=>n+i),
  ...[...Array(n)].map((_,i)=>[i,(i+1)%n,(i+1)%n+n,i+n]),
];

const shapes: Record<string, Shape> = {
  cubo: {
    name:"Cubo", short:"Il punto di partenza",
    vertices:[[-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]],
    edges:[[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]],
    faces:[[0,3,2,1],[4,5,6,7],[0,1,5,4],[3,7,6,2],[0,4,7,3],[1,2,6,5]],
  },
  elle: {
    name:"Solido a L", short:"Occhio agli spigoli",
    vertices:[[-1.2,-1,-1],[1.2,-1,-1],[1.2,0,-1],[0,0,-1],[0,1,-1],[-1.2,1,-1],[-1.2,-1,1],[1.2,-1,1],[1.2,0,1],[0,0,1],[0,1,1],[-1.2,1,1]],
    edges:[[0,1],[1,2],[2,3],[3,4],[4,5],[5,0],[6,7],[7,8],[8,9],[9,10],[10,11],[11,6],[0,6],[1,7],[2,8],[3,9],[4,10],[5,11]],
    faces:extrudedFaces(6),
  },
  casa: {
    name:"Casetta", short:"Compare una falda",
    vertices:[[-1.15,-1,-1],[1.15,-1,-1],[1.15,.45,-1],[0,1.2,-1],[-1.15,.45,-1],[-1.15,-1,1],[1.15,-1,1],[1.15,.45,1],[0,1.2,1],[-1.15,.45,1]],
    edges:[[0,1],[1,2],[2,3],[3,4],[4,0],[5,6],[6,7],[7,8],[8,9],[9,5],[0,5],[1,6],[2,7],[3,8],[4,9]],
    faces:extrudedFaces(5),
  },
};

const vectorLength=([x,y,z]:V3)=>Math.hypot(x,y,z);
const unit=(v:V3):V3=>{const l=vectorLength(v)||1;return [v[0]/l,v[1]/l,v[2]/l]};
const dot=(a:V3,b:V3)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const edgeKey=(a:number,b:number)=>a<b?`${a}-${b}`:`${b}-${a}`;
const sampleEvenly=<T,>(items:T[],max:number)=>items.length<=max?items:Array.from({length:max},(_,i)=>items[Math.round(i*(items.length-1)/(max-1))]);

function buildFeatureEdges(vertices:V3[],faces:number[][]){
  const adjacent=new Map<string,{edge:Edge;faces:number[]}>();
  faces.forEach((face,fi)=>face.forEach((a,i)=>{
    const b=face[(i+1)%face.length],key=edgeKey(a,b),entry=adjacent.get(key);
    if(entry)entry.faces.push(fi);else adjacent.set(key,{edge:[a,b],faces:[fi]});
  }));
  const normals=faces.map(face=>unit(normal(face,vertices))),limit=Math.cos(12*Math.PI/180);
  return [...adjacent.values()].filter(x=>x.faces.length!==2||Math.abs(dot(normals[x.faces[0]],normals[x.faces[1]]))<limit).map(x=>x.edge);
}

function parseStl(buffer:ArrayBuffer,fileName:string):Shape{
  const triangles:V3[][]=[];
  // STL usa normalmente X verso destra, Y in profondità e Z verso l'alto.
  // Nel triedro interno X positivo va invece verso sinistra: invertiamo X
  // durante l'importazione, così il modello non appare specchiato a video.
  const fromStl=([x,y,z]:V3):V3=>[-x,z,-y];
  const data=new DataView(buffer);
  const count=buffer.byteLength>=84?data.getUint32(80,true):0;
  const binary=count>0&&84+count*50<=buffer.byteLength;
  if(binary){
    if(count>6000)throw new Error("Il modello supera il limite di 6.000 triangoli.");
    for(let i=0;i<count;i++){
      const start=84+i*50+12,tri:V3[]=[];
      for(let j=0;j<3;j++){
        const p=start+j*12,x=data.getFloat32(p,true),y=data.getFloat32(p+4,true),z=data.getFloat32(p+8,true);
        tri.push(fromStl([x,y,z]));
      }
      triangles.push(tri);
    }
  }else{
    const text=new TextDecoder().decode(buffer),values:[number,number,number][]=[];
    const re=/vertex\s+([-+\d.eE]+)\s+([-+\d.eE]+)\s+([-+\d.eE]+)/g;
    let match:RegExpExecArray|null;
    while((match=re.exec(text)))values.push(fromStl([Number(match[1]),Number(match[2]),Number(match[3])]));
    if(values.length%3!==0||values.length===0)throw new Error("Il file non contiene una mesh STL valida.");
    if(values.length/3>6000)throw new Error("Il modello supera il limite di 6.000 triangoli.");
    for(let i=0;i<values.length;i+=3)triangles.push([values[i],values[i+1],values[i+2]]);
  }
  const raw=triangles.flat();
  if(raw.some(v=>v.some(n=>!Number.isFinite(n))))throw new Error("Il file STL contiene coordinate non valide.");
  const mins:V3=[Infinity,Infinity,Infinity],maxs:V3=[-Infinity,-Infinity,-Infinity];
  raw.forEach(v=>v.forEach((n,i)=>{mins[i]=Math.min(mins[i],n);maxs[i]=Math.max(maxs[i],n)}));
  const center:V3=[0,1,2].map(i=>(mins[i]+maxs[i])/2) as V3;
  const extent=Math.max(...[0,1,2].map(i=>maxs[i]-mins[i]));
  if(extent<=0)throw new Error("Il modello STL non ha dimensioni utilizzabili.");
  const scale=2.2/extent,vertices:V3[]=[],faces:number[][]=[],lookup=new Map<string,number>();
  triangles.forEach(tri=>{
    const face=tri.map(v=>{
      const p:V3=[(v[0]-center[0])*scale,(v[1]-center[1])*scale,(v[2]-center[2])*scale];
      const key=p.map(n=>n.toFixed(5)).join(",");
      let index=lookup.get(key);
      if(index===undefined){index=vertices.length;vertices.push(p);lookup.set(key,index)}
      return index;
    });
    if(new Set(face).size===3)faces.push(face);
  });
  if(!faces.length)throw new Error("Il modello STL contiene soltanto triangoli degeneri.");
  const signedVolume=faces.reduce((sum,[ia,ib,ic])=>{
    const a=vertices[ia],b=vertices[ib],c=vertices[ic];
    return sum+(a[0]*(b[1]*c[2]-b[2]*c[1])-a[1]*(b[0]*c[2]-b[2]*c[0])+a[2]*(b[0]*c[1]-b[1]*c[0]))/6;
  },0);
  if(signedVolume<0)faces.forEach(face=>face.reverse());
  const base=fileName.replace(/\.stl$/i,"")||"Modello importato";
  return {name:base,short:`STL · ${faces.length} triangoli`,vertices,faces,edges:buildFeatureEdges(vertices,faces),mesh:true};
}

function rotate([x,y,z]:V3,yaw:number,pitch:number):V3{
  const a=yaw*Math.PI/180,b=pitch*Math.PI/180;
  const x1=x*Math.cos(a)+z*Math.sin(a),z1=-x*Math.sin(a)+z*Math.cos(a);
  return [x1,y*Math.cos(b)-z1*Math.sin(b),y*Math.sin(b)+z1*Math.cos(b)];
}

function pointsFor(vertices:V3[],mode:Mode,cx:number,cy:number,scale:number){
  // Nel triedro l'asse x positivo si sviluppa verso sinistra.
  // Prospetto e pianta devono conservare questo verso durante il ribaltamento.
  return vertices.map(([x,y,z])=>mode==="front"?[cx-x*scale,cy-y*scale]:mode==="top"?[cx-x*scale,cy+z*scale]:[cx+z*scale,cy-y*scale]);
}

function normal(face:number[],v:V3[]):V3{
  const a=v[face[0]],b=v[face[1]],c=v[face[2]];
  const u:V3=[b[0]-a[0],b[1]-a[1],b[2]-a[2]],w:V3=[c[0]-a[0],c[1]-a[1],c[2]-a[2]];
  return [u[1]*w[2]-u[2]*w[1],u[2]*w[0]-u[0]*w[2],u[0]*w[1]-u[1]*w[0]];
}

function faceMix(face:number[],vertices:V3[]){
  const n=normal(face,vertices);
  // Il colore di un piano conta solo dal lato da cui la faccia è visibile.
  // Una componente negativa appartiene al retro della relativa proiezione:
  // lì gli spigoli sono nascosti e la faccia non deve ricevere quel colore.
  const raw:{mode:Mode;weight:number}[]=[
    {mode:"front",weight:Math.max(0,n[2])},
    {mode:"side",weight:Math.max(0,n[0])},
    {mode:"top",weight:Math.max(0,n[1])},
  ];
  const total=raw.reduce((s,x)=>s+x.weight,0);
  const visible=raw.filter(x=>x.weight/total>.015);
  const visibleTotal=visible.reduce((s,x)=>s+x.weight,0);
  return visible.map(x=>({...x,weight:x.weight/visibleTotal}));
}

function visibleEdgeSet(shape:Shape,vertices:V3[],mode:Mode){
  const view:V3=mode==="front"?[0,0,1]:mode==="top"?[0,1,0]:[1,0,0];
  const result=new Set<string>();
  shape.faces.forEach(face=>{
    const n=normal(face,vertices);
    if(n[0]*view[0]+n[1]*view[1]+n[2]*view[2]>.0001){
      face.forEach((a,i)=>{const b=face[(i+1)%face.length];result.add(a<b?`${a}-${b}`:`${b}-${a}`)});
    }
  });
  return result;
}

function meshEdgesForView(shape:Shape,vertices:V3[],view:V3){
  const adjacent=new Map<string,{edge:Edge;faces:number[]}>();
  shape.faces.forEach((face,fi)=>face.forEach((a,i)=>{
    const b=face[(i+1)%face.length],key=edgeKey(a,b),entry=adjacent.get(key);
    if(entry)entry.faces.push(fi);else adjacent.set(key,{edge:[a,b],faces:[fi]});
  }));
  const normals=shape.faces.map(face=>unit(normal(face,vertices))),creaseLimit=Math.cos(12*Math.PI/180);
  return [...adjacent.values()].flatMap(entry=>{
    const facing=entry.faces.map(fi=>dot(normals[fi],view)>.0001);
    const silhouette=facing.some(Boolean)&&!facing.every(Boolean);
    const crease=entry.faces.length!==2||Math.abs(dot(normals[entry.faces[0]],normals[entry.faces[1]]))<creaseLimit;
    return crease||silhouette?[{edge:entry.edge,shown:facing.some(Boolean)}]:[];
  });
}

function ProjectionWire({shape,vertices,pts,mode,color="#176b87",width=2}:{shape:Shape,vertices:V3[],pts:number[][],mode:Mode,color?:string,width?:number}){
  const view:V3=mode==="front"?[0,0,1]:mode==="top"?[0,1,0]:[1,0,0];
  if(shape.mesh){
    return <g>{meshEdgesForView(shape,vertices,view).map(({edge:[a,b],shown},i)=><line key={i} x1={pts[a][0]} y1={pts[a][1]} x2={pts[b][0]} y2={pts[b][1]} stroke={color} strokeWidth={shown?width:Math.max(1,width*.78)} strokeDasharray={shown?undefined:"7 6"} opacity={shown?1:.72} strokeLinecap="round"/>)}</g>;
  }
  const visible=visibleEdgeSet(shape,vertices,mode);
  return <g>{shape.edges.map(([a,b],i)=>{
    const key=a<b?`${a}-${b}`:`${b}-${a}`,shown=visible.has(key);
    return <line key={i} x1={pts[a][0]} y1={pts[a][1]} x2={pts[b][0]} y2={pts[b][1]} stroke={color} strokeWidth={shown?width:Math.max(1,width*.78)} strokeDasharray={shown?undefined:"7 6"} opacity={shown?1:.72} strokeLinecap="round"/>;
  })}</g>;
}

// Triedro come nello sketch: x va a sinistra, y sale, z scende verso destra.
// I tre piani condividono l'origine e gli stessi tre spigoli.
// Proiezione cavaliera ridotta: l'asse inclinato è a 45° e vale metà.
// Ciascuna componente vale L/(2√2), quindi il vettore inclinato misura L/2.
const DEPTH_COMPONENT=96/(2*Math.SQRT2);
// Direzione dell'osservatore implicita nella proiezione cavaliera.
// Una faccia viene disegnata solo se la sua normale è rivolta verso l'osservatore.
const CAVALIER_VIEW:V3=[DEPTH_COMPONENT/96,DEPTH_COMPONENT/96,1];
const scenePoint=([x,y,z]:V3):number[]=>[445-x*96+z*DEPTH_COMPONENT,320-y*96+z*DEPTH_COMPONENT];
const placeInTrihedron=(vertices:V3[])=>vertices.map(([x,y,z]):V3=>[1.42+x*.62,1.42+y*.62,1.35+z*.62]);
const planePoints=(vertices:V3[],mode:Mode)=>vertices.map(([x,y,z])=>scenePoint(mode==="front"?[x,y,0]:mode==="side"?[0,y,z]:[x,0,z]));

function PlaneScene({shape,vertices,onDown,onMove,onUp}:{shape:Shape,vertices:V3[],onDown:(e:React.PointerEvent<SVGSVGElement>)=>void,onMove:(e:React.PointerEvent<SVGSVGElement>)=>void,onUp:()=>void}){
  const placed=placeInTrihedron(vertices);
  const objectPts=placed.map(scenePoint);
  const front=planePoints(placed,"front"),side=planePoints(placed,"side"),top=planePoints(placed,"top");
  const faces=shape.faces.filter(face=>{
    const n=normal(face,vertices);
    return n[0]*CAVALIER_VIEW[0]+n[1]*CAVALIER_VIEW[1]+n[2]*CAVALIER_VIEW[2]>.0001;
  }).sort((a,b)=>{
    const depth=(f:number[])=>f.reduce((s,i)=>s+vertices[i][0]*CAVALIER_VIEW[0]+vertices[i][1]*CAVALIER_VIEW[1]+vertices[i][2]*CAVALIER_VIEW[2],0)/f.length;
    return depth(a)-depth(b);
  });
  const mixes=faces.map(face=>faceMix(face,vertices));
  const mixKey=(mix:ReturnType<typeof faceMix>)=>mix.map(x=>`${x.mode[0]}${Math.round(x.weight*20)}`).join("-");
  const patternAngle=(mix:ReturnType<typeof faceMix>)=>{
    const modes=new Set(mix.map(x=>x.mode));
    if(modes.size===3)return -45;
    if(modes.has("front")&&modes.has("side"))return 0;
    if(modes.has("front")&&modes.has("top"))return 90;
    return 45; // laterale + orizzontale: parallelo all'asse inclinato del triedro
  };
  const patterns=new Map<string,ReturnType<typeof faceMix>>();
  mixes.filter(m=>m.length>1).forEach(m=>{const key=mixKey(m);if(!patterns.has(key))patterns.set(key,m)});
  const constructionStep=shape.mesh?Math.max(1,Math.ceil(placed.length/24)):2;
  const modelMeshEdges=shape.mesh?meshEdgesForView(shape,vertices,CAVALIER_VIEW).filter(x=>x.shown):[];
  const planes:{mode:Mode;corners:V3[];label:string;pts:number[][]}[]=[
    {mode:"front",label:"PIANO FRONTALE · PROSPETTO",corners:[[0,0,0],[3.5,0,0],[3.5,3.25,0],[0,3.25,0]],pts:front},
    {mode:"side",label:"PIANO LATERALE · PROFILO",corners:[[0,0,0],[0,3.25,0],[0,3.25,3.35],[0,0,3.35]],pts:side},
    {mode:"top",label:"PIANO ORIZZONTALE · PIANTA",corners:[[0,0,0],[3.5,0,0],[3.5,0,3.35],[0,0,3.35]],pts:top},
  ];
  return <svg className="model-svg trihedral" viewBox="0 0 860 610" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} role="img" aria-label={`${shape.name} pieno circondato dai tre piani di proiezione`}>
    <defs>{[...patterns.entries()].map(([key,mix])=>{
      let x=0;
      return <pattern key={key} id={`face-stripes-${key}`} patternUnits="userSpaceOnUse" width="30" height="30" patternTransform={`rotate(${patternAngle(mix)})`}>{mix.map(part=>{const start=x;x+=part.weight*30;return <rect key={part.mode} x={start} y="-20" width={part.weight*30+.4} height="70" fill={FACE_COLORS[part.mode]}/>})}</pattern>;
    })}</defs>
    {planes.map((p,i)=>{const corners=p.corners.map(scenePoint);return <g key={p.mode} className={`plane plane-${p.mode}`}><polygon points={corners.map(x=>x.join(",")).join(" ")}/><text x={i===0?145:i===1?585:285} y={i===0?74:i===1?105:552}>{p.label}</text></g>})}
    <g className="trihedron-axes"><line x1="445" y1="320" x2="109" y2="320"/><line x1="445" y1="320" x2="445" y2="34"/><line x1="445" y1="320" x2="690" y2="565"/><circle cx="445" cy="320" r="5"/></g>
    <g className="construction-lines">{placed.filter((_,i)=>i%constructionStep===0).flatMap((v,i)=>{
      const p=scenePoint(v),targets=[scenePoint([v[0],v[1],0]),scenePoint([0,v[1],v[2]]),scenePoint([v[0],0,v[2]])];
      return targets.map((t,j)=><line key={`${i}-${j}`} x1={p[0]} y1={p[1]} x2={t[0]} y2={t[1]}/>);
    })}</g>
    <g className="plane-projection front-projection"><ProjectionWire shape={shape} vertices={vertices} pts={front} mode="front" color={FACE_COLORS.front}/></g>
    <g className="plane-projection side-projection"><ProjectionWire shape={shape} vertices={vertices} pts={side} mode="side" color={FACE_COLORS.side}/></g>
    <g className="plane-projection top-projection"><ProjectionWire shape={shape} vertices={vertices} pts={top} mode="top" color={FACE_COLORS.top}/></g>
    <g className={shape.mesh?"solid mesh-solid":"solid"}>{faces.map((face,i)=><polygon key={i} points={face.map(k=>objectPts[k].join(",")).join(" ")} fill={mixes[i].length===1?FACE_COLORS[mixes[i][0].mode]:`url(#face-stripes-${mixKey(mixes[i])})`}/>)}</g>
    {shape.mesh&&<g className="mesh-outline">{modelMeshEdges.map(({edge:[a,b]},i)=><line key={i} x1={objectPts[a][0]} y1={objectPts[a][1]} x2={objectPts[b][0]} y2={objectPts[b][1]}/>)}</g>}
  </svg>;
}

function TaskSheet({shape,vertices,onClose}:{shape:Shape,vertices:V3[],onClose:()=>void}){
  const f=pointsFor(vertices,"front",125,97,39),t=pointsFor(vertices,"top",125,90,39),s=pointsFor(vertices,"side",125,97,39);
  const featureIndices=shape.mesh?Array.from(new Set(shape.edges.flat())):vertices.map((_,i)=>i);
  const sourceIndices=featureIndices.length?featureIndices:vertices.map((_,i)=>i);
  const constructionIndices=shape.mesh?sampleEvenly(sourceIndices,60):sourceIndices;
  const allDepths=Array.from(new Set(sourceIndices.map(i=>Number(vertices[i][2].toFixed(2))))).sort((a,b)=>a-b);
  const depths=shape.mesh?sampleEvenly(allDepths,16):allDepths;
  const depthGuides=depths.map(z=>{
    const indices=vertices.map((v,i)=>Math.abs(v[2]-z)<.011?i:-1).filter(i=>i>=0);
    const i=indices[0],planY=380+t[i][1],radius=planY-330,turnX=500+radius;
    return {z,planY,turnX,radius,planStartX:Math.max(...indices.map(k=>110+t[k][0])),profileTopY:Math.min(...indices.map(k=>100+s[k][1]))};
  });
  return <div className="task-overlay" role="dialog" aria-modal="true"><div className="task-shell"><div className="task-toolbar"><div><b>Elaborato di proiezioni ortogonali</b><span>{shape.name} · metodo europeo</span></div><Button variant="outline" size="icon" onClick={onClose} aria-label="Chiudi"><X/></Button></div><div className="sheet"><div className="sheet-title"><span>PROIEZIONI ORTOGONALI</span><small>Oggetto: {shape.name}</small></div><svg viewBox="0 0 1000 650">
      <line x1="500" y1="55" x2="500" y2="615" className="sheet-axis"/><line x1="55" y1="330" x2="945" y2="330" className="sheet-axis"/>
    <g className="task-construction">
      {constructionIndices.map(i=><line key={`v-${i}`} x1={110+f[i][0]} y1={100+f[i][1]} x2={110+t[i][0]} y2={380+t[i][1]}/>)}
      {constructionIndices.map(i=><line key={`h-${i}`} x1={110+f[i][0]} y1={100+f[i][1]} x2={515+s[i][0]} y2={100+s[i][1]}/>)}
    </g>
    <g className="depth-transfer">{depthGuides.map(g=><g key={g.z}><line x1={g.planStartX} y1={g.planY} x2="500" y2={g.planY}/><path d={`M500 ${g.planY} A${g.radius} ${g.radius} 0 0 0 ${g.turnX} 330`}/><line x1={g.turnX} y1="330" x2={g.turnX} y2={g.profileTopY}/></g>)}</g>
    <g transform="translate(110 100)"><text x="0" y="-15" className="sheet-label">PROSPETTO</text><ProjectionWire shape={shape} vertices={vertices} pts={f} mode="front" color={FACE_COLORS.front} width={2.5}/></g>
    <g transform="translate(515 100)"><text x="0" y="-15" className="sheet-label">PROFILO</text><ProjectionWire shape={shape} vertices={vertices} pts={s} mode="side" color={FACE_COLORS.side} width={2.5}/></g>
    <g transform="translate(110 380)"><text x="0" y="-15" className="sheet-label">PIANTA</text><ProjectionWire shape={shape} vertices={vertices} pts={t} mode="top" color={FACE_COLORS.top} width={2.5}/></g>
    <text x="650" y="590" className="arc-label">RIBALTAMENTO A 90°</text>
  </svg></div></div></div>;
}

export default function Home(){
  const [shapeKey,setShapeKey]=useState("elle");
  const [customShape,setCustomShape]=useState<Shape|null>(null),[importError,setImportError]=useState("");
  const [yaw,setYaw]=useState(0),[pitch,setPitch]=useState(0),[task,setTask]=useState(false);
  const drag=useRef<{x:number;y:number;yaw:number;pitch:number}|null>(null);
  const fileInput=useRef<HTMLInputElement|null>(null);
  const shape=shapeKey==="stl"&&customShape?customShape:shapes[shapeKey],vertices=useMemo(()=>shape.vertices.map(v=>rotate(v,yaw,pitch)),[shape,yaw,pitch]);
  const down=useCallback((e:React.PointerEvent<SVGSVGElement>)=>{drag.current={x:e.clientX,y:e.clientY,yaw,pitch};e.currentTarget.setPointerCapture(e.pointerId)},[yaw,pitch]);
  const move=useCallback((e:React.PointerEvent<SVGSVGElement>)=>{if(!drag.current)return;setYaw(drag.current.yaw+(e.clientX-drag.current.x)*.45);setPitch(Math.max(-70,Math.min(70,drag.current.pitch-(e.clientY-drag.current.y)*.35)))},[]);
  const importStl=async(e:React.ChangeEvent<HTMLInputElement>)=>{
    const file=e.target.files?.[0];e.target.value="";
    if(!file)return;
    if(file.size>20*1024*1024){setImportError("Il file supera il limite di 20 MB.");return}
    try{
      const imported=parseStl(await file.arrayBuffer(),file.name);
      setCustomShape(imported);setShapeKey("stl");setYaw(0);setPitch(0);setImportError("");
    }catch(error){setImportError(error instanceof Error?error.message:"Non riesco a leggere questo STL.")}
  };
  return <main><header className="topbar"><div className="brand"><span><Box/></span><div><b>PROIETTA</b><small>laboratorio di geometria descrittiva</small></div></div><Button onClick={()=>setTask(true)}><School/>Visualizza come compito</Button></header>
    <div className="workspace"><aside className="controls"><div><p className="eyebrow">1 · Scegli il solido</p><div className="shape-list">{Object.entries(shapes).map(([key,s])=><button key={key} onClick={()=>setShapeKey(key)} className={key===shapeKey?"active":""}><span className="shape-icon"><Box/></span><span><b>{s.name}</b><small>{s.short}</small></span></button>)}{customShape&&<button onClick={()=>setShapeKey("stl")} className={shapeKey==="stl"?"active":""}><span className="shape-icon"><Upload/></span><span><b>{customShape.name}</b><small>{customShape.short}</small></span></button>}</div><input ref={fileInput} className="stl-input" type="file" accept=".stl,model/stl" onChange={importStl}/><Button className="import-stl" variant="outline" onClick={()=>fileInput.current?.click()}><Upload/>Importa STL</Button>{importError&&<p className="import-error" role="alert">{importError}</p>}<p className="import-note">STL ASCII o binario · massimo 20 MB / 6.000 triangoli</p></div>
      <div className="rotation-controls"><div className="control-title"><p className="eyebrow">2 · Ruota l’oggetto</p><button onClick={()=>{setYaw(0);setPitch(0)}} aria-label="Ripristina orientamento a zero"><RotateCcw/></button></div><label>Rotazione orizzontale <output>{Math.round(yaw)}°</output></label><Slider min={-180} max={180} step={1} value={[yaw]} onValueChange={v=>setYaw(v[0])}/><label>Inclinazione <output>{Math.round(pitch)}°</output></label><Slider min={-70} max={70} step={1} value={[pitch]} onValueChange={v=>setPitch(v[0])}/><p className="hint">Trascina il solido: le proiezioni restano aderenti ai tre piani.</p></div>
      <div className="legend"><span><i className="color-dot front-dot"/>piano frontale</span><span><i className="color-dot side-dot"/>piano laterale</span><span><i className="color-dot top-dot"/>piano orizzontale</span><span><i className="visible-sample"/>spigolo visibile</span><span><i className="hidden-sample"/>spigolo nascosto</span></div>
      <div className="lesson"><span>Regola</span><p>Il solido è pieno. Sui piani compaiono soltanto i suoi contorni: continui se visibili, tratteggiati se nascosti.</p></div>
    </aside>
    <section className="stage"><div className="stage-title"><div><p className="eyebrow">Tre piani di proiezione</p><h1>{shape.name}</h1></div><span className="drag-pill">trascina per ruotare</span></div><div className="diagram single-scene"><PlaneScene shape={shape} vertices={vertices} onDown={down} onMove={move} onUp={()=>drag.current=null}/></div></section></div>
    <footer><span>Solido pieno · proiezioni wireframe</span><span>Tratteggio = spigolo non visibile</span></footer>{task&&<TaskSheet shape={shape} vertices={vertices} onClose={()=>setTask(false)}/>}
  </main>;
}
