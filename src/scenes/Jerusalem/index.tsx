/**
 * 時空綜觀：耶路撒冷時間軸（F-1 ~ F-4）
 *
 * 場景模組介面（配合 src/game/scenes.ts 的 SceneProps）：
 *   default export <Jerusalem mode paused background onReady onExit? initialEvent? />
 *   - 自己渲染全螢幕 <Canvas> 與 HUD；paused 時 frameloop='never'。
 *   - 第一個畫面畫好時呼叫 onReady()。
 *   - 回主選單：onExit（若有），否則呼叫 useShell.getState().toMenu()（src/game/shell.ts 存在時）。
 *   - 網址 ?ev=<事件 id> 可指定開場事件（例：?scene=jerusalem&ev=herod）。
 */
import { Suspense, useEffect, useMemo, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import * as THREE from 'three'
import { useStore } from '../../store'
import { CameraRig, City, Clouds, DEFAULT_FOCUS, Effects, Highlights, Labels, Lights, ReadySignal, Terrain, Vegetation } from './World3D'
import { JerusalemHUD } from './HUD'
import { useJ } from './state'
import { EVENTS } from './timeline'

export interface JerusalemProps {
  mode?: string
  chapter?: number
  paused?: boolean
  background?: boolean
  onReady?: () => void
  onExit?: () => void
  /** 開場事件 id（預設：網址 ?ev=，否則第一個事件） */
  initialEvent?: string
}

// 外框的狀態模組（合併 agent/shell 後才存在；用 glob 讓建置不因缺檔失敗）
const shellMod = import.meta.glob<{ useShell: { getState: () => { toMenu: () => void } } }>('../../game/shell.ts')
const shellLoader = Object.values(shellMod)[0]

const NO_FX = typeof location !== 'undefined' && new URLSearchParams(location.search).has('nofx')

export default function Jerusalem({ paused = false, background = false, onReady, onExit, initialEvent }: JerusalemProps) {
  const quality = useStore((s) => s.quality)
  const start = useMemo(() => {
    const id = initialEvent ?? new URLSearchParams(location.search).get('ev') ?? EVENTS[0].id
    return Math.max(0, EVENTS.findIndex((e) => e.id === id))
  }, [initialEvent])
  // 每次掛上都重設場景狀態（切換場景後不保留）
  useState(() => useJ.getState().reset(start))
  useEffect(() => () => useJ.getState().setPlaying(false), [])
  // 當主選單背景時：慢慢自動播放
  useEffect(() => {
    if (background) useJ.getState().setPlaying(true)
  }, [background])

  const exit = onExit ?? (shellLoader ? () => void shellLoader().then((m) => m.useShell.getState().toMenu()) : undefined)

  return (
    <div className="jer-root">
      <Canvas
        shadows
        frameloop={paused ? 'never' : 'always'}
        dpr={[1, quality === 'high' ? 1.75 : 1.25]}
        gl={{ toneMapping: NO_FX ? THREE.AgXToneMapping : THREE.NoToneMapping, preserveDrawingBuffer: true, antialias: false }}
        camera={{ fov: 45, near: 5, far: 20000, position: [1500, 400, 0] }}
      >
        <Suspense fallback={null}>
          <Lights />
          <Clouds />
          <Terrain />
          <City />
          <Vegetation />
          <Highlights />
          {!background && <Labels />}
          {/* 從橄欖山上空的全景開始，再飛到開場事件 */}
          <CameraRig initial={DEFAULT_FOCUS} />
          {!NO_FX && <Effects />}
          <ReadySignal onReady={onReady} />
        </Suspense>
      </Canvas>
      {!background && <JerusalemHUD onExit={exit} paused={paused} />}
    </div>
  )
}
