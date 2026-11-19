/**
 * 程序生成的 PBR 材質（不用外部素材）。
 * 每種材質都有：顏色貼圖、粗糙度貼圖、法線貼圖，
 * 即時畫面和路徑追蹤（拍照模式）都能用。
 */
import * as THREE from 'three'
import { mulberry } from './rng'

type Height = Float32Array

/* ---------- 雜訊 ---------- */
function valueNoise(size: number, cells: number, seed: number): Height {
  const rnd = mulberry(seed)
  const grid = new Float32Array((cells + 1) * (cells + 1)).map(() => rnd())
  // 讓邊界可以無縫重複
  for (let i = 0; i <= cells; i++) {
    grid[i * (cells + 1) + cells] = grid[i * (cells + 1)]
    grid[cells * (cells + 1) + i] = grid[i]
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
      const a = grid[iy * (cells + 1) + ix]
      const b = grid[iy * (cells + 1) + ix + 1]
      const c = grid[(iy + 1) * (cells + 1) + ix]
      const d = grid[(iy + 1) * (cells + 1) + ix + 1]
      out[y * size + x] = a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy
    }
  return out
}

function fbm(size: number, base: number, octaves: number, seed: number): Height {
  const out = new Float32Array(size * size)
  let amp = 1
  let tot = 0
  for (let o = 0; o < octaves; o++) {
    const n = valueNoise(size, base << o, seed + o * 17)
    for (let i = 0; i < out.length; i++) out[i] += n[i] * amp
    tot += amp
    amp *= 0.5
  }
  for (let i = 0; i < out.length; i++) out[i] /= tot
  return out
}

/* ---------- 貼圖輸出 ---------- */
function toTexture(size: number, fill: (i: number, x: number, y: number) => [number, number, number], srgb: boolean, repeat: [number, number]) {
  const data = new Uint8Array(size * size * 4)
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const i = y * size + x
      const [r, g, b] = fill(i, x, y)
      data[i * 4] = Math.max(0, Math.min(255, r * 255))
      data[i * 4 + 1] = Math.max(0, Math.min(255, g * 255))
      data[i * 4 + 2] = Math.max(0, Math.min(255, b * 255))
      data[i * 4 + 3] = 255
    }
  const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat)
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(repeat[0], repeat[1])
  t.magFilter = THREE.LinearFilter
  t.minFilter = THREE.LinearMipmapLinearFilter
  t.generateMipmaps = true
  t.anisotropy = 8
  t.needsUpdate = true
  return t
}

function normalFromHeight(h: Height, size: number, strength: number, repeat: [number, number]) {
  return toTexture(
    size,
    (_i, x, y) => {
      const at = (xx: number, yy: number) => h[((yy + size) % size) * size + ((xx + size) % size)]
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength
      const len = Math.hypot(dx, dy, 1)
      return [(-dx / len) * 0.5 + 0.5, (dy / len) * 0.5 + 0.5, 1 / len]
    },
    false,
    repeat,
  )
}

const hex = (c: string) => {
  const col = new THREE.Color(c)
  return [col.r, col.g, col.b] as [number, number, number]
}
const mix3 = (a: number[], b: number[], t: number): [number, number, number] => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
]
// sRGB 數值 → 線性（只用於比較，不影響輸出）
const s = (v: number) => Math.min(1, Math.max(0, v))

export interface PBRMaps {
  map: THREE.Texture
  roughnessMap: THREE.Texture
  normalMap: THREE.Texture
}

const cache = new Map<string, PBRMaps>()
function cached(key: string, make: () => PBRMaps) {
  if (!cache.has(key)) cache.set(key, make())
  return cache.get(key)!
}

/** 敲打過的銅：鎚痕、氧化變暗的斑塊 */
export function bronzeMaps(repeat: [number, number] = [1, 1]) {
  return cached('bronze' + repeat, () => {
    const N = 256
    const big = fbm(N, 4, 4, 11)
    const fine = fbm(N, 32, 2, 12)
    // 鎚痕：隨機小凹坑
    const dents = new Float32Array(N * N)
    const rnd = mulberry(5)
    for (let k = 0; k < 420; k++) {
      const cx = rnd() * N
      const cy = rnd() * N
      const r = 3 + rnd() * 6
      for (let y = -r; y <= r; y++)
        for (let x = -r; x <= r; x++) {
          const d = Math.hypot(x, y) / r
          if (d > 1) continue
          const px = Math.floor((cx + x + N) % N)
          const py = Math.floor((cy + y + N) % N)
          dents[py * N + px] -= (1 - d * d) * 0.6
        }
    }
    const base = hex('#c08c55')
    const dark = hex('#7a5233')
    const bright = hex('#e0b07a')
    return {
      map: toTexture(N, (i) => {
        const t = big[i]
        const c = mix3(dark, base, s(t * 1.2 + 0.25))
        return mix3(c, bright, s((fine[i] - 0.55) * 1.5))
      }, true, repeat),
      roughnessMap: toTexture(N, (i) => {
        const r = 0.28 + (1 - big[i]) * 0.38 + fine[i] * 0.1
        return [r, r, r]
      }, false, repeat),
      normalMap: normalFromHeight(dents.map((d, i) => d + fine[i] * 0.4), N, 1.2, repeat),
    }
  })
}

/** 精金：些微錘紋、局部較霧 */
export function goldMaps(repeat: [number, number] = [1, 1]) {
  return cached('gold' + repeat, () => {
    const N = 256
    const big = fbm(N, 3, 3, 21)
    const fine = fbm(N, 24, 3, 22)
    const base = hex('#f0c25a')
    const deep = hex('#c48f2a')
    return {
      map: toTexture(N, (i) => mix3(deep, base, s(big[i] * 1.4 - 0.1)), true, repeat),
      roughnessMap: toTexture(N, (i) => {
        const r = 0.12 + fine[i] * 0.16 + (1 - big[i]) * 0.08
        return [r, r, r]
      }, false, repeat),
      normalMap: normalFromHeight(fine, N, 1.4, repeat),
    }
  })
}

/** 銀：較亮、較冷 */
export function silverMaps(repeat: [number, number] = [1, 1]) {
  return cached('silver' + repeat, () => {
    const N = 128
    const big = fbm(N, 3, 3, 31)
    const fine = fbm(N, 20, 2, 32)
    return {
      map: toTexture(N, (i) => mix3(hex('#9a9ca0'), hex('#e6e7ea'), s(big[i] * 1.3)), true, repeat),
      roughnessMap: toTexture(N, (i) => {
        const r = 0.18 + fine[i] * 0.2
        return [r, r, r]
      }, false, repeat),
      normalMap: normalFromHeight(fine, N, 1.0, repeat),
    }
  })
}

/** 撚的細麻：織紋＋垂墜皺褶（縱向） */
export function linenMaps(repeat: [number, number] = [1, 1]) {
  return cached('linen' + repeat, () => {
    const N = 512
    const n = fbm(N, 8, 3, 41)
    const h = new Float32Array(N * N)
    for (let y = 0; y < N; y++)
      for (let x = 0; x < N; x++) {
        const i = y * N + x
        // 皺褶：每 512px 約 6 道，加上雜訊擾動
        const fold = Math.sin((x / N) * Math.PI * 2 * 6 + n[i] * 3) * 0.5 + 0.5
        h[i] = fold
      }
    const base = hex('#ece4d1')
    const shade = hex('#cbbfa5')
    return {
      map: toTexture(N, (i) => mix3(shade, base, s(0.55 + h[i] * 0.45 + (n[i] - 0.5) * 0.3)), true, repeat),
      roughnessMap: toTexture(N, () => [0.92, 0.92, 0.92], false, repeat),
      normalMap: normalFromHeight(h, N, 2.2, repeat),
    }
  })
}

/** 沙地：風紋＋碎石 */
export function sandMaps(repeat: [number, number] = [1, 1]) {
  return cached('sand' + repeat, () => {
    const N = 512
    const n = fbm(N, 6, 4, 51)
    const grain = fbm(N, 128, 1, 52)
    const rnd = mulberry(53)
    const h = new Float32Array(N * N)
    for (let y = 0; y < N; y++)
      for (let x = 0; x < N; x++) {
        const i = y * N + x
        const ripple = Math.sin((y / N) * Math.PI * 2 * 14 + n[i] * 9) * 0.5 + 0.5
        h[i] = ripple * 0.35 + grain[i] * 0.4 + n[i] * 0.6
      }
    // 小碎石
    const pebble = new Float32Array(N * N)
    for (let k = 0; k < 220; k++) {
      const cx = rnd() * N
      const cy = rnd() * N
      const r = 1 + rnd() * 2.5
      for (let y = -3; y <= 3; y++)
        for (let x = -3; x <= 3; x++) {
          const d = Math.hypot(x, y) / r
          if (d > 1) continue
          const i = Math.floor((cy + y + N) % N) * N + Math.floor((cx + x + N) % N)
          pebble[i] = Math.max(pebble[i], Math.sqrt(1 - d * d))
        }
    }
    const light = hex('#d2b48a')
    const mid = hex('#b38d61')
    const dark = hex('#7d5f40')
    return {
      map: toTexture(N, (i) => {
        let c = mix3(mid, light, s(n[i] * 1.4 - 0.15 + grain[i] * 0.25))
        if (pebble[i] > 0) c = mix3(c, dark, pebble[i] * 0.3)
        return c
      }, true, repeat),
      roughnessMap: toTexture(N, (i) => {
        const r = 0.9 + grain[i] * 0.1 - pebble[i] * 0.2
        return [r, r, r]
      }, false, repeat),
      normalMap: normalFromHeight(h.map((v, i) => v + pebble[i] * 1.5), N, 3, repeat),
    }
  })
}

/** 皂莢木（洋槐木）：木紋 */
export function woodMaps(repeat: [number, number] = [1, 1]) {
  return cached('wood' + repeat, () => {
    const N = 256
    const n = fbm(N, 4, 4, 61)
    const h = new Float32Array(N * N)
    for (let y = 0; y < N; y++)
      for (let x = 0; x < N; x++) {
        const i = y * N + x
        h[i] = Math.sin((x / N) * Math.PI * 2 * 9 + n[i] * 10) * 0.5 + 0.5
      }
    return {
      map: toTexture(N, (i) => mix3(hex('#5b3a22'), hex('#8e6440'), h[i] * 0.7 + n[i] * 0.3), true, repeat),
      roughnessMap: toTexture(N, (i) => {
        const r = 0.6 + h[i] * 0.25
        return [r, r, r]
      }, false, repeat),
      normalMap: normalFromHeight(h, N, 1.5, repeat),
    }
  })
}

/** 海狗皮（外罩）：皮革紋 */
export function hideMaps(repeat: [number, number] = [1, 1]) {
  return cached('hide' + repeat, () => {
    const N = 256
    const n = fbm(N, 6, 5, 71)
    const cells = fbm(N, 40, 2, 72)
    const h = n.map((v, i) => v * 0.6 + Math.abs(cells[i] - 0.5) * 1.2)
    return {
      map: toTexture(N, (i) => mix3(hex('#3a2e25'), hex('#6a5646'), s(n[i] * 1.5 - 0.2)), true, repeat),
      roughnessMap: toTexture(N, (i) => {
        const r = 0.7 + cells[i] * 0.25
        return [r, r, r]
      }, false, repeat),
      normalMap: normalFromHeight(h, N, 4, repeat),
    }
  })
}

/** 山羊毛布（營地帳棚） */
export function goatMaps(repeat: [number, number] = [1, 1]) {
  return cached('goat' + repeat, () => {
    const N = 256
    const n = fbm(N, 8, 3, 81)
    const h = new Float32Array(N * N)
    for (let y = 0; y < N; y++)
      for (let x = 0; x < N; x++) {
        const i = y * N + x
        h[i] = (Math.sin(y * 0.8) * 0.5 + 0.5) * 0.4 + ((y % 48) < 2 ? -1 : 0) + n[i] * 0.5
      }
    return {
      map: toTexture(N, (i) => mix3(hex('#1f1a17'), hex('#4a3f37'), s(n[i] * 1.5 - 0.1)), true, repeat),
      roughnessMap: toTexture(N, () => [0.95, 0.95, 0.95], false, repeat),
      normalMap: normalFromHeight(h, N, 3, repeat),
    }
  })
}
