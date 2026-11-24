/**
 * 人物共用材質（全部人共用，頂點顏色決定各部位顏色）。
 * 都是 MeshPhysical／MeshStandard，路徑追蹤拍照也能用。
 */
import * as THREE from 'three'
import { mulberry } from '../../rng'

function heightToNormal(h: Float32Array, N: number, strength: number) {
  const data = new Uint8Array(N * N * 4)
  const at = (x: number, y: number) => h[((y + N) % N) * N + ((x + N) % N)]
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength
      const l = Math.hypot(dx, dy, 1)
      const i = (y * N + x) * 4
      data[i] = (-dx / l) * 127.5 + 127.5
      data[i + 1] = (dy / l) * 127.5 + 127.5
      data[i + 2] = (1 / l) * 127.5 + 127.5
      data[i + 3] = 255
    }
  const t = new THREE.DataTexture(data, N, N)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.magFilter = THREE.LinearFilter
  t.minFilter = THREE.LinearMipmapLinearFilter
  t.generateMipmaps = true
  t.anisotropy = 4
  t.needsUpdate = true
  return t
}

/** 平紋手織布：經緯線上下交錯（連續、無斷階）＋粗細不均的紗（slub） */
function weaveNormal() {
  const N = 256
  const T = 32 // 每張貼圖的紗線數（偶數，才能無縫）
  const rnd = mulberry(77)
  const slubU = Array.from({ length: T }, () => 0.8 + rnd() * 0.4)
  const slubV = Array.from({ length: T }, () => 0.8 + rnd() * 0.4)
  const h = new Float32Array(N * N)
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const u = (x / N) * T
      const v = (y / N) * T
      const su = slubU[Math.floor(u) % T]
      const sv = slubV[Math.floor(v) % T]
      // 經線（沿 v）與緯線（沿 u）的圓截面，交錯上下
      const warp = Math.sin(Math.PI * (u % 1)) ** 0.6 * su
      const weft = Math.sin(Math.PI * (v % 1)) ** 0.6 * sv
      const over = Math.cos(Math.PI * u) * Math.cos(Math.PI * v)
      h[y * N + x] = 0.5 * (warp + weft) + 0.35 * over
    }
  return heightToNormal(h, N, 0.9)
}

/** 皮膚：細小毛孔與紋理 */
function poreNormal() {
  const N = 128
  const rnd = mulberry(91)
  const h = new Float32Array(N * N)
  for (let k = 0; k < 900; k++) {
    const cx = rnd() * N
    const cy = rnd() * N
    const r = 0.8 + rnd() * 1.2
    for (let y = Math.floor(cy - 3); y <= cy + 3; y++)
      for (let x = Math.floor(cx - 3); x <= cx + 3; x++) {
        const d = Math.hypot(x - cx, y - cy)
        if (d < r * 2) h[((y + N) % N) * N + ((x + N) % N)] -= Math.exp(-(d * d) / (r * r)) * 0.6
      }
  }
  for (let i = 0; i < h.length; i++) h[i] += (rnd() - 0.5) * 0.15
  return heightToNormal(h, N, 1.2)
}

let cache: { skin: THREE.MeshPhysicalMaterial; cloth: THREE.MeshPhysicalMaterial; gold: THREE.MeshStandardMaterial; wood: THREE.MeshStandardMaterial; clay: THREE.MeshStandardMaterial; wool: THREE.MeshPhysicalMaterial } | null = null

export function peopleMaterials() {
  if (cache) return cache
  const weave = weaveNormal()
  // 布料：紗線約 1–2 公釐（UV 以公尺×6 計），遠處由 mipmap 自然變平
  const clothWeave = weave.clone()
  clothWeave.repeat.set(3, 3)
  clothWeave.needsUpdate = true
  const pores = poreNormal()
  const facePores = pores.clone()
  facePores.repeat.set(3, 3)
  facePores.needsUpdate = true
  const skin = new THREE.MeshPhysicalMaterial({
    vertexColors: true,
    roughness: 0.56,
    normalMap: facePores,
    normalScale: new THREE.Vector2(0.06, 0.06),
    // 次表面散射的近似：偏紅的 sheen 讓邊緣透出暖色
    sheen: 0.45,
    sheenColor: new THREE.Color('#d0603e'),
    sheenRoughness: 0.45,
    specularIntensity: 0.55,
    specularColor: new THREE.Color('#ffe2d0'),
  })
  const cloth = new THREE.MeshPhysicalMaterial({
    vertexColors: true,
    roughness: 0.93,
    normalMap: clothWeave,
    normalScale: new THREE.Vector2(0.45, 0.45),
    sheen: 0.6,
    sheenColor: new THREE.Color('#9a9488'),
    sheenRoughness: 0.75,
    specularIntensity: 0.3,
    side: THREE.DoubleSide,
  })
  const gold = new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 1, roughness: 0.3 })
  const wood = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, normalMap: weave, normalScale: new THREE.Vector2(0.8, 0.8) })
  const clay = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, normalMap: pores, normalScale: new THREE.Vector2(0.4, 0.4) })
  const wool = new THREE.MeshPhysicalMaterial({
    vertexColors: true,
    roughness: 1,
    normalMap: weave,
    normalScale: new THREE.Vector2(1.2, 1.2),
    sheen: 1,
    sheenColor: new THREE.Color('#e8e0d0'),
    sheenRoughness: 0.9,
    side: THREE.DoubleSide,
  })
  cache = { skin, cloth, gold, wood, clay, wool }
  return cache
}
