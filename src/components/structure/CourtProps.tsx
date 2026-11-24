import { useMemo } from 'react'
import { CuboidCollider, CylinderCollider, RigidBody } from '@react-three/rapier'
import * as THREE from 'three'
import { mat, smat } from '../../materials'
import { mulberry } from '../../rng'
import { mergeParts, trs, type Part } from './merge'
import { useDispose, type M } from './hooks'

/**
 * 院子裡的生活細節（位置與造型都是推測）：
 * - 祭壇旁的柴堆（利 1:7「把柴擺在火上」）
 * - 祭壇的器具：盆、鏟子、肉叉、火鼎、收灰的盆（出 27:3），放在草蓆上
 * - 祭壇東邊倒灰的地方（利 1:16）
 * - 洗濯盆旁打水用的陶罐
 */

const lathe = (pts: [number, number][], seg = 16) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg)

export function CourtProps({ m }: { m: M }) {
  const g = useMemo(() => {
    const rnd = mulberry(303)
    /* ---------- 柴堆 ---------- */
    const wood = { x: m(26.5), z: m(-7.5) }
    const logSide = new THREE.CylinderGeometry(1, 1, 1, 9, 1, true)
    logSide.rotateZ(Math.PI / 2)
    const logEnd = new THREE.CircleGeometry(1, 9)
    logEnd.rotateY(Math.PI / 2)
    const bark: Part[] = []
    const ends: Part[] = []
    const addLog = (x: number, y: number, z: number, len: number, r: number, yaw: number, tilt = 0) => {
      const t = 0.8 + rnd() * 0.35
      bark.push({ geo: logSide, matrix: trs([x, y, z], [0, yaw, tilt], [len, r, r]), color: [t, t * 0.97, t * 0.94], uvOffset: [rnd(), rnd()] })
      const dir = new THREE.Vector3(Math.cos(yaw) * Math.cos(tilt), Math.sin(tilt), -Math.sin(yaw) * Math.cos(tilt))
      for (const s of [-1, 1]) {
        const p = new THREE.Vector3(x, y, z).addScaledVector(dir, (s * len) / 2)
        const c = 0.85 + rnd() * 0.2
        ends.push({ geo: logEnd, matrix: trs([p.x, p.y, p.z], [0, yaw + (s < 0 ? Math.PI : 0), s * tilt], [1, r, r]), color: [c, c * 0.95, c * 0.9], uvOffset: [rnd(), rnd()] })
      }
    }
    const rows = [5, 4, 3, 2]
    let y = 0
    for (let rI = 0; rI < rows.length; rI++) {
      const n = rows[rI]
      const r0 = 0.06
      y += rI === 0 ? r0 : r0 * 1.75
      for (let i = 0; i < n; i++) {
        const z = wood.z + (i - (n - 1) / 2) * r0 * 2.05
        addLog(wood.x + (rnd() - 0.5) * 0.12, y, z, 0.9 + rnd() * 0.25, r0 * (0.8 + rnd() * 0.35), (rnd() - 0.5) * 0.08)
      }
    }
    // 散落的幾根
    for (let i = 0; i < 4; i++) addLog(wood.x + 0.6 + rnd() * 0.5, 0.05, wood.z + (rnd() - 0.5) * 0.9, 0.6 + rnd() * 0.4, 0.035 + rnd() * 0.02, rnd() * 3)

    /* ---------- 銅器（出 27:3） ---------- */
    const tools = { x: m(25.2), z: m(-4.2) }
    const B: Part[] = []
    const bowl = lathe([
      [0.001, 0],
      [0.09, 0.004],
      [0.14, 0.03],
      [0.165, 0.07],
      [0.162, 0.078],
      [0.15, 0.072],
      [0.13, 0.04],
      [0.085, 0.013],
      [0.001, 0.009],
    ])
    const pan = lathe([
      [0.001, 0],
      [0.11, 0.002],
      [0.125, 0.03],
      [0.12, 0.034],
      [0.11, 0.008],
      [0.001, 0.006],
    ])
    const pot = lathe([
      [0.001, 0],
      [0.12, 0.01],
      [0.17, 0.08],
      [0.175, 0.16],
      [0.15, 0.22],
      [0.16, 0.24],
      [0.145, 0.245],
      [0.13, 0.22],
      [0.15, 0.16],
      [0.001, 0.02],
    ])
    const handle = new THREE.CylinderGeometry(0.011, 0.013, 1, 6)
    handle.rotateZ(Math.PI / 2)
    const blade = new THREE.BoxGeometry(0.22, 0.006, 0.2)
    const lipG = new THREE.BoxGeometry(0.22, 0.03, 0.006)
    const prong = new THREE.CylinderGeometry(0.004, 0.006, 1, 5)
    prong.rotateZ(Math.PI / 2)
    const tone = () => {
      const t = 0.85 + rnd() * 0.25
      return [t, t, t] as [number, number, number]
    }
    const at = (dx: number, dz: number, yaw: number) => {
      const c = Math.cos(yaw)
      const s = Math.sin(yaw)
      return (lx: number, ly: number, lz: number): [number, number, number] => [tools.x + dx + lx * c + lz * s, ly, tools.z + dz - lx * s + lz * c]
    }
    // 鏟子（收灰用）× 2
    for (const [dx, dz, yaw] of [
      [-0.25, -0.2, 0.15],
      [-0.2, 0.05, 0.05],
    ]) {
      const p = at(dx, dz, yaw)
      const col = tone()
      B.push({ geo: blade, matrix: trs(p(0.3, 0.016, 0), [0, yaw, 0]), color: col })
      for (const s of [-1, 1]) B.push({ geo: lipG, matrix: trs(p(0.3, 0.028, s * 0.1), [0, yaw, 0]), color: col })
      B.push({ geo: lipG, matrix: trs(p(0.41, 0.028, 0), [0, yaw + Math.PI / 2, 0], [0.9, 1, 1]), color: col })
      B.push({ geo: handle, matrix: trs(p(-0.1, 0.024, 0), [0, yaw, 0], [0.6, 1, 1]), color: col })
    }
    // 盆（盛血、灑血用）× 2
    B.push({ geo: bowl, matrix: trs(at(0.3, -0.18, 0)(0, 0.012, 0)), color: tone() })
    B.push({ geo: bowl, matrix: trs(at(0.15, 0.2, 0)(0, 0.012, 0), [0.04, 0, 0.02]), color: tone() })
    // 肉叉（三齒，撒母耳記上 2:13）× 2
    for (const [dx, dz, yaw] of [
      [0.05, -0.33, -0.1],
      [0.0, 0.32, 0.25],
    ]) {
      const p = at(dx, dz, yaw)
      const col = tone()
      B.push({ geo: handle, matrix: trs(p(0, 0.022, 0), [0, yaw, 0], [0.5, 0.8, 0.8]), color: col })
      for (const s of [-1, 0, 1]) B.push({ geo: prong, matrix: trs(p(0.3, 0.022 + Math.abs(s) * 0.004, s * 0.022), [0, yaw - s * 0.18, 0.25], [0.13, 1, 1]), color: col })
    }
    // 火鼎（取炭的盤）
    {
      const p = at(0.36, 0.08, 1.2)
      const col = tone()
      B.push({ geo: pan, matrix: trs(p(0, 0.012, 0)), color: col })
      B.push({ geo: handle, matrix: trs(p(0.3, 0.03, 0), [0, 1.2, 0.06], [0.38, 0.8, 0.8]), color: col })
    }
    // 收灰的盆：放在倒灰的地方旁邊
    const ashAt = { x: m(27.2), z: m(3) }
    B.push({ geo: pot, matrix: trs([ashAt.x - 0.62, 0, ashAt.z - 0.25], [0, 0.4, 0]), color: [0.75, 0.72, 0.7] })

    /* ---------- 陶罐（洗濯盆旁） ---------- */
    const jarG = lathe(
      [
        [0.001, 0],
        [0.07, 0.0],
        [0.12, 0.05],
        [0.175, 0.17],
        [0.19, 0.29],
        [0.165, 0.41],
        [0.1, 0.49],
        [0.062, 0.52],
        [0.066, 0.57],
        [0.082, 0.595],
        [0.072, 0.605],
        [0.054, 0.59],
        [0.05, 0.5],
        [0.001, 0.48],
      ],
      18,
    )
    const jugG = lathe(
      [
        [0.001, 0],
        [0.05, 0],
        [0.09, 0.05],
        [0.1, 0.12],
        [0.07, 0.19],
        [0.035, 0.23],
        [0.04, 0.27],
        [0.05, 0.285],
        [0.03, 0.28],
        [0.001, 0.25],
      ],
      14,
    )
    const jars = { x: m(10.8), z: m(-3.6) }
    const J: Part[] = []
    for (const [dx, dz, s, kind] of [
      [0, 0, 1, 0],
      [0.38, 0.12, 0.92, 0],
      [0.15, -0.36, 1.05, 0],
      [0.45, -0.3, 1, 1],
    ]) {
      const t = 0.85 + rnd() * 0.25
      J.push({ geo: kind ? jugG : jarG, matrix: trs([jars.x + dx, 0, jars.z + dz], [0, rnd() * 6, 0], s), color: [t, t * 0.97, t * 0.95], uvOffset: [rnd(), 0] })
    }
    // 倒在地上的一個
    J.push({ geo: jugG, matrix: trs([jars.x - 0.35, 0.09, jars.z + 0.3], [0, 0.7, Math.PI / 2 - 0.12]), color: [0.95, 0.9, 0.85] })

    /* ---------- 灰堆 ---------- */
    const heap = new THREE.SphereGeometry(1, 20, 8, 0, Math.PI * 2, 0, Math.PI / 2)
    {
      const pa = heap.attributes.position as THREE.BufferAttribute
      for (let i = 0; i < pa.count; i++) {
        const x = pa.getX(i)
        const yy = pa.getY(i)
        const z = pa.getZ(i)
        const a = Math.atan2(z, x)
        const k = 1 + Math.sin(a * 3 + 1) * 0.12 + Math.sin(a * 7) * 0.05
        pa.setXYZ(i, x * k, yy * (0.9 + 0.2 * Math.sin(a * 5)), z * k)
      }
      heap.scale(0.6, 0.18, 0.48)
      heap.translate(ashAt.x, -0.01, ashAt.z)
      heap.computeVertexNormals()
    }
    const rug = new THREE.BoxGeometry(1.15, 0.012, 0.78)
    rug.translate(tools.x, 0.006, tools.z)

    const out = {
      bark: mergeParts(bark),
      ends: mergeParts(ends),
      bronze: mergeParts(B),
      clay: mergeParts(J),
      heap,
      rug,
      wood,
      jars,
    }
    ;[logSide, logEnd, bowl, pan, pot, handle, blade, lipG, prong, jarG, jugG].forEach((x) => x.dispose())
    return out
  }, [m])
  useDispose(g.bark, g.ends, g.bronze, g.clay, g.heap, g.rug)
  return (
    <group>
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider args={[0.6, 0.3, 0.42]} position={[g.wood.x, 0.3, g.wood.z]} />
        <CylinderCollider args={[0.3, 0.45]} position={[g.jars.x + 0.15, 0.3, g.jars.z - 0.08]} />
      </RigidBody>
      <mesh geometry={g.bark} material={smat.bark} castShadow receiveShadow />
      <mesh geometry={g.ends} material={smat.endgrain} castShadow receiveShadow />
      <mesh geometry={g.bronze} material={smat.bronze} castShadow receiveShadow />
      <mesh geometry={g.clay} material={smat.clay} castShadow receiveShadow />
      <mesh geometry={g.heap} material={mat.ash} castShadow receiveShadow />
      <mesh geometry={g.rug} material={mat.mat} receiveShadow />
    </group>
  )
}
