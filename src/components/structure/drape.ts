/**
 * 布料幾何：真的有皺褶的垂掛布（不是平板＋貼圖）。
 * - hangingSheet：從一條杆子垂下來的帷子／門簾（院子帷子、門簾、幔子）
 * - coverLayer：帳幕的一層外罩（屋頂＋三面垂下，前面敞開）
 *
 * 每個頂點帶：position、normal、uv、color（沙塵、色差）、aSway（0 = 固定，1 = 自由端）
 */
import * as THREE from 'three'

/* ---------- 1D 平滑雜訊 ---------- */
function hash(i: number, seed: number) {
  const h = Math.sin(i * 127.1 + seed * 311.7) * 43758.5453
  return h - Math.floor(h)
}
export function noise1(x: number, seed = 0) {
  const i = Math.floor(x)
  let f = x - i
  f = f * f * (3 - 2 * f)
  return hash(i, seed) * (1 - f) + hash(i + 1, seed) * f
}

/**
 * 皺褶函數：不規則的波（波長會變、上窄下寬）。回傳約 -1..1。
 * x：沿布寬（公尺）；t：0 = 上緣、1 = 下緣
 */
export function pleat(x: number, t: number, wavelength: number, seed: number) {
  const k = x / wavelength
  // 波長抖動：相位用低頻雜訊推動
  const phase = Math.PI * 2 * (k + 0.9 * noise1(k * 0.33, seed) + 0.25 * t * noise1(k * 0.7 + 3.1, seed + 1))
  const s = Math.sin(phase)
  // 褶子尖、凹處圓：布垂下來的樣子
  const shaped = Math.sign(s) * Math.pow(Math.abs(s), 0.75)
  const second = Math.sin(phase * 2 + noise1(k * 1.3, seed + 2) * 3) * 0.18
  // 有些褶比較深
  const depth = 0.65 + 0.7 * noise1(k * 0.5 + 7.7, seed + 3)
  return (shaped + second) * depth
}

export interface SheetOpts {
  width: number
  height: number
  /** 每公尺幾段（沿寬度） */
  colsPerM?: number
  rows?: number
  wavelength?: number
  ampTop?: number
  ampBottom?: number
  seed?: number
  /** 上緣掛鉤間距（公尺）：鉤子之間的布微微下垂、鉤子處褶子收緊 */
  hookSpacing?: number
  /** 下緣不整齊 */
  hemNoise?: number
  /** 整片布被風吹得微微鼓起 */
  billow?: number
  /** 兩端收緊（角落、門邊不要翹開） */
  pinEnds?: boolean
  /** uv：'unit' = 0..1；'meters' = 以公尺為單位 */
  uv?: 'unit' | 'meters'
  /** 頂點色：x（公尺，自左端起）、y（公尺，自下緣起）、t（0 上 1 下） */
  color?: (x: number, y: number, t: number) => [number, number, number]
}

/**
 * 垂掛布：局部座標上緣在 y = 0，往下到 y = -height；x 由 -w/2 到 w/2；褶子往 ±z。
 */
export function hangingSheet(o: SheetOpts) {
  const {
    width,
    height,
    colsPerM = 16,
    rows = 12,
    wavelength = 0.38,
    ampTop = 0.012,
    ampBottom = 0.05,
    seed = 1,
    hookSpacing = 0,
    hemNoise = 0.02,
    billow = 0.03,
    pinEnds = true,
    uv = 'meters',
    color,
  } = o
  const cols = Math.max(2, Math.ceil(width * colsPerM))
  const nv = (cols + 1) * (rows + 1)
  const pos = new Float32Array(nv * 3)
  const uvs = new Float32Array(nv * 2)
  const col = new Float32Array(nv * 3)
  const sway = new Float32Array(nv)
  let v = 0
  for (let r = 0; r <= rows; r++) {
    // 上面排得密一點（掛鉤附近變化大）
    const t = Math.pow(r / rows, 1.15)
    for (let c = 0; c <= cols; c++, v++) {
      const s = c / cols
      const xl = s * width
      const x = xl - width / 2
      let amp = ampTop + (ampBottom - ampTop) * Math.pow(t, 0.8)
      let y = -t * height
      if (hookSpacing > 0) {
        // 掛鉤處褶子收緊；鉤子之間上緣微微下垂
        const f = (xl / hookSpacing) % 1
        const between = Math.sin(Math.PI * f)
        amp *= 0.25 + 0.75 * Math.min(1, between * 1.6 + t * 3)
        y -= between * 0.025 * (1 - t)
      }
      if (pinEnds) {
        const e = Math.min(xl, width - xl)
        amp *= Math.min(1, 0.2 + e / 0.25)
      }
      let z = amp * pleat(xl, t, wavelength, seed)
      z += billow * t * t * (noise1(xl / 2.7, seed + 5) - 0.5) * 2
      if (r === rows) y += (noise1(xl * 3, seed + 6) - 0.5) * 2 * hemNoise + Math.abs(z) * 0.3
      pos[v * 3] = x
      pos[v * 3 + 1] = y
      pos[v * 3 + 2] = z
      if (uv === 'unit') {
        uvs[v * 2] = s
        uvs[v * 2 + 1] = 1 - r / rows
      } else {
        uvs[v * 2] = xl
        uvs[v * 2 + 1] = height + y
      }
      const cc = color ? color(xl, height + y, t) : [1, 1, 1]
      col[v * 3] = cc[0]
      col[v * 3 + 1] = cc[1]
      col[v * 3 + 2] = cc[2]
      sway[v] = t
    }
  }
  const idx: number[] = []
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const a = r * (cols + 1) + c
      const b = a + 1
      const d = a + cols + 1
      const e = d + 1
      idx.push(a, d, b, b, d, e)
    }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2))
  g.setAttribute('color', new THREE.BufferAttribute(col, 3))
  g.setAttribute('aSway', new THREE.BufferAttribute(sway, 1))
  g.setIndex(idx)
  g.computeVertexNormals()
  return g
}

/* ============================================================
 * 帳幕外罩的一層
 * ============================================================ */
export interface CoverOpts {
  /** 豎板外框：前緣 x、後面（西面）x、南北外面的 |z|、頂高 */
  xFront: number
  xBack: number
  zHalf: number
  top: number
  /** 這一層離豎板外面的距離 */
  off: number
  /** 下緣離地高度 */
  hem: number
  /** 前緣多伸出去的長度 */
  frontOver?: number
  /** 屋頂中央下垂（公尺，推測） */
  sag?: number
  wavelength?: number
  ampTop?: number
  ampBottom?: number
  /** 獸皮一塊塊的下緣：每塊寬度與起伏 */
  scallop?: [number, number]
  seed?: number
  colsPerM?: number
  /** 頂點色：y（離地高度）、onRoof */
  color?: (y: number, onRoof: boolean, u: number) => [number, number, number]
}

/**
 * 平面上沿外框（南 → 西 → 北）走一圈的路徑，角落圓弧。
 * c：投影到豎板外框上的「標準弧長」，各層相同，讓每一層的褶子對齊。
 */
function perimeter(xFront: number, xBack: number, z: number, rc: number, step: number, ref: { xf: number; xb: number; zh: number }) {
  const pts: { x: number; z: number; nx: number; nz: number; L: number; c: number }[] = []
  let L = 0
  const push = (x: number, zz: number, nx: number, nz: number, c: number) => {
    const last = pts[pts.length - 1]
    if (last) L += Math.hypot(x - last.x, zz - last.z)
    pts.push({ x, z: zz, nx, nz, L, c })
  }
  const W = ref.xf - ref.xb
  // 南面：x 由前往後，法線 -z
  const sLen = xFront - (xBack + rc)
  const ns = Math.max(1, Math.ceil(sLen / step))
  for (let i = 0; i <= ns; i++) {
    const x = xFront - (i / ns) * sLen
    push(x, -z, 0, -1, ref.xf - x)
  }
  const na = 4
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t
  // 西南角
  let c0 = ref.xf - (xBack + rc)
  let c1 = W + (-z + rc + ref.zh)
  for (let i = 1; i <= na; i++) {
    const a = -Math.PI / 2 - (i / na) * (Math.PI / 2)
    push(xBack + rc + Math.cos(a) * rc, -z + rc + Math.sin(a) * rc, Math.cos(a), Math.sin(a), lerp(c0, c1, i / na))
  }
  // 西面
  const wLen = 2 * (z - rc)
  const nw = Math.max(1, Math.ceil(wLen / step))
  for (let i = 1; i <= nw; i++) {
    const zz = -z + rc + (i / nw) * wLen
    push(xBack, zz, -1, 0, W + zz + ref.zh)
  }
  // 西北角
  c0 = W + (z - rc) + ref.zh
  c1 = W + 2 * ref.zh + (xBack + rc - ref.xb)
  for (let i = 1; i <= na; i++) {
    const a = Math.PI - (i / na) * (Math.PI / 2)
    push(xBack + rc + Math.cos(a) * rc, z - rc + Math.sin(a) * rc, Math.cos(a), Math.sin(a), lerp(c0, c1, i / na))
  }
  // 北面
  for (let i = 1; i <= ns; i++) {
    const x = xBack + rc + (i / ns) * sLen
    push(x, z, 0, 1, W + 2 * ref.zh + (x - ref.xb))
  }
  return pts
}

/** 一層外罩：屋頂（微微下垂）＋三面垂下的布／皮，前面敞開。回傳一個幾何。 */
export function coverLayer(o: CoverOpts) {
  const {
    xFront,
    xBack,
    zHalf,
    top,
    off,
    hem,
    frontOver = 0.1,
    sag = 0.08,
    wavelength = 0.6,
    ampTop = 0.01,
    ampBottom = 0.06,
    scallop = [0, 0],
    seed = 1,
    colsPerM = 10,
    color,
  } = o
  const Z = zHalf + off
  const XB = xBack - off
  const XF = xFront + frontOver
  const yTop = top + off
  const R = 0.14 // 板頂邊緣的圓角
  const path = perimeter(XF, XB, Z, 0.12, 1 / colsPerM, { xf: xFront, xb: xBack, zh: zHalf })

  // 斷面：屋頂上往內 0.12 → 圓角 → 垂直往下到下緣
  type Sec = { n: number; y: number; vert: boolean }
  const sec: Sec[] = [{ n: -R - 0.12, y: yTop - 0.03, vert: false }]
  for (let i = 0; i <= 5; i++) {
    const a = Math.PI / 2 - (i / 5) * (Math.PI / 2)
    sec.push({ n: -R + Math.cos(a) * R, y: yTop - R + Math.sin(a) * R, vert: false })
  }
  const drop = yTop - R - hem
  const nDrop = Math.max(4, Math.ceil(drop / 0.25))
  for (let i = 1; i <= nDrop; i++) sec.push({ n: 0, y: yTop - R - (i / nDrop) * drop, vert: true })

  const pos: number[] = []
  const uv: number[] = []
  const col: number[] = []
  const sway: number[] = []
  const idx: number[] = []
  const ringN = sec.length
  // 垂直方向的弧長（給 uv）
  const vLen: number[] = [0]
  for (let i = 1; i < ringN; i++) vLen.push(vLen[i - 1] + Math.hypot(sec[i].n - sec[i - 1].n, sec[i].y - sec[i - 1].y))

  for (const p of path) {
    for (let r = 0; r < ringN; r++) {
      const s = sec[r]
      let n = s.n
      let y = s.y
      let t = 0
      if (s.vert) {
        t = (yTop - R - y) / drop
        // 用「離頂多深」（各層相同）算褶子，讓幾層的褶子平行、不互相穿插
        const tt = Math.min(1, (top - y) / top)
        const amp = ampTop + (ampBottom - ampTop) * Math.pow(tt, 0.9)
        // 前緣（帳幕門口）收緊
        const fe = Math.min(1, Math.abs(XF - p.x) / 0.6 + (Math.abs(p.nx) > 0.5 ? 1 : 0))
        n += (amp * pleat(p.c, tt, wavelength, seed) + amp * 0.8) * (0.3 + 0.7 * fe)
        if (r === ringN - 1) {
          y += (noise1(p.c * 2.3, seed + 9) - 0.5) * 0.04
          if (scallop[0] > 0) y += Math.abs(Math.sin((Math.PI * p.L) / scallop[0])) * scallop[1] * (0.6 + 0.8 * noise1(p.L / scallop[0], seed + 4))
          y = Math.max(0.012, y)
        }
      }
      pos.push(p.x + p.nx * n, y, p.z + p.nz * n)
      uv.push(p.L, vLen[r])
      const c = color ? color(y, !s.vert, p.L) : [1, 1, 1]
      col.push(c[0], c[1], c[2])
      sway.push(t)
    }
  }
  for (let i = 0; i < path.length - 1; i++)
    for (let r = 0; r < ringN - 1; r++) {
      const a = i * ringN + r
      const b = a + 1
      const d = a + ringN
      const e = d + 1
      idx.push(a, b, d, b, e, d)
    }

  // 屋頂：網格，中央微微下垂（推測：經文沒說是平頂或有脊）
  const base = pos.length / 3
  const rx0 = XB + R
  const rx1 = XF
  const rz = Z - R
  const nx = Math.ceil((rx1 - rx0) / 0.3)
  const nz = Math.ceil((2 * rz) / 0.25)
  for (let j = 0; j <= nz; j++) {
    const z = -rz + (j / nz) * 2 * rz
    for (let i = 0; i <= nx; i++) {
      const x = rx0 + (i / nx) * (rx1 - rx0)
      const ez = 1 - (z / rz) ** 2
      const ex = Math.min(1, (x - rx0) / 0.8, (rx1 - x) / 0.5)
      const bump = (noise1(x * 1.3, seed + 11) - 0.5) * 0.02 + (noise1(z * 2.1 + x * 0.4, seed + 12) - 0.5) * 0.015
      const y = yTop - (sag * ez * (0.85 + 0.3 * noise1(x * 0.4, seed + 13)) + bump * ez) * Math.max(0, ex)
      pos.push(x, y, z)
      uv.push(x, z)
      const c = color ? color(y, true, x) : [1, 1, 1]
      col.push(c[0], c[1], c[2])
      sway.push(0)
    }
  }
  for (let j = 0; j < nz; j++)
    for (let i = 0; i < nx; i++) {
      const a = base + j * (nx + 1) + i
      const b = a + 1
      const d = a + nx + 1
      const e = d + 1
      idx.push(a, d, b, b, d, e)
    }

  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
  g.setAttribute('aSway', new THREE.Float32BufferAttribute(sway, 1))
  g.setIndex(idx)
  g.computeVertexNormals()
  return g
}
