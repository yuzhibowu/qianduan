"use client"

import * as React from "react"
import { useEffect, useRef } from "react"

const SEGMENTS = 192
const FOV = 50
const DPR_CAP = 2

const PX_PER_WORLD = 220
const ATLAS_MAX = 4096
const ATLAS_MIN = 512
const TEXEL_TARGET = 420
const SUPERSAMPLE_MAX = 6

const BACK_DIM = 0.3
const BACK_BIAS = 2.2

const RIM_EDGE = 0.055
const RIM_ALPHA = 0.62
const SIDE_ALPHA = 0.42
const SPIN_AT_50 = 0.16

const REFRACT_AT_100 = 0.30

const DIST_PER_BAND = 1.4

interface ItemProp {
    text?: string
    image?: string
}

const DEFAULT_ITEMS: ItemProp[] = [
    { text: "DESIGN" },
    { text: "MOTION" },
    { text: "SYSTEMS" },
    { text: "BRAND" },
]

const VERT = `
precision highp float;

attribute vec2 aRing;

uniform float uRadius;
uniform float uHeight;
uniform float uRepeats;
uniform float uYaw;
uniform float uPitch;
uniform float uDist;
uniform float uFocal;
uniform float uAspect;

varying vec2  vUv;
varying vec2  vSurf;
varying vec3  vN;
varying float vCos;
varying float vFront;
varying float vNdcX;

void main() {
    float th = aRing.x * 6.2831853 + uYaw;
    vec3 p = vec3(uRadius * sin(th), (0.5 - aRing.y) * uHeight, uRadius * cos(th));

    float c = cos(uPitch);
    float s = sin(uPitch);
    vec3 q = vec3(p.x, p.y * c - p.z * s, p.y * s + p.z * c);

    float depth = uDist - q.z;

    if (depth < 0.05) {
        gl_Position = vec4(2.0, 2.0, 0.0, 1.0);
        vUv = vec2(0.0);
        vSurf = vec2(0.0);
        vN = vec3(0.0, 0.0, 1.0);
        vCos = 0.0;
        vFront = 0.0;
        vNdcX = 2.0;
        return;
    }

    float ndcX = (q.x * uFocal / depth) / uAspect;
    float ndcY = q.y * uFocal / depth;
    gl_Position = vec4(ndcX, ndcY, 0.0, 1.0);

    vUv = vec2(aRing.x * uRepeats, aRing.y);
    vSurf = aRing;

    vec3 n = vec3(sin(th), 0.0, cos(th));
    vN = vec3(n.x, n.y * c - n.z * s, n.y * s + n.z * c);
    vCos = cos(th);

    vFront = smoothstep(-0.18, 0.18, vCos);
    vNdcX = ndcX;
}
`

const FRAG = `
precision highp float;

uniform sampler2D uAtlas;
uniform float uBackDim;
uniform float uBackBias;
uniform float uFade;
uniform float uGrain;
uniform float uRimEdge;
uniform float uRimAlpha;
uniform float uSideAlpha;
uniform vec3  uInk;

varying vec2  vUv;
varying vec2  vSurf;
varying vec3  vN;
varying float vCos;
varying float vFront;
varying float vNdcX;

const vec3 H_TIGHT = vec3(-0.4200, 0.0, 0.9075);
const vec3 H_BROAD = vec3(0.6000, 0.0, 0.8000);

float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

void main() {
    vec4 near = texture2D(uAtlas, vUv);
    vec4 far  = texture2D(uAtlas, vUv, uBackBias);
    vec4 t = mix(far, near, vFront);

    vec4 type = t * mix(uBackDim, 1.0, vFront);

    float fade = smoothstep(-1.0, -1.0 + uFade, vNdcX)
               * (1.0 - smoothstep(1.0 - uFade, 1.0, vNdcX));

    float dEdge = min(vSurf.y, 1.0 - vSurf.y);
    float rim = (1.0 - smoothstep(0.0, uRimEdge * 0.45, dEdge)) * uRimAlpha;
    float rimDark = (1.0 - smoothstep(uRimEdge * 0.5, uRimEdge * 1.9, dEdge))
                  * (1.0 - rim) * 0.16;

    float fres = pow(1.0 - abs(vCos), 4.0) * uSideAlpha;

    vec3 N = normalize(vN);
    vec3 Nf = normalize(vec3(N.x, 0.0, N.z));

    float spec = pow(max(dot(Nf, H_TIGHT), 0.0), 40.0) * 0.58
               + pow(max(dot(Nf, H_BROAD), 0.0), 14.0) * 0.20;

    float top = smoothstep(0.6, 0.0, vSurf.y) * 0.05;

    vec3 edgeTint = mix(vec3(0.78, 0.89, 1.08), vec3(1.09, 0.94, 0.82),
                        0.5 + 0.5 * Nf.x);

    float aFres = clamp(fres * vFront, 0.0, 1.0);
    float aLite = clamp((rim + spec + top) * vFront, 0.0, 1.0);
    float aDark = clamp(rimDark * vFront, 0.0, 1.0);

    float n = hash(vSurf * vec2(1900.0, 520.0));
    float grain = clamp(uGrain * smoothstep(0.55, 1.0, n) * vFront, 0.0, 1.0);

    vec4 acc = vec4(uInk, 1.0) * aDark;
    acc = vec4(edgeTint, 1.0) * aFres + acc * (1.0 - aFres);
    acc = vec4(1.0, 1.0, 1.0, 1.0) * aLite + acc * (1.0 - aLite);
    acc = vec4(uInk, 1.0) * grain + acc * (1.0 - grain);
    acc = type + acc * (1.0 - type.a);

    acc *= fade;
    gl_FragColor = acc;
}
`

function compile(
    gl: WebGLRenderingContext,
    type: number,
    src: string
): WebGLShader | null {
    const sh = gl.createShader(type)
    if (!sh) return null
    gl.shaderSource(sh, src)
    gl.compileShader(sh)
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        console.warn("FrostedTypeBand shader:", gl.getShaderInfoLog(sh))
    }
    return sh
}

function nextPot(n: number, cap: number = ATLAS_MAX): number {
    let p = ATLAS_MIN
    while (p < n && p * 2 <= cap) p *= 2
    return p
}

interface FontLike {
    fontFamily?: string
    fontSize?: string | number
    fontWeight?: string | number
    fontStyle?: string
    letterSpacing?: string | number
}
function fontPx(f: FontLike | undefined): number {
    const raw = f?.fontSize
    const n = typeof raw === "number" ? raw : parseFloat(String(raw ?? ""))
    return Number.isFinite(n) && n > 0 ? n : 64
}
function fontShorthand(f: FontLike | undefined, px: number): string {
    const style = f?.fontStyle ?? "normal"
    const weight = f?.fontWeight ?? 700
    const family = f?.fontFamily ?? "Inter, system-ui, sans-serif"
    return `${style} ${weight} ${px}px ${family}`
}

export interface Framing {
    radius: number
    bandH: number
    pitch: number
    dist: number
    focal: number
    aspect: number
}

export function project(
    th: number,
    v: number,
    f: Framing
): { x: number; y: number } | null {
    const px = f.radius * Math.sin(th)
    const py = (0.5 - v) * f.bandH
    const pz = f.radius * Math.cos(th)
    const c = Math.cos(f.pitch)
    const s = Math.sin(f.pitch)
    const qy = py * c - pz * s
    const qz = py * s + pz * c
    const depth = f.dist - qz
    if (depth < 0.05) return null
    return {
        x: (px * f.focal) / depth / f.aspect,
        y: (qy * f.focal) / depth,
    }
}

export function silhouetteOutlines(f: Framing): { x: number; y: number }[][] {
    const STEPS = 256
    const cosT = f.radius / Math.max(1e-6, f.dist * Math.cos(f.pitch))

    const ranges: [number, number][] = []
    if (cosT < 1) {
        const th = Math.acos(Math.max(-1, cosT))
        ranges.push([-th, th], [th, Math.PI * 2 - th])
    } else {
        ranges.push([0, Math.PI * 2])
    }

    const at = (t0: number, t1: number, i: number) =>
        t0 + (t1 - t0) * ((1 - Math.cos((Math.PI * i) / STEPS)) / 2)
    const loops: { x: number; y: number }[][] = []
    for (const [t0, t1] of ranges) {
        const pts: { x: number; y: number }[] = []
        let bad = false

        for (let i = 0; i <= STEPS; i++) {
            const p = project(at(t0, t1, i), 0, f)
            if (!p) { bad = true; break }
            pts.push(p)
        }
        for (let i = STEPS; i >= 0 && !bad; i--) {
            const p = project(at(t0, t1, i), 1, f)
            if (!p) { bad = true; break }
            pts.push(p)
        }
        if (bad || pts.length < 4) continue

        let area = 0
        for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
            area += (pts[j].x - pts[i].x) * (pts[j].y + pts[i].y)
        }
        if (area < 0) pts.reverse()
        loops.push(pts)
    }
    return loops
}

export function silhouettePath(f: Framing, w: number, h: number): string {
    const loops = silhouetteOutlines(f)
    if (!loops.length) return ""
    const subs = loops.map((pts) => {
        const d = pts.map(
            (p, i) =>
                `${i ? "L" : "M"}${(((p.x + 1) / 2) * w).toFixed(2)} ${(
                    ((1 - p.y) / 2) *
                    h
                ).toFixed(2)}`
        )
        return d.join(" ") + " Z"
    })
    return `path("${subs.join(" ")}")`
}

export interface Profile {
    nx: Float32Array
    top: Float32Array
    bot: Float32Array
}

export function bandProfile(f: Framing, w: number, h: number): Profile {
    const nx = new Float32Array(w)
    const hit = new Uint8Array(w)
    const top = new Float32Array(w).fill(Infinity)
    const bot = new Float32Array(w).fill(-Infinity)

    for (const loop of silhouetteOutlines(f)) {
        for (let i = 0, j = loop.length - 1; i < loop.length; j = i++) {
            const ax = ((loop[j].x + 1) / 2) * w
            const ay = ((1 - loop[j].y) / 2) * h
            const bx = ((loop[i].x + 1) / 2) * w
            const by = ((1 - loop[i].y) / 2) * h
            const lo = Math.max(0, Math.ceil(Math.min(ax, bx)))
            const hi = Math.min(w - 1, Math.floor(Math.max(ax, bx)))
            for (let c = lo; c <= hi; c++) {
                const t = bx === ax ? 0 : (c - ax) / (bx - ax)
                const y = ay + (by - ay) * t
                if (y < top[c]) top[c] = y
                if (y > bot[c]) bot[c] = y
            }
        }
    }
    const cosT = f.radius / Math.max(1e-6, f.dist * Math.cos(f.pitch))
    const half = cosT < 1 ? Math.acos(cosT) : Math.PI / 2
    const N = 2048
    let prevX = -1
    let prevN = 0
    for (let i = 0; i <= N; i++) {
        const th = -half + (2 * half * i) / N
        const p = project(th, 0.5, f)
        if (!p) continue
        const x = ((p.x + 1) / 2) * w
        const n = Math.sin(th)
        const c0 = Math.max(0, Math.ceil(prevX < 0 ? x : prevX))
        const c1 = Math.min(w - 1, Math.floor(x))
        for (let c = c0; c <= c1; c++) {
            const t = prevX < 0 || x === prevX ? 1 : (c - prevX) / (x - prevX)
            nx[c] = prevN + (n - prevN) * t
            hit[c] = 1
        }
        prevX = x
        prevN = n
    }

    let first = -1
    let last = -1
    for (let c = 0; c < w; c++) {
        if (!hit[c]) continue
        if (first < 0) first = c
        last = c
    }
    if (first >= 0) {
        for (let c = 0; c < first; c++) if (top[c] < Infinity) nx[c] = nx[first]
        for (let c = last + 1; c < w; c++) if (top[c] < Infinity) nx[c] = nx[last]
    }
    return { nx, top, bot }
}

const MAP_MAX_W = 512

const RIM_BEVEL = 0.13

export function refractionMap(
    prof: Profile,
    w: number,
    h: number,
    bandH: number
): { url: string; mw: number; mh: number } {
    const div = Math.max(1, Math.ceil(w / MAP_MAX_W))
    const mw = Math.max(2, Math.round(w / div))
    const mh = Math.max(2, Math.round(h / div))
    const canvas = document.createElement("canvas")
    canvas.width = mw
    canvas.height = mh
    const g = canvas.getContext("2d")
    if (!g) return { url: "", mw, mh }
    const img = g.createImageData(mw, mh)
    const bevel = Math.max(1, bandH * RIM_BEVEL)
    for (let my = 0; my < mh; my++) {
        const y = ((my + 0.5) / mh) * h
        for (let mx = 0; mx < mw; mx++) {
            const x = Math.min(w - 1, Math.floor(((mx + 0.5) / mw) * w))
            const dx = prof.nx[x]
            let dy = 0
            const t = prof.top[x]
            const b = prof.bot[x]
            if (t < Infinity) {
                const dTop = y - t
                const dBot = b - y
                if (dTop >= 0 && dTop < bevel) dy += 1 - dTop / bevel
                if (dBot >= 0 && dBot < bevel) dy -= 1 - dBot / bevel
            }
            const i = (my * mw + mx) * 4
            img.data[i] = Math.round(127.5 + 127.5 * Math.max(-1, Math.min(1, dx)))
            img.data[i + 1] = Math.round(127.5 + 127.5 * Math.max(-1, Math.min(1, dy)))
            img.data[i + 2] = 0
            img.data[i + 3] = 255
        }
    }
    g.putImageData(img, 0, 0)
    return { url: canvas.toDataURL(), mw, mh }
}

export function tintGradient(prof: Profile, w: number, tint: string): string {
    const [r, g, b, a] = parseRgba(tint)
    const STOPS = 33
    const parts: string[] = []
    for (let i = 0; i < STOPS; i++) {
        const pct = i / (STOPS - 1)
        const col = Math.min(w - 1, Math.round(pct * (w - 1)))
        const n = Math.abs(prof.nx[col])
        const al = Math.min(0.97, a * (1 + 2.2 * n * n * n))
        parts.push(`rgba(${r},${g},${b},${al.toFixed(3)}) ${(pct * 100).toFixed(1)}%`)
    }
    return `linear-gradient(to right, ${parts.join(", ")})`
}

function parseRgba(c: string | undefined): [number, number, number, number] {
    const s = String(c ?? "").trim()
    const m = s.match(/^#([0-9a-f]{3,8})$/i)
    if (m) {
        let hx = m[1]
        if (hx.length === 3 || hx.length === 4) {
            hx = hx
                .split("")
                .map((ch) => ch + ch)
                .join("")
        }
        const n = parseInt(hx.slice(0, 6), 16)
        const al = hx.length >= 8 ? parseInt(hx.slice(6, 8), 16) / 255 : 1
        return [(n >> 16) & 255, (n >> 8) & 255, n & 255, al]
    }
    const rr = s.match(/rgba?\(([^)]+)\)/i)
    if (rr) {
        const p = rr[1].split(",").map((v) => parseFloat(v))
        return [p[0] || 0, p[1] || 0, p[2] || 0, p.length > 3 ? p[3] : 1]
    }
    return [246, 246, 250, 0.5]
}

function parseRgb(c: string | undefined): [number, number, number] {
    const s = String(c ?? "").trim()
    const m = s.match(/^#([0-9a-f]{3,8})$/i)
    if (m) {
        let h = m[1]
        if (h.length === 3 || h.length === 4) {
            h = h
                .split("")
                .map((ch) => ch + ch)
                .join("")
        }
        const n = parseInt(h.slice(0, 6), 16)
        return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
    }
    const r = s.match(/rgba?\(([^)]+)\)/i)
    if (r) {
        const p = r[1].split(",").map((v) => parseFloat(v))
        return [(p[0] || 0) / 255, (p[1] || 0) / 255, (p[2] || 0) / 255]
    }
    return [0.06, 0.06, 0.08]
}

interface GlassGroup {
    blur: number
    refraction: number
    tint: string
    grain: number
}
interface CursorGroup {
    damping: number
    hover: number
}

export interface FrostedTypeBandProps {
    items?: ItemProp[]
    font?: FontLike
    textColor?: string
    speed?: number
    distance?: number
    tilt?: number
    gap?: number
    fade?: number
    glass?: Partial<GlassGroup>
    cursor?: Partial<CursorGroup>
    /** OriginKit -> Keynote adapter: deterministic absolute timeline. */
    timeSeconds?: number
    width?: number
    height?: number
    style?: React.CSSProperties
}

export default function FrostedTypeBand(props: FrostedTypeBandProps) {
    const {
        items = [{ text: "DESIGN" }, { text: "MOTION" }, { text: "SYSTEMS" }, { text: "BRAND" }],
        font = {
            variant: "Bold",
            fontSize: "16px",
            textAlign: "left",
            fontFamily: "Inter",
            fontWeight: 700,
            lineHeight: "1.5em",
            letterSpacing: "0em",
        } as FontLike,
        textColor = "#FEFF00",
        speed = 100,
        distance = 810,
        tilt = 0,
        gap = 83,
        fade = 49,
        glass = { blur: 100, refraction: 50, tint: "rgba(250,250,255,0.26)", grain: 0 },
        cursor = { hover: 200, damping: 100 },
        timeSeconds,
        style,
    } = props

    const {
        blur = 100,
        refraction = 50,
        tint = "rgba(250,250,255,0.26)",
        grain = 0,
    } = glass
    const { damping = 100, hover = 200 } = cursor

    const hostRef = useRef<HTMLDivElement>(null)
    const plateRef = useRef<HTMLDivElement>(null)
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const feImageRef = useRef<SVGFEImageElement>(null)
    const feDispRef = useRef<SVGFEDisplacementMapElement>(null)

    const filterId = `ftb${React.useId().replace(/[^a-zA-Z0-9]/g, "")}`

    const sizePx = fontPx(font)

    const atlasKey = JSON.stringify([
        items.map((i) => [i?.text ?? "", i?.image ?? ""]),
        fontShorthand(font, sizePx),
        font?.letterSpacing ?? "",
        textColor,
        gap,
    ])

    const live = useRef({
        items,
        font,
        sizePx,
        textColor,
        gap,
        speed,
        distance,
        tilt,
        fade,
        grain,
        blur,
        refraction,
        tint,
        damping,
        hover,
        timeSeconds,
        atlasKey,
    })
    live.current = {
        items,
        font,
        sizePx,
        textColor,
        gap,
        speed,
        distance,
        tilt,
        fade,
        grain,
        blur,
        refraction,
        tint,
        damping,
        hover,
        timeSeconds,
        atlasKey,
    }

    const drag = useRef({
        down: 0,
        lastX: 0,
        vel: 0,
        manual: 0,
        over: 0,
        hoverAmt: 0,
    })

    useEffect(() => {
        const host = hostRef.current
        const canvas = canvasRef.current
        const plate = plateRef.current
        const feImage = feImageRef.current
        const feDisp = feDispRef.current
        if (!host || !canvas || !plate || !feImage || !feDisp) return

        const opts: WebGLContextAttributes = {
            alpha: true,
            antialias: true,
            premultipliedAlpha: true,
            depth: false,
        }

        let isGL2 = true
        let gl = canvas.getContext("webgl2", opts) as WebGLRenderingContext | null
        if (!gl) {
            isGL2 = false
            gl = canvas.getContext("webgl", opts) as WebGLRenderingContext | null
        }
        if (!gl) return

        const vs = compile(gl, gl.VERTEX_SHADER, VERT)
        const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG)
        const prog = gl.createProgram()
        if (!vs || !fs || !prog) return
        gl.attachShader(prog, vs)
        gl.attachShader(prog, fs)
        gl.linkProgram(prog)
        if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
            console.warn("FrostedTypeBand link:", gl.getProgramInfoLog(prog))
            return
        }
        gl.useProgram(prog)

        const aRing = gl.getAttribLocation(prog, "aRing")
        const U = (n: string) => gl.getUniformLocation(prog, n)
        const u = {
            radius: U("uRadius"),
            height: U("uHeight"),
            repeats: U("uRepeats"),
            yaw: U("uYaw"),
            pitch: U("uPitch"),
            dist: U("uDist"),
            focal: U("uFocal"),
            aspect: U("uAspect"),
            atlas: U("uAtlas"),
            backDim: U("uBackDim"),
            backBias: U("uBackBias"),
            fade: U("uFade"),
            grain: U("uGrain"),
            rimEdge: U("uRimEdge"),
            rimAlpha: U("uRimAlpha"),
            sideAlpha: U("uSideAlpha"),
            ink: U("uInk"),
        }

        const verts = new Float32Array((SEGMENTS + 1) * 4)
        for (let i = 0; i <= SEGMENTS; i++) {
            const t = i / SEGMENTS
            verts[i * 4] = t
            verts[i * 4 + 1] = 0
            verts[i * 4 + 2] = t
            verts[i * 4 + 3] = 1
        }
        const ringBuf = gl.createBuffer()
        gl.bindBuffer(gl.ARRAY_BUFFER, ringBuf)
        gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW)
        gl.enableVertexAttribArray(aRing)
        gl.vertexAttribPointer(aRing, 2, gl.FLOAT, false, 0, 0)
        const vertCount = (SEGMENTS + 1) * 2

        const tex = gl.createTexture()
        gl.bindTexture(gl.TEXTURE_2D, tex)
        gl.texImage2D(
            gl.TEXTURE_2D,
            0,
            gl.RGBA,
            1,
            1,
            0,
            gl.RGBA,
            gl.UNSIGNED_BYTE,
            new Uint8Array([0, 0, 0, 0])
        )
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)

        const strip = document.createElement("canvas")
        const sctx = strip.getContext("2d")
        const imgCache = new Map<string, HTMLImageElement>()
        let imgTick = 0
        let builtKey = ""
        let builtTick = -1
        let atlasW = 1
        let atlasH = 1
        let atlasScale = 1
        let ready = false

        const maxTexW = Math.max(
            ATLAS_MIN,
            Math.min(8192, gl.getParameter(gl.MAX_TEXTURE_SIZE) as number)
        )
        const anisoExt = gl.getExtension("EXT_texture_filter_anisotropic") as {
            TEXTURE_MAX_ANISOTROPY_EXT: number
            MAX_TEXTURE_MAX_ANISOTROPY_EXT: number
        } | null
        const aniso = anisoExt
            ? {
                  pname: anisoExt.TEXTURE_MAX_ANISOTROPY_EXT,
                  max: Math.min(
                      8,
                      gl.getParameter(
                          anisoExt.MAX_TEXTURE_MAX_ANISOTROPY_EXT
                      ) as number
                  ),
              }
            : null

        const getImage = (src: string): HTMLImageElement | null => {
            const hit = imgCache.get(src)
            if (hit) return hit.complete && hit.naturalWidth > 0 ? hit : null
            const im = new Image()
            im.crossOrigin = "anonymous"
            im.onload = () => {
                imgTick++
            }
            im.src = src
            imgCache.set(src, im)
            return null
        }

        const buildAtlas = () => {
            if (!sctx) return
            const L = live.current
            const list =
                Array.isArray(L.items) && L.items.length ? L.items : DEFAULT_ITEMS

            const rawH = Math.max(8, Math.round(L.sizePx * 1.7))
            sctx.font = fontShorthand(L.font, L.sizePx)
            let rawSum = 0
            for (const it of list) {
                const src = it?.image
                let w = 0
                if (src) {
                    const im = getImage(src)
                    w = im ? (im.naturalWidth / im.naturalHeight) * rawH * 0.62 : 0
                }
                if (!w) w = Math.max(1, sctx.measureText(it?.text ?? "").width)
                rawSum += w
            }
            const rawW = Math.max(1, rawSum + L.gap * list.length)
            const k = Math.max(
                1,
                Math.min(SUPERSAMPLE_MAX, TEXEL_TARGET / rawH, maxTexW / rawW)
            )

            const px = L.sizePx * k
            const h = Math.max(8, Math.round(rawH * k))
            const gapPx = L.gap * k

            sctx.font = fontShorthand(L.font, px)
            const spacing = L.font?.letterSpacing

            const anyCtx = sctx as unknown as { letterSpacing?: string }
            if (spacing != null) {
                anyCtx.letterSpacing =
                    typeof spacing === "number" ? `${spacing}px` : String(spacing)
            }

            const widths: number[] = []
            let sum = 0
            for (const it of list) {
                const src = it?.image
                let w = 0
                if (src) {
                    const im = getImage(src)
                    w = im ? (im.naturalWidth / im.naturalHeight) * h * 0.62 : 0
                }
                if (!w) w = Math.max(1, sctx.measureText(it?.text ?? "").width)
                widths.push(w)
                sum += w
            }
            const n = widths.length
            const wanted = sum + gapPx * n

            const W = isGL2
                ? Math.min(maxTexW, Math.max(ATLAS_MIN, Math.ceil(wanted)))
                : nextPot(Math.ceil(wanted), maxTexW)

            const slack = W - sum
            const perGap = slack / n
            const squeeze = perGap < 0 ? W / Math.max(1, sum) : 1

            strip.width = W
            strip.height = h
            sctx.clearRect(0, 0, W, h)
            sctx.font = fontShorthand(L.font, px)
            if (spacing != null) {
                anyCtx.letterSpacing =
                    typeof spacing === "number" ? `${spacing}px` : String(spacing)
            }
            sctx.fillStyle = L.textColor
            sctx.textBaseline = "middle"
            sctx.textAlign = "left"

            let x = Math.max(0, perGap) * 0.5
            for (let i = 0; i < n; i++) {
                const it = list[i]
                const w = widths[i] * squeeze
                const src = it?.image
                const im = src ? getImage(src) : null
                if (im) {
                    const ih = h * 0.62
                    sctx.drawImage(im, x, (h - ih) * 0.5, w, ih)
                } else {
                    sctx.save()
                    if (squeeze !== 1) {
                        sctx.translate(x, 0)
                        sctx.scale(squeeze, 1)
                        sctx.fillText(it?.text ?? "", 0, h * 0.5)
                    } else {
                        sctx.fillText(it?.text ?? "", x, h * 0.5)
                    }
                    sctx.restore()
                }
                x += w + Math.max(0, perGap)
            }

            gl.bindTexture(gl.TEXTURE_2D, tex)
            gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 1)
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, strip)

            gl.generateMipmap(gl.TEXTURE_2D)
            gl.texParameteri(
                gl.TEXTURE_2D,
                gl.TEXTURE_MIN_FILTER,
                gl.LINEAR_MIPMAP_LINEAR
            )
            if (aniso) {
                gl.texParameterf(gl.TEXTURE_2D, aniso.pname, aniso.max)
            }
            atlasW = W
            atlasH = h
            atlasScale = k
            ready = true
            builtKey = L.atlasKey
            builtTick = imgTick
        }

        gl.disable(gl.DEPTH_TEST)
        gl.enable(gl.BLEND)

        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
        gl.enable(gl.CULL_FACE)

        let cssW = 0
        let cssH = 0
        const resize = () => {
            const dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP)
            cssW = canvas.clientWidth || host.clientWidth || 0
            cssH = canvas.clientHeight || host.clientHeight || 0
            const w = Math.max(1, Math.round(cssW * dpr))
            const h = Math.max(1, Math.round(cssH * dpr))
            if (canvas.width !== w || canvas.height !== h) {
                canvas.width = w
                canvas.height = h
            }
            gl.viewport(0, 0, w, h)
        }
        resize()
        const ro = new ResizeObserver(resize)
        ro.observe(canvas)

        const onDown = (e: PointerEvent) => {
            const d = drag.current
            d.down = 1
            d.lastX = e.clientX
            d.vel = 0
            host.style.cursor = "grabbing"

            try {
                host.setPointerCapture(e.pointerId)
            } catch {
            }
        }
        const onMove = (e: PointerEvent) => {
            const d = drag.current
            d.over = 1
            if (!d.down) return
            const w = host.offsetWidth || 1

            const dx = (e.clientX - d.lastX) / w
            d.lastX = e.clientX
            d.manual += dx * Math.PI
            d.vel = dx * Math.PI * 12
        }
        const onUp = () => {
            drag.current.down = 0
            host.style.cursor = "grab"
        }
        const onLeave = () => {
            drag.current.over = 0
            drag.current.down = 0
            host.style.cursor = "grab"
        }
        host.addEventListener("pointerdown", onDown)
        host.addEventListener("pointermove", onMove)
        host.addEventListener("pointerleave", onLeave)
        host.addEventListener("pointercancel", onUp)

        window.addEventListener("pointerup", onUp)

        let raf = 0
        let last = performance.now()
        let yaw = 0
        let lastControlledTime = 0

        let clipKey = ""

        const frame = (now: number) => {
            raf = requestAnimationFrame(frame)
            const dt = Math.min((now - last) / 1000, 0.05)
            last = now

            if (cssW <= 0 || cssH <= 0) {
                resize()
                if (cssW <= 0 || cssH <= 0) return
            }

            const L = live.current
            if (L.atlasKey !== builtKey || imgTick !== builtTick) buildAtlas()
            if (!ready) return

            const d = drag.current
            const controlledTime =
                typeof L.timeSeconds === "number" && Number.isFinite(L.timeSeconds)
                    ? Math.max(0, L.timeSeconds)
                    : null
            let timelineDt = dt
            if (controlledTime !== null) {
                if (controlledTime + 1e-6 < lastControlledTime) {
                    yaw = (L.speed / 50) * SPIN_AT_50 * controlledTime
                    timelineDt = 0
                } else {
                    timelineDt = controlledTime - lastControlledTime
                }
                lastControlledTime = controlledTime
            }

            const target = d.over ? 1 : 0
            d.hoverAmt += (target - d.hoverAmt) * Math.min(1, dt * 6)

            const keep = Math.exp(-dt * (0.5 + (L.damping / 100) * 7))
            if (!d.down) {
                yaw += d.vel * dt
                d.vel *= keep
            } else {
                yaw += d.manual
            }
            d.manual = 0

            const slow = 1 - (L.hover / 100) * d.hoverAmt
            yaw += (L.speed / 50) * SPIN_AT_50 * slow * timelineDt

            yaw = yaw % (Math.PI * 2)

            const perWorld = PX_PER_WORLD * atlasScale
            const bandH = atlasH / perWorld
            const tileW = atlasW / perWorld

            const repeats = Math.max(
                1,
                Math.ceil((Math.PI * 2 * bandH * 1.2) / Math.max(0.001, tileW))
            )
            const radius = (repeats * tileW) / (Math.PI * 2)

            const aspect = Math.max(0.05, cssW / Math.max(1, cssH))
            const focal = 1 / Math.tan(((FOV / 2) * Math.PI) / 180)
            const pitch = (L.tilt * Math.PI) / 180

            const dist = Math.max(
                bandH * (L.distance / 100) * DIST_PER_BAND,
                radius + (bandH * focal) / 0.9
            )

            const key = `${radius.toFixed(4)}|${bandH.toFixed(4)}|${pitch.toFixed(
                5
            )}|${dist.toFixed(4)}|${aspect.toFixed(4)}|${cssW}x${cssH}|${
                L.tint
            }|${L.blur}|${L.refraction}`
            if (key !== clipKey) {
                clipKey = key
                const framing = { radius, bandH, pitch, dist, focal, aspect }
                const path = silhouettePath(framing, cssW, cssH)
                const ps = plate.style as CSSStyleDeclaration & {
                    webkitClipPath?: string
                    webkitBackdropFilter?: string
                }
                ps.clipPath = path
                ps.webkitClipPath = path

                const prof = bandProfile(framing, cssW, cssH)
                ps.background = tintGradient(prof, cssW, L.tint)

                const mid = Math.min(cssW - 1, Math.round(cssW / 2))
                const bandPx = Math.max(
                    2,
                    (prof.bot[mid] === -Infinity ? cssH : prof.bot[mid]) -
                        (prof.top[mid] === Infinity ? 0 : prof.top[mid])
                )
                const peak = (L.refraction / 100) * bandPx * REFRACT_AT_100
                const parts: string[] = []
                if (peak > 0.5) {
                    const map = refractionMap(prof, cssW, cssH, bandPx)
                    if (map.url) {
                        feImage.setAttribute("href", map.url)
                        feImage.setAttribute("x", "0")
                        feImage.setAttribute("y", "0")
                        feImage.setAttribute("width", String(cssW))
                        feImage.setAttribute("height", String(cssH))

                        feDisp.setAttribute("scale", (peak * 2).toFixed(2))
                        parts.push(`url(#${filterId})`)
                    }
                }
                if (L.blur > 0) parts.push(`blur(${Math.round(L.blur)}px)`)

                const bf = parts.length ? parts.join(" ") : "none"
                ps.backdropFilter = bf
                ps.webkitBackdropFilter = bf
            }

            gl.useProgram(prog)
            gl.uniform1f(u.radius, radius)
            gl.uniform1f(u.height, bandH)
            gl.uniform1f(u.repeats, repeats)
            gl.uniform1f(u.yaw, yaw)
            gl.uniform1f(u.pitch, pitch)
            gl.uniform1f(u.dist, dist)
            gl.uniform1f(u.focal, focal)
            gl.uniform1f(u.aspect, aspect)
            gl.uniform1f(u.backDim, BACK_DIM)
            gl.uniform1f(u.backBias, BACK_BIAS)

            gl.uniform1f(u.fade, Math.max(0.002, (L.fade / 100) * 2))
            gl.uniform1f(u.grain, (L.grain / 100) * 0.5)
            gl.uniform1f(u.rimEdge, RIM_EDGE)
            gl.uniform1f(u.rimAlpha, RIM_ALPHA)
            gl.uniform1f(u.sideAlpha, SIDE_ALPHA)
            const ink = parseRgb(L.textColor)
            gl.uniform3f(u.ink, ink[0], ink[1], ink[2])
            gl.activeTexture(gl.TEXTURE0)
            gl.bindTexture(gl.TEXTURE_2D, tex)
            gl.uniform1i(u.atlas, 0)

            gl.bindBuffer(gl.ARRAY_BUFFER, ringBuf)
            gl.enableVertexAttribArray(aRing)
            gl.vertexAttribPointer(aRing, 2, gl.FLOAT, false, 0, 0)

            gl.clearColor(0, 0, 0, 0)
            gl.clear(gl.COLOR_BUFFER_BIT)

            gl.cullFace(gl.FRONT)
            gl.drawArrays(gl.TRIANGLE_STRIP, 0, vertCount)
            gl.cullFace(gl.BACK)
            gl.drawArrays(gl.TRIANGLE_STRIP, 0, vertCount)
        }
        raf = requestAnimationFrame(frame)

        return () => {
            cancelAnimationFrame(raf)
            ro.disconnect()
            host.removeEventListener("pointerdown", onDown)
            host.removeEventListener("pointermove", onMove)
            host.removeEventListener("pointerleave", onLeave)
            host.removeEventListener("pointercancel", onUp)
            window.removeEventListener("pointerup", onUp)
            gl.deleteTexture(tex)
            gl.deleteBuffer(ringBuf)
            gl.deleteProgram(prog)
            gl.deleteShader(vs)
            gl.deleteShader(fs)

        }
    }, [])

    const fadePct = Math.max(0, Math.min(49, Math.round(fade)))
    const fadeMask =
        fadePct > 0
            ? `linear-gradient(to right, transparent 0%, #000 ${fadePct}%, #000 ${
                  100 - fadePct
              }%, transparent 100%)`
            : undefined

    return (
        <div
            ref={hostRef}
            style={{
                minWidth: 1200,
                minHeight: 800,
                width: "100%",
                height: "100%",
                position: "relative",
                overflow: "hidden",

                cursor: "grab",
                touchAction: "pan-y",
                userSelect: "none",
                ...style,
            }}
        >
            <svg
                width="0"
                height="0"
                aria-hidden
                style={{ position: "absolute", pointerEvents: "none" }}
            >
                <filter
                    id={filterId}
                    x="0%"
                    y="0%"
                    width="100%"
                    height="100%"
                    colorInterpolationFilters="sRGB"
                    filterUnits="objectBoundingBox"
                    primitiveUnits="userSpaceOnUse"
                >
                    <feImage ref={feImageRef} result="map" preserveAspectRatio="none" />
                    <feDisplacementMap
                        ref={feDispRef}
                        in="SourceGraphic"
                        in2="map"
                        scale="0"
                        xChannelSelector="R"
                        yChannelSelector="G"
                    />
                </filter>
            </svg>
            <div
                ref={plateRef}
                style={{
                    position: "absolute",
                    inset: 0,
                    maskImage: fadeMask,
                    WebkitMaskImage: fadeMask,
                    pointerEvents: "none",

                }}
            />
            <canvas
                ref={canvasRef}
                style={{
                    position: "absolute",
                    inset: 0,
                    width: "100%",
                    height: "100%",
                    display: "block",
                    pointerEvents: "none",
                }}
            />
        </div>
    )
}
