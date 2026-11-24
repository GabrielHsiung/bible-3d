/** 人物手上的小道具：木柴捆、水罐、手杖、石凳、磨石 */
import * as THREE from 'three'
import { mulberry } from '../../rng'
import { Builder, MAT_CLOTH, mixc, mulc, noise3, rgb, v3, type RGB } from './geo'

const geoCache = new Map<string, THREE.BufferGeometry>()
function cached(key: string, make: () => THREE.BufferGeometry) {
  if (!geoCache.has(key)) geoCache.set(key, make())
  return geoCache.get(key)!
}

function log(b: Builder, a: THREE.Vector3, c: THREE.Vector3, r: number, seed: number) {
  const bark = rgb(seed % 3 === 0 ? '#5a4632' : seed % 3 === 1 ? '#6e5a44' : '#4a3a2a')
  const inner = rgb('#b89a6a')
  const n = 6
  const pts: THREE.Vector3[] = []
  const rad: number[] = []
  for (let i = 0; i <= n; i++) {
    const t = i / n
    const p = a.clone().lerp(c, t)
    p.y += Math.sin(t * 3 + seed) * 0.012
    pts.push(p)
    rad.push(i === 0 || i === n ? r * 0.2 : r * (1 + 0.1 * Math.sin(t * 7 + seed)))
  }
  // 兩端收口（鋸開的斷面顏色較淺）
  pts.splice(1, 0, pts[0].clone().lerp(pts[1], 0.05))
  rad.splice(1, 0, r * 0.95)
  pts.splice(pts.length - 1, 0, pts[pts.length - 1].clone().lerp(pts[pts.length - 2], 0.05))
  rad.splice(rad.length - 1, 0, r * 0.95)
  b.tube(MAT_CLOTH, pts, rad, 8, {
    color: (s, an, p) => (s < 0.03 || s > 0.97 ? inner : mulc(bark, 0.8 + 0.3 * noise3(p.x * 40, p.y * 40 + an, p.z * 40))),
    weight: () => [[0, 1]],
    up: v3(0, 1, 0),
  })
}

/** 一捆木柴（約 0.7 公尺長），中心在原點，沿 x 軸 */
export function woodBundle() {
  return cached('wood', () => {
    const b = new Builder()
    const r = mulberry(5)
    const spots: [number, number][] = [
      [0, 0],
      [0.06, 0.01],
      [-0.06, 0.012],
      [0.03, 0.06],
      [-0.03, 0.062],
      [0.0, -0.05],
    ]
    spots.forEach(([z, y], i) => {
      const L = 0.62 + r() * 0.16
      const off = (r() - 0.5) * 0.08
      log(b, v3(-L / 2 + off, y, z), v3(L / 2 + off, y + (r() - 0.5) * 0.02, z + (r() - 0.5) * 0.03), 0.026 + r() * 0.012, i)
    })
    // 綁繩
    for (const x of [-0.18, 0.18]) {
      const pts: THREE.Vector3[] = []
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2
        pts.push(v3(x, 0.006 + Math.sin(a) * 0.085, Math.cos(a) * 0.1))
      }
      b.tube(MAT_CLOTH, pts, pts.map(() => 0.006), 4, { color: () => rgb('#8a7350'), weight: () => [[0, 1]], closed: true, up: v3(1, 0, 0), orient: false })
    }
    return b.build()
  })
}

/** 一堆木柴（祭壇旁） */
export function woodPile() {
  return cached('pile', () => {
    const b = new Builder()
    const r = mulberry(9)
    for (let layer = 0; layer < 4; layer++)
      for (let i = 0; i < 6 - layer; i++) {
        const L = 0.9 + r() * 0.3
        const z = (i - (5 - layer) / 2) * 0.1 + (r() - 0.5) * 0.02
        const y = 0.045 + layer * 0.08
        const rot = layer % 2 ? 0.25 : -0.15
        const a = v3(-L / 2, y, z).applyAxisAngle(v3(0, 1, 0), rot)
        const c = v3(L / 2, y, z + (r() - 0.5) * 0.06).applyAxisAngle(v3(0, 1, 0), rot)
        log(b, a, c, 0.035 + r() * 0.015, layer * 7 + i)
      }
    return b.build()
  })
}

/** 陶水罐（約 0.32 公尺高，底在原點） */
export function waterJar(size = 1) {
  return cached('jar' + size, () => {
    const b = new Builder()
    const prof: [number, number][] = [
      [0.0, 0.0],
      [0.05, 0.0],
      [0.09, 0.03],
      [0.13, 0.11],
      [0.135, 0.17],
      [0.11, 0.24],
      [0.06, 0.28],
      [0.045, 0.3],
      [0.055, 0.32],
      [0.048, 0.325],
      [0.04, 0.31],
    ]
    const clay: RGB = rgb('#b06a44')
    b.grid(
      MAT_CLOTH,
      20,
      prof.length - 1,
      (u, _v, _i, j) => {
        const a = u * Math.PI * 2
        const [r, y] = prof[j]
        const band = y > 0.16 && y < 0.2 ? 0.55 : 1
        return { p: v3(Math.sin(a) * r * size, y * size, Math.cos(a) * r * size), c: mixc(mulc(clay, band), rgb('#c89a70'), y < 0.05 ? 0.3 : 0), w: [[0, 1]] }
      },
      v3(0, 0.15 * size, 0),
    )
    return b.build()
  })
}

/** 牧杖／手杖，以握把為原點，長 1.55 */
export function staff() {
  return cached('staff', () => {
    const b = new Builder()
    const pts = [v3(0, -0.92, 0), v3(0.01, -0.5, 0.005), v3(-0.005, 0, 0), v3(0.0, 0.45, 0.01), v3(0.03, 0.6, 0.0), v3(0.08, 0.64, 0), v3(0.11, 0.6, 0)]
    b.tube(MAT_CLOTH, pts, [0.012, 0.014, 0.015, 0.015, 0.014, 0.013, 0.011], 6, { color: (s) => mulc(rgb('#6a4a2e'), 0.85 + 0.15 * Math.sin(s * 40)), weight: () => [[0, 1]], up: v3(0, 0, 1) })
    return b.build()
  })
}

/** 坐的石頭 */
export function seatStone(seed: number) {
  return cached('seat' + seed, () => {
    const b = new Builder()
    b.blob(
      MAT_CLOTH,
      14,
      10,
      (d) => {
        const n = noise3(d.x * 3 + seed, d.y * 3, d.z * 3)
        const p = v3(d.x * 0.28, Math.max(d.y, -0.2) * 0.22 + 0.2, d.z * 0.24).multiplyScalar(1 + n * 0.08)
        if (p.y > 0.38) p.y = 0.38 + (p.y - 0.38) * 0.3
        return { p, c: mulc(rgb('#8e7458'), 0.85 + n * 0.2), w: [[0, 1]] }
      },
      v3(0, 0.2, 0),
    )
    return b.build()
  })
}

/** 磨穀的鞍形石磨（下石＋手推石） */
export function quern() {
  return cached('quern', () => {
    const b = new Builder()
    b.blob(MAT_CLOTH, 14, 8, (d) => ({ p: v3(d.x * 0.22, Math.max(d.y, -0.3) * 0.09 + 0.06 - Math.max(0, d.y) * 0.05 * (1 - d.z * d.z), d.z * 0.32), c: mulc(rgb('#6e6458'), 0.9 + 0.15 * noise3(d.x * 5, d.y * 5, d.z * 5)), w: [[0, 1]] }), v3(0, 0.05, 0))
    b.blob(MAT_CLOTH, 10, 6, (d) => ({ p: v3(d.x * 0.15, d.y * 0.035 + 0.13, d.z * 0.06 + 0.04), c: rgb('#7a7064'), w: [[0, 1]] }), v3(0, 0.13, 0.04))
    // 麵粉
    b.blob(MAT_CLOTH, 8, 4, (d) => ({ p: v3(d.x * 0.08, Math.max(0, d.y) * 0.025 + 0.002, d.z * 0.08 - 0.36), c: rgb('#e8e0cc'), w: [[0, 1]] }), v3(0, 0, -0.36))
    return b.build()
  })
}
