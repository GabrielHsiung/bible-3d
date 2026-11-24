/**
 * 燔祭壇（銅壇）出 27:1-8；38:1-7
 * - 皂莢木做、包銅，長寬各 5 肘、四四方方、高 3 肘（27:1）
 * - 四角上有角，與壇接連一塊（27:2）
 * - 銅網安在壇四圍腰板之下，達到壇的半腰；網的四角有四個銅環（27:4-5）
 * - 槓用皂莢木包銅，穿在壇兩邊的環內（27:6-7）
 * - 壇上的火要常常燒著，不可熄滅（利 6:13）
 * 角的彎曲造型、腰板與網的實際樣子、壇內填土等細節屬推測。
 */
import { useMemo } from 'react'
import { CuboidCollider, RigidBody } from '@react-three/rapier'
import * as THREE from 'three'
import { Embers, FireLight, Flames, Smoke } from './Flame'
import { horn, merge, rbox, rng } from './geom'
import { sacredMat } from './materials'

type M = (n: number) => number

const W = 5
const H = 3
const BED = 2.9 // 炭床高度

/** 把一塊沿 x 軸的板放到四面（k=0 南、1 東、2 北、3 西） */
function fourSides(make: () => THREE.BufferGeometry, offset: number, y: number) {
  return [0, 1, 2, 3].map((k) => make().translate(0, y, offset).rotateY((k * Math.PI) / 2))
}

export function buildAltar() {
  const bronze: THREE.BufferGeometry[] = []
  const soot: THREE.BufferGeometry[] = []

  // 壇身（中空的板，壇內推測填土；這裡用實心）
  bronze.push(rbox(W - 0.24, BED, W - 0.24, 0.05).translate(0, BED / 2, 0))
  // 四角的柱（板的接角），略凸出
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]])
    bronze.push(rbox(0.46, H, 0.46, 0.06).translate((sx * (W - 0.46)) / 2, H / 2, (sz * (W - 0.46)) / 2))
  // 底座線腳
  bronze.push(...fourSides(() => rbox(W - 0.3, 0.26, 0.2, 0.05), W / 2 - 0.1, 0.13))
  // 上緣：被煙燻黑的口沿
  soot.push(...fourSides(() => rbox(W - 0.3, 0.3, 0.24, 0.06), W / 2 - 0.12, H - 0.15))
  // 腰板（壇四圍的突出邊，27:5）：在半腰
  bronze.push(...fourSides(() => rbox(W + 0.12, 0.16, 0.34, 0.05), W / 2 - 0.05, 1.56))
  // 上半部的豎框，把板面分成三格
  for (const x of [-0.85, 0.85]) bronze.push(...fourSides(() => rbox(0.16, 1.1, 0.12, 0.04).translate(x, 0, 0), W / 2 - 0.08, 2.18))
  bronze.push(...fourSides(() => rbox(W - 0.4, 0.12, 0.1, 0.03), W / 2 - 0.1, 2.6))

  // 銅網：腰板之下，達到壇的半腰（推測：網包在壇外的下半部）
  const grate: THREE.BufferGeometry[] = []
  const gw = W - 0.5
  const y0 = 0.32
  const y1 = 1.46
  const step = 0.19
  for (let x = -gw / 2 + step / 2; x < gw / 2; x += step) grate.push(new THREE.BoxGeometry(0.045, y1 - y0, 0.045).translate(x, (y0 + y1) / 2, 0))
  for (let y = y0 + step / 2; y < y1; y += step) grate.push(new THREE.BoxGeometry(gw, 0.045, 0.045).translate(0, y, 0.025))
  // 網框
  grate.push(rbox(gw + 0.1, 0.1, 0.09, 0.03).translate(0, y0, 0.02))
  grate.push(rbox(gw + 0.1, 0.1, 0.09, 0.03).translate(0, y1, 0.02))
  const oneSide = merge(grate)
  for (let k = 0; k < 4; k++) bronze.push(oneSide.clone().translate(0, 0, W / 2 - 0.06).rotateY((k * Math.PI) / 2))
  // 壁面在網後面（較暗）
  soot.push(...fourSides(() => new THREE.BoxGeometry(gw, y1 - y0, 0.02), W / 2 - 0.13, (y0 + y1) / 2))

  // 四個銅環（在網的四角，南北兩邊），槓穿過去
  const ringXs = [-1.75, 1.75]
  for (const sz of [-1, 1])
    for (const x of ringXs) {
      bronze.push(new THREE.TorusGeometry(0.16, 0.04, 8, 20).rotateY(Math.PI / 2).translate(x, 1.3, sz * (W / 2 + 0.19)))
      bronze.push(rbox(0.16, 0.2, 0.18, 0.04).translate(x, 1.3 + 0.16, sz * (W / 2 + 0.06)))
    }
  // 槓：沿東西方向
  for (const sz of [-1, 1]) bronze.push(new THREE.CapsuleGeometry(0.1, W + 1.8, 4, 14).rotateZ(Math.PI / 2).translate(0, 1.3, sz * (W / 2 + 0.19)))

  // 四角的角：向上、向外彎（27:2）
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const out = new THREE.Vector3(sx, 0, sz)
    const g = horn(1.05, 0.22, out, 0.7)
    bronze.push(g.translate((sx * (W - 0.46)) / 2, H - 0.02, (sz * (W - 0.46)) / 2))
    bronze.push(rbox(0.5, 0.12, 0.5, 0.05).translate((sx * (W - 0.46)) / 2, H, (sz * (W - 0.46)) / 2))
  }

  // 炭床：起伏的炭與灰
  const bed = new THREE.PlaneGeometry(W - 0.5, W - 0.5, 28, 28).rotateX(-Math.PI / 2)
  const r = rng(7)
  const bp = bed.attributes.position as THREE.BufferAttribute
  const bumps = Array.from({ length: 18 }, () => [(r() - 0.5) * 3.6, (r() - 0.5) * 3.6, 0.3 + r() * 0.5, 0.06 + r() * 0.1])
  for (let i = 0; i < bp.count; i++) {
    const x = bp.getX(i)
    const z = bp.getZ(i)
    let y = 0
    for (const [bx, bz, rad, amp] of bumps) y += amp * Math.exp(-((x - bx) ** 2 + (z - bz) ** 2) / (rad * rad))
    y += 0.12 * Math.exp(-(x * x + z * z) / 2.5)
    const edge = Math.max(Math.abs(x), Math.abs(z)) / ((W - 0.5) / 2)
    bp.setY(i, y * (1 - edge ** 6) + 0.01)
  }
  bed.computeVertexNormals()
  bed.translate(0, BED, 0)

  // 柴堆：兩層交錯的木柴（帶樹皮的粗枝，表面不規則）
  const logs: THREE.BufferGeometry[] = []
  const lr = rng(11)
  const addLog = (x: number, y: number, z: number, len: number, rad: number, rotY: number, tilt: number) => {
    const g = new THREE.CylinderGeometry(rad * (0.85 + lr() * 0.2), rad, len, 9, 4)
    const p = g.attributes.position as THREE.BufferAttribute
    const ph = lr() * 10
    for (let i = 0; i < p.count; i++) {
      const vx = p.getX(i)
      const vy = p.getY(i)
      const vz = p.getZ(i)
      const k = 1 + 0.12 * Math.sin(vy * 5 + ph) * Math.cos(Math.atan2(vz, vx) * 3 + ph) + (lr() - 0.5) * 0.06
      p.setXYZ(i, vx * k, vy + Math.sin(vx * 7) * 0.02, vz * k)
    }
    g.computeVertexNormals()
    logs.push(g.rotateX(Math.PI / 2 + tilt).rotateY(rotY).translate(x, y, z))
  }
  // 下層（南北向）
  for (let i = 0; i < 5; i++) addLog(-1.4 + i * 0.7 + (lr() - 0.5) * 0.2, BED + 0.2, (lr() - 0.5) * 0.3, 2.6 + lr() * 0.6, 0.13 + lr() * 0.05, (lr() - 0.5) * 0.25, (lr() - 0.5) * 0.1)
  // 上層（東西向）
  for (let i = 0; i < 4; i++) addLog((lr() - 0.5) * 0.3, BED + 0.48, -1.0 + i * 0.66 + (lr() - 0.5) * 0.2, 2.3 + lr() * 0.6, 0.12 + lr() * 0.05, Math.PI / 2 + (lr() - 0.5) * 0.3, (lr() - 0.5) * 0.12)
  // 斜靠的幾根
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4
    addLog(Math.cos(a) * 0.55, BED + 0.6, Math.sin(a) * 0.55, 1.6, 0.1, -a + Math.PI / 2, 0.75)
  }

  // 火焰：中央高、四周低
  const fr = rng(21)
  const flames: { p: [number, number, number]; w: number; h: number }[] = []
  for (let i = 0; i < 14; i++) {
    const a = fr() * Math.PI * 2
    const d = Math.sqrt(fr()) * 1.35
    const big = 1 - d / 1.5
    flames.push({ p: [Math.cos(a) * d, BED + 0.35 + fr() * 0.2, Math.sin(a) * d], w: 0.7 + big * 0.7 + fr() * 0.3, h: 1.0 + big * 1.8 + fr() * 0.6 })
  }
  for (let i = 0; i < 8; i++) {
    // 炭床上的小火舌
    flames.push({ p: [(fr() - 0.5) * 3.4, BED + 0.08, (fr() - 0.5) * 3.4], w: 0.25 + fr() * 0.2, h: 0.35 + fr() * 0.35 })
  }

  return { bronze: merge(bronze), soot: merge(soot), bed, logs: merge(logs), flames }
}

export function Altar({ m }: { m: M }) {
  const w = m(W)
  const h = m(H)
  const geo = useMemo(buildAltar, [])
  return (
    <group position={[m(20), 0, 0]}>
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider args={[w / 2, h / 2, w / 2]} position={[0, h / 2, 0]} />
      </RigidBody>
      <group scale={m(1)}>
        <mesh geometry={geo.bronze} material={sacredMat.bronze} castShadow receiveShadow />
        <mesh geometry={geo.soot} material={sacredMat.bronzeSoot} castShadow receiveShadow />
        <mesh geometry={geo.bed} material={sacredMat.coals} receiveShadow />
        <mesh geometry={geo.logs} material={sacredMat.log} castShadow receiveShadow />
        <Flames items={geo.flames} turbulence={1.15} intensity={1.0} seed={11} />
        <Embers count={70} spread={3.2} height={7} size={0.05} position={[0, BED + 0.3, 0]} />
        <Smoke count={30} spread={1.8} height={16} size={2.6} speed={0.05} swirl={0.8} opacity={0.42} color="#b9b2a8" position={[0, BED + 1.6, 0]} />
        <FireLight position={[0, BED + 1.6, 0]} color="#ff8a3a" intensity={9} distance={14} decay={1.6} />
      </group>
    </group>
  )
}
