import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Bloom, BrightnessContrast, DepthOfField, EffectComposer, HueSaturation, N8AO, ToneMapping, Vignette } from '@react-three/postprocessing'
import { ToneMappingMode, type DepthOfFieldEffect } from 'postprocessing'
import { GradientEquirectTexture, WebGLPathTracer } from 'three-gpu-pathtracer'
import * as THREE from 'three'
import { INTERIOR } from '../materials'
import { useStore, view } from '../store'

const isTouch = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches

/**
 * 環境反射探針：在院子中央和帳幕內各拍一張 360° 環境圖。
 * 院子裡的銅器會映出天空、白色帷子和沙地；
 * 帳幕裡的金器只映出幽暗的金牆和燈光。
 */
export function EnvProbes({ C }: { C: number }) {
  const { gl, scene } = useThree()
  useEffect(() => {
    let raf = 0
    let frame = 0
    const made: THREE.Texture[] = []
    const pmrem = new THREE.PMREMGenerator(gl)
    const capture = (pos: THREE.Vector3, size: number) => {
      const rt = new THREE.WebGLCubeRenderTarget(size, { type: THREE.HalfFloatType })
      const cam = new THREE.CubeCamera(0.05, 4000, rt)
      cam.position.copy(pos)
      scene.add(cam)
      cam.update(gl, scene)
      scene.remove(cam)
      const tex = pmrem.fromCubemap(rt.texture).texture
      rt.dispose()
      made.push(tex)
      return tex
    }
    const run = () => {
      frame++
      if (frame < 4) {
        raf = requestAnimationFrame(run)
        return
      }
      // 拍兩輪：第二輪時金屬已經有反射，互相映照會更真實
      for (let pass = 0; pass < 2; pass++) {
        const outside = capture(new THREE.Vector3(14 * C, 1.7, 7 * C), 256)
        const inside = capture(new THREE.Vector3(-12 * C, 2.2, 0), 128)
        scene.environment = outside
        scene.environmentIntensity = 0.9
        INTERIOR.forEach((m) => {
          m.envMap = inside
          m.envMapIntensity = 1.2
          m.needsUpdate = true
        })
      }
    }
    raf = requestAnimationFrame(run)
    return () => {
      cancelAnimationFrame(raf)
      pmrem.dispose()
      made.forEach((t) => t.dispose())
    }
  }, [gl, scene, C])
  return null
}

/**
 * 即時畫面的後製：環境光遮蔽、泛光、AgX 色調映射、調色。
 * 依品質分級：low 不做 AO、不做景深；景深只在開場與導覽時打開。
 */
export function Effects() {
  const quality = useStore((s) => s.quality)
  const phase = useStore((s) => s.phase)
  const tour = useStore((s) => s.tour)
  const wantDof = quality !== 'low' && (phase !== 'play' || tour >= 0)
  return (
    <EffectComposer multisampling={quality === 'high' && !isTouch ? 4 : 0}>
      {quality !== 'low' ? (
        <N8AO halfRes={quality !== 'high'} quality={quality === 'high' ? 'medium' : 'performance'} aoRadius={1.6} distanceFalloff={0.6} intensity={2.4} color="#2a1c10" />
      ) : (
        <></>
      )}
      {wantDof ? <Focus /> : <></>}
      <Bloom mipmapBlur luminanceThreshold={1.0} luminanceSmoothing={0.2} intensity={0.7} />
      <ToneMapping mode={ToneMappingMode.AGX} />
      <HueSaturation saturation={0.12} />
      <BrightnessContrast contrast={0.1} brightness={0.0} />
      <Vignette offset={0.35} darkness={phase === 'play' && tour < 0 ? 0.35 : 0.5} />
    </EffectComposer>
  )
}

/** 景深：對焦點與強度每幀由 Player 寫入 view */
function Focus() {
  const ref = useRef<DepthOfFieldEffect>(null)
  const { camera } = useThree()
  useFrame(() => {
    const e = ref.current
    if (!e || !e.target) return
    e.target.set(view.focus.x, view.focus.y, view.focus.z)
    const d = camera.position.distanceTo(e.target)
    e.cocMaterial.worldFocusRange = Math.max(3, d * 0.9)
    e.bokehScale = view.dof * 3.2
  })
  return <DepthOfField ref={ref} target={[0, 0, 0]} worldFocusRange={8} bokehScale={0} resolutionScale={0.5} />
}

/**
 * 拍照模式：用 GPU 路徑追蹤，把目前畫面算成有真實反射、光線反彈與柔和陰影的照片。
 */
export function PathTrace() {
  const { gl, scene, camera } = useThree()
  const pt = useRef<WebGLPathTracer | null>(null)
  const setSamples = useStore((s) => s.setSamples)
  const last = useRef(0)

  useEffect(() => {
    // 路徑追蹤只支援標準材質：把天空、煙、尺寸框等暫時藏起來
    const hidden: THREE.Object3D[] = []
    scene.traverse((o) => {
      const mesh = o as THREE.Mesh
      const material = mesh.material as THREE.Material | undefined
      const unsupported = mesh.isMesh && material && !(material as THREE.MeshStandardMaterial).isMeshStandardMaterial
      if ((o.userData.noPathTrace || unsupported || (o as THREE.LineSegments).isLineSegments) && o.visible) {
        hidden.push(o)
        o.visible = false
      }
    })
    const prevBg = scene.background
    const prevEnv = scene.environment
    const prevEnvInt = scene.environmentIntensity
    const prevTM = gl.toneMapping
    const prevExp = gl.toneMappingExposure
    const sky = new GradientEquirectTexture()
    sky.topColor.set('#7fb0ee')
    sky.bottomColor.set('#f5efe2')
    sky.exponent = 2.2
    sky.update()
    scene.background = sky
    scene.environment = sky
    scene.environmentIntensity = 1.7
    gl.toneMapping = THREE.AgXToneMapping
    gl.toneMappingExposure = 1.35

    const tracer = new WebGLPathTracer(gl)
    tracer.bounces = 5
    tracer.filterGlossyFactor = 0.4
    tracer.minSamples = 1
    tracer.renderScale = isTouch ? 0.5 : 1
    tracer.tiles.set(isTouch ? 3 : 2, isTouch ? 3 : 2)
    tracer.fadeDuration = 300
    tracer.setScene(scene, camera)
    pt.current = tracer

    return () => {
      tracer.dispose()
      pt.current = null
      hidden.forEach((o) => (o.visible = true))
      scene.background = prevBg
      scene.environment = prevEnv
      scene.environmentIntensity = prevEnvInt
      gl.toneMapping = prevTM
      gl.toneMappingExposure = prevExp
      sky.dispose()
    }
  }, [gl, scene, camera])

  // priority 1：接手渲染
  useFrame(() => {
    const t = pt.current
    if (!t) return
    t.renderSample()
    const n = Math.floor(t.samples)
    if (n !== last.current) {
      last.current = n
      setSamples(n)
    }
  }, 1)
  return null
}
