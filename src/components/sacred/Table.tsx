/**
 * 陳設餅的桌子（出 25:23-30；37:10-16；利 24:5-9）
 * - 長 2 肘、寬 1 肘、高 1.5 肘，包上精金，四圍鑲金牙邊（25:23-24）
 * - 四圍做一掌寬的橧子，橧子上也鑲金牙邊（25:25）
 * - 四個金環安在四腳的四角上，靠近橧子（25:26-27）
 * - 陳設餅十二個，分兩行，每行六個；每行上面放淨乳香（利 24:5-7）
 * 桌腳的車旋造型、橧子的位置（這裡放在桌面下）屬推測。
 */
import { useMemo } from 'react'
import { CuboidCollider, RigidBody } from '@react-three/rapier'
import * as THREE from 'three'
import { lathe, merge, rbox, rng, smoothProfile } from './geom'
import { sacredMat } from './materials'

type M = (n: number) => number

const L = 2
const D = 1
const HT = 1.5
const TOP_T = 0.07

export function buildTable() {
  const gold: THREE.BufferGeometry[] = []
  const top = HT - TOP_T
  // 桌面
  gold.push(rbox(L, TOP_T, D, 0.02).translate(0, top + TOP_T / 2, 0))
  // 金牙邊（桌面四圍的冠邊）：一條方線＋一條圓線
  for (const s of [-1, 1]) {
    gold.push(rbox(L + 0.04, 0.07, 0.05, 0.015).translate(0, HT + 0.03, s * (D / 2 - 0.005)))
    gold.push(rbox(0.05, 0.07, D + 0.04, 0.015).translate(s * (L / 2 - 0.005), HT + 0.03, 0))
    gold.push(new THREE.CapsuleGeometry(0.018, L - 0.02, 3, 8).rotateZ(Math.PI / 2).translate(0, HT + 0.075, s * (D / 2 - 0.005)))
    gold.push(new THREE.CapsuleGeometry(0.018, D - 0.02, 3, 8).rotateX(Math.PI / 2).translate(s * (L / 2 - 0.005), HT + 0.075, 0))
  }
  // 一掌寬的橧子（約 1/6 肘），在桌面下，連著四腳
  const hb = 1 / 6
  for (const s of [-1, 1]) {
    gold.push(rbox(L - 0.16, hb, 0.05, 0.015).translate(0, top - hb / 2, s * (D / 2 - 0.08)))
    gold.push(rbox(0.05, hb, D - 0.16, 0.015).translate(s * (L / 2 - 0.08), top - hb / 2, 0))
    // 橧子上的金牙邊
    gold.push(rbox(L - 0.12, 0.03, 0.07, 0.01).translate(0, top - hb - 0.01, s * (D / 2 - 0.08)))
    gold.push(rbox(0.07, 0.03, D - 0.12, 0.01).translate(s * (L / 2 - 0.08), top - hb - 0.01, 0))
  }
  // 車旋的桌腳
  const leg = lathe(
    smoothProfile(
      [
        [0.05, 0], [0.065, 0.02], [0.055, 0.06], [0.04, 0.1], [0.045, 0.16], [0.06, 0.2], [0.045, 0.24], [0.036, 0.5],
        [0.034, 0.85], [0.048, 0.9], [0.05, 0.93], [0.04, 0.96], [0.036, 1.15], [0.046, 1.2], [0.05, top - 0.02], [0.05, top],
      ],
      60,
    ),
    16,
  )
  const legPos: [number, number][] = [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz]) => [sx * (L / 2 - 0.08), sz * (D / 2 - 0.08)])
  legPos.forEach(([x, z]) => {
    gold.push(leg.clone().translate(x, 0, z))
    // 四個金環（在四角，靠近橧子），槓沿長邊穿過
    gold.push(new THREE.TorusGeometry(0.06, 0.016, 8, 18).rotateY(Math.PI / 2).translate(x, top - hb - 0.12, z + Math.sign(z) * 0.08))
  })
  // 兩行陳設餅，每行六個；上面放一小金杯乳香
  const bread: THREE.BufferGeometry[] = []
  const r = rng(5)
  const loaf = lathe(smoothProfile([[0.0, 0.0], [0.3, 0.0], [0.36, 0.015], [0.375, 0.035], [0.35, 0.058], [0.25, 0.07], [0.0, 0.075]], 18), 28)
  const incense: THREE.BufferGeometry[] = []
  for (const sx of [-0.5, 0.5]) {
    for (let i = 0; i < 6; i++) {
      const g = loaf.clone().scale(1, 1, 0.92).rotateY(r() * Math.PI)
      bread.push(g.translate(sx + (r() - 0.5) * 0.02, HT + i * 0.072, (r() - 0.5) * 0.02))
    }
    const cupY = HT + 6 * 0.072
    gold.push(lathe(smoothProfile([[0.0, 0.0], [0.05, 0.0], [0.06, 0.012], [0.08, 0.05], [0.074, 0.052], [0.05, 0.02], [0.0, 0.016]], 14), 20).translate(sx, cupY, 0))
    incense.push(new THREE.IcosahedronGeometry(0.05, 1).scale(1, 0.55, 1).translate(sx, cupY + 0.04, 0))
  }
  return { gold: merge(gold), bread: merge(bread), incense: merge(incense) }
}

export function Table({ m }: { m: M }) {
  const geo = useMemo(buildTable, [])
  const Lm = m(L)
  const Wm = m(D)
  const Hh = m(HT)
  return (
    <group position={[m(-10), 0, m(-3)]}>
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider args={[Lm / 2, Hh / 2, Wm / 2]} position={[0, Hh / 2, 0]} />
      </RigidBody>
      <group scale={m(1)}>
        <mesh geometry={geo.gold} material={sacredMat.gold} castShadow receiveShadow />
        <mesh geometry={geo.bread} material={sacredMat.bread} castShadow receiveShadow />
        <mesh geometry={geo.incense} material={sacredMat.frankincense} />
      </group>
    </group>
  )
}
