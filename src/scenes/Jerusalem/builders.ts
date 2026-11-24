/**
 * 幾何建構器：把成千上萬個方塊、圓柱、圓頂直接寫進同一份陣列，
 * 每個建築群只產生一個 BufferGeometry（省 draw call）。
 * 每個頂點帶 aBase（這個零件的地基高度），讓 shader 做「升起／崩塌」動畫。
 * UV 由世界座標產生（每 4 m 重複一次），石材貼圖在所有建築上比例一致。
 */
import * as THREE from 'three'
import { groundY } from './terrain'
import type { P } from './geo'

const TILE = 4

export class GB {
  pos: number[] = []
  nor: number[] = []
  uv: number[] = []
  col: number[] = []
  base: number[] = []
  idx: number[] = []
  private c = new THREE.Color()

  get vertCount() {
    return this.pos.length / 3
  }

  /** 加一個四邊形（a b c d 逆時針，從外面看） */
  quad(a: number[], b: number[], c: number[], d: number[], n: number[], color: THREE.Color, base: number) {
    const v0 = this.vertCount
    for (const p of [a, b, c, d]) {
      this.pos.push(p[0], p[1], p[2])
      this.nor.push(n[0], n[1], n[2])
      // 依法線方向選擇投影平面
      const ax = Math.abs(n[0])
      const ay = Math.abs(n[1])
      if (ay > 0.7) this.uv.push(p[0] / TILE, p[2] / TILE)
      else if (ax > Math.abs(n[2])) this.uv.push(p[2] / TILE, p[1] / TILE)
      else this.uv.push(p[0] / TILE, p[1] / TILE)
      this.col.push(color.r, color.g, color.b)
      this.base.push(base)
    }
    this.idx.push(v0, v0 + 1, v0 + 2, v0, v0 + 2, v0 + 3)
  }

  tri(a: number[], b: number[], c: number[], color: THREE.Color, base: number) {
    const v0 = this.vertCount
    const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
    const e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]]
    const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]]
    const l = Math.hypot(n[0], n[1], n[2]) || 1
    for (const p of [a, b, c]) {
      this.pos.push(p[0], p[1], p[2])
      this.nor.push(n[0] / l, n[1] / l, n[2] / l)
      this.uv.push((p[0] + p[2]) / TILE, p[1] / TILE)
      this.col.push(color.r, color.g, color.b)
      this.base.push(base)
    }
    this.idx.push(v0, v0 + 1, v0 + 2)
  }

  color(c: string | THREE.Color) {
    return typeof c === 'string' ? this.c.set(c).clone() : c
  }

  /**
   * 方塊：中心 (cx, cz)，底 y0，寬 w（x）、深 d（z）、高 h，繞 y 旋轉 rot。
   * bottom=false 時不畫底面（放在地上看不到）。
   */
  box(cx: number, y0: number, cz: number, w: number, h: number, d: number, color: string | THREE.Color, rot = 0, base = y0, bottom = false) {
    const col = this.color(color)
    const cs = Math.cos(rot)
    const sn = Math.sin(rot)
    const P = (lx: number, ly: number, lz: number) => [cx + lx * cs + lz * sn, y0 + ly, cz - lx * sn + lz * cs]
    const N = (nx: number, nz: number) => [nx * cs + nz * sn, 0, -nx * sn + nz * cs]
    const x = w / 2
    const z = d / 2
    // +z, -z, +x, -x, top
    this.quad(P(-x, 0, z), P(x, 0, z), P(x, h, z), P(-x, h, z), N(0, 1), col, base)
    this.quad(P(x, 0, -z), P(-x, 0, -z), P(-x, h, -z), P(x, h, -z), N(0, -1), col, base)
    this.quad(P(x, 0, z), P(x, 0, -z), P(x, h, -z), P(x, h, z), N(1, 0), col, base)
    this.quad(P(-x, 0, -z), P(-x, 0, z), P(-x, h, z), P(-x, h, -z), N(-1, 0), col, base)
    this.quad(P(-x, h, z), P(x, h, z), P(x, h, -z), P(-x, h, -z), [0, 1, 0], col, base)
    if (bottom) this.quad(P(-x, 0, -z), P(x, 0, -z), P(x, 0, z), P(-x, 0, z), [0, -1, 0], col, base)
  }

  /** 人字形屋頂（屋脊沿 x 方向，長 w、深 d、高 h） */
  gable(cx: number, y0: number, cz: number, w: number, h: number, d: number, color: string | THREE.Color, rot = 0, base = y0) {
    const col = this.color(color)
    const cs = Math.cos(rot)
    const sn = Math.sin(rot)
    const P = (lx: number, ly: number, lz: number) => [cx + lx * cs + lz * sn, y0 + ly, cz - lx * sn + lz * cs]
    const x = w / 2
    const z = d / 2
    const s = Math.hypot(z, h)
    const n1 = [(0 * cs + (h / s) * sn), z / s, -0 * sn + (h / s) * cs]
    const n2 = [(-(h / s)) * sn, z / s, -(h / s) * cs]
    this.quad(P(-x, 0, z), P(x, 0, z), P(x, h, 0), P(-x, h, 0), n1, col, base)
    this.quad(P(x, 0, -z), P(-x, 0, -z), P(-x, h, 0), P(x, h, 0), n2, col, base)
    this.tri(P(x, 0, z), P(x, 0, -z), P(x, h, 0), col, base)
    this.tri(P(-x, 0, -z), P(-x, 0, z), P(-x, h, 0), col, base)
  }

  /** 圓柱或圓錐台（r2 為頂部半徑） */
  cyl(cx: number, y0: number, cz: number, r: number, h: number, color: string | THREE.Color, seg = 8, r2 = r, base = y0, cap = true) {
    const col = this.color(color)
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * Math.PI * 2
      const a1 = ((i + 1) / seg) * Math.PI * 2
      const am = (a0 + a1) / 2
      const n = [Math.cos(am), (r - r2) / h, Math.sin(am)]
      const l = Math.hypot(n[0], n[1], n[2])
      this.quad(
        [cx + Math.cos(a0) * r, y0, cz + Math.sin(a0) * r],
        [cx + Math.cos(a0) * r2, y0 + h, cz + Math.sin(a0) * r2],
        [cx + Math.cos(a1) * r2, y0 + h, cz + Math.sin(a1) * r2],
        [cx + Math.cos(a1) * r, y0, cz + Math.sin(a1) * r],
        [n[0] / l, n[1] / l, n[2] / l],
        col,
        base,
      )
      if (cap && r2 > 0.01)
        this.tri([cx, y0 + h, cz], [cx + Math.cos(a1) * r2, y0 + h, cz + Math.sin(a1) * r2], [cx + Math.cos(a0) * r2, y0 + h, cz + Math.sin(a0) * r2], col, base)
    }
  }

  /** 圓頂（半球，sy 為高度比例；平滑法線） */
  dome(cx: number, y0: number, cz: number, r: number, color: string | THREE.Color, seg = 12, rings = 5, sy = 1, base = y0) {
    const col = this.color(color)
    const pt = (i: number, j: number) => {
      const a = (i / seg) * Math.PI * 2
      const b = (j / rings) * Math.PI * 0.5
      return [Math.cos(a) * Math.cos(b), Math.sin(b), Math.sin(a) * Math.cos(b)]
    }
    for (let j = 0; j < rings; j++)
      for (let i = 0; i < seg; i++) {
        const q = [pt(i, j), pt(i, j + 1), pt(i + 1, j + 1), pt(i + 1, j)]
        const v0 = this.vertCount
        for (const p of q) {
          this.pos.push(cx + p[0] * r, y0 + p[1] * r * sy, cz + p[2] * r)
          const n = [p[0], p[1] / sy, p[2]]
          const l = Math.hypot(n[0], n[1], n[2])
          this.nor.push(n[0] / l, n[1] / l, n[2] / l)
          this.uv.push((cx + p[0] * r) / TILE, (y0 + p[1] * r) / TILE)
          this.col.push(col.r, col.g, col.b)
          this.base.push(base)
        }
        this.idx.push(v0, v0 + 1, v0 + 2, v0, v0 + 2, v0 + 3)
      }
  }

  /** 多邊形柱體（任意凸／凹多邊形，頂面用三角化） */
  prism(poly: P[], y0: number, y1: number, color: string | THREE.Color, base = y0, top = true) {
    const col = this.color(color)
    const n = poly.length
    // 確保逆時針（從上往下看，x 東 z 南）
    let area = 0
    for (let i = 0; i < n; i++) {
      const [ax, az] = poly[i]
      const [bx, bz] = poly[(i + 1) % n]
      area += ax * bz - bx * az
    }
    const pts = area < 0 ? [...poly].reverse() : poly
    for (let i = 0; i < n; i++) {
      const [ax, az] = pts[i]
      const [bx, bz] = pts[(i + 1) % n]
      const ex = bx - ax
      const ez = bz - az
      const l = Math.hypot(ex, ez) || 1
      // 面向外的法線
      const nn = [-ez / l, 0, ex / l]
      this.quad([bx, y0, bz], [ax, y0, az], [ax, y1, az], [bx, y1, bz], [-nn[0], 0, -nn[2]], col, base)
    }
    if (top) {
      const tris = THREE.ShapeUtils.triangulateShape(pts.map(([x, z]) => new THREE.Vector2(x, z)), [])
      for (const [a, b, c] of tris) this.tri([pts[a][0], y1, pts[a][1]], [pts[c][0], y1, pts[c][1]], [pts[b][0], y1, pts[b][1]], col, base)
    }
  }

  /** 正多邊形柱（例如八角形），r 為外接圓半徑 */
  ngon(cx: number, y0: number, cz: number, r: number, h: number, sides: number, color: string | THREE.Color, rot = 0, base = y0) {
    const poly: P[] = []
    for (let i = 0; i < sides; i++) {
      const a = rot + (i / sides) * Math.PI * 2
      poly.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r])
    }
    this.prism(poly, y0, y0 + h, color, base)
  }

  /**
   * 沿地形的城牆：每段切成 ≤ 10 m 的方塊，底部埋進地面。
   * towers：每隔多少公尺一座方塔；crenel：城垛間距（0＝不做）。
   */
  wall(
    path: P[],
    o: { h: number; t: number; color: string; closed?: boolean; towerEvery?: number; towerSize?: number; towerExtra?: number; crenel?: number; jitter?: number },
  ) {
    const col = this.color(o.color)
    const dark = col.clone().multiplyScalar(0.92)
    const pts = o.closed ? [...path, path[0]] : path
    let acc = 0
    let nextTower = (o.towerEvery ?? 0) * 0.5
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i]
      const [bx, bz] = pts[i + 1]
      const L = Math.hypot(bx - ax, bz - az)
      const rot = -Math.atan2(bz - az, bx - ax)
      const n = Math.max(1, Math.ceil(L / 10))
      for (let k = 0; k < n; k++) {
        const t0 = k / n
        const t1 = (k + 1) / n
        const x0 = ax + (bx - ax) * t0
        const z0 = az + (bz - az) * t0
        const x1 = ax + (bx - ax) * t1
        const z1 = az + (bz - az) * t1
        const cx = (x0 + x1) / 2
        const cz = (z0 + z1) / 2
        const g = Math.min(groundY(x0, z0), groundY(x1, z1), groundY(cx, cz))
        const top = groundY(cx, cz) + o.h + (o.jitter ? (Math.sin(cx * 0.7 + cz) * 0.5 + 0.5) * o.jitter : 0)
        const seg = L / n + 0.6
        this.box(cx, g - 3, cz, seg, top - g + 3, o.t, k % 2 ? col : dark, rot, g - 3)
        if (o.crenel) {
          const m = Math.max(1, Math.floor(seg / o.crenel))
          for (let c = 0; c < m; c++) {
            const tt = (c + 0.5) / m
            const px = x0 + (x1 - x0) * tt
            const pz = z0 + (z1 - z0) * tt
            this.box(px, top, pz, o.crenel * 0.5, 1.4, o.t * 0.9, col, rot, g - 3)
          }
        }
        acc += L / n
        if (o.towerEvery && acc >= nextTower) {
          nextTower += o.towerEvery
          const s = o.towerSize ?? 9
          this.box(cx, g - 3, cz, s, top - g + 3 + (o.towerExtra ?? 4), s * 0.9, dark, rot, g - 3)
        }
      }
    }
  }

  geometry() {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3))
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3))
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2))
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3))
    g.setAttribute('aBase', new THREE.Float32BufferAttribute(this.base, 1))
    g.setIndex(this.vertCount > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1))
    g.computeBoundingSphere()
    return g
  }

  get empty() {
    return this.idx.length === 0
  }
}

/** 沿折線取點（每 step 公尺），回傳 [x, z, 方向角] */
export function along(path: P[], step: number, closed = false) {
  const pts = closed ? [...path, path[0]] : path
  const out: [number, number, number][] = []
  let carry = 0
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i]
    const [bx, bz] = pts[i + 1]
    const L = Math.hypot(bx - ax, bz - az)
    const rot = -Math.atan2(bz - az, bx - ax)
    let d = carry
    while (d < L) {
      const t = d / L
      out.push([ax + (bx - ax) * t, az + (bz - az) * t, rot])
      d += step
    }
    carry = d - L
  }
  return out
}
