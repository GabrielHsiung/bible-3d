/**
 * 合併幾何：把同一材質的許多小物件（柱子、繩子、碎石……）合成一個 mesh。
 * 不用 InstancedMesh，因為路徑追蹤（three-gpu-pathtracer 的 WebGL 版）
 * 攤平場景時不會套用 instance 矩陣；合併後一個 draw call，路徑追蹤也正確。
 */
import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

export interface Part {
  geo: THREE.BufferGeometry
  matrix: THREE.Matrix4
  color?: [number, number, number]
  /** uv 位移（讓重複物件的貼圖不要一模一樣） */
  uvOffset?: [number, number]
}

/** 合併；一律輸出 position / normal / uv / color 四個屬性（沒給顏色就是白色） */
export function mergeParts(parts: Part[]): THREE.BufferGeometry {
  const list: THREE.BufferGeometry[] = []
  for (const p of parts) {
    let g = p.geo.index ? p.geo.toNonIndexed() : p.geo.clone()
    // 只保留共同屬性
    for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name)
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2))
    if (!g.attributes.normal) g.computeVertexNormals()
    g.applyMatrix4(p.matrix)
    const n = g.attributes.position.count
    const c = p.color ?? [1, 1, 1]
    const col = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) {
      col[i * 3] = c[0]
      col[i * 3 + 1] = c[1]
      col[i * 3 + 2] = c[2]
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3))
    if (p.uvOffset) {
      const uv = g.attributes.uv as THREE.BufferAttribute
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) + p.uvOffset[0], uv.getY(i) + p.uvOffset[1])
    }
    list.push(g)
  }
  const merged = mergeGeometries(list, false)!
  list.forEach((g) => g.dispose())
  merged.computeBoundingSphere()
  return merged
}

const _q = new THREE.Quaternion()
const _e = new THREE.Euler()
const _s = new THREE.Vector3()
const _p = new THREE.Vector3()

/** 位置＋歐拉角＋縮放 → 矩陣 */
export function trs(pos: [number, number, number], rot: [number, number, number] = [0, 0, 0], scale: number | [number, number, number] = 1) {
  _p.set(pos[0], pos[1], pos[2])
  _q.setFromEuler(_e.set(rot[0], rot[1], rot[2]))
  if (typeof scale === 'number') _s.setScalar(scale)
  else _s.set(scale[0], scale[1], scale[2])
  return new THREE.Matrix4().compose(_p, _q, _s)
}

/** 由 a 到 b 的細圓柱（繩子、杆子）。幾何要是沿 y 軸、長度 1、中心在原點的圓柱 */
export function segment(a: THREE.Vector3, b: THREE.Vector3) {
  const d = new THREE.Vector3().subVectors(b, a)
  const len = d.length()
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.divideScalar(len))
  const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5)
  return new THREE.Matrix4().compose(mid, q, new THREE.Vector3(1, len, 1))
}

/** 有一點下垂的繩子：分成幾段 */
export function ropeParts(geo: THREE.BufferGeometry, a: THREE.Vector3, b: THREE.Vector3, sagPerM = 0.012, segs = 3): Part[] {
  const out: Part[] = []
  const len = a.distanceTo(b)
  const pts: THREE.Vector3[] = []
  for (let i = 0; i <= segs; i++) {
    const t = i / segs
    const p = new THREE.Vector3().lerpVectors(a, b, t)
    p.y -= Math.sin(Math.PI * t) * sagPerM * len
    pts.push(p)
  }
  for (let i = 0; i < segs; i++) out.push({ geo, matrix: segment(pts[i], pts[i + 1]) })
  return out
}
