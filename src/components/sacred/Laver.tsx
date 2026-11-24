/**
 * 洗濯盆（出 30:17-21；38:8；40:30-32）
 * 「用銅作洗濯盆和盆座」，用會幕門口伺候的婦人之銅鏡做成（38:8）。
 * 經文沒有記載尺寸和造型：這裡的大小（盆徑約 3 肘、盆口離地約 2.3 肘）與盆座樣式都是推測。
 */
import { useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { CylinderCollider, RigidBody } from '@react-three/rapier'
import * as THREE from 'three'
import { lathe, merge, rbox, smoothProfile, type V2 } from './geom'
import { sacredMat } from './materials'

type M = (n: number) => number

const STAND_H = 1.55
const WATER_Y = 0.52 // 水面在盆內的高度（從盆底起算）

// 盆的外壁與內壁（由下往上；[半徑, 高度]）
const OUTER: V2[] = smoothProfile([[0.0, 0.0], [0.45, 0.0], [0.62, 0.04], [0.95, 0.2], [1.25, 0.45], [1.42, 0.66]], 24)
const INNER: V2[] = smoothProfile([[1.36, 0.66], [1.2, 0.47], [0.9, 0.24], [0.58, 0.1], [0.3, 0.07], [0.0, 0.07]], 24)

function innerRadiusAt(y: number) {
  for (let i = 0; i < INNER.length - 1; i++) {
    const [r0, y0] = INNER[i]
    const [r1, y1] = INNER[i + 1]
    if ((y - y0) * (y - y1) <= 0) return r0 + ((r1 - r0) * (y - y0)) / (y1 - y0 || 1)
  }
  return 1
}

export function buildLaver() {
  const g: THREE.BufferGeometry[] = []
  // 盆座：方形底座＋四足＋車旋的柱身（推測）
  g.push(rbox(1.9, 0.16, 1.9, 0.05).translate(0, 0.14, 0))
  g.push(rbox(1.7, 0.08, 1.7, 0.03).translate(0, 0.26, 0))
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    g.push(lathe(smoothProfile([[0.0, 0], [0.13, 0.01], [0.15, 0.04], [0.1, 0.07], [0.12, 0.09]], 10), 14).translate(sx * 0.78, 0, sz * 0.78))
  }
  g.push(
    lathe(
      smoothProfile(
        [
          [0.62, 0.28], [0.6, 0.34], [0.45, 0.42], [0.32, 0.55], [0.26, 0.75], [0.3, 0.86], [0.34, 0.9], [0.3, 0.94],
          [0.24, 1.05], [0.23, 1.2], [0.3, 1.32], [0.48, 1.44], [0.58, 1.52], [0.56, STAND_H],
        ],
        48,
      ),
      40,
    ),
  )
  // 盆：外壁＋捲邊＋內壁一體
  const rim = new THREE.TorusGeometry(1.39, 0.045, 10, 72).rotateX(Math.PI / 2).translate(0, 0.665, 0)
  const bowl = lathe([...OUTER, ...INNER], 72)
  g.push(merge([bowl, rim]).translate(0, STAND_H, 0))
  const water = new THREE.CircleGeometry(innerRadiusAt(WATER_Y) + 0.01, 64).rotateX(-Math.PI / 2).translate(0, STAND_H + WATER_Y, 0)
  return { bronze: merge(g), water }
}

export function Laver({ m }: { m: M }) {
  const geo = useMemo(buildLaver, [])
  useFrame((_, dt) => {
    const n = sacredMat.water.normalMap
    if (n) {
      n.offset.x += dt * 0.012
      n.offset.y += dt * 0.007
    }
  })
  return (
    <group position={[m(8), 0, 0]}>
      <RigidBody type="fixed" colliders={false}>
        <CylinderCollider args={[m(1.5), m(1.4)]} position={[0, m(1.5), 0]} />
      </RigidBody>
      <group scale={m(1)}>
        <mesh geometry={geo.bronze} material={sacredMat.bronzePolished} castShadow receiveShadow />
        <mesh geometry={geo.water} material={sacredMat.water} receiveShadow />
      </group>
    </group>
  )
}
