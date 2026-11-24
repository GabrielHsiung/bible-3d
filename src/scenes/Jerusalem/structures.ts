/**
 * F-3 各時期的城市：每個建築群有存在的年代（spans）與結束方式（焚毀 burn／沉沒淡出 sink）。
 * 尺寸：聖殿用肘（一般肘 0.445 m）；其餘用公尺。外觀除註明者外皆屬重建推測。
 * 希律時期（約主後 30／66）的整體佈局對照以色列博物館 1:50「第二聖殿末期耶路撒冷模型」
 * （Avi-Yonah 依約瑟夫設計、Tsafrir 依考古修訂）：聖殿山梯形平台與四周柱廊、南邊皇家柱廊、
 * 西北角安東尼亞堡、上城西北角的希律王宮與三塔（希皮庫斯、法撒勒、瑪利安）、上城（西山）與下城（大衛城）、
 * 第一／二／三道牆。模型中的賽馬場已移除，這裡也不放。
 */
import * as THREE from 'three'
import { GB, along } from './builders'
import type { MatKey } from './jmaterials'
import { groundY, slopeAt } from './terrain'
import { mulberry } from '../../rng'
import {
  L, MOUNT, MOUNT_TOP, NO_HOUSE, SQUARE, WALL_BYZANTINE, WALL_DAVID, WALL_FIRST, WALL_NEHEMIAH, WALL_OTTOMAN, WALL_SECOND,
  WALL_SOLOMON, WALL_THIRD, WALL_WEST, Z, inPoly, quadPoint, type P,
} from './geo'

/** 一般肘（公尺） */
export const CUBIT = 0.445
const c = (n: number) => n * CUBIT

export type Parts = Partial<Record<MatKey, GB>>
export interface Structure {
  id: string
  spans: [number, number][]
  end: 'burn' | 'sink'
  /** 出現前延遲（秒），例如廢墟要等焚毀之後才出現 */
  delay?: number
  smoke?: P[]
  build: () => Parts
}

function parts() {
  const p: Parts = {}
  const get = (k: MatKey) => (p[k] ??= new GB())
  return { p, get }
}

const minGround = (poly: P[]) => {
  let m = Infinity
  const cx = poly.reduce((s, q) => s + q[0], 0) / poly.length
  const cz = poly.reduce((s, q) => s + q[1], 0) / poly.length
  for (const [x, z] of [...poly, [cx, cz] as P]) {
    m = Math.min(m, groundY(x, z))
    for (const t of [0.25, 0.5, 0.75]) m = Math.min(m, groundY(x + (cx - x) * t, z + (cz - z) * t))
  }
  return m
}
const rect = (x0: number, z0: number, x1: number, z1: number): P[] => [
  [x0, z0],
  [x1, z0],
  [x1, z1],
  [x0, z1],
]

/** 平面上的矩形圍牆（不沿地形） */
function rectWall(g: GB, x0: number, z0: number, x1: number, z1: number, y0: number, h: number, t: number, color: string, gateE = 0) {
  g.box((x0 + x1) / 2, y0, z0, x1 - x0 + t, h, t, color)
  g.box((x0 + x1) / 2, y0, z1, x1 - x0 + t, h, t, color)
  g.box(x0, y0, (z0 + z1) / 2, t, h, z1 - z0, color)
  if (gateE > 0) {
    const half = (z1 - z0 - gateE) / 2
    g.box(x1, y0, z0 + half / 2, t, h, half, color)
    g.box(x1, y0, z1 - half / 2, t, h, half, color)
    g.box(x1, y0, (z0 + z1) / 2, t * 1.6, h * 1.25, gateE + 2, color)
  } else g.box(x1, y0, (z0 + z1) / 2, t, h, z1 - z0, color)
}

/** 柱廊：沿 a→b，內側一排柱子＋平屋頂＋外牆 */
function stoa(g: GB, roof: GB, a: P, b: P, y0: number, depth: number, h: number, inward: number) {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1])
  const rot = -Math.atan2(b[1] - a[1], b[0] - a[0])
  const nx = (-(b[1] - a[1]) / len) * inward
  const nz = ((b[0] - a[0]) / len) * inward
  const cx = (a[0] + b[0]) / 2
  const cz = (a[1] + b[1]) / 2
  g.box(cx + nx * 0.8, y0, cz + nz * 0.8, len, h + 1.5, 1.6, '#e7dcc4', rot)
  roof.box(cx + nx * (depth / 2), y0 + h, cz + nz * (depth / 2), len, 1.2, depth, '#8a6d52', rot)
  for (const [x, z] of along([a, b], 5.5).slice(1)) g.cyl(x + nx * (depth - 1), y0, z + nz * (depth - 1), 0.55, h, '#efe6d2', 6, 0.5, y0, false)
}

/* ---------------- 聖殿 ---------------- */

/** 所羅門聖殿（王上 6–7）：殿長 60、寬 20、高 30 肘；廊 20×10 肘；三層旁屋；雅斤、波阿斯；銅海；銅壇 20×20×10 肘（代下 4:1） */
function solomonTemple(plain: boolean): Parts {
  const { p, get } = parts()
  const s = get('stone')
  const y0 = groundY(0, 0) + 1.2
  const W = -c(22) // 西端（至聖所在岩石上）
  // 院子的石台（摩利亞山頂整平）
  const court = rect(W - c(32), -c(57), W + c(142), c(57))
  s.prism(court, minGround(court) - 2, y0 - 0.4, '#cdbd98')
  // 旁屋（三層，每層 5 肘，王上 6:5–10）：北、南、西三面
  s.box(W + c(30) - c(3), y0, 0, c(66), c(17), c(34), plain ? '#cdbd9a' : '#d9cba9')
  // 殿身
  s.box(W + c(30), y0, 0, c(60), c(30), c(20), '#e8dcc0')
  // 前廊（長 20 肘＝殿寬，深 10 肘）
  s.box(W + c(65), y0, 0, c(10), c(30), c(20) + 1, '#efe4ca')
  // 屋頂：香柏木
  get('roof').box(W + c(35), y0 + c(30), 0, c(70), 0.6, c(20) + 1.2, '#6b4a30')
  // 院子：內院用鑿好的石頭三層、香柏木一層（王上 6:36）
  rectWall(s, W - c(30), -c(55), W + c(140), c(55), y0 - 0.5, 3.2, 1.6, '#d2c29f', plain ? 0 : 8)
  // 祭壇（代下 4:1：長寬 20 肘、高 10 肘）
  ;(plain ? s : get('bronze')).box(W + c(95), y0, 0, c(20), c(10), c(20), '#b8a07a')
  if (!plain) {
    const b = get('bronze')
    // 雅斤、波阿斯：高 18 肘、圍 12 肘，柱頂 5 肘（王上 7:15–21）
    for (const z of [-c(6), c(6)]) {
      b.cyl(W + c(72), y0, z, c(12) / (2 * Math.PI), c(18), '#b88a52', 12)
      b.cyl(W + c(72), y0 + c(18), z, c(2.4), c(5), '#c49a5e', 12, c(1.6))
    }
    // 銅海：徑 10 肘、高 5 肘，在殿的東南（王上 7:23–26、39）
    b.cyl(W + c(80), y0 + c(3), c(22), c(5), c(5), '#b07a45', 16, c(5.6))
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) b.box(W + c(80) + dx * c(2.5), y0, c(22) + dz * c(2.5), 1.2, c(3), 1.2, '#8f6a40')
    // 十個銅盆座（王上 7:27–39）
    for (let i = 0; i < 5; i++) for (const z of [-c(30), c(30)]) b.box(W + c(40) + i * c(9), y0, z, c(4), c(3), c(4), '#a4774a')
  }
  return p
}

/** 希律聖殿（米示拿、約瑟夫）：殿正面 100×100 肘，後段寬 70 肘；祭司院、以色列院、婦女院、矮欄 */
function herodTemple(): Parts {
  const { p, get } = parts()
  const s = get('stone')
  const gold = get('gold')
  const y0 = MOUNT_TOP
  const yc = y0 + 3 // 內院比外院高
  // 內院的台基
  s.box(c(45), y0, 0, c(330), 3, c(150), '#e3d7bd')
  // 矮欄（索雷格）
  rectWall(s, -c(130), -c(110), c(235), c(110), y0, 1.4, 0.4, '#f0e8d8')
  // 祭司院＋以色列院（187 × 135 肘）
  rectWall(s, -c(30), -c(67), c(157), c(67), yc, c(30), 3, '#e9dfc8', 12)
  // 婦女院（135 × 135 肘）
  rectWall(s, c(157), -c(67), c(292), c(67), yc - 1, c(25), 3, '#e6dbc2', 10)
  for (const [x, z] of [[c(157), -c(67)], [c(157), c(67)], [c(292), -c(67)], [c(292), c(67)]]) s.box(x, yc - 1, z, 8, c(30), 8, '#e2d6bc')
  // 尼迦挪門
  s.box(c(157), yc, 0, 7, c(40), 16, '#efe4cc')
  gold.box(c(157) + 3.6, yc + 2, 0, 0.3, c(20), 6, '#e8b850')
  // 殿：後段（長 c(70)、寬 70 肘、高 100 肘）
  const X0 = -c(10)
  s.box(X0 + c(35), yc, 0, c(70), c(90), c(70), '#f4ecdc')
  // 前段（正面 100 × 100 肘，深 11 肘）
  s.box(X0 + c(75), yc, 0, c(11), c(100), c(100), '#f7f0e2')
  // 正面的金：大門與上方的金葡萄樹（約瑟夫）
  gold.box(X0 + c(80.6), yc + 1, 0, 0.4, c(40), c(20), '#efc35a')
  gold.box(X0 + c(80.6), yc + c(70), 0, 0.4, c(10), c(60), '#efc35a')
  // 屋頂上的金色尖刺（防鳥）
  for (const [x, z] of along(rect(X0 + 1, -c(34), X0 + c(69), c(34)), 6, true)) gold.cyl(x, yc + c(90), z, 0.25, 2.2, '#f0c560', 4, 0.02)
  for (let z = -c(48); z <= c(48); z += 6) gold.cyl(X0 + c(75), yc + c(100), z, 0.25, 2.2, '#f0c560', 4, 0.02)
  // 燔祭壇（米示拿：底 32 肘見方、高 10 肘）＋坡道
  s.box(c(110), yc, 0, c(32), c(10), c(32), '#cfc3aa')
  s.box(c(110), yc, c(28), c(16), c(5), c(30), '#d8cbb0')
  return p
}

/** 所羅巴伯聖殿：基本比例與所羅門殿相同，較樸素（拉 6:3 的尺寸各譯本不同） */
const zerubbabelTemple = () => solomonTemple(true)

/* ---------------- 平台 ---------------- */
function platform(poly: P[], top: number, color: string): Parts {
  const { p, get } = parts()
  get('stone').prism(poly, minGround(poly) - 4, top, color)
  return p
}

/** 希律平台：擋土牆＋四周柱廊＋南邊的皇家柱廊 */
function herodMount(): Parts {
  const { p, get } = parts()
  const s = get('stone')
  s.prism(MOUNT, minGround(MOUNT) - 4, MOUNT_TOP, '#d9c9a6')
  // 牆頂的女兒牆
  s.wall(MOUNT, { h: 0, t: 1.2, color: '#e1d3b3', closed: true })
  return p
}

function herodPorticoes(): Parts {
  const { p, get } = parts()
  const s = get('stone')
  const r = get('roof')
  const [nw, ne, se, sw] = MOUNT
  const y = MOUNT_TOP
  // 所羅門廊（東）、北廊、西廊：雙排柱，深約 15 m
  stoa(s, r, ne, se, y, 15, 12, -1)
  stoa(s, r, nw, ne, y, 15, 12, -1)
  stoa(s, r, sw, nw, y, 15, 12, -1)
  // 皇家柱廊（南）：巴西利卡式，四排柱，中殿特別高（約瑟夫《猶太古史》15.11.5）
  const len = Math.hypot(se[0] - sw[0], se[1] - sw[1])
  const rot = -Math.atan2(se[1] - sw[1], se[0] - sw[0])
  const cx = (sw[0] + se[0]) / 2
  const cz = (sw[1] + se[1]) / 2 - 17
  s.box(cx, y, cz + 15, len, 16, 2, '#e7dcc4', rot)
  s.box(cx, y, cz, len - 6, 15, 30, '#e3d6ba', rot)
  s.box(cx, y + 15, cz, len - 6, 10, 13, '#ece1c8', rot)
  r.gable(cx, y + 25, cz, len - 6, 4, 14, '#8f6b4c', rot)
  r.box(cx, y + 15, cz + 8.5, len - 6, 0.8, 13, '#8a6d52', rot)
  r.box(cx, y + 15, cz - 8.5, len - 6, 0.8, 13, '#8a6d52', rot)
  for (const [x, z] of along([quadPoint(MOUNT, 0.03, 0.9), quadPoint(MOUNT, 0.97, 0.9)], 6)) s.cyl(x, y, z - 1, 0.7, 15, '#f0e7d4', 6, 0.6, y, false)
  // 南邊的戶勒大台階
  s.box(-20, groundY(-20, 245) - 2, 240, 64, MOUNT_TOP - groundY(-20, 245) - 6, 30, '#d5c6a6')
  // 羅賓遜拱門的台階（西南角往下到泰羅邊谷）
  s.box(-128, groundY(-128, 190) - 2, 192, 15, MOUNT_TOP - groundY(-128, 190) - 1, 18, '#d9caa8')
  return p
}

/** 安東尼亞堡：聖殿山西北角，四角有塔，東南塔最高（約瑟夫） */
function antonia(): Parts {
  const { p, get } = parts()
  const s = get('stone')
  const x0 = -165
  const x1 = -55
  const z0 = -330
  const z1 = -262
  const g = minGround(rect(x0, z0, x1, z1))
  s.box((x0 + x1) / 2, g - 3, (z0 + z1) / 2, x1 - x0, MOUNT_TOP - g + 18, z1 - z0, '#d3c3a0')
  for (const [x, z, h] of [[x0, z0, 22], [x1, z0, 22], [x0, z1, 22], [x1, z1, 32]] as const) s.box(x, MOUNT_TOP + 15, z, 13, h, 13, '#dccdab')
  return p
}

/* ---------------- 王宮 ---------------- */
function terraceBox(g: GB, x: number, z: number, w: number, h: number, d: number, color: string, rot = 0) {
  const gr = minGround(rect(x - w / 2, z - d / 2, x + w / 2, z + d / 2))
  const top = groundY(x, z) + 1
  g.box(x, gr - 3, z, w, top - gr + 3, d, '#cbb995', rot, gr - 3)
  g.box(x, top, z, w * 0.92, h, d * 0.92, color, rot, gr - 3)
  return top + h
}

function davidCity(): Parts {
  const { p, get } = parts()
  const s = get('stone')
  // 大衛的王宮（推礎用推羅的香柏木與石匠，撒下 5:11）
  const [x, z] = L.davidPalace
  const top = terraceBox(s, x, z, 36, 9, 24, '#d9c6a0')
  get('roof').box(x, top, z, 33, 0.6, 22, '#6b4a30')
  // 階梯式石造結構（東坡）
  for (let i = 0; i < 7; i++) {
    const xx = x + 18 + i * 6
    const g = groundY(xx, z)
    s.box(xx, g - 4, z + 2, 7, 6 - i * 0.3 + 4, 30 - i * 2, '#c9b893')
  }
  return p
}

function solomonPalace(): Parts {
  const { p, get } = parts()
  const s = get('stone')
  const r = get('roof')
  // 黎巴嫩林宮：長 100、寬 50、高 30 肘（王上 7:2）
  let t = terraceBox(s, 30, 130, c(100), c(30), c(50), '#dccaa6')
  r.box(30, t, 130, c(100), 0.6, c(50), '#5e4129')
  // 柱廊：長 50、寬 30 肘（7:6）
  t = terraceBox(s, 40, 175, c(50), c(15), c(30), '#e2d2b0')
  r.box(40, t, 175, c(50), 0.6, c(30), '#5e4129')
  // 審判廊（7:7）
  t = terraceBox(s, -10, 160, c(30), c(20), c(30), '#ddcca8')
  r.box(-10, t, 160, c(30), 0.6, c(30), '#5e4129')
  // 王的宮室與法老女兒的宮（7:8）
  t = terraceBox(s, -20, 210, c(60), c(18), c(40), '#d8c6a1')
  r.box(-20, t, 210, c(60), 0.6, c(40), '#5e4129')
  t = terraceBox(s, 55, 220, c(40), c(16), c(35), '#d8c6a1')
  r.box(55, t, 220, c(40), 0.6, c(35), '#5e4129')
  return p
}

/** 希律王宮與三座塔（希皮庫斯、法撒勒、瑪利安） */
function herodPalace(): Parts {
  const { p, get } = parts()
  const s = get('stone')
  const r = get('roof')
  const [x, z] = L.herodPalace
  for (const dz of [-60, 70]) {
    const top = terraceBox(s, x, z + dz, 90, 12, 70, '#e4d7bb')
    r.box(x, top, z + dz, 84, 0.6, 64, '#8d6c4f')
  }
  // 中間的園子
  get('foliage').box(x, groundY(x, z) + 0.5, z + 5, 70, 1.5, 40, '#5f6e3a')
  const towers: [number, number, number, number][] = [
    [-745, 175, 40, 12],
    [-712, 170, 45, 17],
    [-682, 178, 30, 11],
  ]
  for (const [tx, tz, h, w] of towers) {
    const g = groundY(tx, tz)
    s.box(tx, g - 3, tz, w, h + 3, w, '#e8dcc2')
    s.box(tx, g + h, tz, w + 1.5, 1.2, w + 1.5, '#efe4cc')
  }
  return p
}

/* ---------------- 城牆 ---------------- */
function walls(path: P[], o: Parameters<GB['wall']>[1]): () => Parts {
  return () => {
    const { p, get } = parts()
    get('stone').wall(path, o)
    return p
  }
}

/** 鄂圖曼城牆：城垛、方塔、城門 */
function ottomanWalls(color: string, gates: boolean): () => Parts {
  return () => {
    const { p, get } = parts()
    const s = get('stone')
    s.wall(WALL_OTTOMAN, { h: 12, t: 3, color, closed: false, towerEvery: 110, towerSize: 10, towerExtra: 3, crenel: 2.4 })
    if (gates)
      for (const at of [L.jaffaGate, L.damascusGate, L.lionsGate, L.zionGate, L.dungGate, [-180, -448] as P, [-750, -205] as P]) {
        const g = groundY(at[0], at[1])
        s.box(at[0], g - 2, at[1], 18, 18, 18, '#e2d4b4')
        s.box(at[0], g + 16, at[1], 19, 1.5, 19, '#eadcbc')
      }
    return p
  }
}

/** 大衛塔（城堡）：中世紀起，鄂圖曼時期加上宣禮塔 */
function citadel(minaret: boolean): () => Parts {
  return () => {
    const { p, get } = parts()
    const s = get('stone')
    const [x, z] = L.citadel
    const g = groundY(x, z)
    s.box(x, g - 3, z, 90, 18, 60, '#d9cba9')
    s.box(x - 30, g - 3, z - 10, 20, 30, 20, '#e0d2b0')
    s.box(x + 35, g - 3, z + 20, 16, 26, 16, '#e0d2b0')
    if (minaret) {
      s.cyl(x - 40, g + 14, z + 25, 2.4, 26, '#e8dcc2', 8)
      s.cyl(x - 40, g + 40, z + 25, 1.4, 4, '#e8dcc2', 8, 0.05)
    }
    return p
  }
}

/* ---------------- 教堂與清真寺 ---------------- */
function sepulchreConstantine(): Parts {
  const { p, get } = parts()
  const s = get('stone')
  const r = get('roof')
  const [x, z] = L.sepulchre
  const g = groundY(x, z)
  // 復活堂（圓頂）
  s.cyl(x - 45, g - 2, z, 17, 18, '#e6d9bd', 16)
  s.dome(x - 45, g + 16, z, 17, '#9b8e7d', 16, 5, 0.9)
  // 大殿（馬丁殿）
  s.box(x + 10, g - 2, z, 58, 16, 40, '#e3d5b7')
  r.gable(x + 10, g + 14, z, 58, 7, 40, '#9a4e35')
  // 中庭與門廳
  rectWall(s, x + 40, z - 20, x + 75, z + 20, g - 1, 5, 1.2, '#ddd0b2')
  return p
}

function sepulchreCrusader(): Parts {
  const { p, get } = parts()
  const s = get('stone')
  const lead = get('lead')
  const [x, z] = L.sepulchre
  const g = groundY(x, z)
  s.cyl(x - 40, g - 2, z, 18, 20, '#ddd0b4', 16)
  lead.dome(x - 40, g + 18, z, 18, '#9a9fa3', 16, 5, 0.8)
  s.box(x, g - 2, z, 50, 20, 36, '#dccfb2')
  s.cyl(x + 5, g + 18, z, 7, 5, '#ddd0b4', 12)
  lead.dome(x + 5, g + 23, z, 7, '#a2a7aa', 12, 4)
  // 鐘樓
  s.box(x - 15, g - 2, z + 22, 9, 30, 9, '#e1d4b8')
  return p
}

function churchBasic(at: P, len: number, wide: number, roofColor = '#9a4e35'): () => Parts {
  return () => {
    const { p, get } = parts()
    const g = groundY(at[0], at[1])
    get('stone').box(at[0], g - 2, at[1], len, 14, wide, '#e2d4b6')
    get('roof').gable(at[0], g + 12, at[1], len, 6, wide, roofColor)
    get('stone').cyl(at[0] - len / 2, g - 2, at[1], wide / 2, 12, '#e2d4b6', 12)
    return p
  }
}

/** 圓頂清真寺：八角形（每邊約 20.6 m）、鼓座、圓頂；建在平台中央的高台上 */
function domeOfRock(): Parts {
  const { p, get } = parts()
  const s = get('stone')
  const y = MOUNT_TOP
  // 上層平台與台階
  s.prism(rect(-85, -90, 85, 80), y - 1, y + 3, '#e5dac4')
  const y1 = y + 3
  get('tile').ngon(0, y1, 0, 26.9, 12, 8, '#ffffff', Math.PI / 8)
  s.ngon(0, y1 + 12, 0, 26.9, 1.2, 8, '#efe7d6', Math.PI / 8)
  get('tile').cyl(0, y1 + 12, 0, 11.5, 9, '#ffffff', 24)
  get('gold').dome(0, y1 + 21, 0, 11.8, '#e8b850', 24, 8, 1.25)
  get('gold').cyl(0, y1 + 35.5, 0, 0.3, 4, '#e8b850', 6, 0.05)
  // 鍊子圓頂
  s.ngon(18 + 26, y1, -6, 7, 6, 11, '#d8d2c4')
  get('lead').dome(44, y1 + 6, -6, 5, '#9fa5a8', 12, 4)
  return p
}

function aqsa(): Parts {
  const { p, get } = parts()
  const s = get('stone')
  const [x, z] = L.aqsa
  const y = MOUNT_TOP
  s.box(x, y, z, 55, 13, 80, '#ded1b5')
  for (const dx of [-18, 0, 18]) get('lead').gable(x + dx, y + 13, z, 80, 4.5, 18, '#8c9194', Math.PI / 2)
  s.cyl(x, y + 13, z + 28, 8, 5, '#ded1b5', 16)
  get('lead').dome(x, y + 18, z + 28, 8.5, '#a0a6aa', 16, 5, 1.1)
  return p
}

/* ---------------- 羅馬：埃利亞加比多連 ---------------- */
function aelia(): Parts {
  const { p, get } = parts()
  const s = get('stone')
  const r = get('roof')
  // 南北大道（卡多）：大馬士革門往南，兩側柱廊
  const cardo: P[] = [
    [-493, -410],
    [-470, -150],
    [-455, 120],
  ]
  for (const side of [-1, 1]) {
    const path = cardo.map(([x, z]) => [x + side * 11, z] as P)
    for (const [x, z] of along(path, 6)) s.cyl(x, groundY(x, z), z, 0.5, 7, '#ece3cf', 6, 0.45, groundY(x, z), false)
    for (let i = 0; i < path.length - 1; i++) {
      const a = path[i]
      const b = path[i + 1]
      for (const [x, z, rot] of along([a, b], 10)) r.box(x + side * 4, groundY(x, z) + 7, z + 5, 7, 0.6, 10.5, '#9a5a3c', rot + Math.PI / 2)
    }
  }
  // 大馬士革門的凱旋門（三個拱門）
  const [gx, gz] = L.damascusGate
  const gg = groundY(gx, gz)
  s.box(gx, gg - 2, gz + 10, 30, 16, 8, '#e4d8bf')
  // 哈德良的神廟（在今日聖墓教堂的位置）
  const [tx, tz] = L.sepulchre
  const tg = groundY(tx, tz)
  s.box(tx, tg - 2, tz, 70, 6, 50, '#ddd0b3')
  s.box(tx - 5, tg + 4, tz, 30, 12, 18, '#ece2cc')
  r.gable(tx - 5, tg + 16, tz, 34, 4, 20, '#9a5a3c')
  for (const dz of [-8, -3, 3, 8]) s.cyl(tx + 12, tg + 4, tz + dz, 0.8, 12, '#f0e8d6', 8)
  // 廣場
  s.prism(rect(-640, 60, -560, 140), groundY(-600, 100) - 1, groundY(-600, 100) + 0.6, '#d8ccb2')
  return p
}

/** 第十軍團營地（主後 70 年後，西山西北） */
function legionCamp(): Parts {
  const { p, get } = parts()
  const s = get('plaster')
  const x0 = -790
  const z0 = 210
  const x1 = -640
  const z1 = 420
  get('stone').wall(rect(x0, z0, x1, z1), { h: 4, t: 1.5, color: '#bca984', closed: true })
  const rnd = mulberry(70)
  for (let x = x0 + 12; x < x1 - 8; x += 9)
    for (let z = z0 + 12; z < z1 - 8; z += 7) if (rnd() > 0.2) s.box(x, groundY(x, z), z, 5, 2.2, 3.5, '#cbb89a')
  return p
}

/* ---------------- 廢墟 ---------------- */
function rubble(seed: number, areas: P[][], count: number, burnt: boolean): () => Parts {
  return () => {
    const { p, get } = parts()
    const s = get('stone')
    const rnd = mulberry(seed)
    let n = 0
    let tries = 0
    while (n < count && tries < count * 30) {
      tries++
      const a = areas[Math.floor(rnd() * areas.length)]
      const xs = a.map((q) => q[0])
      const zs = a.map((q) => q[1])
      const x = Math.min(...xs) + rnd() * (Math.max(...xs) - Math.min(...xs))
      const z = Math.min(...zs) + rnd() * (Math.max(...zs) - Math.min(...zs))
      if (!inPoly(x, z, a)) continue
      const onMount = inPoly(x, z, MOUNT)
      const g = onMount ? MOUNT_TOP : groundY(x, z)
      const k = burnt ? 0.55 + rnd() * 0.25 : 0.85 + rnd() * 0.1
      const col = new THREE.Color('#cbb894').multiplyScalar(k)
      s.box(x, g - 0.5, z, 2 + rnd() * 7, 0.8 + rnd() * 2.8, 2 + rnd() * 6, col, rnd() * 3)
      n++
    }
    return p
  }
}

/** 沿城牆的殘牆（被拆毀的城牆） */
function brokenWall(path: P[]): () => Parts {
  return () => {
    const { p, get } = parts()
    get('stone').wall(path, { h: 1.5, t: 3, color: '#b9a582', jitter: 3 })
    return p
  }
}

/* ---------------- 民房 ---------------- */
type Style = 'iron' | 'persian' | 'hellen' | 'roman' | 'ottoman' | 'modern' | 'village'
const STYLE: Record<Style, { step: number; w: [number, number]; h: [number, number]; cols: string[]; dome: number; gable: number; keep: number; slope: number }> = {
  iron: { step: 11, w: [5, 9], h: [3, 5], cols: ['#c9b08a', '#bba07a', '#d3bd98', '#b39773'], dome: 0, gable: 0, keep: 0.85, slope: 0.6 },
  persian: { step: 13, w: [5, 8], h: [3, 4.5], cols: ['#c9b08a', '#bba07a', '#cdb791'], dome: 0, gable: 0, keep: 0.45, slope: 0.6 },
  hellen: { step: 13, w: [7, 13], h: [4, 8], cols: ['#e0d2b4', '#d6c6a4', '#e8dcc3', '#cdbb98'], dome: 0, gable: 0, keep: 0.85, slope: 0.5 },
  roman: { step: 14, w: [7, 13], h: [5, 9], cols: ['#e0d2b4', '#d9c8a6', '#e6dac0'], dome: 0, gable: 0.35, keep: 0.75, slope: 0.5 },
  ottoman: { step: 12, w: [7, 12], h: [5, 10], cols: ['#e3d7bd', '#dacbab', '#ece3cf', '#d2c19f'], dome: 0.45, gable: 0, keep: 0.9, slope: 0.5 },
  village: { step: 15, w: [7, 12], h: [4, 9], cols: ['#e6dcc6', '#d9cbaf', '#efe7d7'], dome: 0.1, gable: 0, keep: 0.7, slope: 0.6 },
  modern: { step: 30, w: [14, 26], h: [8, 22], cols: ['#e8dfcb', '#ddd1b8', '#efe8da', '#d6c9ac'], dome: 0, gable: 0.05, keep: 0.8, slope: 0.45 },
}

function houses(zone: P[], style: Style, seed: number, exclude: P[][] = []): () => Parts {
  return () => {
    const { p, get } = parts()
    const st = STYLE[style]
    const s = get(style === 'modern' || style === 'hellen' || style === 'roman' ? 'stone' : 'plaster')
    const rnd = mulberry(seed)
    const xs = zone.map((q) => q[0])
    const zs = zone.map((q) => q[1])
    const cols = st.cols.map((x) => new THREE.Color(x))
    const gridRot = style === 'modern' ? (seed % 7) * 0.2 : 0
    for (let x = Math.min(...xs); x < Math.max(...xs); x += st.step)
      for (let z = Math.min(...zs); z < Math.max(...zs); z += st.step) {
        if (rnd() > st.keep) continue
        const px = x + (rnd() - 0.5) * st.step * 0.5
        const pz = z + (rnd() - 0.5) * st.step * 0.5
        if (!inPoly(px, pz, zone)) continue
        if (inPoly(px, pz, MOUNT) || NO_HOUSE.some((q) => inPoly(px, pz, q)) || exclude.some((q) => inPoly(px, pz, q))) continue
        const sl = slopeAt(px, pz)
        if (sl > st.slope) continue
        const w = st.w[0] + rnd() * (st.w[1] - st.w[0])
        const d = st.w[0] + rnd() * (st.w[1] - st.w[0])
        const h = st.h[0] + rnd() * (st.h[1] - st.h[0])
        // 房子順著等高線排（梯田上的房子）
        const gx = slopeAt(px + 3, pz) - slopeAt(px - 3, pz)
        const rot = style === 'modern' ? gridRot + (rnd() - 0.5) * 0.15 : Math.atan2(groundY(px, pz + 4) - groundY(px, pz - 4), groundY(px + 4, pz) - groundY(px - 4, pz)) + gx * 0 + (rnd() - 0.5) * 0.3
        const g = Math.min(groundY(px - w / 2, pz - d / 2), groundY(px + w / 2, pz + d / 2), groundY(px + w / 2, pz - d / 2), groundY(px - w / 2, pz + d / 2))
        const top = groundY(px, pz) + h
        const col = cols[Math.floor(rnd() * cols.length)].clone().multiplyScalar(0.92 + rnd() * 0.12)
        s.box(px, g - 1.5, pz, w, top - g + 1.5, d, col, rot, g - 1.5)
        const roll = rnd()
        if (roll < st.dome) s.dome(px, top, pz, Math.min(w, d) * 0.3, '#f1ebde', 8, 3, 0.8, g - 1.5)
        else if (roll < st.dome + st.gable) get('roof').gable(px, top, pz, w, 2.4, d, '#a3563a', rot, g - 1.5)
        else if (style === 'modern' && rnd() < 0.3) s.box(px, top, pz, w * 0.5, 2.5, d * 0.5, col, rot, g - 1.5)
      }
    return p
  }
}

/* ---------------- 其他 ---------------- */
/** 西羅亞池 */
function siloam(): Parts {
  const { p, get } = parts()
  const [x, z] = L.siloam
  const g = groundY(x, z)
  get('stone').wall(rect(x - 28, z - 18, x + 28, z + 18), { h: 1.2, t: 2, color: '#d6c6a3', closed: true })
  get('water').box(x, g - 1, z, 54, 1.4, 34, '#3d6b73')
  return p
}

/** 橄欖山上的猶太墓地（白色墓石；只呈現外觀） */
function cemetery(): Parts {
  const { p, get } = parts()
  const s = get('plaster')
  const rnd = mulberry(5)
  const col = new THREE.Color('#ece6da')
  for (let i = 0; i < 4200; i++) {
    const x = 330 + rnd() * 330
    const z = -230 + rnd() * 420
    if (slopeAt(x, z) > 0.45 || inPoly(x, z, Z.silwan)) continue
    const rot = Math.atan2(groundY(x, z + 3) - groundY(x, z - 3), groundY(x + 3, z) - groundY(x - 3, z))
    s.box(x, groundY(x, z) - 0.3, z, 1.1, 0.9, 2.1, col, rot)
  }
  return p
}

function tower(at: P, h: number, w: number, color = '#e4d7bb', topDome = false): () => Parts {
  return () => {
    const { p, get } = parts()
    const g = groundY(at[0], at[1])
    get('stone').box(at[0], g - 2, at[1], w, h, w, color)
    if (topDome) get('lead').dome(at[0], g + h - 2, at[1], w * 0.45, '#9da3a6', 10, 4, 1.4)
    return p
  }
}

function plaza(): Parts {
  const { p, get } = parts()
  const g = groundY(-165, 0)
  get('stone').prism(rect(-205, -55, -132, 55), g - 1, g + 0.8, '#e6dccb')
  return p
}

/* ---------------- 清單 ---------------- */
const SQ_TOP = 39
export const STRUCTURES: Structure[] = [
  // 城牆
  { id: 'wall-david', spans: [[-1000, -960]], end: 'sink', build: walls(WALL_DAVID, { h: 7, t: 3.5, color: '#c4b08b', closed: true, towerEvery: 70, towerSize: 8 }) },
  { id: 'wall-solomon', spans: [[-960, -586]], end: 'burn', build: walls(WALL_SOLOMON, { h: 8, t: 4, color: '#c9b591', closed: true, towerEvery: 80, towerSize: 9 }), smoke: [[60, 600], [-110, 250]] },
  { id: 'wall-west', spans: [[-720, -586]], end: 'burn', build: walls(WALL_WEST, { h: 8, t: 7, color: '#c7b28d', towerEvery: 90, towerSize: 11 }), smoke: [[-500, 300], [-700, 100]] },
  { id: 'wall-ruins-586', spans: [[-586, -444]], end: 'sink', delay: 2.8, build: brokenWall(WALL_SOLOMON) },
  { id: 'wall-nehemiah', spans: [[-444, -150]], end: 'sink', build: walls(WALL_NEHEMIAH, { h: 8, t: 3, color: '#cdb995', closed: true, towerEvery: 85, towerSize: 8 }) },
  { id: 'wall-first', spans: [[-150, 70]], end: 'burn', build: walls(WALL_FIRST, { h: 10, t: 4, color: '#d6c5a2', towerEvery: 75, towerSize: 11, towerExtra: 6 }) },
  { id: 'wall-second', spans: [[-40, 70]], end: 'burn', build: walls(WALL_SECOND, { h: 10, t: 4, color: '#d3c29f', towerEvery: 70, towerSize: 10, towerExtra: 5 }) },
  { id: 'wall-third', spans: [[42, 70]], end: 'burn', build: walls(WALL_THIRD, { h: 10, t: 5, color: '#dccbab', towerEvery: 60, towerSize: 11, towerExtra: 6 }) },
  { id: 'wall-ruins-70', spans: [[70, 135]], end: 'sink', delay: 2.8, build: brokenWall(WALL_FIRST) },
  { id: 'wall-byz', spans: [[440, 1033]], end: 'sink', build: walls(WALL_BYZANTINE, { h: 9, t: 3, color: '#d8c8a8', towerEvery: 80, towerSize: 9 }) },
  { id: 'wall-medieval', spans: [[1033, 1219]], end: 'sink', build: ottomanWalls('#cdbb98', false) },
  { id: 'wall-ottoman', spans: [[1538, 9999]], end: 'sink', build: ottomanWalls('#e0d1ae', true) },
  // 聖殿山
  { id: 'square', spans: [[-150, -20]], end: 'sink', build: () => platform(SQUARE, SQ_TOP, '#d2c19c') },
  { id: 'mount', spans: [[-20, 9999]], end: 'sink', build: herodMount },
  { id: 'temple-solomon', spans: [[-960, -586]], end: 'burn', smoke: [[0, 0]], build: () => solomonTemple(false) },
  { id: 'temple-zerubbabel', spans: [[-516, -20]], end: 'sink', build: zerubbabelTemple },
  { id: 'baris', spans: [[-150, -35]], end: 'sink', build: tower([-110, -195], 18 + SQ_TOP - groundY(-110, -195), 22) },
  { id: 'temple-herod', spans: [[-20, 70]], end: 'burn', smoke: [[20, 0], [80, 0]], build: herodTemple },
  { id: 'porticoes', spans: [[-20, 70]], end: 'burn', smoke: [[0, 190], [160, 0]], build: herodPorticoes },
  { id: 'antonia', spans: [[-35, 70]], end: 'burn', smoke: [[-110, -295]], build: antonia },
  { id: 'temple-ruins-586', spans: [[-586, -516]], end: 'sink', delay: 2.8, build: rubble(586, [rect(-60, -40, 60, 40), WALL_DAVID], 400, true) },
  { id: 'temple-ruins-70', spans: [[70, 135]], end: 'sink', delay: 2.8, build: rubble(70, [rect(-80, -50, 150, 50), rect(-120, 150, 160, 215), WALL_FIRST], 900, true) },
  { id: 'dome', spans: [[691, 9999]], end: 'sink', build: domeOfRock },
  { id: 'aqsa', spans: [[705, 9999]], end: 'sink', build: aqsa },
  // 王宮
  { id: 'david-palace', spans: [[-1000, -586]], end: 'burn', smoke: [[40, 360]], build: davidCity },
  { id: 'solomon-palace', spans: [[-960, -586]], end: 'burn', smoke: [[20, 160]], build: solomonPalace },
  { id: 'herod-palace', spans: [[-23, 70]], end: 'burn', smoke: [[-705, 300]], build: herodPalace },
  { id: 'legion', spans: [[70, 300]], end: 'sink', delay: 2.5, build: legionCamp },
  { id: 'phasael', spans: [[70, 1099]], end: 'sink', build: tower([-712, 170], 30, 17, '#d8cbad') },
  { id: 'citadel', spans: [[1099, 1655]], end: 'sink', build: citadel(false) },
  { id: 'citadel-ott', spans: [[1655, 9999]], end: 'sink', build: citadel(true) },
  { id: 'siloam', spans: [[-701, 70], [400, 9999]], end: 'sink', build: siloam },
  // 羅馬至今
  { id: 'aelia', spans: [[135, 335]], end: 'sink', build: aelia },
  { id: 'sepulchre-byz', spans: [[335, 1009]], end: 'sink', build: sepulchreConstantine },
  { id: 'sepulchre', spans: [[1048, 9999]], end: 'sink', build: sepulchreCrusader },
  { id: 'hagia-sion', spans: [[390, 1219]], end: 'sink', build: churchBasic(L.zion, 60, 32) },
  { id: 'nea', spans: [[543, 800]], end: 'sink', build: churchBasic(L.nea, 70, 40) },
  { id: 'eleona', spans: [[330, 614]], end: 'sink', build: churchBasic([760, -40], 40, 20) },
  { id: 'redeemer', spans: [[1898, 9999]], end: 'sink', build: tower([-500, -40], 48, 9, '#e7dcc6') },
  { id: 'hurva', spans: [[1864, 1948], [2010, 9999]], end: 'sink', build: tower([-330, 180], 24, 22, '#ece4d4', true) },
  { id: 'russian', spans: [[1886, 9999]], end: 'sink', build: tower([860, -20], 64, 8, '#f0ebe2') },
  { id: 'augusta', spans: [[1910, 9999]], end: 'sink', build: tower([816, -888], 50, 10, '#ddd2bc') },
  { id: 'all-nations', spans: [[1924, 9999]], end: 'sink', build: churchBasic(L.gethsemane, 30, 26, '#8f9497') },
  { id: 'plaza', spans: [[1967, 9999]], end: 'sink', build: plaza },
  { id: 'cemetery', spans: [[1300, 9999]], end: 'sink', build: cemetery },
  // 民房
  { id: 'h-david-iron', spans: [[-1000, -586]], end: 'burn', build: houses(Z.david, 'iron', 11, [rect(0, 330, 120, 395)]) },
  { id: 'h-ophel-iron', spans: [[-700, -586]], end: 'burn', build: houses(Z.ophel, 'iron', 12, [rect(-60, 100, 110, 260)]) },
  { id: 'h-westN-iron', spans: [[-720, -586]], end: 'burn', build: houses(Z.westN, 'iron', 13) },
  { id: 'h-westS-iron', spans: [[-720, -586]], end: 'burn', build: houses(Z.westS, 'iron', 14) },
  { id: 'h-david-persian', spans: [[-530, -150]], end: 'sink', build: houses(Z.david, 'persian', 21) },
  { id: 'h-ophel-persian', spans: [[-444, -150]], end: 'sink', build: houses(Z.ophel, 'persian', 22) },
  { id: 'h-david-hellen', spans: [[-150, 70]], end: 'burn', build: houses(Z.david, 'hellen', 31) },
  { id: 'h-ophel-hellen', spans: [[-150, 70]], end: 'burn', build: houses(Z.ophel, 'hellen', 32) },
  { id: 'h-westN-hellen', spans: [[-150, 70]], end: 'burn', smoke: [[-400, 150]], build: houses(Z.westN, 'hellen', 33) },
  { id: 'h-westS-hellen', spans: [[-150, 70]], end: 'burn', build: houses(Z.westS, 'hellen', 34) },
  { id: 'h-north2-hellen', spans: [[-30, 70]], end: 'burn', build: houses(Z.north2, 'hellen', 35) },
  { id: 'h-bez-hellen', spans: [[-20, 70]], end: 'burn', build: houses(Z.bezetha, 'hellen', 36, [rect(-170, -340, -50, -255)]) },
  { id: 'h-northRest-hellen', spans: [[41, 70]], end: 'burn', build: houses(Z.northRest, 'hellen', 37) },
  { id: 'h-north3-hellen', spans: [[41, 70]], end: 'burn', build: houses(Z.north3, 'persian', 38) },
  { id: 'h-westN-roman', spans: [[135, 640]], end: 'sink', build: houses(Z.westN, 'roman', 41) },
  { id: 'h-north2-roman', spans: [[135, 640]], end: 'sink', build: houses(Z.north2, 'roman', 42, [rect(-520, -180, -420, 160)]) },
  { id: 'h-northRest-roman', spans: [[135, 640]], end: 'sink', build: houses(Z.northRest, 'roman', 43, [rect(-520, -430, -420, 160)]) },
  { id: 'h-bez-roman', spans: [[135, 640]], end: 'sink', build: houses(Z.bezetha, 'roman', 44) },
  { id: 'h-david-byz', spans: [[440, 1033]], end: 'sink', build: houses(Z.david, 'roman', 45) },
  { id: 'h-westS-byz', spans: [[440, 1033]], end: 'sink', build: houses(Z.westS, 'roman', 46, [rect(-610, 520, -510, 600)]) },
  { id: 'h-westN-ott', spans: [[640, 9999]], end: 'sink', build: houses(Z.westN, 'ottoman', 51, [rect(-350, 160, -310, 200)]) },
  { id: 'h-north2-ott', spans: [[640, 9999]], end: 'sink', build: houses(Z.north2, 'ottoman', 52, [rect(-520, -60, -480, -20)]) },
  { id: 'h-northRest-ott', spans: [[640, 9999]], end: 'sink', build: houses(Z.northRest, 'ottoman', 53) },
  { id: 'h-bez-ott', spans: [[640, 9999]], end: 'sink', build: houses(Z.bezetha, 'ottoman', 54) },
  { id: 'h-silwan', spans: [[1880, 9999]], end: 'sink', build: houses(Z.silwan, 'village', 61) },
  { id: 'h-ettur', spans: [[1880, 9999]], end: 'sink', build: houses(Z.etTur, 'village', 62, [rect(830, -60, 890, 20)]) },
  { id: 'h-westS-mod', spans: [[1900, 9999]], end: 'sink', build: houses(Z.westS, 'village', 63, [rect(-610, 520, -510, 600), rect(-800, 440, -560, 470)]) },
  { id: 'h-modernW', spans: [[1880, 9999]], end: 'sink', build: houses(Z.modernW, 'modern', 64) },
  { id: 'h-modernN', spans: [[1900, 9999]], end: 'sink', build: houses(Z.modernN, 'modern', 65) },
  { id: 'h-north3-mod', spans: [[1900, 9999]], end: 'sink', build: houses(Z.north3, 'modern', 66) },
  { id: 'h-modernS', spans: [[1920, 9999]], end: 'sink', build: houses(Z.modernS, 'modern', 67) },
]

export function activeAt(s: { spans: [number, number][] }, year: number) {
  return s.spans.some(([a, b]) => year >= a && year < b)
}

/** 希西家水道（基訓泉 → 西羅亞池，約 533 m，S 形；依考古測繪大致走向） */
export const TUNNEL: P[] = [
  L.gihon,
  [100, 545],
  [70, 585],
  [85, 640],
  [55, 700],
  [10, 735],
  [-20, 790],
  [-55, 815],
  L.siloam,
]
