/**
 * 程序建模的羊（阿瓦西肥尾羊：白色捲毛、褐色臉、下垂的長耳）與黑山羊。
 * 蒙皮骨架：身體、脖子、頭、四條腿、尾巴。同一種羊共用幾何體。
 */
import * as THREE from 'three'
import { Builder, MAT_CLOTH, clamp, makeSkeleton, mixc, mulc, noise3, rgb, sstep, v3, type BoneDef, type Infl, type V3 } from './geo'

export const SB = { BODY: 0, NECK: 1, HEAD: 2, FL: 3, FR: 4, BL: 5, BR: 6, TAIL: 7 } as const
export type SheepKind = 'awassi' | 'cream' | 'goat'

export function sheepBones(kind: SheepKind): BoneDef[] {
  const goat = kind === 'goat'
  const h = goat ? 1.04 : 1
  return [
    { name: 'body', parent: -1, pos: v3(0, 0.5 * h, 0) },
    { name: 'neck', parent: 0, pos: v3(0, 0.58 * h, 0.3) },
    { name: 'head', parent: 1, pos: v3(0, 0.76 * h, 0.5) },
    { name: 'fl', parent: 0, pos: v3(0.09, 0.42 * h, 0.24) },
    { name: 'fr', parent: 0, pos: v3(-0.09, 0.42 * h, 0.24) },
    { name: 'bl', parent: 0, pos: v3(0.09, 0.42 * h, -0.26) },
    { name: 'br', parent: 0, pos: v3(-0.09, 0.42 * h, -0.26) },
    { name: 'tail', parent: 0, pos: v3(0, 0.5 * h, -0.36) },
  ]
}

const cache = new Map<SheepKind, THREE.BufferGeometry>()
export function sheepGeometry(kind: SheepKind) {
  if (cache.has(kind)) return cache.get(kind)!
  const goat = kind === 'goat'
  const defs = sheepBones(kind)
  const hgt = goat ? 1.04 : 1
  const b = new Builder()
  const wool = rgb(kind === 'cream' ? '#d6c4a2' : goat ? '#2a2420' : '#e2d8c6')
  const dirt = rgb(goat ? '#1a1612' : '#9a8566')
  const face = rgb(kind === 'awassi' ? '#6e4a30' : kind === 'cream' ? '#e0d2b8' : '#24201c')
  const C0 = v3(0, 0.52 * hgt, -0.01)
  const bodyW = (p: V3): Infl => {
    const fn = sstep(0.18, 0.34, p.z)
    const tl = sstep(-0.3, -0.42, p.z) * sstep(0.55, 0.42, p.y)
    return [
      [SB.BODY, 1 - fn * 0.6 - tl * 0.5],
      [SB.NECK, fn * 0.6],
      [SB.TAIL, tl * 0.5],
    ]
  }
  // 身體：毛茸茸的橢球，毛團起伏
  b.blob(
    MAT_CLOTH,
    28,
    18,
    (d) => {
      const lump = goat ? noise3(d.x * 6, d.y * 6, d.z * 6) * 0.006 : (noise3(d.x * 9, d.y * 9, d.z * 9) * 0.6 + noise3(d.x * 23 + 3, d.y * 23, d.z * 23) * 0.4) * 0.022
      const rx = goat ? 0.15 : 0.19
      const ry = goat ? 0.17 : 0.2
      const rz = goat ? 0.38 : 0.4
      // 背較平、肚子較圓
      let y = d.y * ry
      if (d.y > 0) y *= 0.85
      const p = v3(d.x * (rx + lump), y + lump * Math.sign(d.y), d.z * (rz + lump)).add(C0)
      const c = mixc(mulc(wool, 0.88 + 0.25 * clamp(lump * 30 + 0.4)), dirt, sstep(0.0, -0.9, d.y) * 0.55)
      return { p, c, w: bodyW(p) }
    },
    C0,
  )
  // 肥尾（阿瓦西羊）或山羊短尾
  {
    const tc = goat ? v3(0, 0.6 * hgt, -0.38) : v3(0, 0.44, -0.42)
    const r = goat ? [0.025, 0.06, 0.025] : [0.1, 0.13, 0.07]
    b.blob(MAT_CLOTH, 12, 8, (d) => ({ p: v3(d.x * r[0], d.y * r[1], d.z * r[2]).add(tc), c: mixc(wool, dirt, sstep(0.2, -1, d.y) * 0.5), w: [[SB.TAIL, 0.8], [SB.BODY, 0.2]] }), tc)
  }
  // 脖子
  const n0 = defs[SB.NECK].pos
  const h0 = defs[SB.HEAD].pos
  b.tube(MAT_CLOTH, [n0.clone().add(v3(0, -0.02, -0.06)), n0.clone().lerp(h0, 0.5), h0.clone().add(v3(0, -0.01, 0.02))], [goat ? 0.07 : 0.11, goat ? 0.06 : 0.085, goat ? 0.05 : 0.06], 12, {
    color: (s) => mixc(mulc(wool, 0.95), face, sstep(0.6, 1, s) * (kind === 'awassi' ? 0.8 : 0.3)),
    weight: (s) => [[SB.NECK, 1 - s * 0.6], [SB.HEAD, s * 0.6]],
    up: v3(0, 1, 0),
  })
  // 頭：往前下方的長臉
  {
    const hc = h0.clone().add(v3(0, -0.035, 0.09))
    b.blob(
      MAT_CLOTH,
      18,
      12,
      (d) => {
        // 前窄後寬，鼻樑隆起
        const front = clamp(d.z)
        const rx = (goat ? 0.05 : 0.058) * (1 - front * 0.45)
        const ry = (goat ? 0.055 : 0.06) * (1 - front * 0.3)
        const p = v3(d.x * rx, d.y * ry + (d.z > 0 ? -d.z * 0.03 : 0), d.z * (goat ? 0.11 : 0.12)).add(hc)
        let c = face
        // 眼睛
        const eye = Math.abs(d.x) > 0.6 && d.y > 0.15 && d.y < 0.5 && d.z > -0.1 && d.z < 0.3
        if (eye) c = rgb('#0c0a08')
        if (d.z > 0.85) c = mulc(face, 0.55) // 鼻頭
        if (!goat && d.z < -0.4 && d.y > -0.2) c = mixc(face, wool, 0.7)
        return { p, c, w: [[SB.HEAD, 1]] }
      },
      hc,
    )
    // 耳朵
    for (const sx of [1, -1]) {
      const e0 = hc.clone().add(v3(sx * 0.05, 0.025, -0.05))
      const pts = goat
        ? [e0, e0.clone().add(v3(sx * 0.05, 0.0, -0.02)), e0.clone().add(v3(sx * 0.09, -0.015, -0.02))]
        : [e0, e0.clone().add(v3(sx * 0.035, -0.04, 0.0)), e0.clone().add(v3(sx * 0.05, -0.1, 0.015)), e0.clone().add(v3(sx * 0.052, -0.13, 0.02))]
      b.tube(MAT_CLOTH, pts, pts.map((_p, i) => [0.026 * (i === pts.length - 1 ? 0.3 : 1), 0.008] as [number, number]), 6, {
        color: () => mulc(face, 0.95),
        weight: () => [[SB.HEAD, 1]],
        up: v3(sx, 0, 0),
      })
    }
    if (goat) {
      // 往後彎的角
      for (const sx of [1, -1]) {
        const a0 = hc.clone().add(v3(sx * 0.025, 0.055, -0.04))
        const pts = [a0]
        for (let i = 1; i <= 5; i++) {
          const t = i / 5
          pts.push(a0.clone().add(v3(sx * 0.02 * t, 0.06 * Math.sin(t * 2.2), -0.12 * t)))
        }
        b.tube(MAT_CLOTH, pts, pts.map((_p, i) => 0.016 * (1 - i / 6)), 6, { color: () => rgb('#5a5046'), weight: () => [[SB.HEAD, 1]], up: v3(1, 0, 0) })
      }
      // 鬍子
      const bc = hc.clone().add(v3(0, -0.06, 0.06))
      b.tube(MAT_CLOTH, [bc, bc.clone().add(v3(0, -0.04, -0.005)), bc.clone().add(v3(0, -0.06, -0.01))], [0.012, 0.01, 0.002], 5, { color: () => rgb('#1a1612'), weight: () => [[SB.HEAD, 1]], up: v3(0, 0, 1) })
    }
  }
  // 腿
  for (const [bone, sx, sz] of [
    [SB.FL, 1, 1],
    [SB.FR, -1, 1],
    [SB.BL, 1, -1],
    [SB.BR, -1, -1],
  ] as const) {
    const top = defs[bone].pos.clone()
    const knee = v3(top.x * 0.95, 0.22, top.z + (sz > 0 ? 0.01 : -0.03))
    const foot = v3(top.x * 0.95, 0.0, top.z + 0.01)
    const pts = [top.clone().add(v3(0, 0.06, 0)), top, knee, foot.clone().add(v3(0, 0.04, 0)), foot.clone().add(v3(0, 0.005, 0.008)), foot.clone().add(v3(0, 0.0, 0.01))]
    b.tube(MAT_CLOTH, pts, [goat ? 0.04 : 0.06, goat ? 0.032 : 0.045, 0.019, 0.016, 0.019, 0.004], 8, {
      color: (s, _a, p) => (p.y < 0.035 ? rgb('#1c1612') : s < 0.25 && !goat ? mixc(wool, dirt, 0.4) : mixc(face, rgb('#3a2e24'), 0.3)),
      weight: (s) => (s < 0.15 ? [[SB.BODY, 0.6], [bone, 0.4]] : [[bone, 1]]),
      up: v3(0, 0, 1),
    })
    void sx
  }
  const g = b.build()
  cache.set(kind, g)
  return g
}

export function makeSheep(kind: SheepKind, mat: THREE.Material) {
  const { bones, skeleton, rest } = makeSkeleton(sheepBones(kind))
  const group = new THREE.Group()
  group.add(bones[0])
  const mesh = new THREE.SkinnedMesh(sheepGeometry(kind), mat)
  mesh.bind(skeleton, new THREE.Matrix4())
  mesh.castShadow = true
  mesh.receiveShadow = true
  mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.45, 0.1), 0.8)
  group.add(mesh)
  return { group, bones, rest, skeleton, mesh }
}

/** 羊的動畫：walk 0..1、graze 0..1（低頭吃草） */
export function animateSheep(bones: THREE.Bone[], rest: THREE.Vector3[], phase: number, walk: number, graze: number, t: number) {
  const s = Math.sin(phase)
  const a = 0.42 * walk
  bones[SB.FL].rotation.x = s * a
  bones[SB.BR].rotation.x = s * a
  bones[SB.FR].rotation.x = -s * a
  bones[SB.BL].rotation.x = -s * a
  bones[SB.BODY].position.y = rest[SB.BODY].y + Math.abs(Math.cos(phase)) * 0.015 * walk
  bones[SB.BODY].rotation.z = Math.sin(phase) * 0.03 * walk
  // 低頭吃草時前腳略彎、身體前傾
  bones[SB.BODY].rotation.x = graze * 0.08
  bones[SB.NECK].rotation.x = graze * 1.25 + Math.sin(t * 0.7) * 0.05 * (1 - graze) - 0.1 * (1 - graze)
  bones[SB.HEAD].rotation.x = graze * 0.75 + Math.sin(t * 5) * 0.06 * graze
  bones[SB.HEAD].rotation.y = Math.sin(t * 0.4) * 0.3 * (1 - graze)
  bones[SB.TAIL].rotation.x = Math.sin(t * 3.1) * 0.08
}
