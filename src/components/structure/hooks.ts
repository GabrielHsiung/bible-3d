import { useEffect } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import type * as THREE from 'three'
import { input } from '../../store'
import { SWAY } from '../../materials'

export type M = (n: number) => number

/** 相機和玩家分在門簾兩側時，門簾變半透明，避免擋住視線 */
export function useCurtainFade(material: THREE.MeshStandardMaterial, planeX: number, halfWidth: number) {
  useFrame(({ camera }) => {
    const p = input.player
    const across = Math.sign(camera.position.x - planeX) !== Math.sign(p.x - planeX)
    const inFront = Math.abs(p.z) < halfWidth + 1 && Math.abs(p.x - planeX) < 8
    const target = across && inFront ? 0.18 : 1
    material.transparent = true
    material.opacity += (target - material.opacity) * 0.15
    material.depthWrite = material.opacity > 0.95
  })
}

/** 布料擺動的時鐘 */
export function useSwayClock() {
  useFrame(({ clock }) => {
    SWAY.uTime.value = clock.elapsedTime
  })
}

/** 元件卸載時釋放幾何 */
export function useDispose(...geos: (THREE.BufferGeometry | null | undefined)[]) {
  useEffect(
    () => () => geos.forEach((g) => g?.dispose()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    geos,
  )
}

/**
 * 檢查用：網址加 `?cam=x,y,z,tx,ty,tz`（公尺）時，相機固定在該位置看向目標，
 * 方便無頭瀏覽器截圖（例如抬頭看聖所的天花板）。一般遊玩不受影響。
 */
const CAM = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('cam') : null
export function useDebugCam() {
  const scene = useThree((s) => s.scene)
  useEffect(() => {
    if (!CAM) return
    const v = CAM.split(',').map(Number)
    if (v.length < 6 || v.some((n) => !Number.isFinite(n))) return
    const prev = scene.onBeforeRender
    scene.onBeforeRender = (r, sc, cam, ...rest) => {
      cam.position.set(v[0], v[1], v[2])
      cam.lookAt(v[3], v[4], v[5])
      cam.updateMatrixWorld()
      prev.call(scene, r, sc, cam, ...rest)
    }
    return () => {
      scene.onBeforeRender = prev
    }
  }, [scene])
}
