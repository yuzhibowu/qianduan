import { useEffect, useRef } from "react";
import { interactionAt, type InteractionSample } from "../interaction";

type Props = {
  background: string;
  baseColor: string;
  accentColor: string;
  speed: number;
  timeSeconds: number;
  loopDuration: number;
  interactionTrack?: InteractionSample[];
  lightBloom?: Partial<LightBloomSettings>;
};

export type LightBloomSettings = {
  variant: "bloom" | "shafts";
  direction: "bottom" | "top" | "left" | "right";
  background: string;
  hover: number;
  rise: number;
  spread: number;
  shaftCount: number;
  shaftAmount: number;
  shaftDrift: number;
  grain: number;
  vignette: number;
};

export const DEFAULT_LIGHT_BLOOM: LightBloomSettings = {
  variant: "shafts", direction: "bottom", background: "#000000", hover: 114,
  rise: 79, spread: 72, shaftCount: 17, shaftAmount: 70, shaftDrift: 79,
  grain: 12, vignette: 25,
};

const VERTEX = `attribute vec2 a_pos; void main(){gl_Position=vec4(a_pos,0.,1.);}`;
const FRAGMENT = `
precision highp float;
uniform vec2 uRes; uniform float uTime; uniform int uStyle; uniform int uDirection;
uniform vec3 uBg; uniform vec3 uBase; uniform vec3 uAccent;
uniform float uRise; uniform float uSpread; uniform float uOriginX; uniform float uLift;
uniform float uShaftCount; uniform float uShaftAmount; uniform float uShaftDrift;
uniform float uGrain; uniform float uVignette;
float h11(float x){return fract(sin(x*127.1)*43758.5453123);}
float vn1(float x){float i=floor(x),f=fract(x);f=f*f*(3.-2.*f);return mix(h11(i),h11(i+1.),f);}
void main(){
 vec2 uv=gl_FragCoord.xy/uRes; float aspect=uRes.x/uRes.y; float t=uTime;
 float breathe=1.+.06*sin(t*.35); float depth=mix(.05,1.20,uSpread);
 vec2 lp; float acrossUv; float edgeCoord;
 if(uDirection==1){lp=vec2(uOriginX,1.+depth);acrossUv=uv.x;edgeCoord=1.-uv.y;}
 else if(uDirection==2){lp=vec2(-depth/aspect,uOriginX);acrossUv=uv.y;edgeCoord=uv.x;}
 else if(uDirection==3){lp=vec2(1.+depth/aspect,uOriginX);acrossUv=uv.y;edgeCoord=1.-uv.x;}
 else{lp=vec2(uOriginX,-depth);acrossUv=uv.x;edgeCoord=uv.y;}
 vec2 q=vec2((uv.x-lp.x)*aspect,uv.y-lp.y); float d=length(q);
 float k=mix(9.,1.4,uRise)/breathe; float g=exp(-d*k)/max(exp(-depth*k),1e-4);g=clamp(g,0.,1.);
 if(uStyle==1){float sx=acrossUv*uShaftCount;float dr=t*uShaftDrift;float s=vn1(sx+dr)*.6+vn1(sx*2.17-dr*.8)*.4;float mask=smoothstep(0.,.35,edgeCoord);g*=mix(1.,.45+1.25*s,uShaftAmount*mask);}
 g=clamp(g*(1.+uLift*.25),0.,1.);
 vec3 col=mix(uBg,uBase,smoothstep(0.,.68,g)); col=mix(col,uAccent,smoothstep(.58,.99,g));
 vec2 vc=uv-.5;vc.x*=aspect;col*=1.-uVignette*smoothstep(.35,.95,length(vc));
 float rnd=fract(sin(dot(gl_FragCoord.xy,vec2(12.9898,78.233)))*43758.5453);col+=(rnd-.5)*(uGrain*.06+1.5/255.);
 gl_FragColor=vec4(clamp(col,0.,1.),1.);
}`;

const rgb = (hex: string, fallback: [number, number, number]) => {
  const match = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!match) return fallback;
  const value = Number.parseInt(match[1], 16);
  return [((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255] as const;
};
const shader = (gl: WebGLRenderingContext, type: number, source: string) => {
  const item = gl.createShader(type)!; gl.shaderSource(item, source); gl.compileShader(item);
  if (!gl.getShaderParameter(item, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(item) ?? "Light Bloom shader failed");
  return item;
};

export default function LightBloom({ background, baseColor, accentColor, speed, timeSeconds, loopDuration, interactionTrack = [], lightBloom }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pointerRef = useRef<{ x: number; active: boolean; moved: boolean }>({ x: 0.5, active: false, moved: false });
  const smoothRef = useRef({ x: 0.5, on: 0, lastTime: 0 });
  const renderRef = useRef<((time: number) => void) | null>(null);
  const settings = { ...DEFAULT_LIGHT_BLOOM, ...lightBloom };
  const propsRef = useRef({ background, baseColor, accentColor, speed, loopDuration, interactionTrack, settings });
  propsRef.current = { background, baseColor, accentColor, speed, loopDuration, interactionTrack, settings };
  useEffect(() => {
    const canvas = canvasRef.current!;
    const gl = canvas.getContext("webgl", { antialias: false, alpha: false, preserveDrawingBuffer: true });
    if (!gl) throw new Error("当前环境无法创建 Light Bloom WebGL 上下文");
    const program = gl.createProgram()!;
    gl.attachShader(program, shader(gl, gl.VERTEX_SHADER, VERTEX)); gl.attachShader(program, shader(gl, gl.FRAGMENT_SHADER, FRAGMENT));
    gl.linkProgram(program); gl.useProgram(program);
    const buffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,3,-1,-1,3]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, "a_pos"); gl.enableVertexAttribArray(position); gl.vertexAttribPointer(position,2,gl.FLOAT,false,0,0);
    const uniform = (name: string) => gl.getUniformLocation(program, name)!;
    const uRes=uniform("uRes"),uTime=uniform("uTime"),uStyle=uniform("uStyle"),uDirection=uniform("uDirection"),uBg=uniform("uBg"),uBase=uniform("uBase"),uAccent=uniform("uAccent"),uRise=uniform("uRise"),uSpread=uniform("uSpread"),uOriginX=uniform("uOriginX"),uLift=uniform("uLift"),uShaftCount=uniform("uShaftCount"),uShaftAmount=uniform("uShaftAmount"),uShaftDrift=uniform("uShaftDrift"),uGrain=uniform("uGrain"),uVignette=uniform("uVignette");
    renderRef.current = (time) => {
      const scale=Math.min(devicePixelRatio||1,2), width=Math.max(1,Math.round(canvas.clientWidth*scale)),height=Math.max(1,Math.round(canvas.clientHeight*scale));
      if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height;gl.viewport(0,0,width,height);}
      const current=propsRef.current,s=current.settings,bg=rgb(s.background||current.background,[0,0,0]),base=rgb(current.baseColor,[.42,.17,.96]),accent=rgb(current.accentColor,[.94,.9,1]);
      const recorded=interactionAt(current.interactionTrack,time), active=pointerRef.current.active;
      const targetX=active||pointerRef.current.moved?pointerRef.current.x:recorded?.x??.5;
      const targetOn=active?1:recorded?.active?1:0;
      const smooth=smoothRef.current;
      if(time<smooth.lastTime){smooth.x=.5;smooth.on=0;smooth.lastTime=0;}
      const elapsed=Math.min(.05,Math.max(0,time-smooth.lastTime));
      smooth.lastTime=time;
      smooth.x+=(targetX-smooth.x)*(1-Math.exp(-8*elapsed));
      smooth.on+=(targetOn-smooth.on)*(1-Math.exp(-5*elapsed));
      const direction=s.direction==="top"?1:s.direction==="left"?2:s.direction==="right"?3:0;
      gl.uniform2f(uRes,width,height);gl.uniform1f(uTime,time*(current.speed/50));gl.uniform1i(uStyle,s.variant==="shafts"?1:0);gl.uniform1i(uDirection,direction);gl.uniform3f(uBg,...bg);gl.uniform3f(uBase,...base);gl.uniform3f(uAccent,...accent);gl.uniform1f(uRise,s.rise/100);gl.uniform1f(uSpread,s.spread/100);
      gl.uniform1f(uOriginX,smooth.x);gl.uniform1f(uLift,(s.hover/100)*smooth.on);gl.uniform1f(uShaftCount,Math.max(1,s.shaftCount));gl.uniform1f(uShaftAmount,s.shaftAmount/100);gl.uniform1f(uShaftDrift,s.shaftDrift/100);gl.uniform1f(uGrain,s.grain/100);gl.uniform1f(uVignette,s.vignette/100);gl.drawArrays(gl.TRIANGLES,0,3);
    };
    renderRef.current(timeSeconds);
    return()=>{renderRef.current=null;gl.deleteProgram(program);gl.deleteBuffer(buffer);};
  }, []);
  useEffect(()=>renderRef.current?.(timeSeconds),[timeSeconds]);
  const updatePointer=(event: React.PointerEvent<HTMLCanvasElement>)=>{const rect=event.currentTarget.getBoundingClientRect();pointerRef.current.x=Math.max(0,Math.min(1,(event.clientX-rect.left)/Math.max(1,rect.width)));pointerRef.current.moved=true;renderRef.current?.(timeSeconds);};
  return <canvas ref={canvasRef} className="motion-root" onPointerEnter={(event)=>{updatePointer(event);pointerRef.current.active=true;}} onPointerLeave={(event)=>{updatePointer(event);pointerRef.current.active=false;}} onPointerMove={updatePointer} style={{position:"absolute",inset:0,width:"100%",height:"100%"}} />;
}
