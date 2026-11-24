/**
 * 聖器用的幾何工具：旋轉體、漸細管、倒角方塊、合併。
 * 所有聖器的幾何都以「肘」為單位建立，外層 group 再乘上 C（一肘幾公尺），
 * 這樣切換肘的標準時不必重建幾何。
 */
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

export type V2 = [number, number]

/** 旋轉體：profile 是 [半徑, 高度] 的點列（由下往上） */
export function lathe(profile: V2[], segs = 24, phiLength = Math.PI * 2) {
  return new THREE.LatheGeometry(
    profile.map(([r, y]) => new THREE.Vector2(Math.max(r, 0.0001), y)),
    segs,
    0,
    phiLength,
  )
}

/** 平滑的旋轉體輪廓：在控制點之間用 Catmull-Rom 補點 */
export function smoothProfile(pts: V2[], n = 32): V2[] {
  const c = new THREE.SplineCurve(pts.map(([x, y]) => new THREE.Vector2(x, y)))
  return c.getSpacedPoints(n).map((p) => [Math.max(p.x, 0), p.y])
}

/** 倒角方塊 */
export function rbox(w: number, h: number, d: number, r = 0.04, seg = 2) {
  const rr = Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4)
  return new RoundedBoxGeometry(w, h, d, seg, rr)
}

/**
 * 沿曲線、半徑會變化的管子（TubeGeometry 只能固定半徑）。
 * radius(t) 回傳 t∈[0,1] 處的半徑；兩端自動封口。
 */
export function taperTube(curve: THREE.Curve<THREE.Vector3>, radius: (t: number) => number, tubular = 32, radial = 10, cap = true) {
  const frames = curve.computeFrenetFrames(tubular, false)
  const pos: number[] = []
  const nor: number[] = []
  const uv: number[] = []
  const idx: number[] = []
  const P = new THREE.Vector3()
  const N = new THREE.Vector3()
  for (let i = 0; i <= tubular; i++) {
    const t = i / tubular
    curve.getPointAt(t, P)
    const r = radius(t)
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * Math.PI * 2
      N.copy(frames.normals[i]).multiplyScalar(Math.cos(a)).addScaledVector(frames.binormals[i], Math.sin(a)).normalize()
      pos.push(P.x + N.x * r, P.y + N.y * r, P.z + N.z * r)
      nor.push(N.x, N.y, N.z)
      uv.push(j / radial, t)
    }
  }
  for (let i = 0; i < tubular; i++)
    for (let j = 0; j < radial; j++) {
      const a = i * (radial + 1) + j
      const b = (i + 1) * (radial + 1) + j
      idx.push(a, b, a + 1, b, b + 1, a + 1)
    }
  if (cap) {
    for (const end of [0, 1]) {
      curve.getPointAt(end, P)
      const T = curve.getTangentAt(end).multiplyScalar(end ? 1 : -1)
      const c = pos.length / 3
      pos.push(P.x, P.y, P.z)
      nor.push(T.x, T.y, T.z)
      uv.push(0.5, end)
      const ring = end ? tubular * (radial + 1) : 0
      // 環的頂點另外複製一份，法線朝外
      const s = pos.length / 3
      for (let j = 0; j <= radial; j++) {
        const k = (ring + j) * 3
        pos.push(pos[k], pos[k + 1], pos[k + 2])
        nor.push(T.x, T.y, T.z)
        uv.push(0.5 + 0.5 * Math.cos((j / radial) * Math.PI * 2), 0.5 + 0.5 * Math.sin((j / radial) * Math.PI * 2))
      }
      for (let j = 0; j < radial; j++) {
        if (end) idx.push(c, s + j, s + j + 1)
        else idx.push(c, s + j + 1, s + j)
      }
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.setIndex(idx)
  return g
}

/** 把幾何放到某處：位置、旋轉（尤拉角）、縮放 */
export function place(
  g: THREE.BufferGeometry,
  p: [number, number, number] = [0, 0, 0],
  r: [number, number, number] = [0, 0, 0],
  s: number | [number, number, number] = 1,
) {
  const m = new THREE.Matrix4().compose(
    new THREE.Vector3(...p),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...r)),
    typeof s === 'number' ? new THREE.Vector3(s, s, s) : new THREE.Vector3(...s),
  )
  return g.applyMatrix4(m)
}

/** 讓幾何的 +Y 軸對準 dir，並移到 p */
export function alignY(g: THREE.BufferGeometry, p: THREE.Vector3, dir: THREE.Vector3) {
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize())
  return g.applyMatrix4(new THREE.Matrix4().compose(p, q, new THREE.Vector3(1, 1, 1)))
}

/** 合併成一個幾何（一次 draw call）。統一成非索引、只保留 position/normal/uv */
export function merge(list: THREE.BufferGeometry[]) {
  const norm = list.map((g) => {
    const n = g.index ? g.toNonIndexed() : g
    for (const k of Object.keys(n.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') n.deleteAttribute(k)
    if (!n.attributes.uv) {
      const c = n.attributes.position.count
      n.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(c * 2), 2))
    }
    if (!n.attributes.normal) n.computeVertexNormals()
    n.morphAttributes = {}
    return n
  })
  const out = mergeGeometries(norm, false)
  if (!out) throw new Error('merge failed')
  out.computeBoundingSphere()
  out.computeBoundingBox()
  return out
}

/** 決定性的亂數（避免每次重新整理長得不一樣） */
export function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * 角：從底部向上、略向外彎的漸細角（像公牛角），尖端圓鈍。
 * out：向外彎的水平方向。高度 h、底半徑 r（單位：肘）。
 */
export function horn(h: number, r: number, out: THREE.Vector3, curl = 0.55) {
  const o = out.clone().setY(0).normalize()
  const curve = new THREE.CubicBezierCurve3(
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0, h * 0.45, 0),
    o.clone().multiplyScalar(h * curl * 0.35).setY(h * 0.85),
    o.clone().multiplyScalar(h * curl).setY(h),
  )
  return taperTube(curve, (t) => r * (1 - t * 0.82) * (t > 0.94 ? Math.sqrt(Math.max(0, 1 - (t - 0.94) / 0.06)) * 0.9 + 0.1 : 1), 16, 12)
}

/** 三角形數 */
export function tris(g: THREE.BufferGeometry) {
  return (g.index ? g.index.count : g.attributes.position.count) / 3
}
