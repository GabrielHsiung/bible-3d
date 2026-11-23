/**
 * 會幕場景（第 1–3 章、自由探索、導覽、攝影）。
 * 內容原本寫在 App.tsx；這裡只是把它們包成一個符合 SceneProps 的場景元件，各子元件本身沒有改動。
 */
import { Suspense, useEffect, useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Physics } from '@react-three/rapier'
import * as THREE from 'three'
import { CUBITS } from '../../data/tabernacle'
import { QUALITY_LOCKED, input, useStore, type Quality } from '../../store'
import { Tabernacle } from '../../components/Tabernacle'
import { Camp, Ground, Lights } from '../../components/World'
import { Player } from '../../components/Player'
import { NPCs } from '../../components/NPCs'
import { HUD } from '../../components/HUD'
import { EnvProbes, Effects, PathTrace } from '../../components/Render'
import { Atmosphere } from '../../experience/Atmosphere'
import { AudioDriver, QualityManager } from '../../experience/Runtime'
import { useShell } from '../../game/shell'
import type { SceneProps } from '../../game/scenes'

const NO_FX = new URLSearchParams(location.search).has('nofx')
const DPR: Record<Quality, number> = { high: 1.75, medium: 1.25, low: 1 }

/** 畫好前幾個畫面後通知外框（載入畫面可以淡出） */
function ReadySignal({ onReady }: { onReady?: () => void }) {
  const n = useRef(0)
  const done = useRef(false)
  useFrame(() => {
    if (done.current) return
    if (++n.current >= 3) {
      done.current = true
      onReady?.()
    }
  })
  return null
}

/** 手動畫質：只同步解析度，不自動降級 */
function ManualQuality() {
  const quality = useStore((s) => s.quality)
  const setDpr = useThree((s) => s.setDpr)
  useEffect(() => setDpr(Math.min(window.devicePixelRatio || 1, DPR[quality])), [quality, setDpr])
  return null
}

/** 開始遊戲：依模式決定進場方式 */
function startMode(mode: SceneProps['mode']) {
  const st = useStore.getState()
  st.setIndex(false)
  st.setPhoto(false)
  st.setTour(-1)
  if (mode === 'tour') {
    // 導覽：直接切到門口開始走（不播進場空拍）
    st.setPhase('play')
    st.teleportTo(60, 0)
    st.setTour(0)
    return
  }
  st.setPhase('flying')
}

export default function TabernacleScene({ mode, paused, background, onReady }: SceneProps) {
  const cubit = useStore((s) => s.cubit)
  const photo = useStore((s) => s.photo)
  const quality = useStore((s) => s.quality)
  const autoQ = useShell((s) => s.save.settings.quality === 'auto') && !QUALITY_LOCKED
  const C = CUBITS[cubit].meters
  const drag = useRef<{ id: number; x: number; y: number } | null>(null)

  // 背景（主選單）⇄ 遊戲中
  useEffect(() => {
    const st = useStore.getState()
    if (background) {
      st.setTour(-1)
      st.setPhoto(false)
      st.setIndex(false)
      st.setPhase('intro')
    } else if (st.phase === 'intro') {
      startMode(mode)
    }
  }, [background, mode])

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const sh = useShell.getState()
      if (sh.paused || !sh.inGame) return
      input.keys.add(e.code)
    }
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
        if ((e.target as HTMLElement).closest('.ui') || st.photo || st.phase !== 'play' || paused) return
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
        frameloop={paused ? 'never' : 'always'}
        dpr={[1, quality === 'high' ? 1.75 : 1.25]}
        gl={{ toneMapping: THREE.NoToneMapping, preserveDrawingBuffer: true, antialias: false }}
        camera={{ fov: 50, near: 0.1, far: 6000, position: [35, 4, 0] }}
      >
        <Suspense fallback={null}>
          <Lights />
          {/* key：切換肘的標準時，整個場景依新尺寸重建 */}
          <Physics key={cubit} gravity={[0, -9.81, 0]} paused={paused}>
            <Ground />
            <Tabernacle C={C} />
            <Camp C={C} />
            <Player C={C} />
          </Physics>
          <NPCs key={'npc' + cubit} C={C} />
          <EnvProbes key={'env' + cubit} C={C} />
          {!NO_FX && <Atmosphere C={C} />}
          <AudioDriver C={C} />
          {autoQ ? <QualityManager /> : <ManualQuality />}
          {photo ? <PathTrace /> : !NO_FX && <Effects />}
          <ReadySignal onReady={onReady} />
        </Suspense>
      </Canvas>
      {!background && <HUD mode={mode} />}
    </div>
  )
}
