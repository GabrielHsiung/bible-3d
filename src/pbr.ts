/**
 * 程序生成的 PBR 材質（不用外部素材）。
 *
 * 每種材質輸出：
 *  - map：顏色（sRGB）
 *  - normalMap：由高度圖算出的法線
 *  - roughnessMap / aoMap / metalnessMap：同一張「ORM」貼圖（R=AO、G=粗糙度、B=金屬度），
 *    three.js 會各自讀對應的通道，所以只要產生、上傳一次。
 *
 * 即時畫面和路徑追蹤（拍照模式）都能用（路徑追蹤會忽略 aoMap）。
 * 效能：所有貼圖在模組載入時一次產生；同一張底圖用 clone() 換 repeat，不重算、不重傳 GPU。
 */
import * as THREE from 'three'
import { mulberry } from './rng'

type F32 = Float32Array

/* ============================================================
 * 雜訊工具（全部可無縫重複）
 * ============================================================ */

/** 值雜訊：cx × cy 個格點，雙線性＋smoothstep 插值 */
function vnoise(size: number, cx: number, cy: number, seed: number): F32 {
  const rnd = mulberry(seed)
  const g = new Float32Array(cx * cy)
  for (let i = 0; i < g.length; i++) g[i] = rnd()
  const out = new Float32Array(size * size)
  const x0 = new Int32Array(size)
  const x1 = new Int32Array(size)
  const fx = new Float32Array(size)
  for (let x = 0; x < size; x++) {
    const gx = (x / size) * cx
    const ix = Math.floor(gx)
    const f = gx - ix
    fx[x] = f * f * (3 - 2 * f)
    x0[x] = ix % cx
    x1[x] = (ix + 1) % cx
  }
  for (let y = 0; y < size; y++) {
    const gy = (y / size) * cy
    const iy = Math.floor(gy)
    let f = gy - iy
    f = f * f * (3 - 2 * f)
    const r0 = (iy % cy) * cx
    const r1 = ((iy + 1) % cy) * cx
    const row = y * size
    for (let x = 0; x < size; x++) {
      const a = g[r0 + x0[x]]
      const b = g[r0 + x1[x]]
      const c = g[r1 + x0[x]]
      const d = g[r1 + x1[x]]
      const u = fx[x]
      out[row + x] = a + (b - a) * u + (c - a) * f + (a - b - c + d) * u * f
    }
  }
  return out
}

/** 分形雜訊（0..1） */
function fbm(size: number, cx: number, cy: number, oct: number, seed: number, gain = 0.5): F32 {
  const out = new Float32Array(size * size)
  let amp = 1
  let tot = 0
  for (let o = 0; o < oct; o++) {
    const n = vnoise(size, Math.min(size, cx << o), Math.min(size, cy << o), seed + o * 101)
    for (let i = 0; i < out.length; i++) out[i] += n[i] * amp
    tot += amp
    amp *= gain
  }
  for (let i = 0; i < out.length; i++) out[i] /= tot
  return out
}

/** Worley（細胞）雜訊：f1 = 到最近點距離、f2 = 第二近（單位：格），id = 最近點的亂數 */
function worley(size: number, cells: number, seed: number, jitter = 0.9) {
  const rnd = mulberry(seed)
  const px = new Float32Array(cells * cells)
  const py = new Float32Array(cells * cells)
  const pid = new Float32Array(cells * cells)
  for (let i = 0; i < px.length; i++) {
    px[i] = 0.5 + (rnd() - 0.5) * jitter
    py[i] = 0.5 + (rnd() - 0.5) * jitter
    pid[i] = rnd()
  }
  const f1 = new Float32Array(size * size)
  const f2 = new Float32Array(size * size)
  const id = new Float32Array(size * size)
  const k = cells / size
  for (let y = 0; y < size; y++) {
    const gy = (y + 0.5) * k
    const cj = Math.floor(gy)
    for (let x = 0; x < size; x++) {
      const gx = (x + 0.5) * k
      const ci = Math.floor(gx)
      let b1 = 1e9
      let b2 = 1e9
      let bid = 0
      for (let dj = -1; dj <= 1; dj++) {
        const nj = (cj + dj + cells) % cells
        for (let di = -1; di <= 1; di++) {
          const ni = (ci + di + cells) % cells
          const c = nj * cells + ni
          const dx = ci + di + px[c] - gx
          const dy = cj + dj + py[c] - gy
          const d = dx * dx + dy * dy
          if (d < b1) {
            b2 = b1
            b1 = d
            bid = pid[c]
          } else if (d < b2) b2 = d
        }
      }
      const i = y * size + x
      f1[i] = Math.sqrt(b1)
      f2[i] = Math.sqrt(b2)
      id[i] = bid
    }
  }
  return { f1, f2, id }
}

/** 可重複的盒狀模糊（可分離，O(n)） */
function blur(src: F32, size: number, r: number): F32 {
  const tmp = new Float32Array(src.length)
  const out = new Float32Array(src.length)
  const w = 2 * r + 1
  for (let y = 0; y < size; y++) {
    const row = y * size
    let acc = 0
    for (let k = -r; k <= r; k++) acc += src[row + ((k + size) % size)]
    for (let x = 0; x < size; x++) {
      tmp[row + x] = acc / w
      acc += src[row + ((x + r + 1) % size)] - src[row + ((x - r + size) % size)]
    }
  }
  for (let x = 0; x < size; x++) {
    let acc = 0
    for (let k = -r; k <= r; k++) acc += tmp[((k + size) % size) * size + x]
    for (let y = 0; y < size; y++) {
      out[y * size + x] = acc / w
      acc += tmp[((y + r + 1) % size) * size + x] - tmp[((y - r + size) % size) * size + x]
    }
  }
  return out
}

/* ============================================================
 * 貼圖輸出
 * ============================================================ */
const clamp = (v: number, a = 0, b = 1) => (v < a ? a : v > b ? b : v)
const sstep = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a))
  return t * t * (3 - 2 * t)
}

function makeTex(data: Uint8Array, size: number, srgb: boolean) {
  const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat)
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.magFilter = THREE.LinearFilter
  t.minFilter = THREE.LinearMipmapLinearFilter
  t.generateMipmaps = true
  t.anisotropy = 8
  t.needsUpdate = true
  return t
}

/** 顏色：r,g,b 是 0..1 的 sRGB 值 */
function colorTex(size: number, r: F32, g: F32, b: F32) {
  const data = new Uint8Array(size * size * 4)
  for (let i = 0, j = 0; i < r.length; i++, j += 4) {
    data[j] = clamp(r[i]) * 255
    data[j + 1] = clamp(g[i]) * 255
    data[j + 2] = clamp(b[i]) * 255
    data[j + 3] = 255
  }
  return makeTex(data, size, true)
}

/** ORM：R = AO、G = 粗糙度、B = 金屬度 */
function ormTex(size: number, ao: F32, rough: F32, metal: F32 | number) {
  const data = new Uint8Array(size * size * 4)
  for (let i = 0, j = 0; i < ao.length; i++, j += 4) {
    data[j] = clamp(ao[i]) * 255
    data[j + 1] = clamp(rough[i]) * 255
    data[j + 2] = clamp(typeof metal === 'number' ? metal : metal[i]) * 255
    data[j + 3] = 255
  }
  return makeTex(data, size, false)
}

/** 高度 → 切線空間法線（OpenGL 慣例，+v 向上） */
function normalTex(h: F32, size: number, strength: number) {
  const data = new Uint8Array(size * size * 4)
  for (let y = 0; y < size; y++) {
    const up = ((y + 1) % size) * size
    const dn = ((y - 1 + size) % size) * size
    const row = y * size
    for (let x = 0; x < size; x++) {
      const xr = (x + 1) % size
      const xl = (x - 1 + size) % size
      const dx = (h[row + xr] - h[row + xl]) * strength
      const dy = (h[up + x] - h[dn + x]) * strength
      const inv = 1 / Math.sqrt(dx * dx + dy * dy + 1)
      const j = (row + x) * 4
      data[j] = (-dx * inv * 0.5 + 0.5) * 255
      data[j + 1] = (-dy * inv * 0.5 + 0.5) * 255
      data[j + 2] = (inv * 0.5 + 0.5) * 255
      data[j + 3] = 255
    }
  }
  return makeTex(data, size, false)
}

/** 凹處比周圍低 → 變暗（簡易 AO） */
function cavityAO(h: F32, size: number, r: number, k: number, floor = 0.35): F32 {
  const b = blur(h, size, r)
  const out = new Float32Array(h.length)
  for (let i = 0; i < h.length; i++) out[i] = clamp(1 - Math.max(0, b[i] - h[i]) * k, floor, 1)
  return out
}

/** sRGB 調色盤 */
const hex = (c: string): [number, number, number] => {
  const n = parseInt(c.slice(1), 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

/** 3 張通道陣列，方便逐像素寫顏色 */
function rgb(n: number): [F32, F32, F32] {
  return [new Float32Array(n), new Float32Array(n), new Float32Array(n)]
}
function put(c: [F32, F32, F32], i: number, r: number, g: number, b: number) {
  c[0][i] = r
  c[1][i] = g
  c[2][i] = b
}
function mixTo(c: [F32, F32, F32], i: number, a: number[], b: number[], t: number) {
  c[0][i] = a[0] + (b[0] - a[0]) * t
  c[1][i] = a[1] + (b[1] - a[1]) * t
  c[2][i] = a[2] + (b[2] - a[2]) * t
}
function blendTo(c: [F32, F32, F32], i: number, b: number[], t: number) {
  c[0][i] += (b[0] - c[0][i]) * t
  c[1][i] += (b[1] - c[1][i]) * t
  c[2][i] += (b[2] - c[2][i]) * t
}
function scaleAt(c: [F32, F32, F32], i: number, k: number) {
  c[0][i] *= k
  c[1][i] *= k
  c[2][i] *= k
}

/* ============================================================
 * 快取與 repeat
 * ============================================================ */
export interface PBRMaps {
  map: THREE.Texture
  normalMap: THREE.Texture
  roughnessMap: THREE.Texture
  aoMap: THREE.Texture
  metalnessMap?: THREE.Texture
}

const base = new Map<string, PBRMaps>()
const withRep = new Map<string, PBRMaps>()
/** 生成時間統計（毫秒），可在 console 用 window.__texMs 查看 */
export const texStats: Record<string, number> = {}

function make(key: string, gen: () => PBRMaps): PBRMaps {
  let b = base.get(key)
  if (!b) {
    const t0 = performance.now()
    b = gen()
    texStats[key] = Math.round(performance.now() - t0)
    base.set(key, b)
    if (typeof window !== 'undefined') (window as unknown as { __texMs: unknown }).__texMs = texStats
  }
  return b
}

function rep(key: string, b: PBRMaps, repeat: [number, number]): PBRMaps {
  const k = key + '|' + repeat[0] + 'x' + repeat[1]
  let r = withRep.get(k)
  if (!r) {
    const clones = new Map<THREE.Texture, THREE.Texture>()
    const cl = (t: THREE.Texture) => {
      let c = clones.get(t)
      if (!c) {
        c = t.clone()
        c.repeat.set(repeat[0], repeat[1])
        clones.set(t, c)
      }
      return c
    }
    const orm = cl(b.roughnessMap)
    r = { map: cl(b.map), normalMap: cl(b.normalMap), roughnessMap: orm, aoMap: orm }
    if (b.metalnessMap) r.metalnessMap = orm
    withRep.set(k, r)
  }
  return r
}

/* ============================================================
 * 金屬：鎚打過的金屬板
 * ============================================================ */
interface MetalOpt {
  N: number
  cells: number
  seed: number
  base: string
  dark: string
  bright: string
  grime: string
  roughMin: number
  roughMax: number
  grimeAmt: number
  scratches: number
  green?: string
  /** 鎚痕深淺（1 = 預設） */
  depth?: number
  /** 每個鎚痕的明暗／粗糙度差異 */
  cellVar?: number
}

function hammeredMetal(o: MetalOpt): PBRMaps {
  const { N } = o
  const w = worley(N, o.cells, o.seed, 0.85)
  const big = fbm(N, 3, 3, 3, o.seed + 1)
  const mid = fbm(N, 12, 12, 2, o.seed + 2)
  const h = new Float32Array(N * N)
  for (let i = 0; i < h.length; i++) {
    // 每一鎚是一個淺凹坑：中心低、邊緣（兩坑交界）形成細稜
    const d = w.f1[i]
    h[i] = (d * d * 1.2 + (w.id[i] - 0.5) * 0.08) * (o.depth ?? 1) + (mid[i] - 0.5) * 0.35
  }
  // 刮痕：細長的直線，略凹、較粗糙
  const scratch = new Float32Array(N * N)
  const rnd = mulberry(o.seed + 3)
  for (let s = 0; s < o.scratches; s++) {
    const x0 = rnd() * N
    const y0 = rnd() * N
    const ang = rnd() < 0.6 ? Math.PI / 2 + (rnd() - 0.5) * 0.5 : rnd() * Math.PI
    const len = 10 + rnd() * N * 0.25
    const a = 0.25 + rnd() * 0.6
    const ca = Math.cos(ang)
    const sa = Math.sin(ang)
    for (let t = 0; t < len; t++) {
      const px = Math.floor(x0 + ca * t + N) % N
      const py = Math.floor(y0 + sa * t + N) % N
      const k = py * N + px
      scratch[k] = Math.max(scratch[k], a * (1 - Math.abs(t / len - 0.5) * 1.6))
    }
  }
  for (let i = 0; i < h.length; i++) h[i] -= scratch[i] * 0.06
  const ao = cavityAO(h, N, 3, 2.2, 0.55)
  const grime = fbm(N, 6, 6, 3, o.seed + 4)
  const C = rgb(N * N)
  const rough = new Float32Array(N * N)
  const metal = new Float32Array(N * N)
  const B = hex(o.base)
  const D = hex(o.dark)
  const L = hex(o.bright)
  const G = hex(o.grime)
  const GR = o.green ? hex(o.green) : null
  for (let i = 0; i < h.length; i++) {
    const cav = 1 - ao[i] // 0..0.45
    mixTo(C, i, D, B, clamp(big[i] * 1.5 - 0.15))
    blendTo(C, i, L, clamp((mid[i] - 0.55) * 2.2) * 0.6 + scratch[i] * 0.35)
    // 凹處和大塊區域積污（煙燻、氧化）
    const g = clamp((grime[i] - 0.52) * 3) * o.grimeAmt + cav * 1.3 * o.grimeAmt
    blendTo(C, i, G, clamp(g))
    if (GR) blendTo(C, i, GR, clamp((cav - 0.22) * 4) * 0.5)
    rough[i] = o.roughMin + (o.roughMax - o.roughMin) * clamp(0.25 + (1 - big[i]) * 0.4 + g * 0.8 + scratch[i] * 0.5 + (w.id[i] - 0.5) * 0.25 * (o.cellVar ?? 1))
    metal[i] = 1 - clamp(g) * 0.45
  }
  const orm = ormTex(N, ao, rough, metal)
  return { map: colorTex(N, ...C), normalMap: normalTex(h, N, N / 64), roughnessMap: orm, aoMap: orm, metalnessMap: orm }
}

/** 敲打過的銅：鎚痕、煙燻、使用痕跡、凹處一點銅綠 */
export function bronzeMaps(repeat: [number, number] = [1, 1]) {
  return rep(
    'bronze',
    make('bronze', () =>
      hammeredMetal({
        N: 256,
        cells: 14,
        seed: 11,
        base: '#b37a45',
        dark: '#7d4e2b',
        bright: '#dca274',
        grime: '#3a2a1e',
        green: '#4f6b52',
        roughMin: 0.22,
        roughMax: 0.78,
        grimeAmt: 0.55,
        scratches: 160,
      }),
    ),
    repeat,
  )
}

/** 精金：錘打的金箔包覆，亮而不死白，局部較霧 */
export function goldMaps(repeat: [number, number] = [1, 1]) {
  return rep(
    'gold',
    make('gold', () =>
      hammeredMetal({
        N: 256,
        cells: 12,
        seed: 21,
        depth: 0.3,
        cellVar: 0.3,
        base: '#e8b552',
        dark: '#b98530',
        bright: '#f6d27c',
        grime: '#8a5f22',
        roughMin: 0.1,
        roughMax: 0.42,
        grimeAmt: 0.18,
        scratches: 120,
      }),
    ),
    repeat,
  )
}

/** 銀：較冷、凹處微微氧化 */
export function silverMaps(repeat: [number, number] = [1, 1]) {
  return rep(
    'silver',
    make('silver', () =>
      hammeredMetal({
        N: 128,
        cells: 6,
        seed: 31,
        base: '#c9cacd',
        dark: '#8e8f93',
        bright: '#eeeff2',
        grime: '#4a463f',
        roughMin: 0.14,
        roughMax: 0.5,
        grimeAmt: 0.28,
        scratches: 50,
      }),
    ),
    repeat,
  )
}

/* ============================================================
 * 撚的細麻：平織，經緯線粗細不均（手紡的竹節紗）
 * 一張貼圖 = 64 × 64 根線；建議實際尺寸約 0.15 m（repeat = 長度 / 0.15）
 * ============================================================ */
export function linenMaps(repeat: [number, number] = [1, 1]) {
  return rep(
    'linen',
    make('linen', () => {
      const N = 512
      const T = 64
      const P = N / T
      const rnd = mulberry(41)
      const thickW = Float32Array.from({ length: T }, () => 0.72 + rnd() * 0.3)
      const thickF = Float32Array.from({ length: T }, () => 0.72 + rnd() * 0.3)
      const toneW = Float32Array.from({ length: T }, () => (rnd() - 0.5) * 0.09)
      const toneF = Float32Array.from({ length: T }, () => (rnd() - 0.5) * 0.09)
      // 竹節：沿著線的方向粗細變化
      const slubW = vnoise(N, T, 24, 42) // 經線（沿 y 變化）
      const slubF = vnoise(N, 24, T, 43) // 緯線（沿 x 變化）
      const fuzz = vnoise(N, 256, 256, 44)
      const mott = fbm(N, 4, 4, 4, 45)
      const h = new Float32Array(N * N)
      const tone = new Float32Array(N * N)
      for (let y = 0; y < N; y++) {
        const j = (y / P) | 0
        const fy = ((y % P) + 0.5) / P
        for (let x = 0; x < N; x++) {
          const i = (x / P) | 0
          const fx = ((x % P) + 0.5) / P
          const k = y * N + x
          const over = ((i + j) & 1) === 0
          const tw = thickW[i] * (0.8 + slubW[k] * 0.45)
          const tf = thickF[j] * (0.8 + slubF[k] * 0.45)
          const pw = Math.max(0, 1 - ((fx - 0.5) * 2) ** 2 / (tw * tw))
          const pf = Math.max(0, 1 - ((fy - 0.5) * 2) ** 2 / (tf * tf))
          const archW = Math.cos((fy - 0.5) * Math.PI)
          const archF = Math.cos((fx - 0.5) * Math.PI)
          const hw = Math.sqrt(pw) * (over ? 0.55 + 0.45 * archW : 0.35 - 0.2 * archW)
          const hf = Math.sqrt(pf) * (over ? 0.35 - 0.2 * archF : 0.55 + 0.45 * archF)
          const top = hw > hf
          h[k] = Math.max(hw, hf) + (fuzz[k] - 0.5) * 0.08
          tone[k] = top ? toneW[i] : toneF[j]
        }
      }
      const ao = cavityAO(h, N, 2, 1.6, 0.45)
      const C = rgb(N * N)
      const rough = new Float32Array(N * N)
      const base = hex('#ebe3cf')
      const gap = hex('#a99c80')
      for (let k = 0; k < h.length; k++) {
        mixTo(C, k, gap, base, clamp(0.25 + h[k] * 0.9))
        scaleAt(C, k, 1 + tone[k] + (mott[k] - 0.5) * 0.08 + (fuzz[k] - 0.5) * 0.04)
        rough[k] = 0.8 + (1 - h[k]) * 0.14 + (fuzz[k] - 0.5) * 0.06
      }
      const orm = ormTex(N, ao, rough, 0)
      return { map: colorTex(N, ...C), normalMap: normalTex(h, N, 2.2), roughnessMap: orm, aoMap: orm }
    }),
    repeat,
  )
}

/* ============================================================
 * 沙地：沙粒、風化的微起伏、碎石、腳印（一張貼圖約 3.5 m 見方）
 * ============================================================ */
export function sandMaps(repeat: [number, number] = [1, 1]) {
  return rep(
    'sand',
    make('sand', () => {
      const N = 512
      const PX = 3.5 / N // 每像素的公尺數
      const rnd = mulberry(51)
      const macro = fbm(N, 3, 3, 4, 52)
      const tint = fbm(N, 5, 5, 3, 53)
      const fine = vnoise(N, 128, 128, 54)
      const ripW = fbm(N, 4, 4, 2, 55)
      const h = new Float32Array(N * N)
      const grainC = new Float32Array(N * N)
      for (let y = 0; y < N; y++)
        for (let x = 0; x < N; x++) {
          const i = y * N + x
          // 被踩過的院子：風紋很淡、斷斷續續
          const rip = Math.sin((y / N) * Math.PI * 2 * 22 + ripW[i] * 14) * 0.5 + 0.5
          h[i] = macro[i] * 1.6 + rip * 0.12 * clamp(ripW[i] * 2 - 0.6) + fine[i] * 0.25
          grainC[i] = rnd()
        }

      // ---- 腳印：幾條走過的路線，每條有左右交替的涼鞋印 ----
      const foot = new Float32Array(N * N)
      const stamp = (cx: number, cy: number, ang: number, depth: number, side: number) => {
        // 涼鞋：前掌 + 腳跟兩個橢圓，單位：公尺 → 像素
        const L = 0.25 / PX
        const ca = Math.cos(ang)
        const sa = Math.sin(ang)
        const R = Math.ceil(L * 0.75)
        for (let dy = -R; dy <= R; dy++)
          for (let dx = -R; dx <= R; dx++) {
            const u = (dx * ca + dy * sa) / L // 沿腳的方向
            const v = (-dx * sa + dy * ca) / L - side * 0.02 * u
            // 前掌（u>0）較寬，腳跟（u<0）較窄
            const e1 = ((u - 0.17) / 0.33) ** 2 + (v / 0.2) ** 2
            const e2 = ((u + 0.24) / 0.2) ** 2 + (v / 0.16) ** 2
            const e = Math.min(e1, e2)
            if (e > 2.2) continue
            const dent = -(1 - sstep(0.55, 1.0, e)) * depth
            const rim = Math.exp(-(((Math.sqrt(e) - 1.12) / 0.16) ** 2)) * depth * 0.35
            const px = (Math.round(cx + dx) + N * 4) % N
            const py = (Math.round(cy + dy) + N * 4) % N
            const k = py * N + px
            foot[k] = Math.max(-1.2, foot[k] + dent + rim)
          }
      }
      for (let tr = 0; tr < 3; tr++) {
        let x = rnd() * N
        let y = rnd() * N
        let ang = rnd() * Math.PI * 2
        const steps = 3 + ((rnd() * 5) | 0)
        const age = 0.25 + rnd() * 0.75
        for (let s = 0; s < steps; s++) {
          const side = s % 2 ? 1 : -1
          const ox = -Math.sin(ang) * side * (0.09 / PX)
          const oy = Math.cos(ang) * side * (0.09 / PX)
          stamp(x + ox, y + oy, ang + side * 0.08, age * (0.6 + rnd() * 0.5), side)
          x += Math.cos(ang) * (0.36 / PX)
          y += Math.sin(ang) * (0.36 / PX)
          ang += (rnd() - 0.5) * 0.25
        }
      }
      const footS = blur(foot, N, 1)
      for (let i = 0; i < h.length; i++) h[i] += footS[i] * 0.8

      // ---- 碎石：各種顏色的小石頭（花崗岩、玄武岩、石英、紅砂岩） ----
      const stone = new Float32Array(N * N)
      const stoneCol = rgb(N * N)
      const palette = ['#8c7f74', '#5d554f', '#b08066', '#d7cdbf', '#7a5a46', '#a59a8a', '#4b4440'].map(hex)
      const gravel = fbm(N, 4, 4, 2, 56) // 碎石聚集的區域
      let placed = 0
      for (let tries = 0; placed < 800 && tries < 5000; tries++) {
        const cx = rnd() * N
        const cy = rnd() * N
        const gi = ((cy | 0) % N) * N + ((cx | 0) % N)
        if (rnd() > gravel[gi] * 1.4 - 0.15) continue
        placed++
        const big = rnd() < 0.025
        const r = big ? 3 + rnd() * 3 : 0.8 + rnd() * 1.6
        const sx = 0.7 + rnd() * 0.6
        const ang = rnd() * Math.PI
        const ca = Math.cos(ang)
        const sa = Math.sin(ang)
        const col = palette[(rnd() * palette.length) | 0]
        const shade = 0.92 + rnd() * 0.25
        const R = Math.ceil(r * 1.4)
        for (let dy = -R; dy <= R; dy++)
          for (let dx = -R; dx <= R; dx++) {
            const u = (dx * ca + dy * sa) / (r * sx)
            const v = (-dx * sa + dy * ca) / r
            const d = u * u + v * v
            if (d > 1) continue
            const k = ((Math.round(cy + dy) + N) % N) * N + ((Math.round(cx + dx) + N) % N)
            const hh = Math.sqrt(1 - d) * r * 0.35
            if (hh > stone[k]) {
              stone[k] = hh
              put(stoneCol, k, col[0] * shade, col[1] * shade, col[2] * shade)
            }
          }
      }
      for (let i = 0; i < h.length; i++) h[i] += stone[i]

      const ao = cavityAO(h, N, 3, 0.9, 0.5)
      const C = rgb(N * N)
      const rough = new Float32Array(N * N)
      const light = hex('#d1b48b')
      const mid = hex('#bb9a6f')
      const dark = hex('#9a7a55')
      const red = hex('#b98660')
      const dk = hex('#5e4a39')
      const qz = hex('#efe6d6')
      for (let i = 0; i < h.length; i++) {
        mixTo(C, i, dark, mid, clamp(macro[i] * 1.8 - 0.2))
        blendTo(C, i, light, clamp((macro[i] - 0.45) * 2.5) * 0.7)
        blendTo(C, i, red, clamp((tint[i] - 0.5) * 2.5) * 0.45)
        // 沙粒：單粒的明暗與雜色礦物
        const g = grainC[i]
        scaleAt(C, i, 0.93 + g * 0.14)
        if (g > 0.985) blendTo(C, i, dk, 0.55)
        else if (g < 0.02) blendTo(C, i, qz, 0.5)
        // 腳印裡壓實、略暗；印痕邊緣翻起的沙較亮
        const f = footS[i]
        // 腳印的明暗要很淡：貼圖每 3.5 m 重複一次，太明顯就看得出是同一組腳印
        scaleAt(C, i, 1 + f * 0.1)
        let r = 0.93 + g * 0.06 + (f < 0 ? f * 0.12 : 0)
        if (stone[i] > 0) {
          const t = clamp(stone[i] * 2) * 0.75
          C[0][i] += (stoneCol[0][i] - C[0][i]) * t
          C[1][i] += (stoneCol[1][i] - C[1][i]) * t
          C[2][i] += (stoneCol[2][i] - C[2][i]) * t
          r = r * (1 - t) + (0.55 + g * 0.25) * t
        }
        scaleAt(C, i, 0.75 + ao[i] * 0.25)
        rough[i] = r
      }
      const orm = ormTex(N, ao, rough, 0)
      return { map: colorTex(N, ...C), normalMap: normalTex(h, N, 1.6), roughnessMap: orm, aoMap: orm }
    }),
    repeat,
  )
}

/* ============================================================
 * 皂莢木（洋槐木）：年輪紋、導管、節、風乾裂紋。木紋沿 v 方向。
 * ============================================================ */
function woodLike(seed: number, pal: { light: string; dark: string; line: string }, rings: number, checks: number): PBRMaps {
  const N = 256
  const warp = fbm(N, 3, 1, 3, seed) // 沿 y 拉長的扭曲
  const warp2 = vnoise(N, 8, 2, seed + 1)
  const pores = vnoise(N, 128, 6, seed + 2)
  const tone = fbm(N, 2, 4, 3, seed + 3)
  const rnd = mulberry(seed + 4)
  const knots = Array.from({ length: 2 }, () => [rnd() * N, rnd() * N, 6 + rnd() * 8])
  const h = new Float32Array(N * N)
  const ring = new Float32Array(N * N)
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const i = y * N + x
      let u = x / N + warp[i] * 0.35 + warp2[i] * 0.05
      for (const [kx, ky, kr] of knots) {
        let dx = x - kx
        let dy = y - ky
        dx -= Math.round(dx / N) * N
        dy -= Math.round(dy / N) * N
        const d = Math.hypot(dx, dy * 0.6)
        u += (kr * 2.5) / N / (1 + (d / kr) ** 2) * Math.sign(dx || 1) * 0.6
        if (d < kr * 0.7) u += (1 - d / (kr * 0.7)) * 0.3
      }
      const s = (u * rings) % 1
      // 早材寬而淺、晚材窄而深
      const r = sstep(0.62, 0.92, s) * (1 - sstep(0.92, 1, s))
      ring[i] = r
      h[i] = -r * 0.6 - (pores[i] > 0.82 ? (pores[i] - 0.82) * 4 : 0)
    }
  // 風乾裂紋
  const crack = new Float32Array(N * N)
  for (let c = 0; c < checks; c++) {
    let x = rnd() * N
    const y0 = rnd() * N
    const len = 30 + rnd() * 120
    for (let t = 0; t < len; t++) {
      x += (rnd() - 0.5) * 0.6
      const k = ((Math.floor(y0 + t) % N) * N + (Math.floor(x) + N) % N) | 0
      crack[k] = 1 - Math.abs(t / len - 0.5) * 2
    }
  }
  for (let i = 0; i < h.length; i++) h[i] -= crack[i] * 1.2
  const ao = cavityAO(h, N, 2, 1.5, 0.45)
  const C = rgb(N * N)
  const rough = new Float32Array(N * N)
  const L = hex(pal.light)
  const D = hex(pal.dark)
  const Ln = hex(pal.line)
  for (let i = 0; i < h.length; i++) {
    mixTo(C, i, D, L, clamp(tone[i] * 1.6 - 0.3))
    blendTo(C, i, Ln, ring[i] * 0.75 + crack[i] * 0.8)
    if (pores[i] > 0.82) scaleAt(C, i, 0.85)
    rough[i] = 0.55 + ring[i] * 0.15 + crack[i] * 0.3 + (1 - tone[i]) * 0.12
  }
  const orm = ormTex(N, ao, rough, 0)
  return { map: colorTex(N, ...C), normalMap: normalTex(h, N, 2.5), roughnessMap: orm, aoMap: orm }
}

export function woodMaps(repeat: [number, number] = [1, 1]) {
  return rep('wood', make('wood', () => woodLike(61, { light: '#a8774a', dark: '#6e4426', line: '#4a2c18' }, 9, 6)), repeat)
}

/** 柴（剖開的洋槐木與樹皮） */
export function barkMaps(repeat: [number, number] = [1, 1]) {
  return rep(
    'bark',
    make('bark', () => {
      const N = 256
      const ridge = fbm(N, 10, 1, 4, 91)
      const n = fbm(N, 6, 6, 4, 92)
      const h = new Float32Array(N * N)
      for (let i = 0; i < h.length; i++) {
        const r = 1 - Math.abs(ridge[i] * 2 - 1)
        h[i] = r * r * 1.4 + n[i] * 0.5
      }
      const ao = cavityAO(h, N, 3, 1.8, 0.35)
      const C = rgb(N * N)
      const rough = new Float32Array(N * N)
      const a = hex('#4a3a2d')
      const b = hex('#8a7663')
      for (let i = 0; i < h.length; i++) {
        mixTo(C, i, a, b, clamp(h[i] * 0.8 + (n[i] - 0.5) * 0.6))
        rough[i] = 0.9 + n[i] * 0.1
      }
      const orm = ormTex(N, ao, rough, 0)
      return { map: colorTex(N, ...C), normalMap: normalTex(h, N, 3), roughnessMap: orm, aoMap: orm }
    }),
    repeat,
  )
}

/* ============================================================
 * 皮革：一塊塊縫起來的獸皮（海狗皮／染紅的公羊皮）
 * 高度、法線、ORM 共用，只有顏色不同。一張約 2 m 見方。
 * ============================================================ */
let leatherCache: { h: F32; seam: F32; scuff: F32; piece: F32; wr: F32; ao: F32; normal: THREE.Texture; orm: THREE.Texture } | null = null
function leatherBase() {
  if (leatherCache) return leatherCache
  const t0 = performance.now()
  const N = 512
  const pieces = worley(N, 2, 71, 0.45) // 一塊皮約 1 m
  const grain = vnoise(N, 96, 96, 72)
  const wr = fbm(N, 5, 7, 3, 73)
  const wr2 = fbm(N, 9, 4, 2, 74)
  const sc = fbm(N, 8, 8, 3, 75)
  const h = new Float32Array(N * N)
  const seam = new Float32Array(N * N)
  const scuff = new Float32Array(N * N)
  const wrk = new Float32Array(N * N)
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const i = y * N + x
      const e = pieces.f2[i] - pieces.f1[i]
      const sm = 1 - sstep(0.0, 0.045, e)
      // 縫線：沿接縫的一排小針腳
      const st = sm > 0.2 && e > 0.012 && e < 0.03 && (((x >> 2) + (y >> 2)) & 1) === 0 ? 1 : 0
      seam[i] = sm
      // 皮紋：細小的不規則格子，交界是細紋
      const g = sstep(0.0, 0.3, Math.abs(grain[i] - 0.5))
      // 皺摺：脊狀雜訊
      const r1 = 1 - Math.abs(wr[i] * 2 - 1)
      const r2 = 1 - Math.abs(wr2[i] * 2 - 1)
      const wrinkle = r1 ** 6 * 0.9 + r2 ** 8 * 0.6
      wrk[i] = wrinkle
      scuff[i] = clamp((sc[i] - 0.6) * 4)
      h[i] = g * 0.18 - wrinkle * 0.7 - sm * 0.35 + st * 0.2 + sm * (1 - sstep(0.0, 0.012, e)) * 0.25
    }
  const ao = cavityAO(h, N, 3, 1.3, 0.45)
  const rough = new Float32Array(N * N)
  for (let i = 0; i < h.length; i++) rough[i] = 0.52 + scuff[i] * 0.3 + seam[i] * 0.15 + wrk[i] * 0.08 + (pieces.id[i] - 0.5) * 0.12
  leatherCache = { h, seam, scuff, piece: pieces.id, wr: wrk, ao, normal: normalTex(h, N, 1.3), orm: ormTex(N, ao, rough, 0) }
  texStats.leather = Math.round(performance.now() - t0)
  return leatherCache
}

function leatherColor(key: string, pal: { base: string; light: string; dark: string; scuff: string }) {
  return make(key, () => {
    const L = leatherBase()
    const N = 512
    const C = rgb(N * N)
    const B = hex(pal.base)
    const Li = hex(pal.light)
    const D = hex(pal.dark)
    const S = hex(pal.scuff)
    const mott = fbm(N, 6, 6, 2, key.length * 13)
    for (let i = 0; i < L.h.length; i++) {
      const p = L.piece[i]
      // 每塊皮的色差要小，色差大會像一塊塊石頭
      mixTo(C, i, D, B, clamp(0.55 + p * 0.25 + (mott[i] - 0.5) * 0.7))
      blendTo(C, i, Li, clamp((mott[i] - 0.6) * 2.5) * 0.5)
      blendTo(C, i, S, L.scuff[i] * 0.45)
      scaleAt(C, i, 0.84 + L.ao[i] * 0.16 - L.seam[i] * 0.07)
    }
    return { map: colorTex(N, ...C), normalMap: L.normal, roughnessMap: L.orm, aoMap: L.orm }
  })
}

/** 海狗皮（最外層）：深灰褐色，油亮中帶磨損 */
export function hideMaps(repeat: [number, number] = [1, 1]) {
  return rep('hide', leatherColor('hide', { base: '#4a4038', light: '#6c5f53', dark: '#2a241f', scuff: '#857563' }), repeat)
}

/** 染紅的公羊皮 */
export function ramMaps(repeat: [number, number] = [1, 1]) {
  return rep('ram', leatherColor('ram', { base: '#7e2416', light: '#a8402a', dark: '#4e140d', scuff: '#9a5a44' }), repeat)
}

/* ============================================================
 * 山羊毛布：粗紡斜紋、一幅幅縫起來（營地帳棚、帳幕的第二層幕幔）
 * ============================================================ */
export function goatMaps(repeat: [number, number] = [1, 1]) {
  return rep(
    'goat',
    make('goat', () => {
      const N = 512
      const fib = vnoise(N, 256, 32, 81)
      const fuzz = vnoise(N, 256, 256, 82)
      const n = fbm(N, 4, 4, 3, 83)
      const stripe = fbm(N, 1, 8, 2, 84)
      const h = new Float32Array(N * N)
      const seamA = new Float32Array(N * N)
      for (let y = 0; y < N; y++)
        for (let x = 0; x < N; x++) {
          const i = y * N + x
          // 斜紋：每 6px 一道斜向的稜
          const tw = Math.sin(((x + y * 2) / 6) * Math.PI * 2) * 0.5 + 0.5
          const yarn = Math.sin((y / 4) * Math.PI * 2) * 0.5 + 0.5
          // 一幅布寬約 N/2，縫邊
          const sy = y % (N / 2)
          const seam = sy < 3 || sy > N / 2 - 3 ? 1 : 0
          seamA[i] = seam
          h[i] = tw * 0.35 + yarn * 0.25 + fib[i] * 0.4 + fuzz[i] * 0.2 - seam * 0.8
        }
      const ao = cavityAO(h, N, 2, 1.4, 0.5)
      const C = rgb(N * N)
      const rough = new Float32Array(N * N)
      const a = hex('#1c1714')
      const b = hex('#3f352d')
      const br = hex('#5a4a3c')
      for (let i = 0; i < h.length; i++) {
        mixTo(C, i, a, b, clamp(n[i] * 1.4 - 0.2 + fib[i] * 0.3))
        // 偶爾一條較淺的褐色毛線
        blendTo(C, i, br, clamp((stripe[i] - 0.62) * 5) * 0.6)
        scaleAt(C, i, 0.85 + fuzz[i] * 0.3 - seamA[i] * 0.2)
        rough[i] = 0.9 + fuzz[i] * 0.1
      }
      const orm = ormTex(N, ao, rough, 0)
      return { map: colorTex(N, ...C), normalMap: normalTex(h, N, 2.2), roughnessMap: orm, aoMap: orm }
    }),
    repeat,
  )
}

/* ============================================================
 * 陶土（水罐）：拉坯的橫紋、手痕、燒製的色差
 * ============================================================ */
export function clayMaps(repeat: [number, number] = [1, 1]) {
  return rep(
    'clay',
    make('clay', () => {
      const N = 256
      const n = fbm(N, 4, 4, 4, 101)
      const fine = vnoise(N, 128, 128, 102)
      const wob = fbm(N, 4, 1, 2, 103)
      const h = new Float32Array(N * N)
      for (let y = 0; y < N; y++)
        for (let x = 0; x < N; x++) {
          const i = y * N + x
          const throwing = Math.sin(((y + wob[i] * 10) / N) * Math.PI * 2 * 26) * 0.5 + 0.5
          h[i] = throwing * 0.3 + fine[i] * 0.25 + n[i] * 0.5
        }
      const ao = cavityAO(h, N, 3, 1.2, 0.6)
      const C = rgb(N * N)
      const rough = new Float32Array(N * N)
      const a = hex('#8f4f2e')
      const b = hex('#c27d52')
      const soot = hex('#4a3428')
      for (let i = 0; i < h.length; i++) {
        mixTo(C, i, a, b, clamp(n[i] * 1.5 - 0.15))
        blendTo(C, i, soot, clamp((0.32 - n[i]) * 3) * 0.6)
        scaleAt(C, i, 0.92 + fine[i] * 0.16)
        rough[i] = 0.82 + fine[i] * 0.12
      }
      const orm = ormTex(N, ao, rough, 0)
      return { map: colorTex(N, ...C), normalMap: normalTex(h, N, 1.5), roughnessMap: orm, aoMap: orm }
    }),
    repeat,
  )
}
