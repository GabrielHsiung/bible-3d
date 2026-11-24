/**
 * F-1 耶路撒冷地形（程序生成，不載入高程資料）
 *
 * 座標：1 單位 = 1 公尺，x 向東、z 向南、y 向上；原點在圓頂清真寺下的岩石（聖殿山頂）。
 * 高度：Y = 海拔 − 700 公尺。
 *
 * 地標位置由經緯度換算（1° 緯度 ≈ 111 km、1° 經度 ≈ 94.85 km @ 31.78°N），
 * 高程依下列資料估計，誤差約 ±10 公尺，屬「重建推測」：
 * - 聖殿山岩石海拔約 741 m；錫安山（西山）約 772 m；橄欖山比錫安山、摩利亞山高約 100 m
 *   （ldolphin.org/moriah.html）；橄欖山頂（Et-Tur）約 818 m。
 * - 汲淪谷沿聖殿山與大衛城東側南下，在 Bir Ayyub（約 600 m）與欣嫩谷會合；
 *   泰羅邊谷（Tyropoeon）把西山與東邊的摩利亞–俄斐勒山脊分開；欣嫩谷從雅法門西側南下再向東轉。
 *   （thattheworldmayknow.com/jerusalem-geography；generationword.com/jerusalembook/8.html）
 */
import * as THREE from 'three'

export const ORIGIN_ELEV = 700
export const EXTENT = { x0: -1700, x1: 1700, z0: -1500, z1: 1900 }

/* ---------- 雜訊 ---------- */
function hash(x: number, y: number) {
  const h = Math.sin(x * 127.1 + y * 311.7) * 43758.5453
  return h - Math.floor(h)
}
export function vnoise(x: number, y: number) {
  const ix = Math.floor(x)
  const iy = Math.floor(y)
  let fx = x - ix
  let fy = y - iy
  fx = fx * fx * (3 - 2 * fx)
  fy = fy * fy * (3 - 2 * fy)
  const a = hash(ix, iy)
  const b = hash(ix + 1, iy)
  const c = hash(ix, iy + 1)
  const d = hash(ix + 1, iy + 1)
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy
}
function fbm(x: number, y: number, oct: number) {
  let v = 0
  let a = 0.5
  let t = 0
  for (let i = 0; i < oct; i++) {
    v += vnoise(x, y) * a
    t += a
    x = x * 2.03 + 17.1
    y = y * 2.03 + 3.7
    a *= 0.5
  }
  return v / t
}
export const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}
const gauss = (dx: number, dz: number, r: number) => Math.exp(-(dx * dx + dz * dz) / (r * r))
function smin(a: number, b: number, k: number) {
  const h = Math.max(k - Math.abs(a - b), 0) / k
  return Math.min(a, b) - h * h * k * 0.25
}

/* ---------- 山谷：折線 (x, z, 谷底海拔) ---------- */
type V = [number, number, number]
interface Valley {
  pts: V[]
  /** 谷壁坡度（每公尺升高） */
  s: number
  /** 谷底圓滑寬度 */
  w: number
}
export const VALLEYS: Record<'kidron' | 'tyropoeon' | 'hinnom', Valley> = {
  // 汲淪谷：聖殿山東牆外約 120 m，向南經基訓泉、西羅亞，到 Bir Ayyub 與欣嫩谷會合，再往東南流向曠野
  kidron: {
    pts: [
      [160, -1600, 735],
      [260, -900, 705],
      [300, -350, 682],
      [290, 50, 664],
      [235, 420, 642],
      [175, 720, 624],
      [70, 990, 606],
      [10, 1060, 600],
      [160, 1450, 572],
      [420, 1950, 540],
    ],
    s: 0.55,
    w: 40,
  },
  // 泰羅邊谷（中谷）：從大馬士革門一帶往南南東，貼著聖殿山西牆，到西羅亞池
  tyropoeon: {
    pts: [
      [-470, -800, 758],
      [-400, -420, 748],
      [-205, -20, 716],
      [-160, 340, 692],
      [-110, 720, 652],
      [-60, 900, 630],
      [10, 1060, 600],
    ],
    s: 0.42,
    w: 50,
  },
  // 欣嫩谷：雅法門西側南下，繞過錫安山南麓向東，在 Bir Ayyub 會合
  hinnom: {
    pts: [
      [-1250, -500, 772],
      [-1000, -80, 757],
      [-960, 330, 740],
      [-880, 720, 708],
      [-640, 960, 678],
      [-300, 1060, 640],
      [10, 1060, 600],
    ],
    s: 0.5,
    w: 45,
  },
}

function valleyDist(v: Valley, x: number, z: number) {
  let best = 1e9
  let floor = 0
  const p = v.pts
  for (let i = 0; i < p.length - 1; i++) {
    const [ax, az, ae] = p[i]
    const [bx, bz, be] = p[i + 1]
    const dx = bx - ax
    const dz = bz - az
    const L2 = dx * dx + dz * dz
    let t = ((x - ax) * dx + (z - az) * dz) / L2
    t = Math.max(0, Math.min(1, t))
    const px = ax + dx * t - x
    const pz = az + dz * t - z
    const d2 = px * px + pz * pz
    if (d2 < best) {
      best = d2
      floor = ae + (be - ae) * t
    }
  }
  return { d: Math.sqrt(best), floor }
}

/** 海拔（公尺） */
export function elevation(x: number, z: number) {
  // 大地形：往南下降（大衛城的山脊往南更陡），往北緩升（比特薩、大馬士革門以北）
  let h = 740 - 0.045 * Math.max(z, 0) - 0.08 * Math.max(z - 350, 0) + 0.035 * Math.max(-z, 0)
  h += 0.01 * Math.max(-x, 0)
  // 西山（錫安山）
  h += 38 * gauss(x + 480, z - 330, 430)
  // 橄欖山脊：南北走向，頂端在 (825,-44)，北端是斯科普斯山／奧古斯塔維多利亞，南端較低（敗壞山）
  const xr = 830 + 40 * Math.sin(z / 600)
  const along = (1 - smooth(150, 1150, z)) * smooth(-2300, -900, z) * 0.85 + 0.15
  h += 72 * along * Math.exp(-(((x - xr) / 330) ** 2))
  h += 10 * gauss(x - 820, z + 880, 260)
  // 東邊往猶大曠野下降
  h -= 0.12 * Math.max(x - 1150, 0)
  // 摩利亞山頂
  h += 1.5 * gauss(x, z, 140)
  // 細節起伏：越遠越大
  const r = Math.hypot(x, z - 200)
  const amp = 0.35 + smooth(400, 1600, r)
  h += (fbm(x / 340 + 3.1, z / 340 - 7.2, 3) - 0.5) * 18 * amp
  h += (vnoise(x / 70, z / 70) - 0.5) * 4 * amp
  // 遠方的猶大山地
  if (r > 1500) h += (fbm(x / 900 + 11, z / 900 + 5, 4) - 0.45) * 110 * smooth(1500, 4000, r)
  // 刻出三條山谷
  for (const v of Object.values(VALLEYS)) {
    const { d, floor } = valleyDist(v, x, z)
    if (d > 600) continue
    const vh = floor + (v.s * d * d) / (d + v.w) + (vnoise(x / 40, z / 40) - 0.5) * 2
    h = smin(h, vh, 14)
  }
  return h
}

/* ---------- 高度網格（同時給網格、貼圖、取樣用） ---------- */
export const GRID = 768
const gw = GRID + 1
let heights: Float32Array | null = null
function grid() {
  if (heights) return heights
  heights = new Float32Array(gw * gw)
  const { x0, x1, z0, z1 } = EXTENT
  for (let j = 0; j < gw; j++)
    for (let i = 0; i < gw; i++) heights[j * gw + i] = elevation(x0 + ((x1 - x0) * i) / GRID, z0 + ((z1 - z0) * j) / GRID) - ORIGIN_ELEV
  return heights
}

/** 地面高度 Y（雙線性取樣網格；範圍外用解析函數） */
export function groundY(x: number, z: number) {
  const { x0, x1, z0, z1 } = EXTENT
  const fx = ((x - x0) / (x1 - x0)) * GRID
  const fz = ((z - z0) / (z1 - z0)) * GRID
  if (fx < 0 || fz < 0 || fx >= GRID || fz >= GRID) return elevation(x, z) - ORIGIN_ELEV
  const h = grid()
  const i = Math.floor(fx)
  const j = Math.floor(fz)
  const tx = fx - i
  const tz = fz - j
  const a = h[j * gw + i]
  const b = h[j * gw + i + 1]
  const c = h[(j + 1) * gw + i]
  const d = h[(j + 1) * gw + i + 1]
  return a + (b - a) * tx + (c - a) * tz + (a - b - c + d) * tx * tz
}

export function slopeAt(x: number, z: number) {
  const e = 5
  const dx = groundY(x + e, z) - groundY(x - e, z)
  const dz = groundY(x, z + e) - groundY(x, z - e)
  return Math.hypot(dx, dz) / (2 * e)
}

/* ---------- 顏色：石灰岩、紅土、乾草、梯田 ---------- */
const C = {
  lime: new THREE.Color('#b9a17a'),
  rock: new THREE.Color('#cfc4ad'),
  rockDark: new THREE.Color('#a59a86'),
  soil: new THREE.Color('#9c6c47'),
  grass: new THREE.Color('#8b8049'),
  green: new THREE.Color('#6f7444'),
  dust: new THREE.Color('#d2c09d'),
}
const tmp = new THREE.Color()
const tmp2 = new THREE.Color()

/** 地表顏色（線性色彩）。terrace = 是否畫梯田線（近景貼圖才畫） */
export function groundColor(x: number, z: number, y: number, slope: number, out: THREE.Color, terrace = true) {
  const n1 = fbm(x / 120, z / 120, 3)
  const n2 = vnoise(x / 18, z / 18)
  // 基色：石灰岩土＋乾草
  out.copy(C.lime).lerp(C.grass, smooth(0.35, 0.75, n1) * 0.55)
  // 谷底：紅土與園子（汲淪谷的王的園子、西羅亞附近）
  let valley = 0
  for (const v of Object.values(VALLEYS)) {
    const { d } = valleyDist(v, x, z)
    valley = Math.max(valley, 1 - smooth(25, 110, d))
  }
  out.lerp(C.soil, valley * 0.45)
  out.lerp(C.green, valley * smooth(0.45, 0.7, n1) * 0.6)
  // 陡坡：裸露的白色石灰岩
  const rocky = smooth(0.28, 0.55, slope + (n2 - 0.5) * 0.25)
  tmp.copy(C.rock).lerp(C.rockDark, n2 * 0.5)
  out.lerp(tmp, rocky * 0.8)
  // 梯田：沿等高線的石牆（深色線）與梯田面（略亮）
  if (terrace) {
    const mask = smooth(0.05, 0.12, slope) * (1 - smooth(0.45, 0.65, slope)) * smooth(0.3, 0.55, fbm(x / 260 + 40, z / 260, 2))
    if (mask > 0.01) {
      const step = 3.2 + n1 * 0.8
      const f = (((y + (n2 - 0.5) * 0.8) / step) % 1 + 1) % 1
      const wall = smooth(0.82, 0.97, f)
      const flat = 1 - smooth(0.0, 0.5, f)
      tmp2.copy(out).multiplyScalar(0.62)
      out.lerp(tmp2, wall * mask * 0.85)
      out.multiplyScalar(1 + flat * mask * 0.06)
    }
  }
  // 細碎斑點
  out.multiplyScalar(0.9 + n2 * 0.18)
  return out
}

function colorTexture(N: number) {
  const data = new Uint8Array(N * N * 4)
  const { x0, x1, z0, z1 } = EXTENT
  const c = new THREE.Color()
  const dx = (x1 - x0) / N
  for (let j = 0; j < N; j++)
    for (let i = 0; i < N; i++) {
      const x = x0 + (i + 0.5) * dx
      const z = z0 + (j + 0.5) * ((z1 - z0) / N)
      const y = groundY(x, z)
      const sx = (groundY(x + dx, z) - groundY(x - dx, z)) / (2 * dx)
      const sz = (groundY(x, z + dx) - groundY(x, z - dx)) / (2 * dx)
      groundColor(x, z, y, Math.hypot(sx, sz), c)
      c.convertLinearToSRGB()
      // PlaneGeometry 旋轉後 v=1 在北邊（z0），貼圖第 0 列對應 v=0（南邊）
      const k = ((N - 1 - j) * N + i) * 4
      data[k] = Math.min(255, c.r * 255)
      data[k + 1] = Math.min(255, c.g * 255)
      data[k + 2] = Math.min(255, c.b * 255)
      data[k + 3] = 255
    }
  const t = new THREE.DataTexture(data, N, N)
  t.colorSpace = THREE.SRGBColorSpace
  t.magFilter = THREE.LinearFilter
  t.minFilter = THREE.LinearMipmapLinearFilter
  t.generateMipmaps = true
  t.anisotropy = 8
  t.needsUpdate = true
  return t
}

/** 近景地形：3.4 × 3.4 km，網格取自高度網格 */
export function innerTerrain(stride: number) {
  const h = grid()
  const seg = GRID / stride
  const { x0, x1, z0, z1 } = EXTENT
  const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0, seg, seg)
  g.rotateX(-Math.PI / 2)
  g.translate((x0 + x1) / 2, 0, (z0 + z1) / 2)
  const pos = g.attributes.position as THREE.BufferAttribute
  // PlaneGeometry 的頂點順序：列（z 由北到南，旋轉後），每列由西到東
  for (let j = 0; j <= seg; j++)
    for (let i = 0; i <= seg; i++) pos.setY(j * (seg + 1) + i, h[j * stride * gw + i * stride])
  g.computeVertexNormals()
  return g
}

export function innerTexture(isTouch: boolean) {
  return colorTexture(isTouch ? 1024 : 1536)
}

/** 遠景地形：16 km，頂點顏色；近景範圍內往下沉，避免重疊閃爍 */
export function outerTerrain(seg: number) {
  const S = 16000
  const g = new THREE.PlaneGeometry(S, S, seg, seg)
  g.rotateX(-Math.PI / 2)
  g.translate(0, 0, 200)
  const pos = g.attributes.position as THREE.BufferAttribute
  const col = new Float32Array(pos.count * 3)
  const c = new THREE.Color()
  const { x0, x1, z0, z1 } = EXTENT
  for (let k = 0; k < pos.count; k++) {
    const x = pos.getX(k)
    const z = pos.getZ(k)
    let y = elevation(x, z) - ORIGIN_ELEV
    const s = Math.hypot(elevation(x + 30, z) - elevation(x - 30, z), elevation(x, z + 30) - elevation(x, z - 30)) / 60
    groundColor(x, z, y, s, c, false)
    // 東邊的猶大曠野更乾、更亮
    c.lerp(new THREE.Color('#d8c29a'), smooth(1400, 4000, x) * 0.6)
    if (x > x0 + 2 && x < x1 - 2 && z > z0 + 2 && z < z1 - 2) y -= 12
    pos.setY(k, y)
    col[k * 3] = c.r
    col[k * 3 + 1] = c.g
    col[k * 3 + 2] = c.b
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3))
  g.computeVertexNormals()
  return g
}
