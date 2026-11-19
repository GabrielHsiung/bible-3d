import { Suspense, useEffect, useRef } from 'react'
import { Canvas } from '@react-three/fiber'
import { Physics } from '@react-three/rapier'
import { CUBITS } from './data/tabernacle'
import { input, useStore } from './store'
import { Tabernacle } from './components/Tabernacle'
import { Camp, Ground, Lights } from './components/World'
import { Player } from './components/Player'
import { NPCs } from './components/NPCs'
import { HUD } from './components/HUD'
import { EnvProbes, Effects, PathTrace } from './components/Render'
import * as THREE from 'three'
import { Atmosphere } from './experience/Atmosphere'
import { AudioDriver, QualityManager } from './experience/Runtime'

const NO_FX = new URLSearchParams(location.search).has('nofx')

export default function App() {
  const cubit = useStore((s) => s.cubit)
  const photo = useStore((s) => s.photo)
  const C = CUBITS[cubit].meters
  const drag = useRef<{ id: number; x: number; y: number } | null>(null)

  useEffect(() => {
    const down = (e: KeyboardEvent) => input.keys.add(e.code)
    const up = (e: KeyboardEvent) => input.keys.delete(e.code)
    const blur = () => input.keys.clear()
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', blur)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', blur)
    }
  }, [])

  return (
    <div
      className="stage"
      onPointerDown={(e) => {
        const st = useStore.getState()
        if ((e.target as HTMLElement).closest('.ui') || st.photo || st.phase !== 'play') return
        drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY }
        ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
      }}
      onPointerMove={(e) => {
        const d = drag.current
        if (!d || d.id !== e.pointerId) return
        input.yaw -= (e.clientX - d.x) * 0.006
        input.pitch = Math.min(1.25, Math.max(-0.15, input.pitch + (e.clientY - d.y) * 0.004))
        d.x = e.clientX
        d.y = e.clientY
        input.lastLook = performance.now()
      }}
      onPointerUp={() => (drag.current = null)}
      onPointerCancel={() => (drag.current = null)}
    >
      <Canvas
        shadows
        dpr={[1, useStore.getState().quality === 'high' ? 1.75 : 1.25]}
        gl={{ toneMapping: THREE.NoToneMapping, preserveDrawingBuffer: true, antialias: false }}
        camera={{ fov: 50, near: 0.1, far: 6000, position: [35, 4, 0] }}
      >
        <Suspense fallback={null}>
          <Lights />
          {/* key：切換肘的標準時，整個場景依新尺寸重建 */}
          <Physics key={cubit} gravity={[0, -9.81, 0]}>
            <Ground />
            <Tabernacle C={C} />
            <Camp C={C} />
            <Player C={C} />
          </Physics>
          <NPCs key={'npc' + cubit} C={C} />
          <EnvProbes key={'env' + cubit} C={C} />
          {!NO_FX && <Atmosphere C={C} />}
          <AudioDriver C={C} />
          <QualityManager />
          {photo ? <PathTrace /> : !NO_FX && <Effects />}
        </Suspense>
      </Canvas>
      <HUD />
    </div>
  )
}
