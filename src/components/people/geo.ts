/**
 * 程序建模的小工具：把多個「片」（網格、管子、橢球）合成一個可蒙皮的 BufferGeometry。
 * 每個頂點帶：位置、顏色（線性）、UV（以公尺計，給布紋法線貼圖用）、骨骼索引與權重。
 * 一個幾何體依材質分成數個 group（0 皮膚、1 布料、2 金）。
 */
import * as THREE from 'three'

export type V3 = THREE.Vector3
export type RGB = [number, number, number]
/** 骨骼影響：[骨骼索引, 權重] */
export type Infl = [number, number][]

export const MAT_SKIN = 0
export const MAT_CLOTH = 1
export const MAT_GOLD = 2

export const v3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z)
export const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x))
/** smoothstep，允許 e0 > e1（反向） */
export const sstep = (e0: number, e1: number, x: number) => {
  const t = clamp((x - e0) / (e1 - e0))
  return t * t * (3 - 2 * t)
}
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t
export const gauss = (d2: number) => Math.exp(-d2)

/** sRGB 十六進位 → 線性 RGB */
export function rgb(hex: string): RGB {
  const c = new THREE.Color(hex)
  return [c.r, c.g, c.b]
}
export const mixc = (a: RGB, b: RGB, t: number): RGB => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]
export const mulc = (a: RGB, k: number): RGB => [a[0] * k, a[1] * k, a[2] * k]

/** 便宜的 3D 雜訊（正弦疊加，夠用於布紋、毛團） */
export function noise3(x: number, y: number, z: number) {
  return (
    Math.sin(x * 1.7 + Math.sin(z * 1.3) * 1.1) * Math.sin(y * 1.9 + Math.sin(x * 0.9) * 1.3) * 0.5 +
    Math.sin(z * 2.3 + Math.sin(y * 1.7) * 0.8) * Math.sin(x * 2.9 - 1.1) * 0.3 +
    Math.sin(y * 3.7 + z * 2.1 + 0.4) * 0.2
  )
}

interface Piece {
  mat: number
  pos: number[]
  col: number[]
  uv: number[]
  si: number[]
  sw: number[]
  idx: number[]
  orient: V3 | null // 用來自動校正法線方向的內部點；null = 不校正
}

export interface VtxOut {
  p: V3
  c: RGB
  w: Infl
  uv?: [number, number]
}

export class Builder {
  pieces: Piece[] = []

  private piece(mat: number, orient: V3 | null): Piece {
    const p: Piece = { mat, pos: [], col: [], uv: [], si: [], sw: [], idx: [], orient }
    this.pieces.push(p)
    return p
  }

  private vtx(pc: Piece, o: VtxOut) {
    pc.pos.push(o.p.x, o.p.y, o.p.z)
    pc.col.push(o.c[0], o.c[1], o.c[2])
    pc.uv.push(o.uv ? o.uv[0] : o.p.x * 10, o.uv ? o.uv[1] : o.p.y * 10)
    const w = o.w
      .filter((e) => e[1] > 1e-4)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
    let tot = 0
    for (const e of w) tot += e[1]
    for (let k = 0; k < 4; k++) {
      pc.si.push(w[k] ? w[k][0] : 0)
      pc.sw.push(w[k] ? w[k][1] / tot : 0)
    }
    return pc.pos.length / 3 - 1
  }

  /**
   * 參數網格：(nu+1)×(nv+1) 個頂點，f(u,v) 給出頂點；keep(i,j) 決定要不要保留第 (i,j) 格。
   * orient：網格「內部」的一點，用來把法線翻成朝外（布料雙面渲染時也讓光照方向一致）。
   */
  grid(mat: number, nu: number, nv: number, f: (u: number, v: number, i: number, j: number) => VtxOut, orient: V3 | null, keep?: (i: number, j: number) => boolean) {
    const pc = this.piece(mat, orient)
    const base = pc.pos.length / 3
    for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) this.vtx(pc, f(i / nu, j / nv, i, j))
    const W = nu + 1
    for (let j = 0; j < nv; j++)
      for (let i = 0; i < nu; i++) {
        if (keep && !keep(i, j)) continue
        const a = base + j * W + i
        const b = a + 1
        const c = a + W
        const d = c + 1
        pc.idx.push(a, c, b, b, c, d)
      }
    return pc
  }

  /**
   * 沿折線的管子。radii 可以是 [寬, 高]（橢圓截面）。截面方向以 up 為參考做平行移動。
   * ring(s, a) 可回傳額外的徑向位移（皺褶）。
   */
  tube(
    mat: number,
    pts: V3[],
    radii: (number | [number, number])[],
    seg: number,
    o: {
      color: (s: number, a: number, p: V3) => RGB
      weight: (s: number, p: V3) => Infl
      up?: V3
      disp?: (s: number, a: number) => number
      closed?: boolean
      uvScale?: number
      orient?: boolean
    },
  ) {
    const n = pts.length
    const T: V3[] = []
    for (let i = 0; i < n; i++) {
      const a = pts[Math.max(0, i - 1)]
      const b = pts[Math.min(n - 1, i + 1)]
      if (o.closed) T.push(pts[(i + 1) % n].clone().sub(pts[(i - 1 + n) % n]).normalize())
      else T.push(b.clone().sub(a).normalize())
    }
    // 平行移動的截面座標
    const up = (o.up ?? v3(0, 0, 1)).clone()
    let N = up.clone().sub(T[0].clone().multiplyScalar(up.dot(T[0])))
    if (N.lengthSq() < 1e-6) N = v3(1, 0, 0).sub(T[0].clone().multiplyScalar(T[0].x))
    N.normalize()
    const Ns: V3[] = []
    const Bs: V3[] = []
    for (let i = 0; i < n; i++) {
      if (i > 0) {
        N = N.clone().sub(T[i].clone().multiplyScalar(N.dot(T[i]))).normalize()
      }
      Ns.push(N.clone())
      Bs.push(T[i].clone().cross(N).normalize())
    }
    let len = 0
    const L: number[] = [0]
    for (let i = 1; i < n; i++) L.push((len += pts[i].distanceTo(pts[i - 1])))
    const total = Math.max(len, 1e-6)
    const uvs = o.uvScale ?? 5
    const rows = n - (o.closed ? 0 : 1)
    const pc = this.grid(
      mat,
      seg,
      o.closed ? n : n - 1,
      (_u, _v, i, j) => {
        const jj = j % n
        const s = L[jj] / total
        const a = (i / seg) * Math.PI * 2
        const r = radii[jj]
        const rx = typeof r === 'number' ? r : r[0]
        const ry = typeof r === 'number' ? r : r[1]
        const d = o.disp ? o.disp(s, a) : 0
        const p = pts[jj]
          .clone()
          .addScaledVector(Bs[jj], Math.cos(a) * (rx + d))
          .addScaledVector(Ns[jj], Math.sin(a) * (ry + d))
        return { p, c: o.color(s, a, p), w: o.weight(s, p), uv: [(a / (Math.PI * 2)) * rx * 6.28 * uvs, L[jj] * uvs] }
      },
      null,
    )
    void rows
    if (o.orient !== false) {
      // 以整條軸線的中點作為內部參考
      pc.orient = pts[Math.floor(n / 2)].clone()
      ;(pc as Piece & { axis?: V3[] }).axis = pts
    }
    return pc
  }

  /** 以方向函式定義的封閉曲面（頭、身體、蹄…）。shape(dir) 回傳頂點 */
  blob(mat: number, nu: number, nv: number, shape: (dir: V3, u: number, v: number) => VtxOut, center: V3, lonWarp?: (u: number) => number, latWarp?: (v: number) => number) {
    return this.grid(
      mat,
      nu,
      nv,
      (u, v) => {
        const lon = (lonWarp ? lonWarp(u) : u) * Math.PI * 2 // 0 = 正前方 (+z)
        const lat = (latWarp ? latWarp(v) : v) * Math.PI // 0 = 頂
        const dir = v3(Math.sin(lat) * Math.sin(lon), Math.cos(lat), Math.sin(lat) * Math.cos(lon))
        return shape(dir, u, v)
      },
      center,
    )
  }

  /** 把幾何體做鏡像 (x → -x)，並把骨骼索引對應到另一側 */
  mirrorLast(count: number, boneMap: (b: number) => number) {
    const src = this.pieces.slice(-count)
    for (const s of src) {
      const pc: Piece = { mat: s.mat, pos: s.pos.slice(), col: s.col.slice(), uv: s.uv.slice(), si: s.si.map(boneMap), sw: s.sw.slice(), idx: s.idx.slice(), orient: s.orient ? s.orient.clone() : null }
      for (let i = 0; i < pc.pos.length; i += 3) pc.pos[i] = -pc.pos[i]
      if (pc.orient) pc.orient.x = -pc.orient.x
      const ax = (s as Piece & { axis?: V3[] }).axis
      if (ax) (pc as Piece & { axis?: V3[] }).axis = ax.map((p) => v3(-p.x, p.y, p.z))
      this.pieces.push(pc)
    }
  }

  /** 對最後 count 個片套用矩陣（位置與方向） */
  transformLast(count: number, m: THREE.Matrix4) {
    for (const s of this.pieces.slice(-count)) {
      const v = v3()
      for (let i = 0; i < s.pos.length; i += 3) {
        v.set(s.pos[i], s.pos[i + 1], s.pos[i + 2]).applyMatrix4(m)
        s.pos[i] = v.x
        s.pos[i + 1] = v.y
        s.pos[i + 2] = v.z
      }
      if (s.orient) s.orient.applyMatrix4(m)
      const ax = (s as Piece & { axis?: V3[] }).axis
      if (ax) (s as Piece & { axis?: V3[] }).axis = ax.map((p) => p.clone().applyMatrix4(m))
    }
  }

  /** 合併成 BufferGeometry：計算法線、焊接接縫法線、依材質分 group */
  /** 依材質拆成多個幾何體（路徑追蹤不支援材質陣列，所以每種材質一個網格） */
  buildByMat(): Map<number, THREE.BufferGeometry> {
    const out = new Map<number, THREE.BufferGeometry>()
    const mats = [...new Set(this.pieces.map((p) => p.mat))]
    for (const m of mats) out.set(m, this.build(this.pieces.filter((p) => p.mat === m)))
    return out
  }

  build(pieces: Piece[] = this.pieces): THREE.BufferGeometry {
    const byMat = [...pieces].sort((a, b) => a.mat - b.mat)
    let nv = 0
    let ni = 0
    for (const p of byMat) {
      nv += p.pos.length / 3
      ni += p.idx.length
    }
    const pos = new Float32Array(nv * 3)
    const nor = new Float32Array(nv * 3)
    const col = new Float32Array(nv * 3)
    const uv = new Float32Array(nv * 2)
    const si = new Uint16Array(nv * 4)
    const sw = new Float32Array(nv * 4)
    const idx = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni)
    const g = new THREE.BufferGeometry()
    let vo = 0
    let io = 0
    let groupStart = 0
    let curMat = byMat.length ? byMat[0].mat : 0
    const a = v3()
    const b = v3()
    const c = v3()
    for (const p of byMat) {
      if (p.mat !== curMat) {
        g.addGroup(groupStart, io - groupStart, curMat)
        groupStart = io
        curMat = p.mat
      }
      const n = p.pos.length / 3
      const pn = new Float32Array(n * 3)
      // 自動校正面方向
      const idxs = p.idx.slice()
      const axis = (p as Piece & { axis?: V3[] }).axis
      if (p.orient || axis) {
        let score = 0
        for (let t = 0; t < idxs.length; t += 3) {
          a.fromArray(p.pos, idxs[t] * 3)
          b.fromArray(p.pos, idxs[t + 1] * 3)
          c.fromArray(p.pos, idxs[t + 2] * 3)
          const cen = a.clone().add(b).add(c).divideScalar(3)
          const fn = b.clone().sub(a).cross(c.clone().sub(a))
          let ref = p.orient!
          if (axis) {
            // 管子：以最近的軸點為參考
            let best = Infinity
            for (const q of axis) {
              const d = q.distanceToSquared(cen)
              if (d < best) {
                best = d
                ref = q
              }
            }
          }
          score += Math.sign(fn.dot(cen.sub(ref)))
        }
        if (score < 0) for (let t = 0; t < idxs.length; t += 3) [idxs[t + 1], idxs[t + 2]] = [idxs[t + 2], idxs[t + 1]]
      }
      for (let t = 0; t < idxs.length; t += 3) {
        const i0 = idxs[t]
        const i1 = idxs[t + 1]
        const i2 = idxs[t + 2]
        a.fromArray(p.pos, i0 * 3)
        b.fromArray(p.pos, i1 * 3)
        c.fromArray(p.pos, i2 * 3)
        const fn = b.sub(a).cross(c.sub(a))
        for (const k of [i0, i1, i2]) {
          pn[k * 3] += fn.x
          pn[k * 3 + 1] += fn.y
          pn[k * 3 + 2] += fn.z
        }
      }
      // 焊接：同位置的頂點共用法線（接縫、極點）
      const map = new Map<string, number[]>()
      for (let k = 0; k < n; k++) {
        const key = `${Math.round(p.pos[k * 3] * 1e5)},${Math.round(p.pos[k * 3 + 1] * 1e5)},${Math.round(p.pos[k * 3 + 2] * 1e5)}`
        const l = map.get(key)
        if (l) l.push(k)
        else map.set(key, [k])
      }
      for (const l of map.values()) {
        if (l.length < 2) continue
        let x = 0
        let y = 0
        let z = 0
        for (const k of l) {
          x += pn[k * 3]
          y += pn[k * 3 + 1]
          z += pn[k * 3 + 2]
        }
        for (const k of l) {
          pn[k * 3] = x
          pn[k * 3 + 1] = y
          pn[k * 3 + 2] = z
        }
      }
      for (let k = 0; k < n; k++) {
        a.set(pn[k * 3], pn[k * 3 + 1], pn[k * 3 + 2])
        if (a.lengthSq() < 1e-20) a.set(0, 1, 0)
        a.normalize()
        nor.set([a.x, a.y, a.z], (vo + k) * 3)
      }
      pos.set(p.pos, vo * 3)
      col.set(p.col, vo * 3)
      uv.set(p.uv, vo * 2)
      si.set(p.si, vo * 4)
      sw.set(p.sw, vo * 4)
      for (let t = 0; t < idxs.length; t++) idx[io + t] = idxs[t] + vo
      vo += n
      io += idxs.length
    }
    if (io > groupStart) g.addGroup(groupStart, io - groupStart, curMat)
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3))
    g.setAttribute('color', new THREE.BufferAttribute(col, 3))
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4))
    g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4))
    g.setIndex(new THREE.BufferAttribute(idx, 1))
    g.computeBoundingSphere()
    g.computeBoundingBox()
    return g
  }
}

/** 骨架定義：名稱、父骨骼、綁定姿勢的世界座標 */
export interface BoneDef {
  name: string
  parent: number
  pos: V3
}

export function makeSkeleton(defs: BoneDef[]) {
  const bones = defs.map((d) => {
    const b = new THREE.Bone()
    b.name = d.name
    return b
  })
  defs.forEach((d, i) => {
    const local = d.parent >= 0 ? d.pos.clone().sub(defs[d.parent].pos) : d.pos.clone()
    bones[i].position.copy(local)
    if (d.parent >= 0) bones[d.parent].add(bones[i])
  })
  // 綁定姿勢：先更新矩陣，再由骨骼世界矩陣反推
  bones[0].updateMatrixWorld(true)
  const skeleton = new THREE.Skeleton(bones)
  return { bones, skeleton, rest: bones.map((b) => b.position.clone()) }
}
