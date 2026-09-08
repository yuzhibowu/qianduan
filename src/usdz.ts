import { strToU8, zipSync } from "fflate"

export type CoinUsdzSettings = { duration:number; delay:number; fps:number; speed:number; ringSpeed:number; count:number; coinSize:number; spread:number; baseColor:string }
const TAU = Math.PI * 2
const turns = (value:number) => value <= 0 ? 0 : Math.max(1, Math.round(value / 50))
const degrees = (time:number, value:number, duration:number, delay:number) => duration > 0 ? Math.max(0, time-delay) / duration * 360 * turns(value) : 0
const matrix4 = (x:number,y:number,z:number,tx:number,ty:number,scale=1) => {
  const rx=x*Math.PI/180,ry=y*Math.PI/180,rz=z*Math.PI/180,sx=Math.sin(rx),cx=Math.cos(rx),sy=Math.sin(ry),cy=Math.cos(ry),sz=Math.sin(rz),cz=Math.cos(rz)
  return `(( ${(cy*cz)*scale}, ${(cy*sz)*scale}, ${(-sy)*scale}, 0), ( ${(sx*sy*cz-cx*sz)*scale}, ${(sx*sy*sz+cx*cz)*scale}, ${(sx*cy)*scale}, 0), ( ${(cx*sy*cz+sx*sz)*scale}, ${(cx*sy*sz-sx*cz)*scale}, ${(cx*cy)*scale}, 0), ( ${tx}, ${ty}, 0, 1))`
}
function geometry(segments=64){const points:number[][]=[],normals:number[][]=[],indices:number[]=[],counts:number[]=[];const half=.05;for(let row=0;row<=1;row++){const y=row===0?half:-half;for(let i=0;i<=segments;i++){const a=i/segments*TAU,x=Math.sin(a),z=Math.cos(a);points.push([x,y,z]);normals.push([x,0,z])}}for(let i=0;i<segments;i++){const a=i,d=i+1,b=segments+1+i,c=b+1;indices.push(a,b,d,b,c,d);counts.push(3,3)}const cap=(top:boolean)=>{const y=top?half:-half,center=points.length;points.push([0,y,0]);normals.push([0,top?1:-1,0]);for(let i=0;i<=segments;i++){const a=i/segments*TAU;points.push([Math.sin(a),y,Math.cos(a)]);normals.push([0,top?1:-1,0])}for(let i=0;i<segments;i++){const a=center+1+i,b=a+1;indices.push(center,top?a:b,top?b:a);counts.push(3)}};cap(true);cap(false);return{points,normals,indices,counts}}
const tuples=(v:number[][])=>`[${v.map(a=>`(${a.map(n=>Number(n.toFixed(8))).join(",")})`).join(",")}]`
const list=(v:number[])=>`[${v.join(",")}]`
const rgb=(hex:string)=>{const n=Number.parseInt(hex.slice(1),16);return[((n>>16)&255)/255,((n>>8)&255)/255,(n&255)/255]}

export function buildCoinUsdz(s:CoinUsdzSettings){
  const frames=Math.max(1,Math.round((s.duration+s.delay)*s.fps)),end=frames-1,g=geometry(),color=rgb(s.baseColor)
  const samples=(fn:(t:number)=>string)=>`{${Array.from({length:frames},(_,f)=>`${f}: ${fn(f/s.fps)}`).join(",")}}`
  const mesh=`def Mesh "CoinMesh" (prepend apiSchemas = ["MaterialBindingAPI"]) {
  uniform token subdivisionScheme = "none"
  point3f[] points = ${tuples(g.points)}
  int[] faceVertexCounts = ${list(g.counts)}
  int[] faceVertexIndices = ${list(g.indices)}
  normal3f[] normals = ${tuples(g.normals)} (interpolation = "vertex")
  rel material:binding = </CoinLoader/CoinMaterial>
}`
  const coins=Array.from({length:s.count},(_,i)=>{const angle=i/s.count*360,p=i/s.count*TAU+TAU/s.count,x=Math.cos(p)*3*s.spread/100,y=Math.sin(p)*3*s.spread/100;return `def Xform "Coin${i+1}" {
  matrix4d xformOp:transform.timeSamples = ${samples(t=>{const d=degrees(t,s.speed,s.duration,s.delay);return matrix4(d,180/s.count+d,angle+90+d,x,y,s.coinSize/100)})}
  uniform token[] xformOpOrder = ["xformOp:transform"]
  ${mesh}
}`}).join("\n")
  const ring=samples(t=>matrix4(0,0,-degrees(t,s.ringSpeed,s.duration,s.delay),0,0,1))
  const model=`#usda 1.0
(
  defaultPrim = "CoinLoader"
  metersPerUnit = 1
  upAxis = "Y"
  startTimeCode = 0
  endTimeCode = ${end}
  framesPerSecond = ${s.fps}
  timeCodesPerSecond = ${s.fps}
  playbackMode = "loop"
  autoPlay = true
)
def Xform "CoinLoader" {
  matrix4d xformOp:transform:ring.timeSamples = ${ring}
  float3 xformOp:scale = (0.6,0.6,0.6)
  uniform token[] xformOpOrder = ["xformOp:transform:ring","xformOp:scale"]
  def Material "CoinMaterial" {
    token outputs:surface.connect = </CoinLoader/CoinMaterial/Surface.outputs:surface>
    def Shader "Surface" {
      uniform token info:id = "UsdPreviewSurface"
      color3f inputs:diffuseColor = (${color.map(v=>v.toFixed(6)).join(",")})
      float inputs:metallic = 1
      float inputs:roughness = 0.2
      token outputs:surface
    }
  }
  ${coins}
}`
  const data=strToU8(model),name="model.usda",padding=(64-(30+name.length+4)%64)%64
  return {bytes:zipSync({[name]:[data,{extra:{6530:new Uint8Array(padding)}}]},{level:0}),frames}
}

export function downloadUsdz(bytes:Uint8Array,name:string){const blob=new Blob([bytes as BlobPart],{type:"model/vnd.usdz+zip"}),url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500)}
