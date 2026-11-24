/**
 * 香壇（金壇）出 30:1-10；37:25-28
 * - 皂莢木做，長 1 肘、寬 1 肘，四四方方，高 2 肘，角與壇接連一塊（30:2）
 * - 壇的上面與四圍、壇的角包上精金，四圍鑲金牙邊（30:3）
 * - 金牙邊以下兩旁做兩個金環，可以穿槓（30:4）
 * - 每早晚燒香（30:7-8）
 * 板面的分格、壇頂的炭火與香的樣子屬推測。
 */
import { useMemo } from 'react'
import { CuboidCollider, RigidBody } from '@react-three/rapier'
import * as THREE from 'three'
import { FireLight, Smoke } from './Flame'
import { horn, merge, rbox, rng } from './geom'
import { sacredMat } from './materials'

type M = (n: number) => number

const S = 1
const HT = 2

export function buildIncenseAltar() {
  const gold: THREE.BufferGeometry[] = []
  // 壇身、底座線腳
  gold.push(rbox(S - 0.1, HT - 0.12, S - 0.1, 0.03).translate(0, (HT - 0.12) / 2, 0))
  gold.push(rbox(S + 0.02, 0.12, S + 0.02, 0.03).translate(0, 0.06, 0))
  gold.push(rbox(S - 0.04, 0.05, S - 0.04, 0.015).translate(0, 0.14, 0))
  // 四面的框格
  for (let k = 0; k < 4; k++) {
    const side: THREE.BufferGeometry[] = []
    for (const x of [-0.38, 0.38]) side.push(rbox(0.07, 1.6, 0.04, 0.012).translate(x, 0.98, 0))
    for (const y of [0.22, 1.0, 1.74]) side.push(rbox(0.83, 0.07, 0.04, 0.012).translate(0, y, 0))
    gold.push(merge(side).translate(0, 0, (S - 0.1) / 2 + 0.01).rotateY((k * Math.PI) / 2))
  }
  // 壇頂與金牙邊（30:3）
  gold.push(rbox(S, 0.06, S, 0.02).translate(0, HT - 0.09, 0))
  for (const s of [-1, 1]) {
    gold.push(rbox(S + 0.04, 0.08, 0.05, 0.015).translate(0, HT - 0.03, s * (S / 2)))
    gold.push(rbox(0.05, 0.08, S + 0.04, 0.015).translate(s * (S / 2), HT - 0.03, 0))
  }
  // 金牙邊以下，兩旁的金環（南北兩側）
  for (const s of [-1, 1]) gold.push(new THREE.TorusGeometry(0.06, 0.016, 8, 18).rotateY(Math.PI / 2).translate(0, HT - 0.2, s * (S / 2 + 0.02)))
  // 四角的角
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]])
    gold.push(horn(0.2, 0.065, new THREE.Vector3(sx, 0, sz), 0.6).translate(sx * (S / 2 - 0.06), HT - 0.02, sz * (S / 2 - 0.06)))

  // 壇頂的小炭火（燒香用）
  const coal: THREE.BufferGeometry[] = []
  const r = rng(3)
  for (let i = 0; i < 14; i++) {
    const a = r() * Math.PI * 2
    const d = Math.sqrt(r()) * 0.17
    coal.push(new THREE.DodecahedronGeometry(0.03 + r() * 0.03, 0).scale(1, 0.7, 1).rotateY(r() * 3).translate(Math.cos(a) * d, HT - 0.04 + r() * 0.03, Math.sin(a) * d))
  }
  return { gold: merge(gold), coal: merge(coal) }
}

export function IncenseAltar({ m }: { m: M }) {
  const geo = useMemo(buildIncenseAltar, [])
  const w = m(S)
  const h = m(HT)
  return (
    <group position={[m(-18), 0, 0]}>
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider args={[w / 2, h / 2, w / 2]} position={[0, h / 2, 0]} />
      </RigidBody>
      <group scale={m(1)}>
        <mesh geometry={geo.gold} material={sacredMat.gold} castShadow receiveShadow />
        <mesh geometry={geo.coal} material={sacredMat.incenseCoals} />
        {/* 細細的一縷香煙 */}
        <Smoke count={160} spread={0.025} height={4.5} size={0.2} speed={0.035} swirl={0.14} opacity={0.12} color="#ece6dc" warm="#d9c8b4" position={[0, HT, 0]} />
        <FireLight position={[0, HT + 0.15, 0]} color="#ff7a30" intensity={0.5} distance={2.5} decay={2} />
      </group>
    </group>
  )
}
