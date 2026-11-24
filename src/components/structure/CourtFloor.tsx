import { useMemo } from 'react'
import * as THREE from 'three'
import { floor, smat } from '../../materials'
import { mulberry } from '../../rng'
import { mergeParts, trs, type Part } from './merge'
import { useDispose, type M } from './hooks'

/**
 * 院子的地面：疊在 World 的沙地上一層（同一組貼圖、同一套 uv，所以邊界看不出接縫），
 * 用頂點色和微小起伏做出大範圍的變化，打破貼圖重複：
 * - 從門口走到祭壇、洗濯盆、帳幕門口的路被踩實（略暗、較平）
 * - 祭壇四周有灰燼和煙燻、洗濯盆旁有水漬
 * - 帷子、柱子、帳幕底部有風吹積的沙和陰影
 * 另外散佈真的 3D 碎石。
 */

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
const sstep = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a))
  return t * t * (3 - 2 * t)
}
function hash2(x: number, y: number) {
  const h = Math.sin(x * 127.1 + y * 311.7) * 43758.5453
  return h - Math.floor(h)
}
export function vnoise2(x: number, y: number) {
  const ix = Math.floor(x)
  const iy = Math.floor(y)
  let fx = x - ix
  let fy = y - iy
  fx = fx * fx * (3 - 2 * fx)
  fy = fy * fy * (3 - 2 * fy)
  const a = hash2(ix, iy)
  const b = hash2(ix + 1, iy)
  const c = hash2(ix, iy + 1)
  const d = hash2(ix + 1, iy + 1)
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy
}

/** 與 World 的地面 PlaneGeometry(1200) 相同的 uv */
const groundUV = (x: number, z: number): [number, number] => [(x + 600) / 1200, (600 - z) / 1200]

export interface FloorField {
  color: (x: number, z: number) => [number, number, number]
  height: (x: number, z: number) => number
  /** 防重複混合的強度（0–1），預設 1；與 World 地面相接處要 0 */
  blend?: (x: number, z: number) => number
}

/** 建一塊網格地面；skip(x, z) 為 true 的三角形不建 */
export function floorGrid(x0: number, x1: number, z0: number, z1: number, step: number, f: FloorField, skip?: (x: number, z: number) => boolean) {
  const nx = Math.ceil((x1 - x0) / step)
  const nz = Math.ceil((z1 - z0) / step)
  const pos = new Float32Array((nx + 1) * (nz + 1) * 3)
  const uv = new Float32Array((nx + 1) * (nz + 1) * 2)
  const col = new Float32Array((nx + 1) * (nz + 1) * 3)
  const bl = new Float32Array((nx + 1) * (nz + 1))
  let k = 0
  for (let j = 0; j <= nz; j++)
    for (let i = 0; i <= nx; i++, k++) {
      const x = x0 + ((x1 - x0) * i) / nx
      const z = z0 + ((z1 - z0) * j) / nz
      pos[k * 3] = x
      pos[k * 3 + 1] = f.height(x, z)
      pos[k * 3 + 2] = z
      const [u, v] = groundUV(x, z)
      uv[k * 2] = u
      uv[k * 2 + 1] = v
      const c = f.color(x, z)
      col[k * 3] = c[0]
      col[k * 3 + 1] = c[1]
      col[k * 3 + 2] = c[2]
      bl[k] = f.blend ? f.blend(x, z) : 1
    }
  const idx: number[] = []
  for (let j = 0; j < nz; j++)
    for (let i = 0; i < nx; i++) {
      const a = j * (nx + 1) + i
      const b = a + 1
      const d = a + nx + 1
      const e = d + 1
      if (skip) {
        const cx = x0 + ((x1 - x0) * (i + 0.5)) / nx
        const cz = z0 + ((z1 - z0) * (j + 0.5)) / nz
        if (skip(cx, cz)) continue
      }
      idx.push(a, d, b, b, d, e)
    }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
  g.setAttribute('color', new THREE.BufferAttribute(col, 3))
  g.setAttribute('aBlend', new THREE.BufferAttribute(bl, 1))
  g.setIndex(idx)
  g.computeVertexNormals()
  return g
}

/** 三種碎石形狀：不規則的二十面體 */
function pebbleShapes() {
  return [11, 12, 13].map((seed) => {
    const g = new THREE.IcosahedronGeometry(1, 0)
    const pa = g.attributes.position as THREE.BufferAttribute
    for (let i = 0; i < pa.count; i++) {
      const x = pa.getX(i)
      const y = pa.getY(i)
      const z = pa.getZ(i)
      const k = 0.7 + 0.6 * hash2(x * 3.1 + seed, y * 2.7 + z * 1.3)
      pa.setXYZ(i, x * k, y * k, z * k)
    }
    g.computeVertexNormals()
    return g
  })
}

export function CourtFloor({ m }: { m: M }) {
  const { geo, rocks } = useMemo(() => {
    const W = m(50)
    const Dz = m(25)
    const CO = 0.12
    const tentX0 = m(-31)
    const tentZ = m(6)
    const altar = [m(20), 0]
    const laver = [m(8), 0]
    // 區域：院子＋門外一段路
    const X0 = -W - 1.5
    const X1 = m(66)
    const Z0 = -Dz - 1.5
    const Z1 = Dz + 1.5
    const pillarsAt: [number, number][] = []
    for (let i = 0; i <= 20; i++) pillarsAt.push([m(-50 + i * 5), -Dz], [m(-50 + i * 5), Dz])
    for (let i = 1; i < 10; i++) pillarsAt.push([-W, m(-25 + i * 5)], [W, m(-25 + i * 5)])

    const edge = (x: number, z: number) => clamp01(Math.min(x - X0, X1 - x, z - Z0, Z1 - z) / 1.2)
    const inCourt = (x: number, z: number) => sstep(-0.3, 0.6, Math.min(W - Math.abs(x), Dz - Math.abs(z)))
    // 被踩出來的路：門外 → 門 → 祭壇兩側 → 洗濯盆 → 帳幕門
    const lane = (x: number, z: number) => {
      if (x < -0.5) return 0
      let zc = 0
      // 繞過祭壇（兩側都有人走）
      const ad = Math.abs(x - altar[0])
      let half = 1.7
      if (ad < m(4)) {
        zc = Math.abs(z) > 0.1 ? Math.sign(z) * m(3.3) * Math.cos((ad / m(4)) * Math.PI * 0.5) : 0
        half = 1.2
      }
      const d = Math.abs(Math.abs(z) - Math.abs(zc))
      const wob = (vnoise2(x * 0.3, 1.7) - 0.5) * 0.8
      return (1 - sstep(half * 0.5, half + 0.6, d + wob)) * clamp01((m(66) - x) / 6)
    }
    const wallDist = (x: number, z: number) => {
      let d = 1e9
      if (Math.abs(x) <= W + CO) d = Math.min(d, Math.abs(Math.abs(z) - Dz - CO))
      if (Math.abs(z) <= Dz + CO && !(x > 0 && Math.abs(z) < m(10))) d = Math.min(d, Math.abs(Math.abs(x) - W - CO))
      return d
    }
    const tentDist = (x: number, z: number) => {
      const dx = Math.max(tentX0 - x, x - 0.35, 0)
      const dz = Math.max(Math.abs(z) - tentZ - 0.2, 0)
      return Math.hypot(dx, dz)
    }
    const pillarDist = (x: number, z: number) => {
      let d = 1e9
      for (const [px, pz] of pillarsAt) {
        const dd = (x - px) ** 2 + (z - pz) ** 2
        if (dd < d) d = dd
      }
      return Math.sqrt(d)
    }

    const field = {
      blend: (x: number, z: number) => edge(x, z),
      color(x: number, z: number): [number, number, number] {
        const e = edge(x, z)
        const ic = inCourt(x, z)
        const ln = lane(x, z)
        let r = 1
        let g = 1
        let b = 1
        // 大範圍的明暗、色偏：打破 3.5 m 一張的重複
        const n1 = vnoise2(x * 0.11, z * 0.11) - 0.5
        const n2 = vnoise2(x * 0.37 + 9, z * 0.37) - 0.5
        const n3 = vnoise2(x * 1.3, z * 1.3 + 4) - 0.5
        const v = 1 + (n1 * 0.16 + n2 * 0.08 + n3 * 0.04) * e
        r *= v
        g *= v * (1 - n2 * 0.03 * e)
        b *= v * (1 - n2 * 0.06 * e)
        // 踩實的路：略暗略灰
        const L = ln * e
        r *= 1 - 0.07 * L
        g *= 1 - 0.075 * L
        b *= 1 - 0.07 * L
        // 祭壇：灰燼、煙燻，東邊（倒灰的地方，利 1:16）較多
        const da = Math.hypot((x - altar[0]) * (x > altar[0] ? 0.75 : 1), z - altar[1])
        const ash = (1 - sstep(m(2.6), m(2.6) + 3, da)) * 0.22 * ic
        r *= 1 - ash
        g *= 1 - ash * 1.03
        b *= 1 - ash * 1.02
        // 洗濯盆旁的水漬
        const dl = Math.hypot(x - laver[0], z - laver[1])
        const wet = (1 - sstep(m(1.6), m(1.6) + 1.4 + n3 * 0.8, dl)) * 0.2 * ic
        r *= 1 - wet
        g *= 1 - wet * 0.95
        b *= 1 - wet * 0.85
        // 帷子底部、柱腳、帳幕周圍的陰影與積沙
        const wd = wallDist(x, z)
        const ao1 = 1 - (1 - sstep(0, 0.55, wd)) * 0.16
        const pd = pillarDist(x, z)
        const ao2 = 1 - (1 - sstep(0.15, 0.6, pd)) * 0.18
        const td = tentDist(x, z)
        const ao3 = 1 - (1 - sstep(0, 1.2, td)) * 0.2
        const ao = ao1 * ao2 * ao3
        return [r * ao, g * ao, b * ao]
      },
      height(x: number, z: number) {
        const e = edge(x, z)
        const ln = lane(x, z)
        const bump = (vnoise2(x * 1.1, z * 1.1) * 0.012 + vnoise2(x * 3.7, z * 3.7) * 0.006 + vnoise2(x * 0.3, z * 0.3) * 0.02) * (1 - ln * 0.7)
        // 風把沙吹積在帷子底下、帳幕邊
        const drift = (1 - sstep(0, 0.45, wallDist(x, z))) * 0.035 + (1 - sstep(0, 0.6, tentDist(x, z))) * 0.03
        return 0.002 + (0.01 + bump + drift * (0.6 + 0.8 * vnoise2(x * 2, z * 2))) * e
      },
    }
    const inTent = (x: number, z: number) => x > m(-30) + 0.03 && x < -0.03 && Math.abs(z) < m(5) - 0.03
    const geo = floorGrid(X0, X1, Z0, Z1, 0.35, field, inTent)

    // ---- 碎石 ----
    const shapes = pebbleShapes()
    const rnd = mulberry(77)
    const pal = ['#8f8478', '#6b625a', '#a77d63', '#c9bca8', '#7f5d48', '#a39785', '#4f4843', '#b59b7a'].map((c) => new THREE.Color(c))
    const parts: Part[] = []
    const blocked = (x: number, z: number) =>
      inTent(x, z) ||
      (Math.abs(x - altar[0]) < m(2.8) && Math.abs(z) < m(2.8)) ||
      Math.hypot(x - laver[0], z) < m(1.7) ||
      (x > m(-30.5) && x < 0.4 && Math.abs(z) < m(5.6))
    for (let tries = 0; parts.length < 1500 && tries < 20000; tries++) {
      const x = X0 + rnd() * (X1 - X0)
      const z = Z0 + rnd() * (Z1 - Z0)
      if (blocked(x, z)) continue
      const keep = (0.35 + 0.65 * vnoise2(x * 0.5, z * 0.5)) * (1 - lane(x, z) * 0.75) * edge(x, z) * (0.4 + 0.6 * inCourt(x, z))
      if (rnd() > keep) continue
      const big = rnd() < 0.04
      const s = big ? 0.04 + rnd() * 0.05 : 0.008 + rnd() * rnd() * 0.028
      const c = pal[(rnd() * pal.length) | 0]
      const t = 0.8 + rnd() * 0.35
      parts.push({
        geo: shapes[(rnd() * 3) | 0],
        matrix: trs([x, field.height(x, z) + s * 0.1, z], [(rnd() - 0.5) * 0.5, rnd() * 6, (rnd() - 0.5) * 0.5], [s * (0.8 + rnd() * 0.5), s * (0.45 + rnd() * 0.25), s]),
        color: [c.r * t, c.g * t, c.b * t],
      })
    }
    const rocks = mergeParts(parts)
    shapes.forEach((g) => g.dispose())
    return { geo, rocks }
  }, [m])
  const mat = useMemo(() => floor(false), [])
  useDispose(geo, rocks)
  return (
    <group>
      <mesh geometry={geo} material={mat} receiveShadow />
      <mesh geometry={rocks} material={smat.rock} receiveShadow castShadow />
    </group>
  )
}
