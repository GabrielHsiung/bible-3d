import { useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { CuboidCollider, RigidBody } from '@react-three/rapier'
import * as THREE from 'three'
import { input, useStore } from '../store'
import { boards, ceiling, hide, linen, mat, woven } from '../materials'
import { Altar, Ark, IncenseAltar, Lampstand, Laver, Table } from './sacred'

type M = (n: number) => number

/** 相機和玩家分在門簾兩側時，門簾變半透明，避免擋住視線 */
function useCurtainFade(material: THREE.MeshStandardMaterial, planeX: number, halfWidth: number) {
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

/* ---------- 院子 ---------- */
function Courtyard({ m }: { m: M }) {
  const pillars = useMemo(() => {
    const p: [number, number][] = []
    for (let i = 0; i <= 20; i++) {
      p.push([-50 + i * 5, -25], [-50 + i * 5, 25])
    }
    for (let i = 1; i < 10; i++) p.push([-50, -25 + i * 5], [50, -25 + i * 5])
    return p
  }, [])

  const linenL = useMemo(() => linen(20), [])
  const linenShort = useMemo(() => linen(3), [])
  const linenW = useMemo(() => linen(10), [])
  const gate = useMemo(() => woven('gate', 2), [])
  useCurtainFade(gate, m(50) + 0.25, m(10))

  const H = m(5)
  const hangH = H - m(0.4)
  const t = 0.04
  // [x, z, 長, 是否沿 x 軸, 材質]
  const walls: [number, number, number, boolean, THREE.Material][] = [
    [0, -25, 100, true, linenL],
    [0, 25, 100, true, linenL],
    [-50, 0, 50, false, linenW],
    [50, -17.5, 15, false, linenShort],
    [50, 17.5, 15, false, linenShort],
  ]

  return (
    <group>
      <RigidBody type="fixed" colliders={false}>
        {walls.map(([x, z, len, alongX], i) => (
          <CuboidCollider
            key={i}
            args={alongX ? [m(len / 2), H / 2, 0.1] : [0.1, H / 2, m(len / 2)]}
            position={[m(x), H / 2, m(z)]}
          />
        ))}
      </RigidBody>

      {walls.map(([x, z, len, alongX, mt], i) => (
        <mesh
          key={i}
          material={mt}
          position={[m(x), hangH / 2 + m(0.15), m(z)]}
          rotation={[0, alongX ? 0 : Math.PI / 2, 0]}
          castShadow
          receiveShadow
        >
          <boxGeometry args={[m(len), hangH, t]} />
        </mesh>
      ))}

      {/* 院子的門簾（東面，寬 20 肘），可穿過 */}
      <mesh material={gate} position={[m(50) + 0.25, hangH / 2 + m(0.15), 0]} rotation={[0, Math.PI / 2, 0]} castShadow>
        <boxGeometry args={[m(20), hangH, t]} />
      </mesh>

      {/* 銀杆（柱子頂端連絡） */}
      {[
        [0, -25, 100, true],
        [0, 25, 100, true],
        [-50, 0, 50, false],
        [50, 0, 50, false],
      ].map(([x, z, len, alongX], i) => (
        <mesh key={i} material={mat.silver} position={[m(x as number), H, m(z as number)]} rotation={[0, alongX ? 0 : Math.PI / 2, 0]}>
          <boxGeometry args={[m(len as number), 0.05, 0.05]} />
        </mesh>
      ))}

      {pillars.map(([x, z], i) => (
        <group key={i} position={[m(x), 0, m(z)]}>
          <mesh material={mat.bronze} position={[0, m(0.35), 0]} castShadow>
            <boxGeometry args={[m(0.9), m(0.7), m(0.9)]} />
          </mesh>
          <mesh material={mat.wood} position={[0, H / 2, 0]} castShadow>
            <cylinderGeometry args={[m(0.22), m(0.25), H, 10]} />
          </mesh>
          <mesh material={mat.silver} position={[0, H, 0]}>
            <cylinderGeometry args={[m(0.32), m(0.24), m(0.35), 10]} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

/* ---------- 帳幕本體 ---------- */
function Tent({ m, cutaway }: { m: M; cutaway: boolean }) {
  const H = m(10)
  const T = m(1) // 板厚（經文未載，推測）
  const boardsL = useMemo(() => boards(20), [])
  const boardsW = useMemo(() => boards(7), [])
  const hideM = useMemo(() => hide(6, 2), [])
  const ceilingM = useMemo(() => ceiling(), [])
  const door = useMemo(() => woven('gate', 1), [])
  useCurtainFade(door, 0, m(5))
  const veil = useMemo(() => woven('veil', 1, true), [])

  const x0 = m(-30)
  const len = m(30)
  const cx = x0 + len / 2

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

      {/* 南北兩面豎板 */}
      {[-1, 1].map((s) => (
        <mesh key={s} material={boardsL} position={[cx - T / 2, H / 2, s * (m(5) + T / 2)]} castShadow receiveShadow>
          <boxGeometry args={[len + T, H, T]} />
        </mesh>
      ))}
      {/* 西面豎板 */}
      <mesh material={boardsW} position={[x0 - T / 2, H / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[T, H, m(10) + 2 * T]} />
      </mesh>
      {/* 銀座（每塊板兩個卯座） */}
      {[-1, 1].map((s) =>
        Array.from({ length: 20 }, (_, i) => (
          <mesh key={`${s}-${i}`} material={mat.silver} position={[x0 + m(1.5) * i + m(0.75), m(0.25), s * (m(5) + T / 2)]}>
            <boxGeometry args={[m(1.4), m(0.5), T + 0.04]} />
          </mesh>
        )),
      )}

      {!cutaway && (
        <group>
          {/* 內層：繡基路伯的細麻幕幔（天花板） */}
          <mesh material={ceilingM} position={[cx, H - 0.01, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <planeGeometry args={[len, m(10)]} />
          </mesh>
          {/* 外罩：染紅公羊皮＋海狗皮 */}
          <mesh material={mat.ram} position={[cx - T / 2, H + 0.06, 0]} castShadow>
            <boxGeometry args={[len + T + 0.3, 0.08, m(10) + 2 * T + 0.5]} />
          </mesh>
          <mesh material={hideM} position={[cx - T / 2, H + 0.14, 0]} castShadow>
            <boxGeometry args={[len + T + 0.5, 0.08, m(10) + 2 * T + 0.7]} />
          </mesh>
          {[-1, 1].map((s) => (
            <mesh key={s} material={hideM} position={[cx - T / 2, H / 2 + m(0.5), s * (m(5) + T + 0.3)]} castShadow>
              <boxGeometry args={[len + T + 0.5, H - m(1) + 0.2, 0.06]} />
            </mesh>
          ))}
          <mesh material={hideM} position={[x0 - T - 0.3, H / 2 + m(0.5), 0]} castShadow>
            <boxGeometry args={[0.06, H - m(1) + 0.2, m(10) + 2 * T + 0.7]} />
          </mesh>
        </group>
      )}

      {/* 帳幕門：五根包金柱子＋門簾（可穿過） */}
      {[-5, -2.5, 0, 2.5, 5].map((z) => (
        <group key={z} position={[0.15, 0, m(z) * 0.97]}>
          <mesh material={mat.bronze} position={[0, m(0.35), 0]}>
            <boxGeometry args={[m(0.9), m(0.7), m(0.9)]} />
          </mesh>
          <mesh material={mat.gold} position={[0, H / 2, 0]} castShadow>
            <cylinderGeometry args={[m(0.25), m(0.25), H, 12]} />
          </mesh>
        </group>
      ))}
      <mesh material={door} position={[-0.05, H / 2 + m(0.3), 0]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[m(10), H - m(0.6)]} />
      </mesh>

      {/* 幔子：四根包金柱子＋銀座 */}
      {[-3.75, -1.25, 1.25, 3.75].map((z) => (
        <group key={z} position={[m(-20), 0, m(z)]}>
          <mesh material={mat.silverIn} position={[0, m(0.25), 0]}>
            <boxGeometry args={[m(0.8), m(0.5), m(0.8)]} />
          </mesh>
          <mesh material={mat.goldIn} position={[0, H / 2, 0]}>
            <cylinderGeometry args={[m(0.22), m(0.22), H, 12]} />
          </mesh>
        </group>
      ))}
      <mesh material={veil} position={[m(-20) - 0.12, H / 2, 0]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[m(10), H]} />
      </mesh>
    </group>
  )
}

/* ---------- 尺寸框（靠近時顯示） ---------- */
const BOXES: Record<string, { c: [number, number]; s: [number, number, number] }> = {
  altar: { c: [20, 0], s: [5, 3, 5] },
  table: { c: [-10, -3], s: [2, 1.5, 1] },
  incense: { c: [-18, 0], s: [1, 2, 1] },
  ark: { c: [-25, 0], s: [2.5, 1.5, 1.5] },
  tent: { c: [-15, 0], s: [30, 10, 10] },
  court: { c: [0, 0], s: [100, 5, 50] },
  gate: { c: [50, 0], s: [0.3, 5, 20] },
  door: { c: [0, 0], s: [0.3, 10, 10] },
  veil: { c: [-20, 0], s: [0.3, 10, 10] },
}

function DimBox({ m }: { m: M }) {
  const nearId = useStore((s) => s.nearId)
  const b = nearId ? BOXES[nearId] : null
  const geo = useMemo(() => (b ? new THREE.EdgesGeometry(new THREE.BoxGeometry(m(b.s[0]), m(b.s[1]), m(b.s[2]))) : null), [b, m])
  if (!b || !geo) return null
  return (
    <lineSegments userData={{ noPathTrace: true }} geometry={geo} position={[m(b.c[0]), m(b.s[1]) / 2 + 0.01, m(b.c[1])]} renderOrder={10}>
      <lineBasicMaterial color="#ffcf5a" depthTest={false} transparent opacity={0.9} />
    </lineSegments>
  )
}

export function Tabernacle({ C }: { C: number }) {
  const cutaway = useStore((s) => s.cutaway)
  const m = useMemo<M>(() => (n: number) => n * C, [C])
  return (
    <group>
      <Courtyard m={m} />
      <Altar m={m} />
      <Laver m={m} />
      <Tent m={m} cutaway={cutaway} />
      <Table m={m} />
      <Lampstand m={m} />
      <IncenseAltar m={m} />
      <Ark m={m} />
      <DimBox m={m} />
    </group>
  )
}
