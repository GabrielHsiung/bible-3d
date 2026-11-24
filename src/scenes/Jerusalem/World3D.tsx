import { useEffect, useMemo, useReducer, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Html, OrbitControls } from '@react-three/drei'
import { Bloom, BrightnessContrast, EffectComposer, HueSaturation, N8AO, ToneMapping, Vignette } from '@react-three/postprocessing'
import { ToneMappingMode } from 'postprocessing'
import { Sky as SkyObj } from 'three/examples/jsm/objects/Sky.js'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { OrbitControls as OrbitImpl } from 'three-stdlib'
import * as THREE from 'three'
import { Sky } from '@react-three/drei'
import { sandMaps } from '../../pbr'
import { mulberry } from '../../rng'
import { useStore } from '../../store'
import { groundY, innerTerrain, innerTexture, outerTerrain, slopeAt, EXTENT } from './terrain'
import { L, MOUNT, WALL_FIRST, WALL_OTTOMAN, Z, inPoly, type P } from './geo'
import { STRUCTURES, TUNNEL, activeAt, type Structure } from './structures'
import { ensureBase, makeMaterial, type AnimUniforms, type MatKey } from './jmaterials'
import { useJ } from './state'
import { EVENTS, yearAt, type Focus } from './timeline'

export const isTouch = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches

/** 清晨的太陽：東南東、仰角約 17°；從橄欖山往西看時順光，影子往西北拉長 */
export const SUN_DIR = new THREE.Vector3(0.83, 0.29, 0.44).normalize()
const SHADOW_CENTER = new THREE.Vector3(-250, 0, 200)

/* ---------------- 天空、光、環境反射、雲 ---------------- */
export function Lights() {
  const quality = useStore((s) => s.quality)
  const { gl, scene } = useThree()
  const sun = useRef<THREE.DirectionalLight>(null)
  const mapSize = quality === 'high' ? (isTouch ? 2048 : 4096) : quality === 'medium' ? 2048 : 1024
  useEffect(() => {
    const s = sun.current
    if (!s) return
    s.target.position.copy(SHADOW_CENTER)
    s.target.updateMatrixWorld()
  }, [])
  // 環境反射：用同一個太陽位置的天空生成（金頂、鉛皮圓頂才有天光）
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl)
    const sky = new SkyObj()
    sky.scale.setScalar(1000)
    const u = sky.material.uniforms
    u.turbidity.value = 4
    u.rayleigh.value = 2.2
    u.mieCoefficient.value = 0.004
    u.mieDirectionalG.value = 0.85
    u.sunPosition.value.copy(SUN_DIR)
    const sc = new THREE.Scene()
    sc.add(sky)
    sc.add(new THREE.Mesh(new THREE.CircleGeometry(900, 16).rotateX(-Math.PI / 2).translate(0, -20, 0), new THREE.MeshBasicMaterial({ color: '#8f7b5e' })))
    const env = pmrem.fromScene(sc, 0.02).texture
    scene.environment = env
    scene.environmentIntensity = 0.35
    return () => {
      scene.environment = null
      env.dispose()
      pmrem.dispose()
    }
  }, [gl, scene])
  const sunPos = SHADOW_CENTER.clone().addScaledVector(SUN_DIR, 2600)
  return (
    <>
      <Sky distance={9000} sunPosition={SUN_DIR.toArray()} turbidity={4} rayleigh={2.2} mieCoefficient={0.004} mieDirectionalG={0.85} />
      <hemisphereLight args={['#b7c6dc', '#8a6a48', 0.32]} />
      <directionalLight
        ref={sun}
        key={mapSize}
        position={sunPos.toArray()}
        intensity={2.7}
        color="#ffcf98"
        castShadow
        shadow-mapSize={[mapSize, mapSize]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.25}
        shadow-camera-left={-1250}
        shadow-camera-right={1250}
        shadow-camera-top={1250}
        shadow-camera-bottom={-1250}
        shadow-camera-near={200}
        shadow-camera-far={5200}
      />
      {/* 空氣透視：清晨暖色的霾 */}
      <fogExp2 attach="fog" args={['#cdbfae', 0.00019]} />
    </>
  )
}

const NOISE = /* glsl */ `
float h12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vn(vec2 p){ vec2 i = floor(p); vec2 f = fract(p); vec2 u = f*f*(3.0-2.0*f);
  return mix(mix(h12(i), h12(i+vec2(1,0)), u.x), mix(h12(i+vec2(0,1)), h12(i+vec2(1,1)), u.x), u.y); }
float fbm(vec2 p){ float v=0.0, a=0.5; for(int i=0;i<5;i++){ v+=a*vn(p); p=p*2.03+vec2(1.7,9.2); a*=0.5;} return v; }
`

/** 雲：高空的積雲與卷雲，朝陽一側染成暖金色 */
export function Clouds() {
  const mesh = useRef<THREE.Mesh>(null)
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: { uTime: { value: 0 }, uSun: { value: SUN_DIR } },
        vertexShader: `varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: /* glsl */ `
          uniform float uTime; uniform vec3 uSun; varying vec3 vDir;
          ${NOISE}
          void main(){
            vec3 d = normalize(vDir);
            if (d.y < 0.0) discard;
            vec2 uv = d.xz / (d.y + 0.12);
            vec2 w = vec2(uTime * 0.004, uTime * 0.0015);
            float base = fbm(uv * 0.8 + w);
            float det = fbm(uv * 2.4 + w * 1.7 + 5.0);
            float c = smoothstep(0.52, 0.8, base * 0.85 + det * 0.3);
            float ci = smoothstep(0.5, 0.9, fbm(vec2(uv.x * 0.45, uv.y * 2.2) + w + 3.0)) * 0.3;
            float a = clamp(c * 0.85 + ci, 0.0, 1.0) * smoothstep(0.02, 0.22, d.y);
            if (a < 0.004) discard;
            float s = max(dot(d, uSun), 0.0);
            vec3 col = mix(vec3(0.66, 0.64, 0.68), vec3(1.0, 0.93, 0.84), smoothstep(0.3, 0.85, det));
            col += vec3(1.0, 0.68, 0.38) * pow(s, 6.0) * 0.9;
            col = mix(vec3(0.9, 0.84, 0.76), col, smoothstep(0.0, 0.3, d.y));
            gl_FragColor = vec4(col * 1.25, a);
          }`,
        transparent: true,
        depthWrite: false,
        fog: false,
        side: THREE.BackSide,
      }),
    [],
  )
  useFrame(({ camera, clock }) => {
    mat.uniforms.uTime.value = clock.elapsedTime
    mesh.current?.position.copy(camera.position)
  })
  return (
    <mesh ref={mesh} material={mat} renderOrder={-1} userData={{ noPathTrace: true }} frustumCulled={false}>
      <sphereGeometry args={[7000, 32, 16]} />
    </mesh>
  )
}

/* ---------------- 地形 ---------------- */
export function Terrain() {
  const inner = useMemo(() => innerTerrain(isTouch ? 3 : 2), [])
  const outer = useMemo(() => outerTerrain(isTouch ? 120 : 180), [])
  const innerMat = useMemo(() => {
    const d = sandMaps([700, 700])
    return new THREE.MeshStandardMaterial({ map: innerTexture(isTouch), normalMap: d.normalMap, normalScale: new THREE.Vector2(0.6, 0.6), roughness: 1 })
  }, [])
  const outerMat = useMemo(() => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }), [])
  return (
    <>
      <mesh geometry={inner} material={innerMat} receiveShadow castShadow />
      <mesh geometry={outer} material={outerMat} receiveShadow />
    </>
  )
}

/* ---------------- 建築群：依年代升起、焚毀、沉沒 ---------------- */
interface Anim {
  rise: number
  burn: number
  wait: number
  u: AnimUniforms
  group: THREE.Group | null
  built: boolean
}

function StructureMeshes({ s, u, onBuilt }: { s: Structure; u: AnimUniforms; onBuilt: (g: THREE.Group) => void }) {
  const group = useRef<THREE.Group>(null)
  const meshes = useMemo(() => {
    const parts = s.build()
    return (Object.entries(parts) as [MatKey, NonNullable<(typeof parts)[MatKey]>][])
      .filter(([, gb]) => !gb.empty)
      .map(([k, gb]) => ({ k, geo: gb.geometry(), mat: makeMaterial(k, u) }))
  }, [s, u])
  useEffect(() => {
    if (group.current) onBuilt(group.current)
    return () => meshes.forEach((m) => (m.geo.dispose(), m.mat.dispose()))
  }, [meshes, onBuilt])
  return (
    <group ref={group}>
      {meshes.map((m) => (
        <mesh key={m.k} geometry={m.geo} material={m.mat} castShadow={m.k !== 'water'} receiveShadow />
      ))}
    </group>
  )
}

/** 煙柱的貼圖（柔和的圓） */
function smokeTexture() {
  const N = 64
  const d = new Uint8Array(N * N * 4)
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const r = Math.hypot(x / N - 0.5, y / N - 0.5) * 2
      const a = Math.max(0, 1 - r) ** 2
      const k = (y * N + x) * 4
      d[k] = d[k + 1] = d[k + 2] = 255
      d[k + 3] = a * 255
    }
  const t = new THREE.DataTexture(d, N, N)
  t.needsUpdate = true
  return t
}

export function City() {
  const anims = useMemo(() => {
    const m = new Map<string, Anim>()
    for (const s of STRUCTURES) m.set(s.id, { rise: 0, burn: 0, wait: 0, u: { uRise: { value: 0 }, uBurn: { value: 0 }, uGlow: { value: 0 } }, group: null, built: false })
    return m
  }, [])
  // 哪些建築群已經建好幾何（第一次需要時才建）
  const builtRef = useRef(new Set<string>())
  const [, force] = useReducerTick()
  const smokeTex = useMemo(() => smokeTexture(), [])
  const smokes = useMemo(
    () =>
      STRUCTURES.flatMap((s) =>
        (s.smoke ?? []).map((p, i) => {
          const m = new THREE.SpriteMaterial({ map: smokeTex, color: '#3a3430', transparent: true, opacity: 0, depthWrite: false, fog: true })
          const sp = new THREE.Sprite(m)
          sp.position.set(p[0], groundY(p[0], p[1]) + 60, p[1])
          sp.scale.set(70, 140, 1)
          sp.userData = { noPathTrace: true, id: s.id, seed: i + p[0] * 0.01 }
          sp.visible = false
          return sp
        }),
      ),
    [smokeTex],
  )
  const callbacks = useMemo(() => {
    const m = new Map<string, (g: THREE.Group) => void>()
    for (const s of STRUCTURES)
      m.set(s.id, (g) => {
        const a = anims.get(s.id)!
        a.group = g
        g.visible = a.rise > 0.001
      })
    return m
  }, [anims])

  useFrame(({ clock }, dtRaw) => {
    const dt = Math.min(dtRaw, 0.1)
    const year = yearAt(useJ.getState().pos)
    let need = false
    for (const s of STRUCTURES) {
      const a = anims.get(s.id)!
      const on = activeAt(s, year)
      if (on) {
        a.wait += dt
        if (!builtRef.current.has(s.id)) {
          builtRef.current.add(s.id)
          need = true
        }
        if (a.wait >= (s.delay ?? 0)) {
          a.burn = Math.max(0, a.burn - dt * 2)
          a.rise = Math.min(1, a.rise + dt / 1.8)
        }
      } else {
        a.wait = 0
        if (a.rise > 0) {
          if (s.end === 'burn' && a.burn < 1) a.burn = Math.min(1, a.burn + dt / 1.1)
          else a.rise = Math.max(0, a.rise - dt / (s.end === 'burn' ? 2.0 : 1.4))
        } else a.burn = 0
      }
      const e = a.rise * a.rise * (3 - 2 * a.rise)
      a.u.uRise.value = e
      a.u.uBurn.value = a.burn
      a.u.uGlow.value = s.end === 'burn' && !on ? a.burn * e : 0
      if (a.group) a.group.visible = a.rise > 0.001
    }
    const t = clock.elapsedTime
    for (const sp of smokes) {
      const a = anims.get(sp.userData.id)!
      const k = a.u.uGlow.value
      const m = sp.material as THREE.SpriteMaterial
      m.opacity = k * 0.55
      sp.visible = k > 0.01
      const sd = sp.userData.seed
      sp.scale.set(70 + Math.sin(t * 0.7 + sd) * 10 + (1 - k) * 40, 150 + (1 - k) * 60, 1)
      m.rotation = Math.sin(t * 0.3 + sd) * 0.15
    }
    if (need) force()
  })

  return (
    <group>
      {STRUCTURES.filter((s) => builtRef.current.has(s.id)).map((s) => (
        <StructureMeshes key={s.id} s={s} u={anims.get(s.id)!.u} onBuilt={callbacks.get(s.id)!} />
      ))}
      {smokes.map((sp, i) => (
        <primitive key={i} object={sp} />
      ))}
    </group>
  )
}

function useReducerTick() {
  return useReducer((x: number) => x + 1, 0)
}

/* ---------------- 植物：橄欖樹、灌木 ---------------- */
function treeGeometry(kind: 'olive' | 'shrub') {
  const crown = new THREE.IcosahedronGeometry(1, 0).toNonIndexed()
  const parts: THREE.BufferGeometry[] = []
  const paint = (g: THREE.BufferGeometry, col: string, jitter: number) => {
    const c = new THREE.Color(col)
    const n = g.getAttribute('position').count
    const a = new Float32Array(n * 3)
    const rnd = mulberry(n)
    for (let i = 0; i < n; i++) {
      const k = 1 - jitter / 2 + rnd() * jitter
      a[i * 3] = c.r * k
      a[i * 3 + 1] = c.g * k
      a[i * 3 + 2] = c.b * k
    }
    g.setAttribute('color', new THREE.BufferAttribute(a, 3))
    g.deleteAttribute('uv')
    return g
  }
  if (kind === 'olive') {
    const pos = crown.getAttribute('position') as THREE.BufferAttribute
    const rnd = mulberry(3)
    for (let i = 0; i < pos.count; i++) pos.setXYZ(i, pos.getX(i) * (3.2 + rnd() * 0.4), pos.getY(i) * 2.2 + 4.2, pos.getZ(i) * (3.2 + rnd() * 0.4))
    crown.computeVertexNormals()
    parts.push(paint(crown, '#7d8558', 0.25))
    parts.push(paint(new THREE.CylinderGeometry(0.35, 0.55, 3, 5).translate(0, 1.5, 0).toNonIndexed(), '#5a4636', 0.1))
  } else {
    crown.scale(1.4, 0.8, 1.4).translate(0, 0.6, 0)
    crown.computeVertexNormals()
    parts.push(paint(crown, '#8a8a5a', 0.3))
  }
  return ensureBase(mergeGeometries(parts)!)
}

function scatter(seed: number, count: number, ok: (x: number, z: number) => boolean) {
  const rnd = mulberry(seed)
  const out: [number, number, number, number][] = []
  const { x0, x1, z0, z1 } = EXTENT
  let tries = 0
  while (out.length < count && tries < count * 25) {
    tries++
    const x = x0 + rnd() * (x1 - x0)
    const z = z0 + rnd() * (z1 - z0)
    if (!ok(x, z)) continue
    out.push([x, z, 0.7 + rnd() * 0.6, rnd() * Math.PI * 2])
  }
  return out
}

const URBAN: P[][] = [WALL_OTTOMAN, WALL_FIRST, MOUNT]
const LATER: P[][] = [Z.modernW, Z.modernN, Z.modernS, Z.silwan, Z.etTur, Z.north3]
const inAny = (x: number, z: number, ps: P[][]) => ps.some((p) => inPoly(x, z, p))
const nearGrove = (x: number, z: number) => {
  // 橄欖園集中在橄欖山西坡、汲淪谷與欣嫩谷的梯田
  const v = Math.sin(x * 0.011 + Math.sin(z * 0.007) * 2) * Math.sin(z * 0.013 + x * 0.004)
  return v > -0.1
}

interface VegSet {
  id: string
  spans: [number, number][]
  kind: 'olive' | 'shrub'
  pts: [number, number, number, number][]
}

export function Vegetation() {
  const sets = useMemo<VegSet[]>(() => {
    const n = isTouch ? 0.55 : 1
    const cem = (x: number, z: number) => x > 320 && x < 670 && z > -240 && z < 200
    const free = (x: number, z: number) => !inAny(x, z, URBAN) && slopeAt(x, z) < 0.55 && !cem(x, z) && !inPoly(x, z, Z.westS) && !inPoly(x, z, Z.david)
    return [
      { id: 'olive-always', spans: [[-2000, 9999]], kind: 'olive', pts: scatter(1, 5200 * n, (x, z) => free(x, z) && !inAny(x, z, LATER) && nearGrove(x, z)) },
      { id: 'olive-pre', spans: [[-2000, 1880]], kind: 'olive', pts: scatter(2, 3800 * n, (x, z) => free(x, z) && inAny(x, z, LATER) && nearGrove(x, z)) },
      { id: 'olive-cem', spans: [[-2000, 1300]], kind: 'olive', pts: scatter(3, 500 * n, (x, z) => cem(x, z) && slopeAt(x, z) < 0.5) },
      { id: 'shrub', spans: [[-2000, 9999]], kind: 'shrub', pts: scatter(4, 7000 * n, (x, z) => !inAny(x, z, URBAN) && !inAny(x, z, LATER)) },
    ]
  }, [])
  const geos = useMemo(() => ({ olive: treeGeometry('olive'), shrub: treeGeometry('shrub') }), [])
  const objs = useMemo(
    () =>
      sets.map((s) => {
        const u: AnimUniforms = { uRise: { value: 1 }, uBurn: { value: 0 }, uGlow: { value: 0 } }
        const mesh = new THREE.InstancedMesh(geos[s.kind], makeMaterial('foliage', u), s.pts.length)
        const m4 = new THREE.Matrix4()
        const q = new THREE.Quaternion()
        const col = new THREE.Color()
        const rnd = mulberry(s.pts.length)
        s.pts.forEach(([x, z, k, r], i) => {
          m4.compose(new THREE.Vector3(x, groundY(x, z) - 0.3, z), q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), r), new THREE.Vector3(k, k * (0.85 + rnd() * 0.3), k))
          mesh.setMatrixAt(i, m4)
          mesh.setColorAt(i, col.setHSL(0.14 + rnd() * 0.05, 0.2 + rnd() * 0.2, 0.42 + rnd() * 0.18).convertSRGBToLinear().multiplyScalar(2.2))
        })
        mesh.castShadow = s.kind === 'olive'
        mesh.receiveShadow = true
        mesh.computeBoundingSphere()
        return { s, mesh, u, rise: 1 }
      }),
    [sets, geos],
  )
  useFrame((_, dt) => {
    const year = yearAt(useJ.getState().pos)
    for (const o of objs) {
      const on = activeAt(o.s, year)
      o.rise = Math.max(0, Math.min(1, o.rise + (on ? dt / 1.6 : -dt / 1.2)))
      o.u.uRise.value = o.rise
      o.mesh.visible = o.rise > 0.001
    }
  })
  return (
    <>
      {objs.map((o) => (
        <primitive key={o.s.id} object={o.mesh} />
      ))}
    </>
  )
}

/* ---------------- 標示：希西家水道、各各他、地名 ---------------- */
export function Highlights() {
  const tube = useMemo(() => {
    const curve = new THREE.CatmullRomCurve3(TUNNEL.map(([x, z]) => new THREE.Vector3(x, groundY(x, z) + 3, z)))
    return new THREE.TubeGeometry(curve, 80, 2.2, 6)
  }, [])
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#7fe3ff', transparent: true, opacity: 0, depthWrite: false, fog: false }), [])
  const ring = useMemo(() => new THREE.MeshBasicMaterial({ color: '#ffd27a', transparent: true, opacity: 0, depthWrite: false, fog: false, side: THREE.DoubleSide }), [])
  const ringRef = useRef<THREE.Mesh>(null)
  useFrame(({ clock }) => {
    const st = useJ.getState()
    const ev = st.sel !== null ? EVENTS[st.sel] : null
    const tgt = ev?.highlight === 'tunnel' ? 0.85 : 0
    mat.opacity += (tgt * (0.75 + 0.25 * Math.sin(clock.elapsedTime * 3)) - mat.opacity) * 0.1
    const g = ev?.highlight === 'golgotha' ? 0.9 : 0
    ring.opacity += (g - ring.opacity) * 0.1
    if (ringRef.current) ringRef.current.scale.setScalar(1 + 0.15 * Math.sin(clock.elapsedTime * 2.4))
  })
  const [gx, gz] = L.sepulchre
  return (
    <>
      <mesh geometry={tube} material={mat} userData={{ noPathTrace: true }} renderOrder={5} />
      <mesh ref={ringRef} material={ring} position={[gx, groundY(gx, gz) + 6, gz]} rotation={[-Math.PI / 2, 0, 0]} userData={{ noPathTrace: true }} renderOrder={5}>
        <ringGeometry args={[22, 27, 32]} />
      </mesh>
    </>
  )
}

const PLACES: { name: string; at: P; y?: number; from?: number; to?: number }[] = [
  { name: '聖殿山（摩利亞山）', at: [20, -120], y: 60 },
  { name: '大衛城（俄斐勒）', at: [40, 620], y: 30 },
  { name: '西山（錫安山）', at: [-480, 520], y: 30 },
  { name: '橄欖山', at: L.olivesTop, y: 30 },
  { name: '汲淪谷', at: [300, -380], y: 20 },
  { name: '欣嫩谷', at: [-620, 960], y: 20 },
  { name: '泰羅邊谷', at: [-170, 340], y: 15 },
  { name: '基訓泉', at: L.gihon, y: 12 },
  { name: '西羅亞池', at: L.siloam, y: 12, from: -701 },
  { name: '客西馬尼', at: L.gethsemane, y: 14, from: -20 },
  { name: '各各他（傳統位置）', at: L.sepulchre, y: 40, from: -20, to: 335 },
  { name: '聖墓教堂', at: L.sepulchre, y: 45, from: 335 },
  { name: '安東尼亞堡', at: L.antonia, y: 70, from: -35, to: 70 },
  { name: '希律王宮', at: L.herodPalace, y: 40, from: -23, to: 70 },
  { name: '圓頂清真寺', at: [0, 0], y: 75, from: 691 },
]

export function Labels() {
  const show = useJ((s) => s.labels)
  const pos = useJ((s) => s.pos)
  const year = yearAt(pos)
  if (!show) return null
  return (
    <>
      {PLACES.filter((p) => (p.from ?? -9999) <= year && year < (p.to ?? 99999)).map((p) => (
        <Html key={p.name} position={[p.at[0], groundY(p.at[0], p.at[1]) + (p.y ?? 20), p.at[1]]} center zIndexRange={[2, 0]} style={{ pointerEvents: 'none' }}>
          <div className="jer-label">{p.name}</div>
        </Html>
      ))}
    </>
  )
}

/* ---------------- 鏡頭：從橄欖山上空俯瞰，選事件時飛過去 ---------------- */
export const DEFAULT_FOCUS: Focus = { x: -180, z: 120, dist: 1900, az: 6, el: 22 }

function camFor(f: Focus) {
  const az = (f.az * Math.PI) / 180
  const el = (f.el * Math.PI) / 180
  const target = new THREE.Vector3(f.x, groundY(f.x, f.z) + 10, f.z)
  const pos = target.clone().add(new THREE.Vector3(Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az)).multiplyScalar(f.dist))
  return { target, pos }
}

export function CameraRig({ initial }: { initial: Focus }) {
  const controls = useRef<OrbitImpl>(null)
  const { camera, size } = useThree()
  const frame = useRef(0)
  const off = useRef({ x: 0, y: 0 })
  const fly = useRef<{ t: number; fromT: THREE.Vector3; fromP: THREE.Vector3; toT: THREE.Vector3; toP: THREE.Vector3 } | null>(null)
  const lastN = useRef(0)
  useEffect(() => {
    const { target, pos } = camFor(initial)
    camera.position.copy(pos)
    controls.current?.target.copy(target)
    controls.current?.update()
    const c = controls.current
    const stop = () => (fly.current = null)
    c?.addEventListener('start', stop)
    return () => c?.removeEventListener('start', stop)
  }, [camera, initial])
  useFrame((_, dt) => {
    const c = controls.current
    if (!c) return
    const req = useJ.getState().fly
    if (req && req.n !== lastN.current) {
      lastN.current = req.n
      const { target, pos } = camFor(req.focus)
      fly.current = { t: 0, fromT: c.target.clone(), fromP: camera.position.clone(), toT: target, toP: pos }
    }
    const f = fly.current
    if (f) {
      f.t = Math.min(1, f.t + dt / 2.6)
      const e = f.t < 0.5 ? 4 * f.t ** 3 : 1 - (-2 * f.t + 2) ** 3 / 2
      c.target.lerpVectors(f.fromT, f.toT, e)
      // 飛行中略微抬高，像空拍機
      camera.position.lerpVectors(f.fromP, f.toP, e)
      camera.position.y += Math.sin(e * Math.PI) * f.fromP.distanceTo(f.toP) * 0.12
      if (f.t >= 1) fly.current = null
    }
    c.update()
    // 把注視點放在卡片與時間軸之外的空白區中央（setViewOffset 移動投影中心）
    if (++frame.current % 10 === 1) {
      const W = size.width
      const H = size.height
      const card = document.querySelector('.jer-card')?.getBoundingClientRect()
      const bar = document.querySelector('.jer-bar')?.getBoundingClientRect()
      let l = 0
      let t = 0
      const b = bar ? bar.top : H
      if (card && card.width > 0) {
        if (card.width < W * 0.7) l = card.right
        else t = card.bottom
      }
      const tx = -((l + W) / 2 - W / 2)
      const ty = -((t + b) / 2 - H / 2)
      off.current.x += (tx - off.current.x) * 0.5
      off.current.y += (ty - off.current.y) * 0.5
      const pc = camera as THREE.PerspectiveCamera
      pc.setViewOffset(W, H, off.current.x, off.current.y, W, H)
    }
    // 不要鑽到地底
    const g = groundY(camera.position.x, camera.position.z) + 25
    if (camera.position.y < g) camera.position.y = g
  })
  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enableDamping
      dampingFactor={0.08}
      minDistance={120}
      maxDistance={4200}
      maxPolarAngle={1.42}
      minPolarAngle={0.12}
      rotateSpeed={0.55}
      zoomSpeed={0.8}
      panSpeed={0.8}
      screenSpacePanning={false}
    />
  )
}

/* ---------------- 後製 ---------------- */
export function Effects() {
  const quality = useStore((s) => s.quality)
  return (
    <EffectComposer multisampling={quality === 'high' && !isTouch ? 4 : 0}>
      {quality === 'high' ? <N8AO halfRes quality="performance" aoRadius={14} distanceFalloff={1} intensity={1.6} color="#2a1c10" /> : <></>}
      <Bloom mipmapBlur luminanceThreshold={1.0} luminanceSmoothing={0.25} intensity={0.55} />
      <ToneMapping mode={ToneMappingMode.AGX} />
      <HueSaturation saturation={0.14} />
      <BrightnessContrast contrast={0.16} brightness={-0.03} />
      <Vignette offset={0.32} darkness={0.42} />
    </EffectComposer>
  )
}

/** 第一個畫面畫好後通知外框 */
export function ReadySignal({ onReady }: { onReady?: () => void }) {
  const n = useRef(0)
  const done = useRef(false)
  const scene = useThree((s) => s.scene)
  // 效能檢查用：window.__jerInfo() 統計目前可見的網格數（主畫面 draw call）與三角形數
  useEffect(() => {
    ;(window as unknown as { __jerInfo: () => object }).__jerInfo = () => {
      let meshes = 0
      let tris = 0
      scene.traverseVisible((o) => {
        const m = o as THREE.Mesh
        if (!m.isMesh) return
        meshes++
        const g = m.geometry
        const t = (g.index ? g.index.count : g.getAttribute('position').count) / 3
        tris += t * ((m as THREE.InstancedMesh).isInstancedMesh ? (m as THREE.InstancedMesh).count : 1)
      })
      return { meshes, tris: Math.round(tris) }
    }
  }, [scene])
  useFrame(() => {
    if (done.current) return
    n.current++
    if (n.current >= 3) {
      done.current = true
      onReady?.()
    }
  })
  return null
}
