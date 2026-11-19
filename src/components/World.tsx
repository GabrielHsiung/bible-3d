import { useEffect, useMemo, useRef } from 'react'
import { Sky } from '@react-three/drei'
import { CuboidCollider, RigidBody } from '@react-three/rapier'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { goatMaps, sandMaps } from '../pbr'
import { mulberry } from '../rng'
import { useStore } from '../store'

/** 上午的陽光：從東南方斜照（約 28° 仰角），會幕入口朝東，正面受光 */
export const SUN = new THREE.Vector3(0.78, 0.47, 0.41).normalize().multiplyScalar(120)
const isTouch = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches

export function Lights() {
  const quality = useStore((s) => s.quality)
  const sun = useRef<THREE.DirectionalLight>(null)
  const mapSize = quality === 'high' ? (isTouch ? 2048 : 4096) : quality === 'medium' ? 2048 : 1024
  // 品質改變時重建陰影貼圖
  useEffect(() => {
    const s = sun.current
    if (!s) return
    s.shadow.mapSize.set(mapSize, mapSize)
    s.shadow.map?.dispose()
    ;(s.shadow as { map: THREE.WebGLRenderTarget | null }).map = null
  }, [mapSize])
  return (
    <>
      <Sky distance={3000} sunPosition={SUN.toArray()} turbidity={2.6} rayleigh={2.4} mieCoefficient={0.003} mieDirectionalG={0.86} />
      <hemisphereLight args={['#bcd3f2', '#9b7a52', 0.45]} />
      <directionalLight
        ref={sun}
        position={SUN.toArray()}
        intensity={3.2}
        color="#ffe9cc"
        castShadow
        shadow-mapSize={[mapSize, mapSize]}
        shadow-bias={-0.0003}
        shadow-normalBias={0.03}
        shadow-camera-left={-45}
        shadow-camera-right={45}
        shadow-camera-top={45}
        shadow-camera-bottom={-45}
        shadow-camera-near={10}
        shadow-camera-far={300}
      />
      {/* 空氣透視：遠山偏藍、偏淡 */}
      <fogExp2 attach="fog" args={['#c6d0d8', 0.00042]} />
    </>
  )
}

/* ---------- 地形：近處平坦沙地，遠處是西乃的紅色花崗岩山 ---------- */
function hash(x: number, y: number) {
  const h = Math.sin(x * 127.1 + y * 311.7) * 43758.5453
  return h - Math.floor(h)
}
function vnoise(x: number, y: number) {
  const ix = Math.floor(x)
  const iy = Math.floor(y)
  let fx = x - ix
  let fy = y - iy
  fx = fx * fx * (3 - 2 * fx)
  fy = fy * fy * (3 - 2 * fy)
  const a = hash(ix, iy)
  const b = hash(ix + 1, iy)
  const c = hash(ix, iy + 1)
  const d = hash(ix + 1, iy + 1)
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy
}
function ridged(x: number, y: number) {
  let v = 0
  let amp = 0.55
  let f = 1
  for (let o = 0; o < 6; o++) {
    const n = 1 - Math.abs(vnoise(x * f, y * f) * 2 - 1)
    v += n * n * amp
    f *= 2.03
    amp *= 0.5
  }
  return v
}
const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

function terrainHeight(x: number, z: number) {
  const r = Math.hypot(x, z)
  const mask = smooth(420, 1300, r)
  // 低矮沙丘（遠一點才起伏，不影響走路的平地）
  const dunes = smooth(120, 260, r) * (Math.sin(x * 0.013 + vnoise(x * 0.004, z * 0.004) * 6) * 2.5 + vnoise(x * 0.01, z * 0.01) * 4)
  const mtn = mask * (ridged(x / 520 + 3.1, z / 520 - 1.7) * 300 + vnoise(x / 140, z / 140) * 25)
  return { h: dunes + mtn, mtn }
}

function displaced(size: number, seg: number, sink?: number) {
  const g = new THREE.PlaneGeometry(size, size, seg, seg)
  g.rotateX(-Math.PI / 2)
  const pos = g.attributes.position as THREE.BufferAttribute
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i)
    const z = pos.getZ(i)
    let y = terrainHeight(x, z).h
    // 外圈地形在內圈範圍內往下沉，避免和近處沙地重疊閃爍
    if (sink && Math.abs(x) < sink && Math.abs(z) < sink) y -= 4
    pos.setY(i, y)
  }
  g.computeVertexNormals()
  return g
}

/** 遠景地形的顏色貼圖：沙地 → 紅色花崗岩 */
function terrainColorMap(size: number) {
  const N = 512
  const data = new Uint8Array(N * N * 4)
  const sand = new THREE.Color('#b8956a')
  const rock = new THREE.Color('#8e4f3b')
  const rockDark = new THREE.Color('#563328')
  const c = new THREE.Color()
  for (let j = 0; j < N; j++)
    for (let i = 0; i < N; i++) {
      const x = (i / N - 0.5) * size
      const z = (j / N - 0.5) * size
      const { mtn } = terrainHeight(x, z)
      const rockAmt = smooth(15, 70, mtn)
      c.copy(sand).lerp(rock, rockAmt).lerp(rockDark, rockAmt * vnoise(x / 60, z / 60) * 0.7)
      c.convertLinearToSRGB()
      const k = ((N - 1 - j) * N + i) * 4
      data[k] = c.r * 255
      data[k + 1] = c.g * 255
      data[k + 2] = c.b * 255
      data[k + 3] = 255
    }
  const t = new THREE.DataTexture(data, N, N)
  t.colorSpace = THREE.SRGBColorSpace
  t.magFilter = THREE.LinearFilter
  t.minFilter = THREE.LinearMipmapLinearFilter
  t.generateMipmaps = true
  t.needsUpdate = true
  return t
}

export function Ground() {
  const NEAR = 1200
  const FAR = 5000
  const near = useMemo(() => displaced(NEAR, isTouch ? 120 : 200), [])
  const far = useMemo(() => displaced(FAR, isTouch ? 200 : 320, NEAR / 2 - 12), [])
  const nearMat = useMemo(() => new THREE.MeshStandardMaterial({ ...sandMaps([NEAR / 3.5, NEAR / 3.5]), roughness: 1 }), [])
  const farMat = useMemo(() => {
    const detail = sandMaps([FAR / 3.5, FAR / 3.5])
    return new THREE.MeshStandardMaterial({ map: terrainColorMap(FAR), normalMap: detail.normalMap, roughness: 1 })
  }, [])
  return (
    <>
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider args={[1000, 0.5, 1000]} position={[0, -0.5, 0]} />
      </RigidBody>
      <mesh geometry={near} material={nearMat} receiveShadow />
      <mesh geometry={far} material={farMat} receiveShadow />
    </>
  )
}

/** 貝都因式的黑山羊毛帳棚 */
function tentGeometry() {
  const shape = new THREE.Shape()
  shape.moveTo(-1, 0)
  shape.lineTo(-1, 0.45)
  shape.lineTo(-0.35, 0.78)
  shape.lineTo(0.35, 0.8)
  shape.lineTo(1, 0.5)
  shape.lineTo(1, 0)
  shape.lineTo(0.85, 0)
  shape.lineTo(0.85, 0.42)
  shape.lineTo(-0.85, 0.4)
  shape.lineTo(-0.85, 0)
  const g = new THREE.ExtrudeGeometry(shape, { depth: 1.6, bevelEnabled: false })
  g.translate(0, 0, -0.8)
  return g
}

/** 營地帳棚的位置（Atmosphere 的炊煙也用這份資料） */
export function campTents(C: number) {
  const rnd = mulberry(42)
  const out: { x: number; z: number; s: number; r: number; dark: boolean }[] = []
  let tries = 0
  while (out.length < 340 && tries < 9000) {
    tries++
    const x = (rnd() - 0.5) * 420
    const z = (rnd() - 0.5) * 380
    if (Math.abs(x) < 50 * C + 22 && Math.abs(z) < 25 * C + 22) continue
    if (x > 0 && Math.abs(z) < 9) continue
    if (out.some((t) => (t.x - x) ** 2 + (t.z - z) ** 2 < 70)) continue
    out.push({ x, z, s: 2.4 + rnd() * 1.8, r: rnd() * Math.PI, dark: rnd() > 0.45 })
  }
  return out
}

/** 以色列營地：帳棚圍繞會幕（佈局參民數記 2 章，位置為推測） */
export function Camp({ C }: { C: number }) {
  const tents = useMemo(() => campTents(C), [C])
  const merged = useMemo(() => {
    const base = tentGeometry()
    const m4 = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const up = new THREE.Vector3(0, 1, 0)
    const parts = { dark: [] as THREE.BufferGeometry[], light: [] as THREE.BufferGeometry[] }
    for (const t of tents) {
      m4.compose(new THREE.Vector3(t.x, 0, t.z), q.setFromAxisAngle(up, t.r), new THREE.Vector3(t.s, 2.3, t.s))
      parts[t.dark ? 'dark' : 'light'].push(base.clone().applyMatrix4(m4))
    }
    return { dark: mergeGeometries(parts.dark)!, light: mergeGeometries(parts.light)! }
  }, [tents])
  const goat = useMemo(() => new THREE.MeshStandardMaterial({ ...goatMaps([3, 2]), roughness: 1, side: THREE.DoubleSide }), [])
  const light = useMemo(() => new THREE.MeshStandardMaterial({ normalMap: goatMaps([3, 2]).normalMap, color: '#a08a6a', roughness: 1, side: THREE.DoubleSide }), [])
  return (
    <group>
      <RigidBody type="fixed" colliders={false}>
        {tents.map((t, i) => (
          <CuboidCollider key={i} args={[t.s, 1, t.s * 0.8]} position={[t.x, 1, t.z]} rotation={[0, t.r, 0]} />
        ))}
      </RigidBody>
      {/* 340 頂帳棚合併成兩個網格（深色／淺色），省下幾百個 draw call */}
      <mesh geometry={merged.dark} material={goat} castShadow receiveShadow />
      <mesh geometry={merged.light} material={light} castShadow receiveShadow />
    </group>
  )
}
