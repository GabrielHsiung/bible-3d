/**
 * 寫實的火：噪聲扭曲的淚滴形火焰（加法混合、不寫深度、會閃爍），
 * 加上火星粒子、柔和煙霧、會閃爍的點光源。
 * 這些都是自訂 shader，路徑追蹤不支援 → userData.noPathTrace。
 * 單位跟著外層 group（聖器裡是「肘」）。
 */
import { useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { rng } from './geom'

/** 所有火、煙共用一個時間 uniform */
const uTime = { value: 0 }
function useFireClock() {
  useFrame(({ clock }) => {
    uTime.value = clock.elapsedTime
  })
}

const NOISE = /* glsl */ `
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p){
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { v += a * vnoise(p); p = p * 2.03 + 17.1; a *= 0.5; }
  return v;
}
`

/* ================= 火焰 ================= */
const flameVert = /* glsl */ `
uniform float uTime;
uniform float uSeed;
varying vec2 vUv;
varying float vSeed;
void main() {
  vUv = uv;
  mat4 M = modelMatrix;
  float seed = uSeed;
  #ifdef USE_INSTANCING
    M = modelMatrix * instanceMatrix;
    seed += float(gl_InstanceID) * 1.731;
  #endif
  vSeed = seed;
  vec3 c = (M * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  float sx = length(M[0].xyz);
  float sy = length(M[1].xyz);
  // 閃爍：高度忽大忽小
  sy *= 1.0 + 0.09 * sin(uTime * 11.0 + seed * 5.0) + 0.06 * sin(uTime * 23.0 + seed * 2.0);
  // 圓柱式 billboard：繞 Y 軸轉向相機
  vec3 toCam = cameraPosition - c;
  toCam.y = 0.0;
  vec3 right = length(toCam) > 1e-4 ? normalize(vec3(toCam.z, 0.0, -toCam.x)) : vec3(1.0, 0.0, 0.0);
  vec3 w = c + right * position.x * sx + vec3(0.0, 1.0, 0.0) * position.y * sy;
  gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
}
`
const flameFrag = /* glsl */ `
uniform float uTime;
uniform float uIntensity;
uniform float uBlue;
uniform float uTurb;
uniform vec3 uCore;
uniform vec3 uMid;
uniform vec3 uEdge;
varying vec2 vUv;
varying float vSeed;
${NOISE}
void main() {
  float t = uTime + vSeed * 7.13;
  float y = vUv.y;
  float sway = (sin(t * 2.3 + vSeed * 3.0) * 0.6 + sin(t * 5.1 + vSeed) * 0.4) * 0.12 * y * y;
  float n1 = fbm(vec2(vUv.x * 2.5 + vSeed * 5.0, y * 2.2 - t * 2.8));
  float n2 = fbm(vec2(vUv.x * 5.0 - vSeed * 3.0, y * 5.0 - t * 5.5));
  float x = (vUv.x - 0.5) * 2.0 + sway + (n1 - 0.5) * 0.8 * uTurb * y;
  // 淚滴形：底部圓、往上收尖
  float w = 0.62 * smoothstep(-0.06, 0.24, y) * pow(max(1.0 - y, 0.0), 0.7) + 0.002;
  float body = 1.0 - abs(x) / w;
  body *= smoothstep(0.0, 0.07, y);
  // 上半部斷裂成一條條火舌
  body -= (n2 - 0.45) * 1.1 * uTurb * smoothstep(0.2, 1.0, y);
  float flick = 0.9 + 0.1 * sin(t * 19.0) * sin(t * 7.3 + 1.0);
  body = clamp(body * flick, 0.0, 1.0);
  float a = smoothstep(0.0, 0.32, body);
  float core = smoothstep(0.3, 0.85, body) * (1.0 - smoothstep(0.1, 0.62, y));
  vec3 col = mix(uEdge, uMid, smoothstep(0.03, 0.5, body));
  col = mix(col, uCore, core);
  // 火苗根部的藍色（油燈）
  float blue = uBlue * (1.0 - smoothstep(0.03, 0.16, y)) * smoothstep(0.0, 0.5, body);
  col = mix(col, vec3(0.15, 0.3, 1.0) * 0.7, blue * 0.8);
  a *= 1.0 - smoothstep(0.72, 1.0, y);
  gl_FragColor = vec4(col * uIntensity, a);
}
`

export interface FlameProps {
  /** 每一團火：位置（底部中心）、寬、高 */
  items: { p: [number, number, number]; w: number; h: number }[]
  /** 根部藍色的量（油燈 1、柴火 0） */
  blue?: number
  /** 擾動量（大火 1.2，小火苗 0.5） */
  turbulence?: number
  intensity?: number
  seed?: number
}

const flameGeo = new THREE.PlaneGeometry(1, 1, 1, 1).translate(0, 0.5, 0)

/** 火焰（InstancedMesh：多團火一次畫完） */
export function Flames({ items, blue = 0, turbulence = 1, intensity = 1, seed = 0 }: FlameProps) {
  useFireClock()
  const ref = useRef<THREE.InstancedMesh>(null)
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: flameVert,
        fragmentShader: flameFrag,
        uniforms: {
          uTime,
          uSeed: { value: seed },
          uIntensity: { value: intensity },
          uBlue: { value: blue },
          uTurb: { value: turbulence },
          uCore: { value: new THREE.Color(1.0, 0.86, 0.6).multiplyScalar(2.6) },
          uMid: { value: new THREE.Color(1.0, 0.4, 0.06).multiplyScalar(2.0) },
          uEdge: { value: new THREE.Color(0.55, 0.07, 0.01).multiplyScalar(1.2) },
        },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        toneMapped: false,
      }),
    [blue, turbulence, intensity, seed],
  )
  useLayoutEffect(() => {
    const m = ref.current
    if (!m) return
    const o = new THREE.Object3D()
    items.forEach((it, i) => {
      o.position.set(...it.p)
      o.scale.set(it.w, it.h, 1)
      o.updateMatrix()
      m.setMatrixAt(i, o.matrix)
    })
    m.instanceMatrix.needsUpdate = true
    m.computeBoundingSphere()
  }, [items])
  return (
    <instancedMesh
      ref={ref}
      args={[flameGeo, material, items.length]}
      userData={{ noPathTrace: true }}
      frustumCulled={false}
      renderOrder={5}
    />
  )
}

/** 油燈的小火苗（單一火焰） */
export function LampFlame({ position, size = 1 }: { position: [number, number, number]; size?: number }) {
  const items = useMemo(() => [{ p: position, w: 0.055 * size, h: 0.16 * size }], [position, size])
  return <Flames items={items} blue={1} turbulence={0.45} intensity={1.1} seed={position[0] * 3 + position[2]} />
}

/* ================= 會閃爍的光源 ================= */
export function FireLight({
  position,
  color = '#ff9a48',
  intensity = 6,
  distance = 12,
  decay = 1.6,
  speed = 1,
}: {
  position: [number, number, number]
  color?: string
  intensity?: number
  distance?: number
  decay?: number
  speed?: number
}) {
  const ref = useRef<THREE.PointLight>(null)
  const seed = useMemo(() => Math.random() * 100, [])
  useFrame(({ clock }) => {
    const l = ref.current
    if (!l) return
    const t = clock.elapsedTime * speed + seed
    const f = 0.82 + 0.1 * Math.sin(t * 9.1) + 0.06 * Math.sin(t * 23.7 + 1.3) + 0.05 * Math.sin(t * 3.3)
    l.intensity = intensity * f
    l.position.set(position[0] + Math.sin(t * 4.1) * 0.03, position[1] + Math.sin(t * 6.3) * 0.03, position[2] + Math.cos(t * 3.7) * 0.03)
  })
  return <pointLight ref={ref} color={color} intensity={intensity} distance={distance} decay={decay} position={position} />
}

/* ================= 火星 ================= */
const emberVert = /* glsl */ `
uniform float uTime;
uniform float uHeight;
uniform float uSpread;
uniform float uSize;
attribute vec4 aSeed;
varying float vLife;
varying float vSeed;
void main() {
  float speed = 0.35 + aSeed.y * 0.5;
  float life = fract(uTime * speed * 0.5 + aSeed.x);
  vLife = life;
  vSeed = aSeed.z;
  vec3 p = vec3((aSeed.z - 0.5) * uSpread, 0.0, (aSeed.w - 0.5) * uSpread);
  // 上升、被熱氣流甩來甩去
  p.y = life * uHeight * (0.6 + aSeed.y * 0.6);
  p.x += sin(life * 9.0 + aSeed.w * 30.0) * 0.18 * life * uHeight * 0.3;
  p.z += cos(life * 7.0 + aSeed.z * 30.0) * 0.18 * life * uHeight * 0.3;
  p.xz *= 1.0 - life * 0.4;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float scale = length(modelMatrix[0].xyz);
  gl_PointSize = uSize * scale * (1.0 - life * 0.7) * (0.6 + aSeed.y) * projectionMatrix[1][1] * 400.0 / -mv.z;
}
`
const emberFrag = /* glsl */ `
uniform float uTime;
varying float vLife;
varying float vSeed;
void main() {
  vec2 d = gl_PointCoord - 0.5;
  float r = length(d);
  if (r > 0.5) discard;
  float a = smoothstep(0.5, 0.0, r);
  float flick = 0.6 + 0.4 * sin(uTime * 30.0 + vSeed * 80.0);
  float fade = smoothstep(0.0, 0.05, vLife) * (1.0 - smoothstep(0.55, 1.0, vLife));
  vec3 col = mix(vec3(4.0, 1.6, 0.35), vec3(2.0, 0.35, 0.05), vLife);
  gl_FragColor = vec4(col * flick, a * fade);
}
`

export function Embers({
  count = 60,
  spread = 2,
  height = 4,
  size = 0.05,
  position = [0, 0, 0],
}: {
  count?: number
  spread?: number
  height?: number
  size?: number
  position?: [number, number, number]
}) {
  useFireClock()
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry()
    const r = rng(count * 13 + 7)
    g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(count * 3), 3))
    g.setAttribute('aSeed', new THREE.Float32BufferAttribute(Float32Array.from({ length: count * 4 }, () => r()), 4))
    return g
  }, [count])
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: emberVert,
        fragmentShader: emberFrag,
        uniforms: { uTime, uHeight: { value: height }, uSpread: { value: spread }, uSize: { value: size } },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
    [height, spread, size],
  )
  return <points geometry={geo} material={material} position={position} frustumCulled={false} userData={{ noPathTrace: true }} renderOrder={6} />
}

/* ================= 煙 ================= */
const smokeVert = /* glsl */ `
uniform float uTime;
uniform float uHeight;
uniform float uSpread;
uniform float uSize;
uniform float uSpeed;
uniform float uSwirl;
attribute vec4 aSeed;
varying vec2 vUv;
varying float vLife;
varying float vSeed;
void main() {
  vUv = uv;
  float life = fract(uTime * uSpeed * (0.8 + aSeed.y * 0.4) + aSeed.x);
  vLife = life;
  vSeed = aSeed.z * 10.0 + aSeed.w;
  vec3 c = vec3((aSeed.z - 0.5) * uSpread, 0.0, (aSeed.w - 0.5) * uSpread);
  c.y = life * uHeight;
  // 隨高度漂移、捲動（像被微風吹）
  float k = life * life;
  c.x += sin(life * 5.0 + aSeed.z * 20.0) * uSwirl * life + k * uHeight * 0.18;
  c.z += cos(life * 4.0 + aSeed.w * 20.0) * uSwirl * life;
  float scale = length(modelMatrix[0].xyz);
  float size = uSize * (0.35 + life * 1.6) * (0.7 + aSeed.y * 0.6) * scale;
  vec4 mv = modelViewMatrix * vec4(c, 1.0);
  float ang = aSeed.x * 6.283 + uTime * 0.2 * (aSeed.y - 0.5);
  vec2 q = mat2(cos(ang), -sin(ang), sin(ang), cos(ang)) * position.xy;
  mv.xy += q * size;
  gl_Position = projectionMatrix * mv;
}
`
const smokeFrag = /* glsl */ `
uniform float uTime;
uniform float uOpacity;
uniform vec3 uColor;
uniform vec3 uWarm;
varying vec2 vUv;
varying float vLife;
varying float vSeed;
${NOISE}
void main() {
  vec2 d = vUv - 0.5;
  float r = length(d) * 2.0;
  float n = fbm(vUv * 3.0 + vec2(vSeed, vSeed * 0.7) + vec2(0.0, -uTime * 0.15));
  float puff = smoothstep(1.0, 0.15, r + (n - 0.5) * 0.9);
  float fade = smoothstep(0.0, 0.12, vLife) * (1.0 - smoothstep(0.35, 1.0, vLife));
  float a = puff * fade * uOpacity * (0.6 + n * 0.8);
  // 底部被火光照成暖色
  vec3 col = mix(uWarm, uColor, smoothstep(0.0, 0.35, vLife)) * (0.75 + n * 0.4);
  gl_FragColor = vec4(col, a);
}
`

export function Smoke({
  count = 24,
  spread = 1,
  height = 6,
  size = 1,
  speed = 0.07,
  swirl = 0.4,
  opacity = 0.35,
  color = '#cfc6ba',
  warm = '#8a5a3a',
  position = [0, 0, 0],
}: {
  count?: number
  spread?: number
  height?: number
  size?: number
  speed?: number
  swirl?: number
  opacity?: number
  color?: string
  warm?: string
  position?: [number, number, number]
}) {
  useFireClock()
  const geo = useMemo(() => {
    const g = new THREE.InstancedBufferGeometry().copy(new THREE.PlaneGeometry(1, 1) as unknown as THREE.InstancedBufferGeometry)
    const r = rng(count * 7 + 3)
    g.setAttribute('aSeed', new THREE.InstancedBufferAttribute(Float32Array.from({ length: count * 4 }, () => r()), 4))
    g.instanceCount = count
    return g
  }, [count])
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: smokeVert,
        fragmentShader: smokeFrag,
        uniforms: {
          uTime,
          uHeight: { value: height },
          uSpread: { value: spread },
          uSize: { value: size },
          uSpeed: { value: speed },
          uSwirl: { value: swirl },
          uOpacity: { value: opacity },
          uColor: { value: new THREE.Color(color) },
          uWarm: { value: new THREE.Color(warm) },
        },
        transparent: true,
        depthWrite: false,
      }),
    [height, spread, size, speed, swirl, opacity, color, warm],
  )
  return <mesh geometry={geo} material={material} position={position} frustumCulled={false} userData={{ noPathTrace: true }} renderOrder={4} />
}
