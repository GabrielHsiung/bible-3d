import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { audio } from '../audio'
import { QUALITY_LOCKED, input, useStore, type Quality } from '../store'

const DPR: Record<Quality, number> = { high: 1.75, medium: 1.25, low: 1 }
const NEXT: Record<Quality, Quality> = { high: 'medium', medium: 'low', low: 'low' }

/**
 * 自動調整畫質：連續兩個 2.5 秒的區間平均低於 40fps 就降一級
 * （解析度、AO、陰影貼圖、粒子數）。只降不升，避免來回跳動。
 * 網址加 ?q=high 可以鎖定。
 */
export function QualityManager() {
  const quality = useStore((s) => s.quality)
  const setQuality = useStore((s) => s.setQuality)
  const setDpr = useThree((s) => s.setDpr)
  const acc = useRef({ t: 0, frames: 0, bad: 0, skip: 2 })

  useEffect(() => {
    setDpr(Math.min(window.devicePixelRatio || 1, DPR[quality]))
    acc.current = { t: 0, frames: 0, bad: 0, skip: 2 }
  }, [quality, setDpr])

  useFrame((_, dt) => {
    if (QUALITY_LOCKED || quality === 'low' || useStore.getState().photo) return
    const a = acc.current
    a.t += Math.min(dt, 0.5)
    a.frames++
    if (a.t < 2.5) return
    const fps = a.frames / a.t
    a.t = 0
    a.frames = 0
    // 剛切換時有 shader 編譯，先跳過幾個區間
    if (a.skip > 0) {
      a.skip--
      return
    }
    a.bad = fps < 40 ? a.bad + 1 : 0
    if (a.bad >= 2) setQuality(NEXT[quality])
  })
  return null
}

const fwd = new THREE.Vector3()

/** 每幀把相機與玩家狀態交給音效引擎 */
export function AudioDriver({ C }: { C: number }) {
  useFrame(({ camera }, dt) => {
    if (!audio.started) return
    camera.getWorldDirection(fwd)
    const st = useStore.getState()
    audio.update({
      listener: { x: camera.position.x, y: camera.position.y, z: camera.position.z },
      forward: { x: fwd.x, y: fwd.y, z: fwd.z },
      player: input.player,
      speed: st.phase === 'play' ? input.speed : 0,
      zone: st.phase === 'play' ? st.zone : 'camp',
      C,
      dt: Math.min(dt, 0.1),
    })
  })
  return null
}
