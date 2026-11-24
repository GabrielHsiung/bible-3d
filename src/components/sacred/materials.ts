/**
 * 聖器專用材質。全部是 MeshStandardMaterial / MeshPhysicalMaterial，路徑追蹤可以拍。
 * 帳幕內的金器加入 INTERIOR，讓它反射帳幕內部（金牆＋燈火），不是外面的天空。
 */
import * as THREE from 'three'
import { INTERIOR } from '../../materials'
import { bronzeMaps, goldMaps, woodMaps } from '../../pbr'
import { rng } from './geom'

function interior<T extends THREE.MeshStandardMaterial>(m: T) {
  INTERIOR.add(m)
  return m
}

/* ---------- 程序貼圖 ---------- */
function noise2(size: number, cells: number, seed: number) {
  const r = rng(seed)
  const g = new Float32Array((cells + 1) * (cells + 1)).map(() => r())
  for (let i = 0; i <= cells; i++) {
    g[i * (cells + 1) + cells] = g[i * (cells + 1)]
    g[cells * (cells + 1) + i] = g[i]
  }
  const out = new Float32Array(size * size)
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const gx = (x / size) * cells
      const gy = (y / size) * cells
      const ix = Math.floor(gx)
      const iy = Math.floor(gy)
      let fx = gx - ix
      let fy = gy - iy
      fx = fx * fx * (3 - 2 * fx)
      fy = fy * fy * (3 - 2 * fy)
      const a = g[iy * (cells + 1) + ix]
      const b = g[iy * (cells + 1) + ix + 1]
      const c = g[(iy + 1) * (cells + 1) + ix]
      const d = g[(iy + 1) * (cells + 1) + ix + 1]
      out[y * size + x] = a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy
    }
  return out
}
function fbm(size: number, base: number, oct: number, seed: number) {
  const out = new Float32Array(size * size)
  let amp = 1
  let tot = 0
  for (let o = 0; o < oct; o++) {
    const n = noise2(size, base << o, seed + o * 31)
    for (let i = 0; i < out.length; i++) out[i] += n[i] * amp
    tot += amp
    amp *= 0.5
  }
  return out.map((v) => v / tot)
}
function tex(size: number, fill: (i: number) => [number, number, number], srgb: boolean, repeat: [number, number] = [1, 1]) {
  const d = new Uint8Array(size * size * 4)
  for (let i = 0; i < size * size; i++) {
    const [r, g, b] = fill(i)
    d[i * 4] = Math.max(0, Math.min(255, r * 255))
    d[i * 4 + 1] = Math.max(0, Math.min(255, g * 255))
    d[i * 4 + 2] = Math.max(0, Math.min(255, b * 255))
    d[i * 4 + 3] = 255
  }
  const t = new THREE.DataTexture(d, size, size, THREE.RGBAFormat)
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(...repeat)
  t.minFilter = THREE.LinearMipmapLinearFilter
  t.magFilter = THREE.LinearFilter
  t.generateMipmaps = true
  t.needsUpdate = true
  return t
}
const sat = (v: number) => Math.min(1, Math.max(0, v))

/** 炭火的裂縫發光：脊線狀的雜訊 → 細細的亮紅裂紋 */
function emberGlow(repeat: [number, number], seed: number, bias = 0) {
  const N = 256
  const a = fbm(N, 6, 4, seed)
  const b = fbm(N, 3, 3, seed + 7)
  return tex(
    N,
    (i) => {
      const ridge = 1 - Math.abs(a[i] - 0.5) * 2 // 0..1，越接近 1 越在裂縫上
      const k = sat(Math.pow(ridge, 10) * 1.8 * sat(b[i] * 1.8 - 0.35 + bias))
      return [k, k * 0.62, k * 0.26]
    },
    true,
    repeat,
  )
}
/** 炭面的顏色：黑炭、灰白的灰燼 */
function charMap(repeat: [number, number], seed: number) {
  const N = 256
  const a = fbm(N, 8, 4, seed)
  const b = fbm(N, 2, 3, seed + 3)
  return tex(
    N,
    (i) => {
      const ash = sat((b[i] - 0.6) * 4) * 0.3
      const v = 0.025 + a[i] * 0.045
      return [v + ash * 0.5, v + ash * 0.47, v + ash * 0.43]
    },
    true,
    repeat,
  )
}

/** 水面的漣漪法線 */
function rippleNormal() {
  const N = 256
  const h = fbm(N, 6, 4, 91)
  return tex(
    N,
    (i) => {
      const x = i % N
      const y = (i / N) | 0
      const dx = h[y * N + ((x + 1) % N)] - h[y * N + ((x - 1 + N) % N)]
      const dy = h[((y + 1) % N) * N + x] - h[((y - 1 + N) % N) * N + x]
      const s = 3
      const nx = -dx * s
      const ny = -dy * s
      const l = Math.hypot(nx, ny, 1)
      return [(nx / l) * 0.5 + 0.5, (ny / l) * 0.5 + 0.5, 1 / l / 2 + 0.5]
    },
    false,
    [3, 3],
  )
}

/** 陳設餅：烤過的表皮，邊緣較深 */
function breadMap() {
  const N = 128
  const a = fbm(N, 6, 4, 101)
  const b = fbm(N, 24, 2, 102)
  return tex(N, (i) => {
    const t = a[i] * 0.7 + b[i] * 0.3
    return [0.62 + t * 0.25, 0.42 + t * 0.2, 0.22 + t * 0.12]
  }, true)
}

/** 金的顏色：接近真實金子的反射色（偏黃、不偏紅），帶一點錘打出來的深淺 */
function goldColor(seed: number) {
  const N = 256
  const a = fbm(N, 3, 3, seed)
  const b = fbm(N, 20, 2, seed + 5)
  const c0 = [0.86, 0.7, 0.4]
  const c1 = [1.0, 0.86, 0.56]
  return tex(N, (i) => {
    const t = sat(a[i] * 1.3 - 0.15 + (b[i] - 0.5) * 0.25)
    return [c0[0] + (c1[0] - c0[0]) * t, c0[1] + (c1[1] - c0[1]) * t, c0[2] + (c1[2] - c0[2]) * t]
  }, true)
}
function goldMat(repeat: [number, number], seed: number, roughness = 1) {
  const g = goldMaps(repeat)
  const map = goldColor(seed)
  map.repeat.set(...repeat)
  return interior(new THREE.MeshStandardMaterial({ map, normalMap: g.normalMap, roughnessMap: g.roughnessMap, metalness: 1, roughness }))
}

/* ---------- 材質 ---------- */
export const sacredMat = {
  /** 精金（錘打過）：帳幕內 */
  gold: goldMat([2, 2], 301),
  /** 燈臺的金：錘紋更細、更亮 */
  goldFine: goldMat([4, 4], 311, 0.85),
  /** 燔祭壇的銅：有使用痕跡 */
  bronze: new THREE.MeshStandardMaterial({ ...bronzeMaps([2, 2]), color: '#e8d2b8', metalness: 1, roughness: 1.15 }),
  /** 被煙燻黑的銅（壇口、壇內） */
  bronzeSoot: new THREE.MeshStandardMaterial({ ...bronzeMaps([3, 3]), color: '#6b5444', metalness: 0.85, roughness: 1.6 }),
  /** 洗濯盆：用婦女的銅鏡做的（出 38:8），較光亮 */
  bronzePolished: new THREE.MeshStandardMaterial({ ...bronzeMaps([1, 1]), color: '#ffe6c8', metalness: 1, roughness: 0.6 }),
  /** 燒焦的木柴，裂縫中透出火光 */
  log: new THREE.MeshStandardMaterial({
    ...woodMaps([1, 2]),
    color: '#5a4436',
    roughness: 1,
    emissive: '#ff9a40',
    emissiveMap: emberGlow([1, 2], 201, -0.1),
    emissiveIntensity: 2.2,
  }),
  /** 炭床：黑炭、灰燼、發紅的裂縫 */
  coals: new THREE.MeshStandardMaterial({
    map: charMap([2, 2], 211),
    roughness: 1,
    emissive: '#ff9a40',
    emissiveMap: emberGlow([2, 2], 213, 0.15),
    emissiveIntensity: 2.4,
  }),
  /** 香壇上的小炭火 */
  incenseCoals: interior(
    new THREE.MeshStandardMaterial({
      map: charMap([1, 1], 221),
      roughness: 1,
      emissive: '#ff9a40',
      emissiveMap: emberGlow([1, 1], 223, 0.25),
      emissiveIntensity: 1.4,
    }),
  ),
  wick: interior(new THREE.MeshStandardMaterial({ color: '#2a1d14', roughness: 1 })),
  /** 橄欖油（出 27:20 清橄欖油） */
  oil: interior(new THREE.MeshStandardMaterial({ color: '#6b4d10', metalness: 0, roughness: 0.05 })),
  bread: interior(new THREE.MeshStandardMaterial({ map: breadMap(), roughness: 0.9 })),
  /** 洗濯盆的水 */
  water: new THREE.MeshPhysicalMaterial({
    color: '#3a5a5c',
    metalness: 0,
    roughness: 0.04,
    normalMap: rippleNormal(),
    normalScale: new THREE.Vector2(0.35, 0.35),
    clearcoat: 1,
    clearcoatRoughness: 0.03,
    transparent: true,
    opacity: 0.82,
  }),
  /** 乳香（陳設餅上） */
  frankincense: interior(new THREE.MeshStandardMaterial({ color: '#e8dcb8', roughness: 0.6 })),
}
