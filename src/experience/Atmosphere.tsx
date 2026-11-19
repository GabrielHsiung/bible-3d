import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useStore } from '../store'
import { SUN, campTents } from '../components/World'

/**
 * 氛圍：天上緩慢移動的雲、空氣中的塵埃光點、祭壇的煙柱與營地炊煙、太陽光暈。
 * 全部是自訂 shader（路徑追蹤拍照時會自動隱藏，也加了 noPathTrace）。
 */

const sunDir = SUN.clone().normalize()

const NOISE_GLSL = /* glsl */ `
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p){
  vec2 i = floor(p); vec2 f = fract(p);
  vec2 u = f*f*(3.0-2.0*f);
  return mix(mix(hash12(i), hash12(i+vec2(1,0)), u.x), mix(hash12(i+vec2(0,1)), hash12(i+vec2(1,1)), u.x), u.y);
}
`

/* ---------------- 雲 ---------------- */
function CloudDome({ octaves }: { octaves: number }) {
  const mesh = useRef<THREE.Mesh>(null)
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: { uTime: { value: 0 }, uSun: { value: sunDir }, uOct: { value: octaves } },
        vertexShader: /* glsl */ `
          varying vec3 vDir;
          void main(){
            vDir = position;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }`,
        fragmentShader: /* glsl */ `
          uniform float uTime; uniform vec3 uSun; uniform float uOct;
          varying vec3 vDir;
          ${NOISE_GLSL}
          float fbm(vec2 p){
            float v = 0.0, a = 0.5;
            for (int i = 0; i < 6; i++) {
              if (float(i) >= uOct) break;
              v += a * vnoise(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5;
            }
            return v;
          }
          void main(){
            vec3 d = normalize(vDir);
            if (d.y < 0.0) discard;
            vec2 uv = d.xz / (d.y + 0.1);
            vec2 w = vec2(uTime * 0.0045, uTime * 0.0018);
            float base = fbm(uv * 0.9 + w);
            float detail = fbm(uv * 2.6 + w * 1.6 + 7.0);
            // 積雲：一團一團、邊緣柔和
            float c = smoothstep(0.5, 0.78, base * 0.85 + detail * 0.3);
            // 高空卷雲：細長的絲
            float ci = smoothstep(0.45, 0.85, fbm(vec2(uv.x * 0.5, uv.y * 2.4) + w * 1.5 + 3.0)) * 0.35;
            float horizon = smoothstep(0.015, 0.25, d.y);
            float alpha = clamp(c * 0.92 + ci, 0.0, 1.0) * horizon;
            if (alpha < 0.003) discard;
            // 受光：朝太陽的一側更亮、背光的底部偏藍灰
            float sun = max(dot(d, uSun), 0.0);
            float lit = mix(0.62, 1.0, smoothstep(0.25, 0.85, detail));
            vec3 col = mix(vec3(0.62, 0.68, 0.78), vec3(1.0, 0.97, 0.92), lit);
            col += vec3(1.0, 0.82, 0.55) * pow(sun, 10.0) * 0.9 * (1.0 - c * 0.5);
            col = mix(vec3(0.86, 0.87, 0.88), col, smoothstep(0.0, 0.35, d.y));
            gl_FragColor = vec4(col * 1.35, alpha);
          }`,
        transparent: true,
        depthWrite: false,
        fog: false,
        side: THREE.BackSide,
      }),
    [],
  )
  mat.uniforms.uOct.value = octaves
  useFrame(({ camera, clock }) => {
    mat.uniforms.uTime.value = clock.elapsedTime
    mesh.current?.position.copy(camera.position)
  })
  return (
    <mesh ref={mesh} material={mat} renderOrder={-1} frustumCulled={false} userData={{ noPathTrace: true }}>
      <sphereGeometry args={[4000, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2]} />
    </mesh>
  )
}

/* ---------------- 塵埃光點 ---------------- */
function Dust({ count }: { count: number }) {
  const B = 11
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry()
    const p = new Float32Array(count * 3)
    const s = new Float32Array(count)
    for (let i = 0; i < count; i++) {
      p[i * 3] = Math.random() * 2 * B
      p[i * 3 + 1] = Math.random() * 2 * B
      p[i * 3 + 2] = Math.random() * 2 * B
      s[i] = Math.random()
    }
    g.setAttribute('position', new THREE.BufferAttribute(p, 3))
    g.setAttribute('seed', new THREE.BufferAttribute(s, 1))
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6)
    return g
  }, [count])
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uCam: { value: new THREE.Vector3() },
          uSun: { value: sunDir },
          uPx: { value: 600 },
          uInside: { value: 0 },
        },
        vertexShader: /* glsl */ `
          attribute float seed;
          uniform float uTime; uniform vec3 uCam; uniform vec3 uSun; uniform float uPx; uniform float uInside;
          varying float vA;
          const float B = ${B.toFixed(1)};
          void main(){
            vec3 drift = vec3(0.25, 0.04, 0.1) * uTime + vec3(sin(uTime * 0.3 + seed * 40.0), sin(uTime * 0.21 + seed * 17.0) * 0.6, cos(uTime * 0.27 + seed * 23.0)) * 0.6;
            vec3 p = mod(position + drift - uCam + B, 2.0 * B) - B + uCam;
            p.y = max(p.y, 0.05);
            vec4 mv = modelViewMatrix * vec4(p, 1.0);
            float dist = -mv.z;
            vec3 v = normalize(p - uCam);
            // 逆光時（看向太陽）塵埃最亮：前向散射
            float fwd = pow(max(dot(v, uSun), 0.0), 3.0);
            float tw = 0.6 + 0.4 * sin(uTime * (1.0 + seed * 2.0) + seed * 60.0);
            float fade = smoothstep(0.4, 1.5, dist) * (1.0 - smoothstep(B * 0.6, B, dist));
            vA = fade * tw * mix(0.25 + fwd * 1.6, 0.35, uInside);
            gl_PointSize = clamp((0.022 + seed * 0.02) * uPx / dist, 1.0, 24.0);
            gl_Position = projectionMatrix * mv;
          }`,
        fragmentShader: /* glsl */ `
          varying float vA;
          void main(){
            vec2 c = gl_PointCoord - 0.5;
            float d = dot(c, c) * 4.0;
            float a = exp(-d * 3.5) * vA;
            if (a < 0.004) discard;
            gl_FragColor = vec4(vec3(1.0, 0.9, 0.72) * a * 1.6, a);
          }`,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        fog: false,
      }),
    [],
  )
  useFrame(({ camera, clock, size, gl }) => {
    mat.uniforms.uTime.value = clock.elapsedTime
    mat.uniforms.uCam.value.copy(camera.position)
    mat.uniforms.uPx.value = (size.height * gl.getPixelRatio()) / (2 * Math.tan(((camera as THREE.PerspectiveCamera).fov * Math.PI) / 360))
    const z = useStore.getState().zone
    mat.uniforms.uInside.value += ((z === 'holy' || z === 'holiest' ? 1 : 0) - mat.uniforms.uInside.value) * 0.05
  })
  return <points geometry={geo} material={mat} frustumCulled={false} userData={{ noPathTrace: true }} />
}

/* ---------------- 煙柱（祭壇＋營地炊煙） ---------------- */
interface Plume {
  x: number
  y: number
  z: number
  height: number
  width: number
  count: number
  rise: number
  alpha: number
  size: number
}

function Smokes({ plumes }: { plumes: Plume[] }) {
  const geo = useMemo(() => {
    const total = plumes.reduce((s, p) => s + p.count, 0)
    const pos = new Float32Array(total * 3)
    const a = new Float32Array(total * 4) // seed, height, width, rise
    const b = new Float32Array(total * 2) // alpha, size
    let k = 0
    for (const pl of plumes)
      for (let i = 0; i < pl.count; i++, k++) {
        pos[k * 3] = pl.x
        pos[k * 3 + 1] = pl.y
        pos[k * 3 + 2] = pl.z
        a[k * 4] = (i + Math.random() * 0.8) / pl.count
        a[k * 4 + 1] = pl.height
        a[k * 4 + 2] = pl.width
        a[k * 4 + 3] = pl.rise
        b[k * 2] = pl.alpha
        b[k * 2 + 1] = pl.size
      }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    g.setAttribute('pa', new THREE.BufferAttribute(a, 4))
    g.setAttribute('pb', new THREE.BufferAttribute(b, 2))
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6)
    return g
  }, [plumes])
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: { uTime: { value: 0 }, uPx: { value: 600 }, uSun: { value: sunDir }, uCam: { value: new THREE.Vector3() } },
        vertexShader: /* glsl */ `
          attribute vec4 pa; attribute vec2 pb;
          uniform float uTime; uniform float uPx; uniform vec3 uSun; uniform vec3 uCam;
          varying float vA; varying float vAge; varying float vSeed; varying float vLit;
          void main(){
            float seed = pa.x, H = pa.y, W = pa.z, rise = pa.w;
            float age = fract(uTime * rise / H + seed);
            float y = age * H;
            // 風從東南吹來，煙往西北飄、越高越彎
            vec2 wind = normalize(vec2(-1.0, -0.35)) * pow(age, 1.3) * H * 0.9;
            float sw = W * (0.3 + age * 2.6);
            vec2 turb = vec2(sin(uTime * 0.31 + seed * 31.0 + age * 5.0), cos(uTime * 0.27 + seed * 17.0 + age * 4.0)) * sw * 0.45;
            vec3 p = position + vec3(wind.x + turb.x, y, wind.y + turb.y);
            vec4 mv = modelViewMatrix * vec4(p, 1.0);
            float dist = max(-mv.z, 0.1);
            float sz = pb.y * (0.35 + age * 2.4);
            gl_PointSize = clamp(sz * uPx / dist, 1.0, 380.0);
            vA = pb.x * smoothstep(0.0, 0.12, age) * (1.0 - smoothstep(0.55, 1.0, age)) * smoothstep(2.0, 9.0, dist);
            vAge = age; vSeed = seed;
            vLit = 0.5 + 0.5 * max(dot(normalize(p - uCam), uSun), 0.0);
            gl_Position = projectionMatrix * mv;
          }`,
        fragmentShader: /* glsl */ `
          varying float vA; varying float vAge; varying float vSeed; varying float vLit;
          ${NOISE_GLSL}
          void main(){
            vec2 c = gl_PointCoord - 0.5;
            float r = length(c) * 2.0;
            float n = vnoise(gl_PointCoord * 3.0 + vSeed * 50.0) * 0.6 + vnoise(gl_PointCoord * 7.0 + vSeed * 13.0) * 0.4;
            float a = (1.0 - smoothstep(0.35, 1.0, r + (n - 0.5) * 0.5)) * vA;
            if (a < 0.004) discard;
            vec3 col = mix(vec3(0.55, 0.52, 0.5), vec3(0.93, 0.91, 0.88), clamp(vAge * 1.4, 0.0, 1.0));
            col *= 0.85 + vLit * 0.35;
            gl_FragColor = vec4(col * 1.25, a);
          }`,
        transparent: true,
        depthWrite: false,
        fog: false,
      }),
    [],
  )
  useFrame(({ camera, clock, size, gl }) => {
    mat.uniforms.uTime.value = clock.elapsedTime
    mat.uniforms.uCam.value.copy(camera.position)
    mat.uniforms.uPx.value = (size.height * gl.getPixelRatio()) / (2 * Math.tan(((camera as THREE.PerspectiveCamera).fov * Math.PI) / 360))
  })
  return <points geometry={geo} material={mat} frustumCulled={false} userData={{ noPathTrace: true }} renderOrder={2} />
}

/* ---------------- 太陽光暈 ---------------- */
function SunGlare() {
  const mesh = useRef<THREE.Mesh>(null)
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: { uVis: { value: 1 } },
        vertexShader: /* glsl */ `
          varying vec2 vUv;
          void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: /* glsl */ `
          uniform float uVis; varying vec2 vUv;
          void main(){
            vec2 c = vUv - 0.5;
            float r = length(c) * 2.0;
            float core = exp(-r * r * 60.0) * 2.5;
            float halo = exp(-r * 4.5) * 0.35;
            float ring = exp(-pow((r - 0.55) * 9.0, 2.0)) * 0.04;
            float a = atan(c.y, c.x);
            float rays = pow(abs(sin(a * 6.0 + 0.3)), 24.0) * exp(-r * 3.0) * 0.12;
            vec3 col = vec3(1.0, 0.86, 0.62) * (halo + rays) + vec3(1.0, 0.96, 0.9) * core + vec3(0.6, 0.8, 1.0) * ring;
            gl_FragColor = vec4(col * uVis, 1.0);
          }`,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        fog: false,
      }),
    [],
  )
  const fwd = useMemo(() => new THREE.Vector3(), [])
  useFrame(({ camera }) => {
    const m = mesh.current
    if (!m) return
    m.position.copy(camera.position).addScaledVector(sunDir, 1800)
    m.quaternion.copy(camera.quaternion)
    camera.getWorldDirection(fwd)
    // 越接近直視太陽越強
    mat.uniforms.uVis.value = 0.35 + 0.65 * Math.pow(Math.max(0, fwd.dot(sunDir)), 4)
  })
  return (
    <mesh ref={mesh} material={mat} scale={900} renderOrder={3} frustumCulled={false} userData={{ noPathTrace: true }}>
      <planeGeometry />
    </mesh>
  )
}

export function Atmosphere({ C }: { C: number }) {
  const quality = useStore((s) => s.quality)
  const plumes = useMemo<Plume[]>(() => {
    const altar: Plume = { x: 20 * C, y: 3 * C + 2.5, z: 0, height: 46, width: 2.2, count: quality === 'low' ? 40 : 70, rise: 1.5, alpha: 0.16, size: 3.2 }
    // 營地炊煙：挑幾頂帳棚，在帳棚前生火
    const tents = campTents(C)
    const picks = tents.filter((_, i) => i % 23 === 5).slice(0, quality === 'low' ? 6 : 12)
    const camp = picks.map<Plume>((t) => ({
      x: t.x + Math.cos(t.r) * t.s * 1.6,
      y: 0.4,
      z: t.z + Math.sin(t.r) * t.s * 1.6,
      height: 18 + (t.s - 2.4) * 6,
      width: 0.6,
      count: quality === 'low' ? 12 : 22,
      rise: 0.9,
      alpha: 0.2,
      size: 1.4,
    }))
    return [altar, ...camp]
  }, [C, quality])
  return (
    <group>
      <CloudDome octaves={quality === 'low' ? 3 : quality === 'medium' ? 4 : 5} />
      <Dust count={quality === 'low' ? 160 : quality === 'medium' ? 380 : 800} />
      <Smokes plumes={plumes} />
      <SunGlare />
    </group>
  )
}
