import * as THREE from 'three'
import { barkMaps, bronzeMaps, clayMaps, goatMaps, goldMaps, hideMaps, linenMaps, ramMaps, sandMaps, silverMaps, woodMaps } from './pbr'
import { ceilingTex, wovenTex } from './textures'

/**
 * 共用材質。帳幕內部的材質（tag: interior）會改用「帳幕內部」的環境反射，
 * 這樣金器反射的是幽暗的金牆和燈光，而不是外面的天空。
 *
 * 全部都是 MeshStandardMaterial（路徑追蹤可用）。aoMap / roughnessMap / metalnessMap
 * 共用同一張 ORM 貼圖；roughness、metalness 數值是乘數。
 */
export const INTERIOR = new Set<THREE.MeshStandardMaterial>()

function std(p: THREE.MeshStandardMaterialParameters, interior = false) {
  const m = new THREE.MeshStandardMaterial(p)
  if (interior) INTERIOR.add(m)
  return m
}

/* ---------- 布料擺動：頂點 shader 小幅擺動（路徑追蹤時不擺動，幾何本身就有褶） ---------- */
export const SWAY = { uTime: { value: 0 } }

/**
 * 讓有 `aSway` 屬性（0 = 固定的上緣，1 = 自由的下緣）的布料隨風輕擺。
 * amp：下緣最大位移（公尺）。只改即時畫面的頂點位置，材質仍是 MeshStandardMaterial。
 */
export function withSway<T extends THREE.MeshStandardMaterial>(m: T, amp = 0.03): T {
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = SWAY.uTime
    shader.uniforms.uSwayAmp = { value: amp }
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
attribute float aSway;
uniform float uTime;
uniform float uSwayAmp;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
{
  vec4 wp = modelMatrix * vec4(position, 1.0);
  float ph = wp.x * 0.37 + wp.z * 0.29;
  float gust = 0.6 + 0.4 * sin(uTime * 0.31 + ph * 0.2);
  float s = sin(uTime * 1.6 + ph * 2.1) * 0.6 + sin(uTime * 2.7 + ph * 4.3 + 1.7) * 0.3 + sin(uTime * 4.1 + position.x * 9.0) * 0.1;
  transformed.z += aSway * aSway * uSwayAmp * gust * s;
}`,
      )
  }
  m.customProgramCacheKey = () => 'sway' + amp
  return m
}

export const mat = {
  bronze: std({ ...bronzeMaps([1, 1]), metalness: 1, roughness: 1 }),
  bronzeBig: std({ ...bronzeMaps([2, 1]), metalness: 1, roughness: 1 }),
  gold: std({ ...goldMaps([1, 1]), metalness: 1, roughness: 1 }),
  goldIn: std({ ...goldMaps([1, 1]), metalness: 1, roughness: 1 }, true),
  silver: std({ ...silverMaps([1, 1]), metalness: 1, roughness: 1 }),
  silverIn: std({ ...silverMaps([1, 1]), metalness: 1, roughness: 1 }, true),
  wood: std({ ...woodMaps([1, 3]), roughness: 1 }),
  ram: std({ ...ramMaps([2, 2]), roughness: 1 }),
  bread: std({ color: '#c99456', roughness: 0.95 }, true),
  water: new THREE.MeshPhysicalMaterial({ color: '#2d5563', metalness: 0, roughness: 0.03, transmission: 0, clearcoat: 1, clearcoatRoughness: 0.02 }),
  fire: std({ color: '#ff8a2a', emissive: '#ff5a00', emissiveIntensity: 6 }),
  flame: std({ color: '#ffd27a', emissive: '#ffb347', emissiveIntensity: 9 }, true),
  ember: std({ color: '#1e0f08', emissive: '#ff3c00', emissiveIntensity: 1.2, roughness: 1 }),
  smoke: new THREE.MeshStandardMaterial({ color: '#d8d2c8', transparent: true, opacity: 0.25, depthWrite: false }),
  /* ---- 建築與道具用 ---- */
  /** 麻繩／山羊毛繩 */
  rope: std({ color: '#a8916c', roughness: 0.95 }),
  /** 陶罐 */
  clay: std({ ...clayMaps([1, 1]), roughness: 1 }),
  /** 柴：樹皮 */
  bark: std({ ...barkMaps([1, 2]), roughness: 1 }),
  /** 柴：剖面（木心） */
  endgrain: std({ ...woodMaps([0.3, 0.3]), color: '#e8d2b4', roughness: 1 }),
  /** 爐灰 */
  ash: std({ ...sandMaps([1.5, 1.5]), color: '#8e8a86', roughness: 1 }),
  /** 草蓆 */
  mat: std({ ...linenMaps([6, 4]), color: '#c7a56b', roughness: 1 }),
}

/**
 * 建築用（合併幾何，帶頂點色做個別差異）。
 * 和 mat.* 分開，因為 vertexColors 的材質遇到沒有 color 屬性的幾何會變黑。
 */
export const smat = {
  wood: std({ ...woodMaps([1, 3]), roughness: 1, vertexColors: true }),
  bronze: std({ ...bronzeMaps([1, 1]), metalness: 1, roughness: 1, vertexColors: true }),
  silver: std({ ...silverMaps([1, 1]), metalness: 1, roughness: 1, vertexColors: true }),
  silverIn: std({ ...silverMaps([1, 1]), metalness: 1, roughness: 1, vertexColors: true }, true),
  gold: std({ ...goldMaps([1, 1]), metalness: 1, roughness: 1, vertexColors: true }),
  goldIn: std({ ...goldMaps([1, 1]), metalness: 1, roughness: 1, vertexColors: true }, true),
  rope: std({ color: '#a8916c', roughness: 0.95, vertexColors: true }),
  rock: std({ roughness: 0.82, vertexColors: true, flatShading: true }),
  clay: std({ ...clayMaps([1, 1]), roughness: 1, vertexColors: true }),
  bark: std({ ...barkMaps([1, 2]), roughness: 1, vertexColors: true }),
  endgrain: std({ ...woodMaps([0.3, 0.3]), color: '#e8d2b4', roughness: 1, vertexColors: true }),
}

/** 院子的白色細麻帷子：織紋＋頂點色（下緣的沙塵）＋輕擺 */
export const linen = (tile = 0.15) =>
  withSway(std({ ...linenMaps([1 / tile, 1 / tile]), vertexColors: true, roughness: 1, side: THREE.DoubleSide }), 0.035)

/** 帳幕外罩：海狗皮、染紅的公羊皮、山羊毛（tile = 一張貼圖的公尺數） */
// 海狗皮：皮塊的起伏要淺，太強會像石牆
export const hide = (tile = 2) =>
  std({ ...hideMaps([1 / tile, 1 / tile]), normalScale: new THREE.Vector2(0.4, 0.4), vertexColors: true, roughness: 1, side: THREE.DoubleSide })
export const ramSkin = (tile = 2) => std({ ...ramMaps([1 / tile, 1 / tile]), vertexColors: true, roughness: 1, side: THREE.DoubleSide })
export const goatHair = (tile = 1.6) => std({ ...goatMaps([1 / tile, 1 / tile]), vertexColors: true, roughness: 1, side: THREE.DoubleSide })

/** 包金的豎板（帳幕內部）：一塊板寬 1.5 肘、高 10 肘，貼圖約 0.4 m 一張 */
export const boards = (C: number) =>
  std(
    {
      ...goldMaps([(1.5 * C) / 0.4, (10 * C) / 0.4]),
      // 金箔貼在木頭上：錘痕要細而淺，否則近看像一片片的銅鱗
      normalScale: new THREE.Vector2(0.3, 0.3),
      metalness: 1,
      roughness: 1,
      vertexColors: true,
    },
    true,
  )

/**
 * 打破貼圖重複：同一張貼圖再用第二組縮放（約 0.37 倍、旋轉 37°）取樣，
 * 用低頻雜訊遮罩混合，並疊上低頻明暗；空中俯瞰時不會看到 3.5 m 的格紋。
 * 幾何要有 `aBlend` 屬性（0 = 完全用原本的貼圖，用在與 World 地面相接的邊緣，1 = 全效果）。
 * 路徑追蹤不吃 onBeforeCompile，會退回單一縮放（照樣可用）。
 */
export function antiTile<T extends THREE.MeshStandardMaterial>(m: T): T {
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aBlend;\nvarying float vBlend;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvBlend = aBlend;')
    const fn = `
varying float vBlend;
float atHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float atNoise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(atHash(i), atHash(i + vec2(1.0, 0.0)), f.x), mix(atHash(i + vec2(0.0, 1.0)), atHash(i + vec2(1.0, 1.0)), f.x), f.y);
}
vec2 atUV2(vec2 uv) { const float c = 0.7986, s = 0.6018; return mat2(c, -s, s, c) * uv * 0.37 + vec2(0.31, 0.17); }
float atMask(vec2 uv) {
  float n = atNoise(uv * 0.21) * 0.65 + atNoise(uv * 0.53 + 7.3) * 0.35;
  return smoothstep(0.35, 0.65, n) * vBlend;
}
float atShade(vec2 uv) { return 1.0 + ((atNoise(uv * 0.09 + 3.1) - 0.5) * 0.16 + (atNoise(uv * 0.031 + 1.7) - 0.5) * 0.12) * vBlend; }
`
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>' + fn)
      .replace(
        '#include <map_fragment>',
        `#ifdef USE_MAP
  vec4 atA = texture2D(map, vMapUv);
  vec4 atB = texture2D(map, atUV2(vMapUv));
  diffuseColor *= mix(atA, atB, atMask(vMapUv)) * vec4(vec3(atShade(vMapUv)), 1.0);
#endif`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#ifdef USE_NORMALMAP_TANGENTSPACE
  vec3 atNA = texture2D(normalMap, vNormalMapUv).xyz;
  vec3 atNB = texture2D(normalMap, atUV2(vNormalMapUv)).xyz;
  vec3 mapN = mix(atNA, atNB, atMask(vNormalMapUv)) * 2.0 - 1.0;
  mapN.xy *= normalScale;
  normal = normalize(tbn * mapN);
#else
#include <normal_fragment_maps>
#endif`,
      )
  }
  m.customProgramCacheKey = () => 'antiTile'
  return m
}

/** 院子／帳幕的沙地（與 World 的地面共用同一組貼圖與 uv；邊緣 aBlend → 0，接縫看不出來） */
export const floor = (interior = false) =>
  antiTile(std({ ...sandMaps([1200 / 3.5, 1200 / 3.5]), vertexColors: true, roughness: 1 }, interior))

/** 繡花的門簾／幔子：圖案貼圖＋細麻的法線與粗糙度 */
export const woven = (kind: 'gate' | 'door' | 'veil', size: [number, number] = [1, 1], interior = false) => {
  const lm = linenMaps([size[0] / 0.15, size[1] / 0.15])
  return std(
    {
      map: wovenTex(kind, 1),
      normalMap: lm.normalMap,
      normalScale: new THREE.Vector2(0.8, 0.8),
      roughnessMap: lm.roughnessMap,
      aoMap: lm.aoMap,
      vertexColors: true,
      roughness: 1,
      side: THREE.DoubleSide,
    },
    interior,
  )
}

/** 天花板：繡基路伯的內層幕幔（size = 帳幕內部的長、寬，公尺） */
export const ceiling = (size: [number, number] = [13.35, 4.45], C = 0.445) => {
  const lm = linenMaps([size[0] / 0.15, size[1] / 0.15])
  return std(
    {
      map: ceilingTex(size[0] / (8 * C)),
      normalMap: lm.normalMap,
      roughnessMap: lm.roughnessMap,
      aoMap: lm.aoMap,
      roughness: 1,
      side: THREE.DoubleSide,
    },
    true,
  )
}
