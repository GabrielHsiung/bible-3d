/**
 * 金燈臺（出 25:31-40；37:17-24）
 * - 座、幹、左右各三枝：一塊精金錘出（25:31、36）
 * - 每枝三個杏花形的杯，有球有花（25:33）；幹上四個杯（25:34）
 * - 每兩枝以下有一個球與枝子接連（25:35）
 * - 七盞燈（25:37），燈光向前照
 * 經文沒有記載高度與枝子形狀：這裡採常見的「半圓弧枝、頂端與中幹同高」重建，高約 3.2 肘（約 1.5 公尺），屬推測。
 * 外側六盞燈的燈嘴轉向中間那盞（拉比傳統對民 8:2 的解釋），也屬推測。
 */
import { useMemo } from 'react'
import { CylinderCollider, RigidBody } from '@react-three/rapier'
import * as THREE from 'three'
import { FireLight, Flames } from './Flame'
import { alignY, lathe, merge, place, smoothProfile, taperTube, type V2 } from './geom'
import { sacredMat } from './materials'

type M = (n: number) => number

const Y_TOP = 2.95 // 燈盞座的高度（肘）
const REACH = [0.42, 0.78, 1.14] // 三對枝子的水平伸展（肘）
const LAMP_H = 0.05

/** 讓旋轉體的上半部變成 n 瓣（杏花的花萼／花瓣） */
function petals(g: THREE.BufferGeometry, n: number, amount: number, y0: number, y1: number) {
  const p = g.attributes.position as THREE.BufferAttribute
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i)
    const y = p.getY(i)
    const z = p.getZ(i)
    const k = THREE.MathUtils.smoothstep(y, y0, y1) * amount
    if (k <= 0) continue
    const phi = Math.atan2(z, x)
    const lobe = Math.pow(Math.abs(Math.cos((n * phi) / 2)), 0.7)
    const s = 1 - k * (1 - lobe)
    p.setXYZ(i, x * s, y + k * lobe * 0.012, z * s)
  }
  g.computeVertexNormals()
  return g
}

/** 一組「杯、球、花」：沿 +Y，高約 0.22 肘 */
function ornament(s = 1) {
  const knop = lathe(smoothProfile([[0.03, 0], [0.062, 0.016], [0.076, 0.045], [0.062, 0.075], [0.032, 0.092]], 14), 18)
  const cup = petals(
    lathe([[0.03, 0.088], [0.034, 0.105], [0.046, 0.14], [0.066, 0.172], [0.078, 0.188], [0.07, 0.19], [0.05, 0.168], [0.036, 0.15]], 30),
    5,
    0.28,
    0.13,
    0.19,
  )
  const flower = petals(
    lathe([[0.042, 0.182], [0.07, 0.196], [0.1, 0.212], [0.106, 0.218], [0.096, 0.219], [0.068, 0.206], [0.044, 0.197]], 36),
    6,
    0.45,
    0.19,
    0.21,
  )
  return place(merge([knop, cup, flower]), [0, 0, 0], [0, 0, 0], s)
}

/** 枝子：從幹上 (0, y0) 水平伸出，彎成四分之一圓，到 (±R, Y_TOP) 時直立向上 */
function branchCurve(R: number, side: number) {
  const y0 = Y_TOP - R * 0.95
  const pts: THREE.Vector3[] = []
  for (let i = 0; i <= 24; i++) {
    const th = (i / 24) * (Math.PI / 2)
    pts.push(new THREE.Vector3(side * R * Math.sin(th), Y_TOP - (Y_TOP - y0) * Math.cos(th), 0))
  }
  return { curve: new THREE.CatmullRomCurve3(pts, false, 'centripetal'), y0 }
}

/** 一盞燈：燈座（花）＋燈盞＋燈嘴；回傳金、油、燈芯幾何與火苗位置 */
function lamp(x: number, dir: THREE.Vector3) {
  const d = dir.clone().setY(0).normalize()
  const base = new THREE.Vector3(x, Y_TOP, 0)
  const seat = petals(lathe([[0.036, -0.02], [0.05, 0.01], [0.075, 0.035], [0.085, LAMP_H], [0.06, LAMP_H]], 30), 6, 0.3, 0.0, 0.05)
  const bowl = lathe(
    smoothProfile([[0.0, 0.0], [0.05, 0.004], [0.088, 0.024], [0.1, 0.05], [0.094, 0.062], [0.086, 0.056], [0.072, 0.03], [0.0, 0.022]], 20),
    28,
  )
  place(bowl, [0, LAMP_H, 0])
  // 燈嘴：捏出來的尖嘴，略向上
  const a = new THREE.Vector3(0, LAMP_H + 0.04, 0).addScaledVector(d, 0.05)
  const b = new THREE.Vector3(0, LAMP_H + 0.056, 0).addScaledVector(d, 0.165)
  // 壓扁成捏出來的嘴
  const cy = LAMP_H + 0.048
  const spout = taperTube(new THREE.LineCurve3(a, b), (t) => 0.032 * (1 - t * 0.45), 6, 12).translate(0, -cy, 0).scale(1, 0.7, 1).translate(0, cy, 0)
  const gold = merge([seat, bowl, spout]).translate(base.x, base.y, base.z)
  const oil = new THREE.CircleGeometry(0.084, 24).rotateX(-Math.PI / 2).translate(base.x, base.y + LAMP_H + 0.05, base.z)
  const tip = b.clone().setY(LAMP_H + 0.06).addScaledVector(d, -0.01)
  const wick = alignY(new THREE.CylinderGeometry(0.007, 0.009, 0.035, 6), tip, new THREE.Vector3(d.x * 0.6, 1, d.z * 0.6)).translate(base.x, base.y, base.z)
  const flameAt: [number, number, number] = [base.x + tip.x + d.x * 0.01, base.y + tip.y + 0.012, base.z + tip.z + d.z * 0.01]
  return { gold, oil, wick, flameAt }
}

export function buildLampstand() {
  const gold: THREE.BufferGeometry[] = []
  const oil: THREE.BufferGeometry[] = []
  const wick: THREE.BufferGeometry[] = []
  const flames: { p: [number, number, number]; w: number; h: number }[] = []

  // 座：圓形階梯座，下有三足（推測）
  const baseProfile: V2[] = [
    [0.0, 0.07], [0.5, 0.07], [0.53, 0.085], [0.53, 0.11], [0.5, 0.125], [0.44, 0.135],
    [0.4, 0.16], [0.4, 0.18], [0.34, 0.19], [0.24, 0.23], [0.17, 0.28], [0.12, 0.33], [0.1, 0.38],
    [0.12, 0.4], [0.12, 0.42], [0.07, 0.44], [0.055, 0.47],
  ]
  gold.push(petals(lathe(baseProfile, 48), 12, 0.04, 0.2, 0.32))
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + Math.PI / 6
    const foot = lathe(smoothProfile([[0.0, 0], [0.07, 0.008], [0.085, 0.035], [0.065, 0.065], [0.04, 0.08]], 10), 16)
    gold.push(place(foot, [Math.cos(a) * 0.42, 0, Math.sin(a) * 0.42], [0, 0, 0], [1.2, 1, 1]))
  }

  // 幹
  gold.push(lathe([[0.05, 0.44], [0.046, 1.6], [0.042, Y_TOP]], 16))
  // 幹上四個杯（25:34）
  for (const y of [0.78, 1.28, 1.6, Y_TOP - 0.26]) gold.push(place(ornament(1.05), [0, y, 0]))

  // 三對枝子
  REACH.forEach((R) => {
    for (const side of [-1, 1]) {
      const { curve } = branchCurve(R, side)
      gold.push(taperTube(curve, (t) => 0.036 - t * 0.007, 40, 10, false))
      for (const t of [0.34, 0.6, 0.84]) {
        const p = curve.getPointAt(t)
        const tan = curve.getTangentAt(t)
        gold.push(alignY(ornament(0.82), p.addScaledVector(tan, -0.1), tan))
      }
      // 頂端一小段直的，接燈座
      gold.push(lathe([[0.03, Y_TOP - 0.03], [0.03, Y_TOP]], 10).translate(side * R, 0, 0))
    }
    // 每兩枝以下有一個球（25:35）
    const y0 = Y_TOP - R * 0.95
    gold.push(place(lathe(smoothProfile([[0.04, -0.06], [0.08, -0.04], [0.092, 0.0], [0.075, 0.035], [0.045, 0.05]], 14), 20), [0, y0, 0]))
  })

  // 七盞燈：中間的燈嘴向前（+Z），兩旁的轉向中間
  for (const x of [0, ...REACH.flatMap((r) => [-r, r])]) {
    const dir = x === 0 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(-Math.sign(x), 0, 0.55)
    const L = lamp(x, dir)
    gold.push(L.gold)
    oil.push(L.oil)
    wick.push(L.wick)
    flames.push({ p: L.flameAt, w: 0.075, h: 0.2 })
  }

  return { gold: merge(gold), oil: merge(oil), wick: merge(wick), flames }
}

export function Lampstand({ m }: { m: M }) {
  const h = m(3.2) // 推測
  const geo = useMemo(buildLampstand, [])
  return (
    <group position={[m(-10), 0, m(3)]}>
      <RigidBody type="fixed" colliders={false}>
        <CylinderCollider args={[h / 2, m(0.6)]} position={[0, h / 2, 0]} />
      </RigidBody>
      {/* 以肘為單位建模；枝子沿南北方向展開，正面朝東（入口） */}
      <group scale={m(1)} rotation={[0, Math.PI / 2, 0]}>
        <mesh geometry={geo.gold} material={sacredMat.goldFine} castShadow receiveShadow />
        <mesh geometry={geo.oil} material={sacredMat.oil} />
        <mesh geometry={geo.wick} material={sacredMat.wick} />
        <Flames items={geo.flames} blue={1} turbulence={0.45} intensity={1.5} seed={3} />
        <FireLight position={[0, Y_TOP + 0.45, 0.25]} color="#ffb565" intensity={5} distance={10} decay={1.4} speed={0.6} />
      </group>
    </group>
  )
}
