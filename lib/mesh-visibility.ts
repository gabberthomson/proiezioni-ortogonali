// Exact hidden-line removal for projected STL triangles. Depth increases
// toward the viewer. No sampling: even a short occluded interval is clipped.
export type ScreenPoint = [number, number, number];
export type VisibleSegment = {a:number[]; b:number[]; shown:boolean};
export function meshSegments(points:ScreenPoint[], faces:number[][], edges:number[][]):VisibleSegment[]{
  const eps=1e-7;
  const triangles=faces.map(([a,b,c])=>{
    const p=points[a],q=points[b],r=points[c];
    const det=(q[1]-r[1])*(p[0]-r[0])+(r[0]-q[0])*(p[1]-r[1]);
    const bary=(s:number[])=>{
      const u=((q[1]-r[1])*(s[0]-r[0])+(r[0]-q[0])*(s[1]-r[1]))/det;
      const v=((r[1]-p[1])*(s[0]-r[0])+(p[0]-r[0])*(s[1]-r[1]))/det;
      return [u,v,1-u-v];
    };
    return {p,q,r,det,bary,minX:Math.min(p[0],q[0],r[0]),maxX:Math.max(p[0],q[0],r[0]),minY:Math.min(p[1],q[1],r[1]),maxY:Math.max(p[1],q[1],r[1])};
  }).filter(t=>Math.abs(t.det)>eps);
  const result:VisibleSegment[]=[];
  for(const [ia,ib] of edges){
    const a=points[ia],b=points[ib],hidden:number[][]=[];
    if(Math.hypot(a[0]-b[0],a[1]-b[1])<eps)continue;
    for(const tri of triangles){
      if(Math.max(a[0],b[0])<tri.minX-eps||Math.min(a[0],b[0])>tri.maxX+eps||Math.max(a[1],b[1])<tri.minY-eps||Math.min(a[1],b[1])>tri.maxY+eps)continue;
      const u=tri.bary(a),v=tri.bary(b);
      const da=u[0]*tri.p[2]+u[1]*tri.q[2]+u[2]*tri.r[2]-a[2]-eps;
      const db=v[0]*tri.p[2]+v[1]*tri.q[2]+v[2]*tri.r[2]-b[2]-eps;
      let lo=0,hi=1;
      for(const [start,end] of [[u[0]+1e-10,v[0]+1e-10],[u[1]+1e-10,v[1]+1e-10],[u[2]+1e-10,v[2]+1e-10],[da,db]]){
        if(start<0&&end<0){hi=-1;break;}
        if(start<0)lo=Math.max(lo,-start/(end-start));
        else if(end<0)hi=Math.min(hi,-start/(end-start));
      }
      if(hi-lo>eps)hidden.push([lo,hi]);
    }
    hidden.sort((a,b)=>a[0]-b[0]);
    const merged:number[][]=[];
    for(const interval of hidden){
      const last=merged[merged.length-1];
      if(last&&interval[0]<=last[1]+eps)last[1]=Math.max(last[1],interval[1]);
      else merged.push([...interval]);
    }
    const point=(t:number)=>[a[0]+t*(b[0]-a[0]),a[1]+t*(b[1]-a[1])];
    const emit=(lo:number,hi:number,shown:boolean)=>{if(hi-lo>eps)result.push({a:point(lo),b:point(hi),shown});};
    let cursor=0;
    for(const [lo,hi] of merged){emit(cursor,lo,true);emit(lo,hi,false);cursor=hi;}
    emit(cursor,1,true);
  }
  // Visible lines cover coincident hidden ones, never the other way round.
  return result.sort((a,b)=>Number(a.shown)-Number(b.shown));
}
