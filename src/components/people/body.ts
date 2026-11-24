/**
 * 程序建模的人體與衣著（綁定姿勢、成人約 1.72 公尺；身高差異由外層 scale 處理）。
 * 頭：在球面上依方向疊加五官起伏（額、眉骨、眼窩、鼻、顴骨、唇、下巴、耳）。
 * 衣：內袍（有袖、腰帶處收、下襬寬且有垂墜皺褶）、外袍（披在肩背、有條紋與繸子）、
 *     頭巾（覆頭垂肩）、祭司的裹頭巾、腰帶、涼鞋。
 * 所有部分合成一個 SkinnedMesh（皮膚／布料／金 三個材質群組）。
 */
import * as THREE from 'three'
import { Builder, MAT_CLOTH, MAT_GOLD, MAT_SKIN, clamp, gauss, lerp, mixc, mulc, noise3, rgb, sstep, v3, type BoneDef, type Infl, type RGB, type V3 } from './geo'

/* ---------- 骨骼 ---------- */
export const B = {
  HIPS: 0,
  SPINE: 1,
  CHEST: 2,
  NECK: 3,
  HEAD: 4,
  UA_L: 5,
  FA_L: 6,
  HAND_L: 7,
  UA_R: 8,
  FA_R: 9,
  HAND_R: 10,
  TH_L: 11,
  SH_L: 12,
  FT_L: 13,
  TH_R: 14,
  SH_R: 15,
  FT_R: 16,
} as const
const LR: Record<number, number> = { 5: 8, 6: 9, 7: 10, 8: 5, 9: 6, 10: 7, 11: 14, 12: 15, 13: 16, 14: 11, 15: 12, 16: 13 }
export const mirrorBone = (b: number) => LR[b] ?? b

export type HeadWear = 'turban' | 'hpturban' | 'cloth' | 'veil' | 'none'

export interface BodyParams {
  seed: number
  female: boolean
  child: boolean
  elder: boolean
  girth: number // 腰腹寬度
  shoulder: number
  headScale: number
  skin: RGB
  hair: RGB
  beard: number // 0 無、1 短、2 滿、3 長
  tunic: RGB
  tunicPattern: 'plain' | 'check' | 'band'
  tunicBand: RGB
  hem: number // 內袍下襬高度
  sleeveCuff: number // 袖口半徑
  mantle: null | { color: RGB; stripe: RGB; stripes: number; hem: number; tassel: RGB }
  head: HeadWear
  headColor: RGB
  headStripe: RGB | null
  cord: RGB | null // 頭巾上的繩箍
  sash: RGB[] // 腰帶顏色（多色 = 繡花）
  sashEnds: number // 腰帶垂下的末端高度
  feet: 'bare' | 'sandal'
  highPriest: boolean
}

export function boneDefs(P: BodyParams): BoneDef[] {
  const sh = 0.175 * P.shoulder * (P.female ? 0.92 : 1)
  const a = (10 * Math.PI) / 180
  const dir = v3(Math.sin(a), -Math.cos(a), 0)
  const uaL = v3(sh, 1.41, -0.01)
  const faL = uaL.clone().addScaledVector(dir, 0.29)
  const hdL = faL.clone().addScaledVector(dir, 0.255)
  const m = (p: V3) => v3(-p.x, p.y, p.z)
  return [
    { name: 'hips', parent: -1, pos: v3(0, 0.92, 0) },
    { name: 'spine', parent: 0, pos: v3(0, 1.05, 0) },
    { name: 'chest', parent: 1, pos: v3(0, 1.25, 0) },
    { name: 'neck', parent: 2, pos: v3(0, 1.46, -0.01) },
    { name: 'head', parent: 3, pos: v3(0, 1.555, -0.005) },
    { name: 'uaL', parent: 2, pos: uaL },
    { name: 'faL', parent: 5, pos: faL },
    { name: 'handL', parent: 6, pos: hdL },
    { name: 'uaR', parent: 2, pos: m(uaL) },
    { name: 'faR', parent: 8, pos: m(faL) },
    { name: 'handR', parent: 9, pos: m(hdL) },
    { name: 'thL', parent: 0, pos: v3(0.09, 0.88, 0) },
    { name: 'shL', parent: 11, pos: v3(0.09, 0.48, 0.005) },
    { name: 'ftL', parent: 12, pos: v3(0.09, 0.085, 0) },
    { name: 'thR', parent: 0, pos: v3(-0.09, 0.88, 0) },
    { name: 'shR', parent: 14, pos: v3(-0.09, 0.48, 0.005) },
    { name: 'ftR', parent: 15, pos: v3(-0.09, 0.085, 0) },
  ]
}

/* ---------- 軀幹輪廓：y → [半寬, 半深, 前後偏移] ---------- */
type Row = [number, number, number, number]
function profile(P: BodyParams): Row[] {
  const g = P.girth
  const s = P.shoulder * (P.female ? 0.9 : 1)
  const hp = P.female ? 1.1 : 1
  const bust = P.female && !P.child ? 0.012 : 0
  return [
    [0.0, 0.29 * hp, 0.22, 0.02],
    [0.25, 0.265 * hp, 0.2, 0.015],
    [0.45, 0.24 * hp, 0.175, 0.01],
    [0.7, 0.215 * hp, 0.155, 0.0],
    [0.88, 0.195 * hp * (0.6 + 0.4 * g), 0.137 * (0.5 + 0.5 * g), -0.01],
    [0.96, 0.172 * g, 0.122 * g, 0.0],
    [1.0, 0.152 * g, 0.108 * g, 0.004 * g],
    [1.08, 0.163 * g, 0.115 * g + bust * 0.3, 0.006 * g],
    [1.18, 0.172 * (0.5 + 0.5 * g), 0.12 + bust, 0.01 + bust * 0.5],
    [1.3, 0.19 * s, 0.123 + bust * 0.6, 0.01],
    [1.38, 0.205 * s, 0.112, 0.0],
    [1.43, 0.185 * s, 0.095, -0.01],
    [1.47, 0.105, 0.075, -0.008],
    [1.505, 0.064, 0.058, -0.004],
  ]
}
function prof(rows: Row[], y: number): [number, number, number] {
  if (y <= rows[0][0]) return [rows[0][1], rows[0][2], rows[0][3]]
  for (let i = 1; i < rows.length; i++) {
    if (y <= rows[i][0]) {
      const a = rows[i - 1]
      const b = rows[i]
      let t = (y - a[0]) / (b[0] - a[0])
      t = t * t * (3 - 2 * t) * 0.5 + t * 0.5
      return [lerp(a[1], b[1], t), lerp(a[2], b[2], t), lerp(a[3], b[3], t)]
    }
  }
  const l = rows[rows.length - 1]
  return [l[1], l[2], l[3]]
}

/* ---------- 頭的形狀 ---------- */
const HX = 0.074
const HY = 0.11
const HZ = 0.096
const g2 = (dx: number, dy: number, sx: number, sy: number) => gauss((dx * dx) / (sx * sx) + (dy * dy) / (sy * sy))

/** 頭部表面點（頭中心為原點，未縮放）；回傳點與五官遮罩 */
function headLocal(d: V3, female: boolean, seed: number) {
  let x = d.x * HX
  let y = d.y * HY
  let z = d.z * HZ
  if (d.y > 0) x *= 1 + 0.05 * d.y
  else {
    const t = -d.y
    x *= 1 - (female ? 0.3 : 0.24) * t * t
    if (d.z < 0) z *= 1 - 0.35 * t * t
  }
  if (d.z < 0) z *= 1 + 0.1 * clamp(d.y + 0.4)
  // 臉是平的
  if (z > 0.068) z = 0.068 + (z - 0.068) * 0.32
  const fr = sstep(0.25, 0.75, d.z)
  const ax = Math.abs(x)
  const v = seed * 0.37
  let dz = 0
  // 鼻：鼻樑 → 鼻尖 → 鼻底
  const noseLen = 1 + (Math.sin(v * 3.1) * 0.12)
  let nh = 0
  if (y < 0.03 && y > -0.054) {
    if (y > 0.01) nh = ((0.03 - y) / 0.02) * 0.007
    else if (y > -0.036) nh = 0.007 + ((0.01 - y) / 0.046) * 0.019 * noseLen
    else nh = (0.007 + 0.019 * noseLen) * (1 - (-0.036 - y) / 0.018) ** 1.5
  }
  const nw = lerp(0.0075, 0.012, clamp((0.02 - y) / 0.06)) * (1 + Math.sin(v * 1.7) * 0.12)
  dz += nh * gauss((x * x) / (nw * nw))
  dz += 0.007 * g2(ax - 0.013, y + 0.039, 0.007, 0.007) // 鼻翼
  // 眼窩、眉骨、顴骨
  dz -= 0.012 * g2(ax - 0.031, y - 0.008, 0.017, 0.0115)
  dz += 0.0065 * g2(ax - 0.026, y - 0.03, 0.03, 0.009) * (female ? 0.6 : 1)
  dz += 0.006 * g2(ax - 0.047, y + 0.016, 0.018, 0.016)
  dz -= 0.004 * g2(ax - 0.044, y + 0.052, 0.016, 0.018) // 頰凹
  // 唇
  dz += 0.0055 * g2(x, y + 0.058, 0.019, 0.0055)
  dz += 0.006 * g2(x, y + 0.071, 0.016, 0.0065)
  dz -= 0.0025 * g2(ax - 0.022, y + 0.065, 0.006, 0.008)
  // 下巴
  dz += (female ? 0.005 : 0.0075) * g2(x, y + 0.098, 0.022, 0.014)
  z += dz * fr
  // 耳朵
  const side = sstep(0.75, 0.95, Math.abs(d.x))
  const ear = 0.013 * g2(y - 0.002, z + 0.008, 0.028, 0.016) * side
  x += Math.sign(x) * ear
  return {
    p: v3(x, y, z),
    lips: (g2(x, y + 0.058, 0.018, 0.005) + g2(x, y + 0.071, 0.015, 0.006)) * fr,
    socket: g2(ax - 0.031, y - 0.008, 0.02, 0.013) * fr,
    brow: g2(ax - 0.03, y - 0.027, 0.02, 0.0045) * fr,
    cheek: g2(ax - 0.045, y + 0.03, 0.02, 0.02) * fr,
    nostril: g2(ax - 0.009, y + 0.046, 0.005, 0.004) * fr,
    ear,
  }
}

/* ---------- 主建模 ---------- */
export function buildPerson(P: BodyParams, detail: number) {
  const b = new Builder()
  const R = profile(P)
  const defs = boneDefs(P)
  const q = (n: number) => Math.max(4, Math.round(n * detail))
  const seed = P.seed
  const k = P.headScale
  const HC = v3(0, 1.62 + (k - 1) * 0.07, 0.012)
  const head = (d: V3) => {
    const h = headLocal(d, P.female, seed)
    h.p.multiplyScalar(k).add(HC)
    return h
  }
  const skin = P.skin
  const lipC = mixc(mulc(skin, 0.8), rgb('#8a3f38'), 0.45)

  /* --- 軀幹座標與蒙皮權重 --- */
  const torsoAt = (phi: number, y: number, off: number) => {
    const [rx, rz, zo] = prof(R, y)
    const sx = Math.sin(phi)
    const cz = Math.cos(phi)
    const box = y > 1.3 && y < 1.45 ? 0.82 : 1
    const xs = Math.sign(sx) * Math.abs(sx) ** box
    return v3(xs * (rx + off), y, zo + cz * (rz + off))
  }
  const armSide = (x: number) => (x > 0 ? B.UA_L : B.UA_R)
  const torsoW = (p: V3, legMax = 0.85, armAmt = 0.55): Infl => {
    const y = p.y
    const w: Infl = []
    if (y >= 0.95) {
      if (y < 1.05) {
        const t = (y - 0.95) / 0.1
        w.push([B.HIPS, 1 - t], [B.SPINE, t])
      } else if (y < 1.25) {
        const t = (y - 1.05) / 0.2
        w.push([B.SPINE, 1 - t], [B.CHEST, t])
      } else if (y < 1.46) w.push([B.CHEST, 1])
      else {
        const t = clamp((y - 1.46) / 0.05)
        w.push([B.CHEST, 1 - t], [B.NECK, t])
      }
      const a = sstep(0.1, 0.2, Math.abs(p.x)) * sstep(1.22, 1.4, y) * armAmt
      if (a > 0) {
        for (const e of w) e[1] *= 1 - a
        w.push([armSide(p.x), a])
      }
      return w
    }
    // 後襬跟腿的關係較弱（坐下時後襬才會垂著，不會整圈翻起來）
    const leg = sstep(0.95, 0.2, y) * legMax * lerp(0.55, 1, sstep(-0.12, 0.1, p.z))
    const side = clamp(p.x / 0.1, -1, 1)
    // 膝蓋以下的布跟著小腿（坐下時從膝蓋垂下）
    const sf = sstep(0.52, 0.28, y) * 0.75
    const wl = leg * (0.5 + 0.5 * side)
    const wr = leg * (0.5 - 0.5 * side)
    return [
      [B.HIPS, 1 - leg],
      [B.TH_L, wl * (1 - sf)],
      [B.TH_R, wr * (1 - sf)],
      [B.SH_L, wl * sf],
      [B.SH_R, wr * sf],
    ]
  }

  /* --- 頭 --- */
  const lonWarp = (u: number) => u - (0.5 * Math.sin(Math.PI * 2 * u)) / (Math.PI * 2)
  const latWarp = (v: number) => v + (0.38 * Math.sin(Math.PI * 2 * v)) / (Math.PI * 2)
  const ruddy = mixc(skin, rgb('#b0503c'), 0.22)
  b.blob(
    MAT_SKIN,
    q(40),
    q(30),
    (d) => {
      const h = head(d)
      let c = skin
      c = mixc(c, ruddy, clamp(h.cheek * 0.8 + h.ear * 40))
      c = mixc(c, lipC, clamp(h.lips * 1.1))
      c = mulc(c, 1 - h.socket * 0.14 - h.nostril * 0.5)
      if (P.head === 'none' || P.head === 'veil') c = mixc(c, P.hair, clamp(h.brow * 0.85))
      else c = mixc(c, P.hair, clamp(h.brow * 0.8))
      if (P.beard >= 2) c = mixc(c, mulc(P.hair, 1.4), clamp(sstep(-0.01, -0.05, h.p.y - HC.y) * 0.25 * sstep(-0.3, 0.2, d.z)))
      return { p: h.p, c, w: [[B.HEAD, 1]] }
    },
    HC,
    lonWarp,
    latWarp,
  )
  // 眼睛：眼球＋上下眼瞼（球的上、下緣用皮膚色並略大一點）
  for (const sx of [1, -1]) {
    const ex = 0.031 * sx
    const ey = 0.008
    const d0 = v3(ex / HX, ey / HY, 0.95).normalize()
    const zs = headLocal(d0, P.female, seed).p.z
    const c = v3(ex, ey, zs - 0.0066).multiplyScalar(k).add(HC)
    const r = 0.0115 * k
    const iris = rgb(seed % 5 === 0 ? '#4a3a22' : '#21160f')
    const lid = mulc(skin, 0.86)
    b.blob(
      MAT_SKIN,
      q(12),
      q(10),
      (d) => {
        const upper = d.y > 0.36 - d.x * sx * 0.12
        const lower = d.y < -0.42
        const isLid = (upper || lower) && d.z > -0.2
        const rr = isLid ? r * 1.12 : r
        let col: RGB = rgb('#d2c7b6')
        if (d.z > 0.9) col = d.z > 0.978 ? rgb('#0a0706') : iris
        if (isLid) col = upper ? mulc(lid, 0.85) : lid
        return { p: c.clone().addScaledVector(d, rr), c: col, w: [[B.HEAD, 1]] }
      },
      c,
    )
  }

  /* --- 頭髮與鬍子（在頭皮外加一層） --- */
  const hairline = (d: V3) => lerp(0.052 + (P.female ? 0.012 - Math.abs(d.x) * 0.06 : 0), -0.075, sstep(0.55, -0.6, d.z))
  if (P.head !== 'turban' && P.head !== 'hpturban') {
    const off = P.head === 'none' ? 0.008 : 0.004
    const nu = q(32)
    const nv = q(16)
    const hd = (u: number, v: number) => {
      const lat = v * 0.64 * Math.PI
      const lon = u * Math.PI * 2
      return v3(Math.sin(lat) * Math.sin(lon), Math.cos(lat), Math.sin(lat) * Math.cos(lon))
    }
    const hm = (dd: V3) => {
      const h = headLocal(dd, P.female, seed)
      return { h, m: sstep(hairline(dd) - 0.01, hairline(dd) + 0.012, h.p.y) * (1 - sstep(0.004, 0.011, h.ear)) }
    }
    b.grid(
      MAT_CLOTH,
      nu,
      nv,
      (u, v) => {
        const dd = hd(u, v)
        const { h, m } = hm(dd)
        const curl = noise3(dd.x * 22 + seed, dd.y * 22, dd.z * 22)
        // 沒有頭髮的地方沉到皮膚下面，髮際線就是兩者的交線（平滑、不會鋸齒）
        const t = -0.003 + (off + 0.004 + 0.004 * curl) * m
        const p = h.p.clone().addScaledVector(dd, t).multiplyScalar(k).add(HC)
        return { p, c: mulc(P.hair, 0.85 + 0.3 * curl), w: [[B.HEAD, 1]] }
      },
      HC,
      (i, j) => hm(hd((i + 0.5) / nu, (j + 0.5) / nv)).m > 0.001 || j < 2,
    )
  }
  if (P.beard > 0) {
    const len = [0, 0.012, 0.04, 0.11][P.beard]
    const thick = [0, 0.004, 0.007, 0.009][P.beard]
    const nu = q(28)
    const nv = q(16)
    const mask = (x: number, y: number, d: V3) => {
      const ax = Math.abs(x)
      // 鬍線：鬢角 → 斜下到嘴角外側（顴骨露出）→ 八字鬍在鼻下
      const yTop = lerp(-0.051, -0.008, sstep(0.024, 0.07, ax)) - 0.012 * g2(ax - 0.04, 0, 0.012, 1)
      let m = sstep(yTop + 0.003, yTop - 0.009, y) * sstep(-0.45, -0.05, d.z)
      m *= 1 - 0.97 * g2(x, y + 0.065, 0.017, 0.0075) // 嘴（露出下唇）
      return clamp(m)
    }
    b.grid(
      MAT_CLOTH,
      nu,
      nv,
      (u, v) => {
        const lon = (u - 0.5) * Math.PI * 1.45
        const lat = Math.PI * lerp(0.46, 0.97, v)
        const d = v3(Math.sin(lat) * Math.sin(lon), Math.cos(lat), Math.sin(lat) * Math.cos(lon))
        const h = headLocal(d, P.female, seed)
        const m = mask(h.p.x, h.p.y, d)
        const n = noise3(d.x * 30 + seed, d.y * 30, d.z * 30)
        const p = h.p.clone().addScaledVector(d, -0.003 + (thick + 0.004 + 0.004 * n + 0.006 * sstep(-0.06, -0.1, h.p.y)) * m)
        // 下巴的鬍子往下、往前長
        const chin = sstep(-0.07, -0.11, h.p.y) * m * sstep(-0.2, 0.5, d.z)
        p.y -= len * chin * (0.8 + 0.2 * n)
        p.z += len * chin * 0.25
        p.multiplyScalar(k).add(HC)
        // 一綹一綹的鬍鬚：沿縱向的明暗條紋
        const strand = 0.75 + 0.25 * Math.sin(u * 140 + n * 4) + 0.2 * n
        const c = mulc(mixc(P.hair, rgb('#6a5240'), P.elder ? 0 : 0.18), strand)
        return { p, c, w: [[B.HEAD, 1]] }
      },
      HC.clone().add(v3(0, -0.02, -0.01)),
      (i, j) => {
        // 只留有鬍子的格子
        const u = (i + 0.5) / nu
        const v = (j + 0.5) / nv
        const lon = (u - 0.5) * Math.PI * 1.45
        const lat = Math.PI * lerp(0.46, 0.97, v)
        const d = v3(Math.sin(lat) * Math.sin(lon), Math.cos(lat), Math.sin(lat) * Math.cos(lon))
        const h = headLocal(d, P.female, seed)
        return mask(h.p.x, h.p.y, d) > 0.001
      },
    )
  }

  /* --- 脖子 --- */
  b.tube(MAT_SKIN, [v3(0, 1.43, -0.012), v3(0, 1.5, -0.006), v3(0, 1.57, 0.0)], [0.052, 0.049, 0.047].map((r) => r * (P.child ? 0.85 : 1) * (P.female ? 0.9 : 1)), q(14), {
    color: () => mulc(skin, 0.95),
    weight: (s) => (s < 0.5 ? [[B.CHEST, 1 - s * 2], [B.NECK, s * 2]] : [[B.NECK, 2 - s * 2], [B.HEAD, s * 2 - 1]]),
    up: v3(0, 0, 1),
  })

  /* --- 內袍 --- */
  const sd = seed * 0.71
  const hemY = P.hem
  const ys: number[] = []
  {
    const knots = [hemY, 0.5, 0.95, 1.06, 1.3, 1.43, 1.505]
    const per = [q(9), q(6), q(3), q(4), q(3), q(3)]
    knots.slice(0, -1).forEach((y0, i) => {
      const y1 = knots[i + 1]
      if (y1 <= y0) return
      for (let s = 0; s < per[i]; s++) ys.push(lerp(y0, y1, s / per[i]))
    })
    ys.push(1.505)
  }
  const tunicFold = (phi: number, y: number) => {
    let d = 0
    if (y < 0.97) {
      const amp = 0.005 + (0.97 - y) * 0.034
      const f = Math.sin(phi * 8 + 0.8 * Math.sin(phi * 3 + sd) + (0.97 - y) * 1.6) * 0.65 + Math.sin(phi * 15 + sd * 2) * 0.25 + Math.sin(phi * 4 + sd) * 0.1
      d += amp * (0.5 + 0.5 * f)
    }
    // 腰帶上方的鼓起（衣服從腰帶上方翻出來）
    d += 0.013 * gauss(((y - 1.055) / 0.028) ** 2) * (1 + 0.25 * Math.sin(phi * 13 + sd))
    d += 0.0025 * Math.sin(phi * 9 + y * 20 + sd) * sstep(1.1, 1.35, y)
    return d
  }
  const nT = q(40)
  const checkC = (u: number, y: number, base: RGB): RGB => {
    if (P.tunicPattern === 'check') {
      // 雜色細麻（出 28:39）：細格子織紋，用輕微明暗表現
      const a = Math.sin(u * Math.PI * 2 * 30) * Math.sin(y * 150)
      return mulc(base, 0.97 + 0.03 * Math.sign(a))
    }
    if (P.tunicPattern === 'band') {
      const band = sstep(0.035, 0.03, Math.abs(y - (hemY + 0.06))) + sstep(0.03, 0.02, Math.abs(y - 1.49))
      return mixc(base, P.tunicBand, clamp(band))
    }
    return base
  }
  b.grid(
    MAT_CLOTH,
    nT,
    ys.length - 1,
    (u, _v, _i, j) => {
      const phi = u * Math.PI * 2
      let y = ys[j]
      const bottom = clamp(1 - (y - hemY) / 0.5)
      const fold = tunicFold(phi, y)
      y += bottom * (0.012 * Math.sin(phi * 3 + sd) - fold * 0.3)
      const p = torsoAt(phi, y, fold)
      const dirt = sstep(hemY + 0.2, hemY, y) * 0.18
      let c = checkC(u, y, P.tunic)
      c = mixc(c, rgb('#7d6448'), dirt)
      c = mulc(c, 0.94 + 0.06 * Math.sin(phi * 8 + sd))
      return { p, c, w: torsoW(p), uv: [u * 6, y * 6] }
    },
    v3(0, 0.9, 0),
  )

  /* --- 腿（袍下露出的小腿與腳） --- */
  for (const sx of [1]) {
    const x = 0.09 * sx
    const lift = P.feet === 'sandal' ? 0.012 : 0
    b.tube(MAT_SKIN, [v3(x, 0.4, 0.004), v3(x, 0.26, 0.01), v3(x, 0.1 + lift, 0.0)], [0.046, 0.04, 0.034].map((r) => r * (P.child ? 0.85 : 1)), q(10), {
      color: () => mulc(skin, 0.97),
      weight: (s) => (s < 0.05 ? [[B.TH_L, 0.3], [B.SH_L, 0.7]] : s > 0.9 ? [[B.SH_L, 1 - (s - 0.9) / 0.1], [B.FT_L, (s - 0.9) / 0.1]] : [[B.SH_L, 1]]),
      up: v3(0, 0, 1),
    })
    // 腳：沿 z 的扁管子
    const fp: [number, number, number, number][] = [
      // z, 中心高, 半寬, 半高
      [-0.062, 0.03, 0.012, 0.014],
      [-0.052, 0.036, 0.026, 0.03],
      [-0.025, 0.045, 0.032, 0.042],
      [0.01, 0.045, 0.035, 0.04],
      [0.06, 0.034, 0.041, 0.028],
      [0.115, 0.022, 0.045, 0.019],
      [0.15, 0.018, 0.043, 0.015],
      [0.176, 0.015, 0.03, 0.011],
      [0.186, 0.013, 0.012, 0.006],
    ]
    const fs = P.child ? 0.8 : P.female ? 0.92 : 1
    b.tube(
      MAT_SKIN,
      fp.map((f) => v3(x, f[1] * fs + lift, f[0] * fs)),
      fp.map((f) => [f[2] * fs, f[3] * fs] as [number, number]),
      q(10),
      {
        color: (s, a) => {
          // 腳趾縫與腳底
          let c = mulc(skin, 0.98)
          if (s > 0.72 && Math.sin(a) > 0) c = mulc(c, 0.92 + 0.08 * Math.cos(Math.cos(a) * 26))
          if (Math.sin(a) < -0.6) c = mixc(c, rgb('#a07a5a'), 0.35)
          return c
        },
        weight: (s) => (s < 0.3 ? [[B.FT_L, 0.6 + s], [B.SH_L, 0.4 - s]] : [[B.FT_L, 1]]),
        up: v3(0, 1, 0),
      },
    )
    if (P.feet === 'sandal') {
      const leather = rgb('#5b3a22')
      b.tube(
        MAT_CLOTH,
        fp.map((f) => v3(x, 0.007, f[0] * fs * 1.04 + 0.002)),
        fp.map((f) => [f[2] * fs + 0.009, 0.007] as [number, number]),
        q(10),
        { color: (_s, a) => (Math.sin(a) > 0.5 ? mulc(leather, 1.15) : mulc(leather, 0.7)), weight: () => [[B.FT_L, 1]], up: v3(0, 1, 0) },
      )
      // 皮帶：前腳掌一條、腳踝一圈，中間連一條
      const strap = (zc: number, yc: number, rx: number, ry: number) => {
        const pts: V3[] = []
        for (let i = 0; i < 12; i++) {
          const a = (i / 12) * Math.PI * 2
          pts.push(v3(x + Math.cos(a) * rx, yc + Math.sin(a) * ry, zc))
        }
        b.tube(MAT_CLOTH, pts, pts.map(() => [0.0035, 0.009] as [number, number]), 4, {
          color: () => mulc(leather, 0.9),
          weight: () => [[B.FT_L, 1]],
          closed: true,
          up: v3(0, 0, 1),
          orient: false,
        })
      }
      strap(0.075 * fs, 0.035 * fs + lift, 0.045 * fs, 0.03 * fs)
      strap(-0.015 * fs, 0.06 * fs + lift, 0.039 * fs, 0.036 * fs)
    }
  }
  b.mirrorLast(P.feet === 'sandal' ? 5 : 2, mirrorBone)

  /* --- 手臂：袖子＋手 --- */
  const uaL = defs[B.UA_L].pos
  const faL = defs[B.FA_L].pos
  const hdL = defs[B.HAND_L].pos
  const dir = hdL.clone().sub(faL).normalize()
  const armPieces = (() => {
    const before = b.pieces.length
    const start = uaL.clone().add(v3(-0.03, -0.005, 0))
    const pts: V3[] = []
    const rad: number[] = []
    const n = q(14)
    const total = uaL.distanceTo(hdL)
    const sE = 0.29 / 0.545
    for (let i = 0; i <= n; i++) {
      const s = i / n
      let p: V3
      if (s < 0.08) p = start.clone().lerp(uaL, s / 0.08)
      else p = uaL.clone().addScaledVector(dir, ((s - 0.08) / 0.92) * total * 0.985)
      pts.push(p)
      const cuff = P.sleeveCuff
      rad.push(s < 0.08 ? 0.05 : s < sE ? lerp(0.058, 0.047, (s - 0.08) / (sE - 0.08)) : lerp(0.047, cuff, sstep(sE, 1, s)))
    }
    b.tube(MAT_CLOTH, pts, rad.map((r) => r * (P.child ? 0.85 : 1) * (P.female ? 0.92 : 1)), q(12), {
      color: (s, a) => {
        let c = checkC(a / 6.28, s, P.tunic)
        if (P.tunicPattern === 'band' && s > 0.93) c = P.tunicBand
        return mulc(c, 0.95 + 0.05 * Math.sin(a * 5 + s * 10))
      },
      weight: (s) => {
        if (s < 0.14) return [[B.CHEST, 1 - s / 0.14], [B.UA_L, s / 0.14]]
        if (Math.abs(s - sE) < 0.06) {
          const t = (s - sE + 0.06) / 0.12
          return [[B.UA_L, 1 - t], [B.FA_L, t]]
        }
        return s < sE ? [[B.UA_L, 1]] : [[B.FA_L, 1]]
      },
      disp: (s, a) => 0.004 * Math.sin(a * 5 + s * 9 + sd) + 0.006 * gauss(((s - sE) / 0.06) ** 2) * (0.5 + 0.5 * Math.sin(a * 3 + s * 60)),
      up: v3(0, 0, 1),
      uvScale: 10,
    })
    // 手（以左手為準：手指向 -y，掌心朝 -x）
    const hb = b.pieces.length
    const hs = P.child ? 0.78 : P.female ? 0.9 : 1
    const handW = (p: V3): Infl => (p.y > -0.012 ? [[B.FA_L, 0.5], [B.HAND_L, 0.5]] : [[B.HAND_L, 1]])
    const skinH = mulc(skin, 0.97)
    // 手腕到掌
    b.tube(MAT_SKIN, [v3(0, 0.02, 0), v3(0, -0.01, 0), v3(0.002, -0.05, 0.0), v3(0.0, -0.088, 0.0)], [[0.02, 0.028], [0.017, 0.03], [0.016, 0.042], [0.013, 0.04]], q(10), {
      color: () => skinH,
      weight: (_s, p) => handW(p),
      up: v3(1, 0, 0),
    })
    // 手指：有點彎向掌心
    const fingers: [number, number, number][] = [
      [0.029, 0.072, 0.0085],
      [0.01, 0.08, 0.0088],
      [-0.009, 0.076, 0.0084],
      [-0.027, 0.06, 0.0075],
    ]
    for (const [z, l, r] of fingers) {
      const p0 = v3(0.0, -0.08, z * 0.92)
      const curl = 0.32
      const p1 = p0.clone().add(v3(0, -l * 0.45, 0))
      const p2 = p1.clone().add(v3(-Math.sin(curl) * l * 0.32, -Math.cos(curl) * l * 0.32, 0))
      const p3 = p2.clone().add(v3(-Math.sin(curl * 2.2) * l * 0.23, -Math.cos(curl * 2.2) * l * 0.23, 0))
      const p4 = p3.clone().add(v3(-Math.sin(curl * 2.4) * 0.006, -Math.cos(curl * 2.4) * 0.006, 0))
      b.tube(MAT_SKIN, [p0, p1, p2, p3, p4], [r * 1.05, r, r * 0.92, r * 0.8, r * 0.3], 6, { color: (s) => (s > 0.85 ? mixc(skinH, rgb('#c9a08a'), 0.3) : skinH), weight: () => [[B.HAND_L, 1]], up: v3(1, 0, 0) })
    }
    // 拇指
    {
      const t0 = v3(-0.006, -0.018, 0.026)
      const t1 = t0.clone().add(v3(-0.012, -0.028, 0.014))
      const t2 = t1.clone().add(v3(-0.014, -0.024, 0.004))
      const t3 = t2.clone().add(v3(-0.004, -0.008, 0))
      b.tube(MAT_SKIN, [t0, t1, t2, t3], [0.013, 0.011, 0.009, 0.003], 6, { color: () => skinH, weight: () => [[B.HAND_L, 1]], up: v3(1, 0, 0) })
    }
    const m = new THREE.Matrix4().makeScale(hs, hs, hs)
    m.premultiply(new THREE.Matrix4().makeRotationZ(Math.atan2(dir.x, -dir.y)))
    m.premultiply(new THREE.Matrix4().makeTranslation(hdL.x, hdL.y, hdL.z))
    b.transformLast(b.pieces.length - hb, m)
    return b.pieces.length - before
  })()
  b.mirrorLast(armPieces, mirrorBone)

  /* --- 腰帶 --- */
  {
    const nS = q(36)
    const cols = P.sash
    const sashC = (u: number, s: number) => {
      if (cols.length === 1) return mulc(cols[0], 0.92 + 0.08 * Math.sin(s * 200))
      // 繡花：沿長度交替的色帶＋斜紋
      const k2 = Math.floor((u * 40 + s * 3) % cols.length)
      return mulc(cols[Math.abs(k2)], 0.9 + 0.1 * Math.sin((u + s) * 300))
    }
    b.grid(
      MAT_CLOTH,
      nS,
      3,
      (u, v) => {
        const phi = u * Math.PI * 2
        const y = lerp(0.972, 1.034, v)
        const p = torsoAt(phi, y, 0.007 + 0.003 * Math.sin(phi * 11 + sd) + 0.004 * Math.sin(v * Math.PI))
        return { p, c: sashC(u, v * 0.1), w: torsoW(p) }
      },
      v3(0, 1, 0),
    )
    // 打結處與垂下的兩端
    const front = torsoAt(0, 1.0, 0.012)
    b.blob(MAT_CLOTH, q(8), q(6), (d) => ({ p: front.clone().add(v3(d.x * 0.024, d.y * 0.022, d.z * 0.012 + 0.006)), c: sashC(0.1, 0.5), w: [[B.HIPS, 0.6], [B.SPINE, 0.4]] }), front)
    if (P.sashEnds < 0.95) {
      for (const sx of [-1, 1]) {
        const pts: V3[] = []
        const n = q(8)
        for (let i = 0; i <= n; i++) {
          const t = i / n
          const y = lerp(0.99, P.sashEnds, t)
          const base = torsoAt(sx * 0.12, y, tunicFold(sx * 0.12, y) + 0.012)
          pts.push(v3(sx * (0.018 + t * 0.012), y, base.z + 0.006 + t * 0.01))
        }
        b.tube(MAT_CLOTH, pts, pts.map(() => [0.021, 0.003] as [number, number]), 6, {
          color: (s, a) => sashC(a * 0.01 + 0.3, s),
          weight: (_s, p) => {
            const leg = sstep(0.95, 0.4, p.y) * 0.6
            return [[B.HIPS, 1 - leg], [B.TH_L, leg * 0.5], [B.TH_R, leg * 0.5]]
          },
          up: v3(0, 0, 1),
        })
      }
    }
  }

  /* --- 大祭司：外袍（藍）、以弗得、胸牌 --- */
  if (P.highPriest) {
    const blue = rgb('#1e3a78')
    const hemHP = 0.36
    const ysR = ys.filter((y) => y >= hemHP + 0.01)
    ysR.unshift(hemHP)
    b.grid(
      MAT_CLOTH,
      nT,
      ysR.length - 1,
      (u, _v, _i, j) => {
        const phi = u * Math.PI * 2
        const y = ysR[j]
        const fold = tunicFold(phi, y) * 0.6
        const p = torsoAt(phi, y, 0.012 + fold + (y < 1.0 ? (1 - y) * 0.03 : 0))
        return { p, c: mulc(blue, 0.92 + 0.08 * Math.sin(phi * 8 + sd)), w: torsoW(p, 0.6, 0.35) }
      },
      v3(0, 0.9, 0),
      (_i, j) => ysR[j] < 1.44,
    )
    // 下襬：石榴與金鈴鐺交替（出 28:33–34）
    const pom = [rgb('#1e3a78'), rgb('#5a2675'), rgb('#a3201c')]
    const nB = q(28)
    for (let i = 0; i < nB; i++) {
      const phi = (i / nB) * Math.PI * 2
      const gold = i % 2 === 1
      const c = torsoAt(phi, hemHP - 0.012, 0.012 + tunicFold(phi, hemHP) * 0.6 + 0.64 * 0.03 + 0.004)
      const r = gold ? 0.011 : 0.013
      b.blob(gold ? MAT_GOLD : MAT_CLOTH, 6, 5, (d) => ({ p: c.clone().addScaledVector(d, r).add(v3(0, d.y < 0 ? -0.004 : 0, 0)), c: gold ? rgb('#d9a441') : pom[(i >> 1) % 3], w: torsoW(c, 0.6) }), c)
    }
    // 以弗得：金、藍、紫、朱紅與細麻織成（出 28:6–8）
    const ephodC = (y: number, phi: number) => {
      const bands = [rgb('#c99a3a'), rgb('#1e3a78'), rgb('#5a2675'), rgb('#a3201c'), rgb('#efe8d8')]
      const k2 = Math.floor(((y * 90 + Math.sin(phi * 2) * 0.2) % 5) + 5) % 5
      return bands[k2]
    }
    const ysE = ys.filter((y) => y > 0.72 && y < 1.4)
    ysE.unshift(0.7)
    b.grid(
      MAT_CLOTH,
      nT,
      ysE.length - 1,
      (u, _v, _i, j) => {
        const phi = u * Math.PI * 2
        const y = ysE[j]
        const p = torsoAt(phi, y, 0.02 + tunicFold(phi, y) * 0.35 + (y < 1.0 ? (1 - y) * 0.03 : 0))
        return { p, c: ephodC(y, phi), w: torsoW(p, 0.5, 0.2) }
      },
      v3(0, 1.0, 0),
      (i) => {
        // 兩側開口（前後兩片）
        const phi = ((i + 0.5) / nT) * Math.PI * 2
        return Math.abs(Math.sin(phi)) < 0.8
      },
    )
    // 肩帶上的紅瑪瑙（出 28:9–12）
    for (const sx of [1, -1]) {
      const c = v3(sx * 0.12, 1.455, 0.0)
      b.blob(MAT_GOLD, 8, 6, (d) => ({ p: c.clone().add(v3(d.x * 0.022, d.y * 0.01, d.z * 0.022)), c: d.y > 0.5 ? rgb('#2a1a18') : rgb('#d9a441'), w: [[B.CHEST, 1]] }), c)
    }
    // 胸牌：四行寶石（出 28:15–21）
    const plate = torsoAt(0, 1.25, 0.03)
    const gems = ['#a3201c', '#c9b44a', '#2f7a4a', '#1f8a6a', '#2a4ea0', '#e8e4dc', '#d9762a', '#8a8a8a', '#6a2a8a', '#4ab0a0', '#2a1a18', '#7a2a2a']
    b.grid(MAT_GOLD, 4, 4, (u, v) => ({ p: plate.clone().add(v3((u - 0.5) * 0.17, (0.5 - v) * 0.2, 0.004 + 0.004 * Math.sin(u * Math.PI))), c: rgb('#d9a441'), w: [[B.CHEST, 1]] }), plate.clone().add(v3(0, 0, -0.1)))
    gems.forEach((g, i) => {
      const r = Math.floor(i / 3)
      const ccol = i % 3
      const c = plate.clone().add(v3((ccol - 1) * 0.05, 0.072 - r * 0.048, 0.012))
      b.blob(MAT_CLOTH, 6, 4, (d) => ({ p: c.clone().add(v3(d.x * 0.016, d.y * 0.014, d.z * 0.006)), c: rgb(g), w: [[B.CHEST, 1]] }), c)
    })
  }

  /* --- 外袍（披在肩背） --- */
  if (P.mantle) {
    const M = P.mantle
    const nu = q(30)
    const nvM = q(16)
    const top = 1.465
    const env = (y: number) => {
      // 從肩膀垂下：取 y 以上（到肩）的最大輪廓
      let [rx, rz] = prof(R, y)
      for (let yy = Math.min(y, 1.42); yy <= 1.42; yy += 0.03) {
        const [a, c] = prof(R, yy)
        rx = Math.max(rx, a)
        rz = Math.max(rz, c)
      }
      // 側面要讓出手臂
      if (y < 1.46) rx = Math.max(rx, lerp(rx, 0.29 * P.shoulder, Math.sqrt(sstep(1.475, 1.3, y))))
      return { rx, rz }
    }
    const mOff = (y: number, phi: number) => {
      const drop = Math.max(0, 1.4 - y)
      return 0.024 + 0.014 * gauss(((y - 1.38) / 0.07) ** 2) + (0.004 + drop * 0.03) * (0.5 + 0.5 * Math.sin(phi * 7 + sd * 1.3 + drop * 2)) + drop * 0.035
    }
    b.grid(
      MAT_CLOTH,
      nu,
      nvM,
      (u, v) => {
        const y0 = lerp(top, M.hem, v ** 0.9)
        const wrap = sstep(1.42, 1.22, y0)
        const p0 = lerp(0.95, 2.04, wrap)
        const p1 = Math.PI * 2 - p0
        const phi = lerp(p0, p1, u)
        const { rx, rz } = env(y0)
        const off = mOff(y0, phi)
        let y = y0
        if (v === 1) y += 0.015 * Math.sin(phi * 4 + sd) - (off - 0.024) * 0.3
        const sx = Math.sin(phi)
        const p = v3(sx * (rx + off), y, Math.cos(phi) * (rz + off) + (y > 1.3 ? -0.005 : 0))
        // 條紋＋下襬的繸子帶
        const stripeT = M.stripes > 0 ? Math.abs(Math.sin(((phi - Math.PI) * M.stripes) / 1.0)) : 0
        let c = M.color
        if (M.stripes > 0 && stripeT > 0.86) c = M.stripe
        if (v > 0.95) c = mixc(c, mulc(M.color, 0.7), 0.6)
        c = mulc(c, 0.93 + 0.07 * Math.sin(phi * 7 + sd * 1.3))
        // 權重
        const w = torsoW(p, 0.55, 0)
        const arm = sstep(0.18, 0.26, Math.abs(p.x)) * sstep(0.9, 1.15, y) * 0.6
        if (arm > 0) {
          for (const e of w) e[1] *= 1 - arm
          w.push([armSide(p.x), arm])
        }
        return { p, c, w, uv: [u * 8, y * 6] }
      },
      v3(0, 1.0, -0.02),
    )
    // 繸子（民 15:38）：兩個前角各一
    for (const sx of [1, -1]) {
      const phi = sx > 0 ? 2.04 : Math.PI * 2 - 2.04
      const { rx, rz } = env(M.hem)
      const off = mOff(M.hem, phi)
      const base = v3(Math.sin(phi) * (rx + off), M.hem, Math.cos(phi) * (rz + off))
      const pts = [base, base.clone().add(v3(0, -0.035, 0.004)), base.clone().add(v3(0, -0.07, 0.006))]
      b.tube(MAT_CLOTH, pts, [0.006, 0.009, 0.004], 5, {
        color: (s) => (s < 0.4 ? M.tassel : rgb('#e9e0cc')),
        weight: () => [[B.HIPS, 0.5], [sx > 0 ? B.TH_L : B.TH_R, 0.5]],
        up: v3(0, 0, 1),
      })
    }
  }

  /* --- 頭巾 / 頭蓋 --- */
  if (P.head === 'cloth' || P.head === 'veil') {
    const veil = P.head === 'veil'
    const nu = q(36)
    const headRows = 7 // ψ = 0..105°，每 15°
    const dRows = q(veil ? 10 : 7)
    const bottom = veil ? 1.0 : 1.24
    const brow = 3 // ψ>45° 的前方不覆蓋（露臉）
    const openHalf = (veil ? 62 : 58) / 180 * Math.PI
    const outer = (phi: number, y: number) => {
      let ex = 0
      let ez = 0
      for (let yy = Math.min(y, 1.42); yy <= 1.42; yy += 0.03) {
        const [a, c] = prof(R, yy)
        ex = Math.max(ex, a)
        ez = Math.max(ez, c)
      }
      if (P.mantle) {
        const drop = Math.max(0, 1.4 - y)
        ex = lerp(ex, 0.28 * P.shoulder, sstep(1.46, 1.36, y)) + 0.026 + drop * 0.05
        ez = ez + 0.026 + drop * 0.05
      }
      if (veil) ex = Math.max(ex, 0.27)
      // 前面兩片垂在胸前，貼著身體而不是往外張開
      const front = sstep(-0.1, 0.55, Math.cos(phi))
      const [tx, tz] = prof(R, Math.max(y, 1.1))
      ex = lerp(ex, tx * 0.9, front)
      ez = lerp(ez, tz + 0.01, front)
      return v3(Math.sin(phi) * (ex + 0.018), 0, Math.cos(phi) * (ez + 0.024) - 0.005)
    }
    const ring = (phi: number, psi: number) => {
      const d = v3(Math.sin(psi) * Math.sin(phi), Math.cos(psi), Math.sin(psi) * Math.cos(phi))
      const h = head(d)
      return h.p.clone().addScaledVector(d, (0.012 + 0.006 * (psi / Math.PI)) * k)
    }
    const psiEnd = (105 / 180) * Math.PI
    const shoulderY = 1.45
    b.grid(
      MAT_CLOTH,
      nu,
      headRows + dRows,
      (u, _v, _i, j) => {
        const phi = u * Math.PI * 2
        let p: V3
        let w: Infl
        let yNorm = 0
        if (j <= headRows) {
          const psi = (j / headRows) * psiEnd
          p = ring(phi, psi)
          // 布的皺褶
          p.addScaledVector(v3(Math.sin(phi), 0, Math.cos(phi)), 0.003 * Math.sin(phi * 9 + sd) * (j / headRows))
          w = [[B.HEAD, 1]]
        } else {
          const t = (j - headRows) / dRows
          const a = ring(phi, psiEnd)
          const sh = outer(phi, shoulderY)
          sh.y = shoulderY - Math.abs(Math.sin(phi)) * 0.05
          const bo = outer(phi, bottom)
          bo.y = bottom
          const t1 = 0.38
          if (t < t1) {
            const s = t / t1
            p = a.clone().lerp(sh, s)
            // 布從頭垂到肩，中間略微下垂
            const sag = Math.sin(s * Math.PI) * 0.018
            p.x += Math.sin(phi) * sag
            p.z += Math.cos(phi) * sag
            p.y -= sag * 0.5
          } else {
            const s = (t - t1) / (1 - t1)
            p = sh.clone().lerp(bo, s)
          }
          yNorm = t
          const fa = 0.004 + t * (veil ? 0.03 : 0.02)
          const f = fa * (0.5 + 0.5 * Math.sin(phi * 9 + sd * 2 + t * 2.5))
          p.x += Math.sin(phi) * f
          p.z += Math.cos(phi) * f
          if (j === headRows + dRows) p.y += 0.012 * Math.sin(phi * 5 + sd) - f * 0.4
          const hw = sstep(0.3, 0.0, t)
          const arm = sstep(0.17, 0.27, Math.abs(p.x)) * sstep(1.42, 1.3, p.y) * 0.35
          w = [[B.HEAD, hw], [B.CHEST, (1 - hw) * (1 - arm)], [armSide(p.x), (1 - hw) * arm]]
        }
        let c = P.headColor
        if (P.headStripe) {
          // 頭巾邊緣的色帶
          const edge = Math.min(Math.abs(phi - openHalf), Math.abs(Math.PI * 2 - openHalf - phi))
          if (edge < 0.25 && j > brow) c = P.headStripe
          if (yNorm > 0.92) c = P.headStripe
        }
        c = mulc(c, 0.93 + 0.07 * Math.sin(phi * 9 + sd * 2))
        return { p, c, w, uv: [u * 6, j * 0.4] }
      },
      HC.clone().add(v3(0, -0.1, -0.02)),
      (i, j) => {
        const phi = ((i + 0.5) / nu) * Math.PI * 2
        const fwd = phi < openHalf || phi > Math.PI * 2 - openHalf
        return !(fwd && j >= brow)
      },
    )
    if (P.cord) {
      const pts: V3[] = []
      for (let i = 0; i < 24; i++) {
        const phi = (i / 24) * Math.PI * 2
        pts.push(ring(phi, (48 / 180) * Math.PI + 0.1 * Math.cos(phi) ** 2).addScaledVector(v3(Math.sin(phi), 0, Math.cos(phi)), 0.006))
      }
      const cord = P.cord
      b.tube(MAT_CLOTH, pts, pts.map(() => 0.0065), 5, { color: (s) => mulc(cord, 0.85 + 0.15 * Math.sin(s * 150)), weight: () => [[B.HEAD, 1]], closed: true, up: v3(0, 1, 0), orient: false })
    }
  }
  if (P.head === 'turban' || P.head === 'hpturban') {
    const hp = P.head === 'hpturban'
    const nu = q(36)
    const nv = q(12)
    b.grid(
      MAT_CLOTH,
      nu,
      nv + 1,
      (u, _v, _i, j) => {
        const phi = u * Math.PI * 2
        const psiB = lerp(1.2, 1.62, sstep(0.3, -0.6, Math.cos(phi))) // 前：額頭；後：後頸上方
        const t = Math.min(j / nv, 1)
        const psi = t * psiB
        const d = v3(Math.sin(psi) * Math.sin(phi), Math.cos(psi), Math.sin(psi) * Math.cos(phi))
        const h = head(d)
        let off = (0.01 + 0.016 * Math.sin(Math.min(t, 0.97) * Math.PI) ** 0.7) * k
        // 一圈一圈纏繞的布
        off += 0.006 * Math.abs(Math.sin((t * 5 + phi / (Math.PI * 2)) * Math.PI)) * sstep(0.25, 0.5, t)
        if (j === nv + 1) off = 0.004
        const p = h.p.clone().addScaledVector(d, off)
        p.y += (hp ? 0.045 : 0.018) * (1 - t) ** 1.6 * k
        if (j === nv + 1) p.y -= 0.004
        const c = mulc(P.headColor, 0.84 + 0.16 * Math.abs(Math.sin((t * 5 + phi / (Math.PI * 2)) * Math.PI)))
        return { p, c, w: [[B.HEAD, 1]], uv: [u * 7, t * 2] }
      },
      HC.clone().add(v3(0, 0.03, 0)),
    )
    if (hp) {
      // 精金的牌（出 28:36–38）
      const d = v3(0, 0.55, 0.83).normalize()
      const c = head(d).p.addScaledVector(d, 0.03 * k)
      b.grid(MAT_GOLD, 3, 2, (u, v) => ({ p: c.clone().add(v3((u - 0.5) * 0.075, (0.5 - v) * 0.024, 0.008 * Math.cos((u - 0.5) * 2.5))), c: rgb('#e0b04a'), w: [[B.HEAD, 1]] }), c.clone().add(v3(0, 0, -0.08)))
    }
  }

  return b.buildByMat()
}
