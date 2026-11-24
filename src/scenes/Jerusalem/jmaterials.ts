/**
 * 耶路撒冷場景的材質：程序生成的方石（Jerusalem stone）、灰泥、金、鉛皮、琉璃磚、植物。
 * 每個建築群用自己的一份材質（uniform 各自獨立），shader 注入：
 *   uRise  0→1 升起（每 7 m 一塊，高度不一，看起來像一塊塊砌起來或崩塌）
 *   uBurn  0→1 燒黑
 *   uGlow  火光（餘燼的橘紅）
 */
import * as THREE from 'three'
import { mulberry } from '../../rng'

function dataTex(N: number, fill: (x: number, y: number) => [number, number, number], srgb: boolean) {
  const d = new Uint8Array(N * N * 4)
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const [r, g, b] = fill(x, y)
      const k = (y * N + x) * 4
      d[k] = Math.max(0, Math.min(255, r * 255))
      d[k + 1] = Math.max(0, Math.min(255, g * 255))
      d[k + 2] = Math.max(0, Math.min(255, b * 255))
      d[k + 3] = 255
    }
  const t = new THREE.DataTexture(d, N, N)
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.magFilter = THREE.LinearFilter
  t.minFilter = THREE.LinearMipmapLinearFilter
  t.generateMipmaps = true
  t.anisotropy = 4
  t.needsUpdate = true
  return t
}

let ashlar: { map: THREE.Texture; normalMap: THREE.Texture } | null = null
/** 方石牆：一列約 0.5 m（貼圖 4 m 一個循環，8 列），石塊長短不一，灰縫凹陷 */
function ashlarMaps() {
  if (ashlar) return ashlar
  const N = 256
  const rows = 8
  const rh = N / rows
  const rnd = mulberry(77)
  const h = new Float32Array(N * N)
  const tone = new Float32Array(N * N)
  for (let r = 0; r < rows; r++) {
    let x = Math.floor(rnd() * 40)
    const cuts: number[] = []
    while (x < N + 60) {
      cuts.push(x)
      x += 28 + Math.floor(rnd() * 56)
    }
    const tones = cuts.map(() => rnd())
    for (let y = r * rh; y < (r + 1) * rh; y++)
      for (let xx = 0; xx < N; xx++) {
        let ci = cuts.length - 1
        for (let c = 0; c < cuts.length; c++) if (cuts[c] <= xx) ci = c
        const dEdgeY = Math.min(y - r * rh, (r + 1) * rh - 1 - y)
        let dEdgeX = 99
        for (const c of cuts) dEdgeX = Math.min(dEdgeX, Math.abs(((xx - c) % N + N) % N), Math.abs(((c - xx) % N + N) % N))
        const e = Math.min(dEdgeX, dEdgeY)
        const i = y * N + xx
        h[i] = e < 1.5 ? 0 : Math.min(1, e / 5) * 0.8 + rnd() * 0.2
        tone[i] = tones[ci] * 0.6 + rnd() * 0.15
      }
  }
  const map = dataTex(N, (x, y) => {
    const i = y * N + x
    const t = 0.84 + tone[i] * 0.22 - (h[i] < 0.05 ? 0.18 : 0)
    return [t, t * 0.97, t * 0.9]
  }, true)
  const normalMap = dataTex(N, (x, y) => {
    const at = (xx: number, yy: number) => h[((yy + N) % N) * N + ((xx + N) % N)]
    const dx = (at(x + 1, y) - at(x - 1, y)) * 2
    const dy = (at(x, y + 1) - at(x, y - 1)) * 2
    const l = Math.hypot(dx, dy, 1)
    return [(-dx / l) * 0.5 + 0.5, (dy / l) * 0.5 + 0.5, 1 / l]
  }, false)
  ashlar = { map, normalMap }
  return ashlar
}

let plaster: THREE.Texture | null = null
function plasterMap() {
  if (plaster) return plaster
  const rnd = mulberry(91)
  plaster = dataTex(128, () => {
    const t = 0.88 + rnd() * 0.12
    return [t, t * 0.98, t * 0.94]
  }, true)
  return plaster
}

let tiles: THREE.Texture | null = null
/** 圓頂清真寺外牆的藍綠色磁磚（遠看的色塊與窗列） */
function tileMap() {
  if (tiles) return tiles
  const N = 128
  const rnd = mulberry(5)
  tiles = dataTex(N, (x, y) => {
    const band = y % 64 < 40
    const win = band && x % 32 > 12 && x % 32 < 20 && y % 64 > 14 && y % 64 < 34
    if (win) return [0.12, 0.12, 0.16]
    const n = rnd() * 0.08
    return band ? [0.16 + n, 0.38 + n, 0.62 + n] : [0.85 + n, 0.83 + n, 0.78 + n]
  }, true)
  tiles.repeat.set(0.5, 0.5)
  return tiles
}

export type MatKey = 'stone' | 'plaster' | 'gold' | 'bronze' | 'lead' | 'tile' | 'foliage' | 'roof' | 'water'

export interface AnimUniforms {
  uRise: { value: number }
  uBurn: { value: number }
  uGlow: { value: number }
}

export function makeMaterial(key: MatKey, u: AnimUniforms) {
  let m: THREE.MeshStandardMaterial
  switch (key) {
    case 'stone':
      m = new THREE.MeshStandardMaterial({ ...ashlarMaps(), vertexColors: true, roughness: 0.88, normalScale: new THREE.Vector2(0.8, 0.8) })
      break
    case 'plaster':
      m = new THREE.MeshStandardMaterial({ map: plasterMap(), vertexColors: true, roughness: 0.95 })
      break
    case 'gold':
      m = new THREE.MeshStandardMaterial({ color: '#e9b955', metalness: 1, roughness: 0.28 })
      break
    case 'bronze':
      m = new THREE.MeshStandardMaterial({ color: '#b07a45', metalness: 1, roughness: 0.4 })
      break
    case 'lead':
      m = new THREE.MeshStandardMaterial({ color: '#8f9396', metalness: 0.7, roughness: 0.45, vertexColors: true })
      break
    case 'tile':
      m = new THREE.MeshStandardMaterial({ map: tileMap(), roughness: 0.35 })
      break
    case 'foliage':
      m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true })
      break
    case 'roof':
      m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 })
      break
    case 'water':
      m = new THREE.MeshStandardMaterial({ color: '#3d6b73', roughness: 0.08, metalness: 0.1 })
      break
  }
  m.onBeforeCompile = (s) => {
    s.uniforms.uRise = u.uRise
    s.uniforms.uBurn = u.uBurn
    s.uniforms.uGlow = u.uGlow
    s.vertexShader = s.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        attribute float aBase;
        uniform float uRise;
        varying float vH;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        float jit = fract(sin(dot(floor(position.xz / 7.0), vec2(12.9898, 78.233))) * 43758.5453);
        float rr = clamp(uRise * 1.35 - jit * 0.35, 0.0, 1.0);
        vH = transformed.y - aBase;
        transformed.y = aBase + vH * rr;`,
      )
    s.fragmentShader = s.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uBurn;
        uniform float uGlow;
        varying float vH;`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.07, 0.06, 0.05), uBurn * 0.85);`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        float flick = 0.6 + 0.4 * sin(vH * 1.7 + gl_FragCoord.x * 0.05);
        totalEmissiveRadiance += vec3(1.0, 0.32, 0.06) * uGlow * flick * (1.0 - smoothstep(2.0, 14.0, vH)) * 3.0;`,
      )
  }
  m.customProgramCacheKey = () => 'jer-' + key
  return m
}

/** 沒有 aBase 的幾何（例如 InstancedMesh 的單件）補上 0 */
export function ensureBase(g: THREE.BufferGeometry) {
  if (!g.getAttribute('aBase')) g.setAttribute('aBase', new THREE.Float32BufferAttribute(new Float32Array(g.getAttribute('position').count), 1))
  return g
}
