import { useMemo } from 'react'
import { CuboidCollider, RigidBody } from '@react-three/rapier'
import * as THREE from 'three'
import { boards, ceiling, floor, goatHair, hide, ramSkin, smat, withSway, woven } from '../../materials'
import { mulberry } from '../../rng'
import { coverLayer, hangingSheet, noise1 } from './drape'
import { mergeParts, ropeParts, trs, type Part } from './merge'
import { floorGrid, vnoise2 } from './CourtFloor'
import { useCurtainFade, useDebugCam, useDispose, useSwayClock, type M } from './hooks'

/**
 * 帳幕本體（出 26；36:8-38）
 * - 豎板：皂莢木包金，南北各 20 塊、西面 6 塊＋2 塊拐角板，每塊兩個銀卯座（26:15-25）
 * - 橫閂：每面 5 根，包金，穿在金環裡；中閂從這頭通到那頭（26:26-29）
 * - 幕幔四層（由內而外）：繡基路伯的細麻（天花板）、山羊毛、染紅的公羊皮、海狗皮（26:1-14）
 *   外層垂到接近地面、邊緣露出一點紅色公羊皮。各層長度、屋頂平或微垂都是推測。
 * - 門口：五根包金柱子、銅座、繡花門簾（26:36-37）；幔子：四根包金柱子、銀座、繡基路伯（26:31-32）
 * - 帳幕的橛子和繩子（35:18）
 */

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
const sstep = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a))
  return t * t * (3 - 2 * t)
}

/** 深色布／皮的頂點色：下緣沾沙塵（變亮、偏黃）、屋頂被太陽曬淡 */
function coverColor(dust: [number, number, number], roof: [number, number, number], seed: number) {
  return (y: number, onRoof: boolean, u: number): [number, number, number] => {
    if (onRoof) {
      const n = 0.85 + 0.3 * noise1(u * 0.7, seed)
      return [1 + (roof[0] - 1) * n, 1 + (roof[1] - 1) * n, 1 + (roof[2] - 1) * n]
    }
    const d = Math.pow(clamp01(1 - (y - 0.0) / 0.9), 1.8) * (0.6 + 0.4 * noise1(u * 1.9, seed + 1))
    const side = 1 + 0.06 * (noise1(u * 0.35, seed + 2) - 0.5)
    return [(1 + (dust[0] - 1) * d) * side, (1 + (dust[1] - 1) * d) * side, (1 + (dust[2] - 1) * d) * side]
  }
}

export function Tent({ m, cutaway }: { m: M; cutaway: boolean }) {
  useSwayClock()
  useDebugCam()
  const H = m(10)
  const T = m(1) // 板厚（經文未載，推測）
  const x0 = m(-30)
  const len = m(30)
  const cx = x0 + len / 2
  const Zi = m(5)
  const Zo = Zi + T
  const XB = x0 - T

  /* ---------- 豎板、銀座、橫閂、金環 ---------- */
  const frame = useMemo(() => {
    const rnd = mulberry(404)
    const bw = m(1.5)
    const board = new THREE.BoxGeometry(bw - 0.004, H, T)
    const sockH = m(0.45)
    const sock = new THREE.BoxGeometry(bw / 2 - 0.012, sockH, T + 0.05)
    const bar = new THREE.CylinderGeometry(0.042, 0.042, 1, 10, 1, true)
    bar.rotateZ(Math.PI / 2)
    const ring = new THREE.TorusGeometry(0.058, 0.011, 5, 12)
    const G: Part[] = []
    const S: Part[] = []
    const BAR: Part[] = []
    const tone = (): [number, number, number] => {
      const t = 0.93 + rnd() * 0.1
      return [t, t * (0.985 + rnd() * 0.02), t * (0.96 + rnd() * 0.04)]
    }
    const addBoard = (x: number, z: number, yaw: number) => {
      G.push({ geo: board, matrix: trs([x, H / 2, z], [0, yaw, 0]), color: tone(), uvOffset: [rnd() * 5, rnd() * 5] })
      for (const s of [-1, 1]) {
        const ox = yaw ? 0 : (s * bw) / 4
        const oz = yaw ? (s * bw) / 4 : 0
        const t = 0.9 + rnd() * 0.15
        S.push({ geo: sock, matrix: trs([x + ox, sockH / 2 - 0.003, z + oz], [0, yaw, 0]), color: [t, t, t] })
      }
    }
    for (const s of [-1, 1]) for (let i = 0; i < 20; i++) addBoard(x0 + (i + 0.5) * bw, s * (Zi + T / 2), 0)
    for (let i = 0; i < 8; i++) addBoard(x0 - T / 2, -Zo + (i + 0.5) * bw, Math.PI / 2)

    // 橫閂：在豎板外面；上下兩根各分兩半，中閂通到底
    const barYs = [H * 0.16, H * 0.5, H * 0.84]
    for (const s of [-1, 1]) {
      const z = s * (Zo + 0.05)
      for (const y of barYs) {
        const segs: [number, number][] = y === barYs[1] ? [[XB, 0]] : [[XB, cx - 0.04], [cx + 0.04, 0]]
        for (const [a, b] of segs) BAR.push({ geo: bar, matrix: trs([(a + b) / 2, y, z], [0, 0, 0], [b - a, 1, 1]) })
        for (let i = 0; i < 20; i++) BAR.push({ geo: ring, matrix: trs([x0 + (i + 0.5) * bw, y, z - s * 0.015], [0, Math.PI / 2, 0]) })
      }
    }
    for (const y of barYs) {
      const x = XB - 0.05
      const segs: [number, number][] = y === barYs[1] ? [[-Zo, Zo]] : [[-Zo, -0.04], [0.04, Zo]]
      for (const [a, b] of segs) BAR.push({ geo: bar, matrix: trs([x, y, (a + b) / 2], [0, Math.PI / 2, 0], [b - a, 1, 1]) })
      for (let i = 0; i < 8; i++) BAR.push({ geo: ring, matrix: trs([x + 0.015, y, -Zo + (i + 0.5) * bw], [0, 0, 0]) })
    }
    const out = { boards: mergeParts(G), sockets: mergeParts(S), bars: mergeParts(BAR) }
    ;[board, sock, bar, ring].forEach((g) => g.dispose())
    return out
  }, [m, H, T, x0, cx, Zi, Zo, XB])

  /* ---------- 四層幕幔 ---------- */
  const covers = useMemo(() => {
    const common = { xFront: 0, xBack: XB, zHalf: Zo, top: H, sag: 0.09, wavelength: 0.55, seed: 21, colsPerM: 9, ampTop: 0.006 }
    const goat = coverLayer({ ...common, off: 0.05, hem: 0.015, frontOver: 0.33, ampBottom: 0.07, color: coverColor([1.7, 1.5, 1.2], [1.1, 1.08, 1.05], 1) })
    const ram = coverLayer({ ...common, off: 0.1, hem: 0.3, frontOver: 0.37, ampBottom: 0.055, scallop: [0.75, 0.05], color: coverColor([1.25, 1.15, 1.05], [1, 1, 1], 2) })
    const tachash = coverLayer({ ...common, off: 0.15, hem: 0.46, frontOver: 0.41, ampBottom: 0.05, scallop: [0.85, 0.07], color: coverColor([1.45, 1.32, 1.12], [1.3, 1.24, 1.16], 3) })
    // 山羊毛幕幔的第六幅在前面摺疊垂下（26:9）
    const valance = hangingSheet({
      width: 2 * (Zo + 0.05) + 0.04,
      height: m(1.2),
      colsPerM: 10,
      rows: 6,
      wavelength: 0.45,
      ampTop: 0.008,
      ampBottom: 0.04,
      seed: 31,
      hookSpacing: 0,
      billow: 0.01,
      color: () => [1.05, 1.02, 1],
    })
    return { goat, ram, tachash, valance }
  }, [m, H, Zo, XB])

  /* ---------- 天花板：繡基路伯的細麻，兩幅之間微微下垂（推測），金鈎子（26:6）在幔子上方 ---------- */
  const ceil = useMemo(() => {
    const g = new THREE.PlaneGeometry(len, 2 * Zi, 60, 16)
    g.rotateX(Math.PI / 2)
    const pa = g.attributes.position as THREE.BufferAttribute
    const sagAt = (x: number, z: number) => {
      const ez = 1 - (z / Zi) ** 2
      // 每幅寬 4 肘，接縫處略高
      const seam = Math.abs(Math.sin((Math.PI * (x - x0)) / m(4)))
      return 0.08 * ez * (0.75 + 0.25 * seam) + 0.012 * ez * noise1(x * 0.8, 5)
    }
    for (let i = 0; i < pa.count; i++) {
      const x = pa.getX(i) + cx
      const z = pa.getZ(i)
      pa.setY(i, -sagAt(x, z))
    }
    g.translate(cx, H - 0.005, 0)
    g.computeVertexNormals()
    const knob = new THREE.SphereGeometry(0.016, 8, 6)
    const parts: Part[] = []
    const n = 20
    for (let i = 0; i < n; i++) {
      const z = -Zi + ((i + 0.5) / n) * 2 * Zi
      parts.push({ geo: knob, matrix: trs([m(-20), H - 0.005 - sagAt(m(-20), z) - 0.012, z], [0, 0, 0], [1.6, 1, 1]) })
    }
    const clasps = mergeParts(parts)
    knob.dispose()
    return { g, clasps }
  }, [m, len, Zi, cx, x0, H])

  /* ---------- 門口與幔子的柱子 ---------- */
  const columns = useMemo(() => {
    const rnd = mulberry(505)
    const r = m(0.24)
    const shaftFor = (h: number) => {
      const g = new THREE.CylinderGeometry(r * 0.94, r, h, 16, 1, true)
      // 金箔貼圖約 0.35 m 一張：沿柱身重複，不要被拉長成條紋
      const uv = g.attributes.uv as THREE.BufferAttribute
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * ((2 * Math.PI * r) / 0.35), uv.getY(i) * (h / 0.35))
      return g
    }
    const cap = new THREE.LatheGeometry(
      [
        [0.001, 0.1],
        [r * 1.25, 0.1],
        [r * 1.45, 0.08],
        [r * 1.5, 0.05],
        [r * 1.25, 0.02],
        [r * 1.05, -0.03],
        [r * 1.12, -0.06],
        [r * 0.99, -0.09],
      ].map(([a, b]) => new THREE.Vector2(a, b)),
      16,
    )
    const base = (w: number, h: number) => {
      const b = new THREE.BoxGeometry(w, h, w)
      const pa = b.attributes.position as THREE.BufferAttribute
      for (let i = 0; i < pa.count; i++) if (pa.getY(i) > 0) pa.setXYZ(i, pa.getX(i) * 0.86, pa.getY(i), pa.getZ(i) * 0.86)
      b.translate(0, h / 2, 0)
      b.computeVertexNormals()
      return b
    }
    const hook = new THREE.TorusGeometry(0.026, 0.006, 5, 8, Math.PI * 1.3)
    const rod = new THREE.CylinderGeometry(0.016, 0.016, 1, 8, 1, true)
    rod.rotateX(Math.PI / 2) // 沿 z
    const rodY = H - 0.16

    // 門口：五根柱子（銅座）
    const doorX = 0.15
    const dGold: Part[] = []
    const dBronze: Part[] = []
    const sockD = base(m(0.7), m(0.5))
    const shaftD = shaftFor(H - m(0.5))
    for (const zz of [-5, -2.5, 0, 2.5, 5]) {
      const z = m(zz) * 0.97
      const t = 0.95 + rnd() * 0.08
      dBronze.push({ geo: sockD, matrix: trs([doorX, 0, z]), color: [t, t, t] })
      dGold.push({ geo: shaftD, matrix: trs([doorX, m(0.5) + (H - m(0.5)) / 2, z], [0, rnd() * 6, 0]), color: [t, t, t], uvOffset: [rnd(), rnd()] })
      dGold.push({ geo: cap, matrix: trs([doorX, H - 0.02, z]) })
      dGold.push({ geo: hook, matrix: trs([doorX - r - 0.022, rodY + 0.008, z], [0, Math.PI, Math.PI * 0.85]) })
    }
    const doorRodX = doorX - r - 0.022
    dGold.push({ geo: rod, matrix: trs([doorRodX, rodY, 0], [0, 0, 0], [1, 1, 2 * Zi + 0.1]) })

    // 幔子：四根柱子（銀座）
    const veilX = m(-20)
    const vGold: Part[] = []
    const vSilver: Part[] = []
    const sockV = base(m(0.7), m(0.45))
    const shaftV = shaftFor(H - m(0.45))
    for (const zz of [-3.75, -1.25, 1.25, 3.75]) {
      const z = m(zz)
      const t = 0.95 + rnd() * 0.08
      vSilver.push({ geo: sockV, matrix: trs([veilX, 0, z]), color: [t, t, t] })
      vGold.push({ geo: shaftV, matrix: trs([veilX, m(0.45) + (H - m(0.45)) / 2, z], [0, rnd() * 6, 0]), color: [t, t, t], uvOffset: [rnd(), rnd()] })
      vGold.push({ geo: cap, matrix: trs([veilX, H - 0.02, z]) })
      vGold.push({ geo: hook, matrix: trs([veilX - r - 0.022, rodY + 0.008, z], [0, Math.PI, Math.PI * 0.85]) })
    }
    const veilRodX = veilX - r - 0.022
    vGold.push({ geo: rod, matrix: trs([veilRodX, rodY, 0], [0, 0, 0], [1, 1, 2 * Zi]) })

    const out = {
      doorGold: mergeParts(dGold),
      doorBronze: mergeParts(dBronze),
      veilGold: mergeParts(vGold),
      veilSilver: mergeParts(vSilver),
      doorRodX,
      veilRodX,
      rodY,
    }
    ;[cap, hook, rod, sockD, shaftD, sockV, shaftV].forEach((g) => g.dispose())
    return out
  }, [m, H, Zi])

  /* ---------- 門簾、幔子（有皺褶的布） ---------- */
  const hangings = useMemo(() => {
    const top = columns.rodY - 0.018
    const dust = (amt: number) => (_x: number, y: number): [number, number, number] => {
      const d = Math.pow(clamp01(1 - y / 0.4), 1.6) * amt
      return [1 - d * 0.22, 1 - d * 0.28, 1 - d * 0.36]
    }
    const door = hangingSheet({
      width: 2 * Zi,
      height: top - 0.03,
      colsPerM: 12,
      rows: 14,
      wavelength: 0.5,
      ampTop: 0.008,
      ampBottom: 0.035,
      seed: 41,
      hookSpacing: 0.32,
      hemNoise: 0.008,
      billow: 0.02,
      uv: 'unit',
      color: dust(0.8),
    })
    const veil = hangingSheet({
      width: 2 * Zi,
      height: top - 0.02,
      colsPerM: 12,
      rows: 14,
      wavelength: 0.55,
      ampTop: 0.006,
      ampBottom: 0.028,
      seed: 42,
      hookSpacing: 0.32,
      hemNoise: 0.006,
      billow: 0.008,
      uv: 'unit',
      color: dust(0.3),
    })
    return { door, veil, top }
  }, [columns, Zi])

  /* ---------- 帳幕裡的地面：沙地，靠牆較暗、走道踩實 ---------- */
  const inner = useMemo(() => {
    const veilX = m(-20)
    return floorGrid(x0, 0, -Zi, Zi, 0.25, {
      color(x, z) {
        const dw = Math.min(x - x0, Zi - Math.abs(z))
        const ao = 0.72 + 0.28 * sstep(0, 0.7, dw)
        const av = 1 - 0.12 * (1 - sstep(0, 0.4, Math.abs(x - veilX)))
        const lane = (1 - sstep(0.3, 0.9, Math.abs(z))) * (x > m(-19) ? 1 : 0.3)
        const n = 1 + (vnoise2(x * 0.5, z * 0.5) - 0.5) * 0.1
        const k = ao * av * n * (1 - lane * 0.06)
        return [k, k * 0.98, k * 0.96]
      },
      height(x, z) {
        const dw = Math.min(x - x0, Zi - Math.abs(z), -x)
        return 0.016 + (vnoise2(x * 1.4, z * 1.4) * 0.006 + (1 - sstep(0, 0.3, dw)) * 0.01) * 1
      },
    })
  }, [m, x0, Zi])

  /* ---------- 帳幕的橛子和繩子（35:18） ---------- */
  const ropes = useMemo(() => {
    const rnd = mulberry(606)
    const rope = new THREE.CylinderGeometry(0.0075, 0.0075, 1, 4, 1, true)
    const peg = new THREE.CylinderGeometry(0.02, 0.008, 0.4, 6)
    const R: Part[] = []
    const P: Part[] = []
    const add = (ax: number, az: number, nx: number, nz: number) => {
      const D = 1.8 + rnd() * 0.25
      const px = ax + nx * D
      const pz = az + nz * D
      const lean = 0.35
      P.push({ geo: peg, matrix: trs([px, 0.09, pz], [nz * lean, 0, -nx * lean]) })
      const a = new THREE.Vector3(ax + nx * 0.02, H + 0.13, az + nz * 0.02)
      R.push(...ropeParts(rope, a, new THREE.Vector3(px + nx * 0.05, 0.22, pz + nz * 0.05), 0.012, 4))
    }
    const top = Zo + 0.16
    for (let i = 0; i <= 10; i++) {
      const x = x0 + i * m(3) - (i === 10 ? 0.2 : 0)
      add(x, -top, 0, -1)
      add(x, top, 0, 1)
    }
    for (const zz of [-4.5, -1.5, 1.5, 4.5]) add(XB - 0.16, m(zz), -1, 0)
    const out = { ropes: mergeParts(R), pegs: mergeParts(P) }
    rope.dispose()
    peg.dispose()
    return out
  }, [m, H, Zo, x0, XB])

  /* ---------- 材質 ---------- */
  const mats = useMemo(
    () => ({
      boards: boards(len / 30),
      goat: goatHair(1.6),
      ram: ramSkin(2),
      tachash: hide(2.2),
      ceiling: ceiling([len, 2 * Zi], len / 30),
      floor: floor(true),
      door: withSway(woven('door', [2 * Zi, H]), 0.02),
      veil: withSway(woven('veil', [2 * Zi, H], true), 0.01),
    }),
    [len, Zi, H],
  )
  useCurtainFade(mats.door, 0, m(5))
  useDispose(
    frame.boards,
    frame.sockets,
    frame.bars,
    covers.goat,
    covers.ram,
    covers.tachash,
    covers.valance,
    ceil.g,
    ceil.clasps,
    columns.doorGold,
    columns.doorBronze,
    columns.veilGold,
    columns.veilSilver,
    hangings.door,
    hangings.veil,
    inner,
    ropes.ropes,
    ropes.pegs,
  )

  return (
    <group>
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider args={[len / 2 + T / 2, H / 2, T / 2]} position={[cx - T / 2, H / 2, m(-5) - T / 2]} />
        <CuboidCollider args={[len / 2 + T / 2, H / 2, T / 2]} position={[cx - T / 2, H / 2, m(5) + T / 2]} />
        <CuboidCollider args={[T / 2, H / 2, m(5) + T]} position={[x0 - T / 2, H / 2, 0]} />
        {/* 幔子：不可進入至聖所 */}
        <CuboidCollider args={[0.1, H / 2, m(5)]} position={[m(-20), H / 2, 0]} />
        {/* 帳幕外罩垂到地面附近，四周不可穿越 */}
        <CuboidCollider args={[0.1, H / 2, m(1.5)]} position={[0.05, H / 2, m(-6.3)]} />
        <CuboidCollider args={[0.1, H / 2, m(1.5)]} position={[0.05, H / 2, m(6.3)]} />
        {/* 屋頂 */}
        {!cutaway && <CuboidCollider args={[len / 2 + T, 0.1, m(5) + T]} position={[cx, H + 0.1, 0]} />}
      </RigidBody>

      {/* 豎板（包金）、銀座、橫閂 */}
      <mesh geometry={frame.boards} material={mats.boards} castShadow receiveShadow />
      <mesh geometry={frame.sockets} material={smat.silverIn} receiveShadow />
      <mesh geometry={frame.bars} material={smat.gold} castShadow />

      {/* 帳幕裡的沙地 */}
      <mesh geometry={inner} material={mats.floor} receiveShadow />

      {!cutaway && (
        <group>
          <mesh geometry={ceil.g} material={mats.ceiling} receiveShadow />
          <mesh geometry={ceil.clasps} material={smat.goldIn} />
          <mesh geometry={covers.goat} material={mats.goat} castShadow receiveShadow />
          <mesh geometry={covers.ram} material={mats.ram} castShadow receiveShadow />
          <mesh geometry={covers.tachash} material={mats.tachash} castShadow receiveShadow />
          <mesh geometry={covers.valance} material={mats.goat} position={[0.335, H + 0.05, 0]} rotation={[0, Math.PI / 2, 0]} castShadow receiveShadow />
          <mesh geometry={ropes.ropes} material={smat.rope} castShadow />
          <mesh geometry={ropes.pegs} material={smat.bronze} castShadow />
        </group>
      )}

      {/* 帳幕門：五根包金柱子＋繡花門簾（可穿過） */}
      <mesh geometry={columns.doorGold} material={smat.gold} castShadow receiveShadow />
      <mesh geometry={columns.doorBronze} material={smat.bronze} castShadow receiveShadow />
      <mesh geometry={hangings.door} material={mats.door} position={[columns.doorRodX, hangings.top, 0]} rotation={[0, Math.PI / 2, 0]} castShadow receiveShadow />

      {/* 幔子：四根包金柱子＋銀座 */}
      <mesh geometry={columns.veilGold} material={smat.goldIn} castShadow receiveShadow />
      <mesh geometry={columns.veilSilver} material={smat.silverIn} receiveShadow />
      {/* 剖面模式隱藏幔子，才看得到至聖所裡的法櫃（碰撞體保留） */}
      <mesh visible={!cutaway} geometry={hangings.veil} material={mats.veil} position={[columns.veilRodX, hangings.top, 0]} rotation={[0, Math.PI / 2, 0]} castShadow receiveShadow />
    </group>
  )
}
