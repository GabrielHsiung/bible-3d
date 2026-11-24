import { useMemo } from 'react'
import { CuboidCollider, RigidBody } from '@react-three/rapier'
import * as THREE from 'three'
import { linen, smat, withSway, woven } from '../../materials'
import { mulberry } from '../../rng'
import { hangingSheet, noise1 } from './drape'
import { mergeParts, ropeParts, trs, type Part } from './merge'
import { useCurtainFade, useDispose, useSwayClock, type M } from './hooks'
import { CourtFloor } from './CourtFloor'
import { CourtProps } from './CourtProps'

/**
 * 院子（出 27:9-19；38:9-20）
 * - 帷子：撚的細麻，高 5 肘，掛在柱子外側的銀鉤、銀杆上；有真的垂墜皺褶，下緣隨風輕擺
 * - 柱子：皂莢木（材料為推測；經文只說柱子）、銅卯座、柱頂包銀、銀鉤、銀杆
 * - 院子的橛子都用銅作（27:19），用繩子把柱子拉住（35:18）
 * - 東面門簾：藍色紫色朱紅色線和細麻繡花，寬 20 肘（27:16）
 */

/** 帷子離柱子中心的距離：掛在柱子外側 */
const CO = 0.12
const ROD_R = 0.011

type Pil = { x: number; z: number; nx: number; nz: number; gateMid: boolean; corner: boolean }

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
const lerp3 = (a: number[], b: number[], t: number): [number, number, number] => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]

/** 細麻帷子的頂點色：每幅布白度略不同、下緣沾沙塵、雨痕 */
function linenColor(seed: number, panelW: number, dustAmt = 0.75) {
  return (xl: number, y: number): [number, number, number] => {
    const panel = Math.floor(xl / panelW)
    const k = 0.93 + 0.07 * noise1(panel * 7.3 + 0.5, seed)
    const base = [k, k * 0.985, k * 0.955]
    const streak = 1 - 0.05 * noise1(xl * 2.3, seed + 3) * noise1(y * 0.8 + xl, seed + 4)
    const d = Math.pow(clamp01(1 - y / 0.5), 1.6) * (0.55 + 0.45 * noise1(xl * 1.7, seed + 1))
    const c = lerp3(base, [0.7, 0.6, 0.47], d * dustAmt)
    return [c[0] * streak, c[1] * streak, c[2] * streak]
  }
}

export function Courtyard({ m }: { m: M }) {
  useSwayClock()
  const H = m(5)
  const rodY = H - 0.13
  const clothTop = rodY - ROD_R - 0.004
  const clothH = clothTop - 0.06
  const r = m(0.2) // 柱子半徑（推測）

  const pillars = useMemo(() => {
    const p: Pil[] = []
    for (let i = 0; i <= 20; i++)
      for (const s of [-1, 1]) {
        const corner = i === 0 || i === 20
        const nx = corner ? (i === 0 ? -1 : 1) * Math.SQRT1_2 : 0
        p.push({ x: m(-50 + i * 5), z: m(25 * s), nx, nz: corner ? s * Math.SQRT1_2 : s, gateMid: false, corner })
      }
    for (let i = 1; i < 10; i++)
      for (const s of [-1, 1]) {
        const z = -25 + i * 5
        p.push({ x: m(50 * s), z: m(z), nx: s, nz: 0, gateMid: s === 1 && Math.abs(z) < 10, corner: false })
      }
    return p
  }, [m])

  /* ---------- 柱子、卯座、柱頂、鉤子、杆子、繩子、橛子：合併成幾個 mesh ---------- */
  const { wood, bronze, silver, ropes, pegs } = useMemo(() => {
    const rnd = mulberry(7)
    const sockH = m(0.5)
    const sockW = m(0.62)
    const sock = new THREE.BoxGeometry(sockW, sockH, sockW)
    {
      // 卯座：上窄下寬、頂面有個卯口的凸緣（造型推測）
      const pa = sock.attributes.position as THREE.BufferAttribute
      for (let i = 0; i < pa.count; i++) if (pa.getY(i) > 0) pa.setXYZ(i, pa.getX(i) * 0.84, pa.getY(i), pa.getZ(i) * 0.84)
      sock.translate(0, sockH / 2, 0)
      sock.computeVertexNormals()
    }
    const lip = new THREE.CylinderGeometry(r * 1.25, r * 1.4, 0.04, 12)
    const shaftLen = H - sockH
    const shaft = new THREE.CylinderGeometry(r * 0.92, r, shaftLen, 14, 1, true)
    const cap = new THREE.LatheGeometry(
      [
        [0.001, 0.075],
        [r * 1.2, 0.075],
        [r * 1.42, 0.058],
        [r * 1.45, 0.035],
        [r * 1.2, 0.012],
        [r * 1.02, -0.02],
        [r * 1.1, -0.045],
        [r * 0.98, -0.07],
      ].map(([a, b]) => new THREE.Vector2(a, b)),
      14,
    )
    const hook = new THREE.TorusGeometry(0.021, 0.0045, 5, 8, Math.PI * 1.3)
    const rod = new THREE.CylinderGeometry(ROD_R, ROD_R, 1, 6, 1, true)
    rod.rotateZ(Math.PI / 2) // 沿 x
    const rope = new THREE.CylinderGeometry(0.0065, 0.0065, 1, 4, 1, true)
    const peg = new THREE.CylinderGeometry(0.018, 0.007, 0.36, 6)
    const pegHead = new THREE.CylinderGeometry(0.026, 0.02, 0.03, 6)

    const W: Part[] = []
    const B: Part[] = []
    const S: Part[] = []
    const R: Part[] = []
    const P: Part[] = []
    const addPeg = (x: number, z: number, nx: number, nz: number) => {
      // 橛子往外斜打進地裡，露出約 20 公分
      const lean = 0.35
      const rotZ = -nx * lean
      const rotX = nz * lean
      const tone = 0.85 + rnd() * 0.2
      P.push({ geo: peg, matrix: trs([x, 0.08, z], [rotX, 0, rotZ]), color: [tone, tone, tone] })
      P.push({ geo: pegHead, matrix: trs([x + nx * 0.062, 0.25, z + nz * 0.062], [rotX, 0, rotZ]) })
      return new THREE.Vector3(x + nx * 0.045, 0.2, z + nz * 0.045)
    }

    for (const pl of pillars) {
      const tone = 0.88 + rnd() * 0.18
      B.push({ geo: sock, matrix: trs([pl.x, 0, pl.z], [0, 0, 0]), color: [tone, tone * 0.98, tone * 0.95] })
      B.push({ geo: lip, matrix: trs([pl.x, sockH + 0.01, pl.z]) })
      W.push({
        geo: shaft,
        matrix: trs([pl.x, sockH + shaftLen / 2, pl.z], [(rnd() - 0.5) * 0.006, rnd() * Math.PI * 2, (rnd() - 0.5) * 0.006]),
        color: [0.85 + rnd() * 0.2, 0.85 + rnd() * 0.15, 0.85 + rnd() * 0.12],
        uvOffset: [rnd(), rnd()],
      })
      S.push({ geo: cap, matrix: trs([pl.x, H - 0.02, pl.z], [0, rnd() * 6, 0]) })
      // 鉤子：在柱子外側，開口朝上，銀杆穿過
      const normals: [number, number][] = pl.corner ? [[Math.sign(pl.nx), 0], [0, Math.sign(pl.nz)]] : [[pl.nx, pl.nz]]
      for (const [nx, nz] of normals) {
        const off = pl.gateMid ? CO + 0.035 : CO
        const th = Math.atan2(-nz, nx)
        S.push({ geo: hook, matrix: trs([pl.x + nx * off, rodY + 0.006, pl.z + nz * off], [0, th, Math.PI * 0.85]) })
      }
      // 繩子：從柱頂拉到地上的銅橛子
      if (pl.gateMid) continue
      const top = new THREE.Vector3(pl.x, H + 0.02, pl.z)
      const D = 2.3 + rnd() * 0.3
      const outs: [number, number][] = [[pl.nx, pl.nz]]
      if (!pl.corner && !(pl.x === m(50) && Math.abs(pl.z) <= m(10) + 0.01)) outs.push([-pl.nx, -pl.nz])
      for (const [nx, nz] of outs) {
        const end = addPeg(pl.x + nx * D, pl.z + nz * D, nx, nz)
        const a = top.clone().add(new THREE.Vector3(nx * r * 0.9, 0, nz * r * 0.9))
        R.push(...ropeParts(rope, a, end, 0.01, 3))
      }
    }
    // 銀杆：沿四面
    const rods: [number, number, number, number][] = [
      // x0, z0, x1, z1
      [m(-50) - CO, m(-25) - CO, m(50) + CO, m(-25) - CO],
      [m(-50) - CO, m(25) + CO, m(50) + CO, m(25) + CO],
      [m(-50) - CO, m(-25) - CO, m(-50) - CO, m(25) + CO],
      [m(50) + CO, m(-25) - CO, m(50) + CO, m(-10)],
      [m(50) + CO, m(10), m(50) + CO, m(25) + CO],
      [m(50) + CO + 0.035, m(-10) - 0.1, m(50) + CO + 0.035, m(10) + 0.1],
    ]
    for (const [x0, z0, x1, z1] of rods) {
      const len = Math.hypot(x1 - x0, z1 - z0)
      S.push({ geo: rod, matrix: trs([(x0 + x1) / 2, rodY, (z0 + z1) / 2], [0, Math.atan2(-(z1 - z0), x1 - x0), 0], [len, 1, 1]) })
    }
    const out = {
      wood: mergeParts(W),
      bronze: mergeParts(B),
      silver: mergeParts(S),
      ropes: mergeParts(R),
      pegs: mergeParts(P),
    }
    ;[sock, lip, shaft, cap, hook, rod, rope, peg, pegHead].forEach((g) => g.dispose())
    return out
  }, [m, pillars, H, rodY, r])

  /* ---------- 帷子 ---------- */
  const sheets = useMemo(() => {
    const mk = (w: number, seed: number) =>
      hangingSheet({
        width: w,
        height: clothH,
        colsPerM: 14,
        rows: 10,
        wavelength: 0.33,
        ampTop: 0.008,
        ampBottom: 0.045,
        seed,
        hookSpacing: 0.26,
        hemNoise: 0.012,
        billow: 0.05,
        color: linenColor(seed, m(5)),
      })
    return {
      north: mk(m(100) + 2 * CO, 1),
      south: mk(m(100) + 2 * CO, 2),
      west: mk(m(50) + 2 * CO, 3),
      eastN: mk(m(15) + CO, 4),
      eastS: mk(m(15) + CO, 5),
      gate: hangingSheet({
        width: m(20) + 0.2,
        height: clothH,
        colsPerM: 14,
        rows: 10,
        wavelength: 0.42,
        ampTop: 0.008,
        ampBottom: 0.04,
        seed: 6,
        hookSpacing: 0.3,
        hemNoise: 0.01,
        billow: 0.03,
        uv: 'unit',
        color: linenColor(6, 100, 0.55),
      }),
    }
  }, [m, clothH])

  const linenM = useMemo(() => linen(0.15), [])
  const gate = useMemo(() => withSway(woven('gate', [m(20), clothH]), 0.025), [m, clothH])
  useCurtainFade(gate, m(50) + 0.2, m(10))
  useDispose(wood, bronze, silver, ropes, pegs, ...Object.values(sheets))

  const walls: [number, number, number, boolean][] = [
    [0, -25, 100, true],
    [0, 25, 100, true],
    [-50, 0, 50, false],
    [50, -17.5, 15, false],
    [50, 17.5, 15, false],
  ]
  const ez = (m(25) + CO + m(10)) / 2

  return (
    <group>
      <RigidBody type="fixed" colliders={false}>
        {walls.map(([x, z, len, alongX], i) => (
          <CuboidCollider key={i} args={alongX ? [m(len / 2), H / 2, 0.1] : [0.1, H / 2, m(len / 2)]} position={[m(x), H / 2, m(z)]} />
        ))}
      </RigidBody>

      {/* 帷子（掛在柱子外側） */}
      <mesh geometry={sheets.north} material={linenM} position={[0, clothTop, -m(25) - CO]} castShadow receiveShadow />
      <mesh geometry={sheets.south} material={linenM} position={[0, clothTop, m(25) + CO]} castShadow receiveShadow />
      <mesh geometry={sheets.west} material={linenM} position={[-m(50) - CO, clothTop, 0]} rotation={[0, Math.PI / 2, 0]} castShadow receiveShadow />
      <mesh geometry={sheets.eastN} material={linenM} position={[m(50) + CO, clothTop, -ez]} rotation={[0, Math.PI / 2, 0]} castShadow receiveShadow />
      <mesh geometry={sheets.eastS} material={linenM} position={[m(50) + CO, clothTop, ez]} rotation={[0, Math.PI / 2, 0]} castShadow receiveShadow />
      {/* 院子的門簾（東面，寬 20 肘），可穿過 */}
      <mesh geometry={sheets.gate} material={gate} position={[m(50) + CO + 0.035, clothTop, 0]} rotation={[0, -Math.PI / 2, 0]} castShadow receiveShadow />

      <mesh geometry={wood} material={smat.wood} castShadow receiveShadow />
      <mesh geometry={bronze} material={smat.bronze} castShadow receiveShadow />
      <mesh geometry={silver} material={smat.silver} castShadow />
      <mesh geometry={ropes} material={smat.rope} castShadow />
      <mesh geometry={pegs} material={smat.bronze} castShadow />

      <CourtFloor m={m} />
      <CourtProps m={m} />
    </group>
  )
}
