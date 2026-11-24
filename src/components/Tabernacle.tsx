import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { CuboidCollider, CylinderCollider, RigidBody } from '@react-three/rapier'
import * as THREE from 'three'
import { useStore } from '../store'
import { mat } from '../materials'
import { Courtyard } from './structure/Courtyard'
import { Tent } from './structure/Tent'

type M = (n: number) => number

/* ---------- 燔祭壇 ---------- */
function Altar({ m }: { m: M }) {
  const fire = useRef<THREE.PointLight>(null)
  useFrame(({ clock }) => {
    if (fire.current) fire.current.intensity = 6 + Math.sin(clock.elapsedTime * 13) * 1.5 + Math.sin(clock.elapsedTime * 7.3)
  })
  const w = m(5)
  const h = m(3)
  return (
    <group position={[m(20), 0, 0]}>
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider args={[w / 2, h / 2, w / 2]} position={[0, h / 2, 0]} />
      </RigidBody>
      <mesh material={mat.bronzeBig} position={[0, h / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[w, h, w]} />
      </mesh>
      {/* 壇的四圍腰板：銅網（出 27:4–5） */}
      <Grating w={w} y={h * 0.42} hgt={m(0.5)} />
      {[
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
      ].map(([sx, sz], i) => (
        <mesh key={i} material={mat.bronze} position={[(sx * w) / 2 - sx * m(0.3), h + m(0.3), (sz * w) / 2 - sz * m(0.3)]} castShadow>
          <coneGeometry args={[m(0.3), m(0.7), 8]} />
        </mesh>
      ))}
      {/* 抬壇的槓 */}
      {[-1, 1].map((s) => (
        <mesh key={s} material={mat.bronze} position={[0, h * 0.45, s * (w / 2 + m(0.25))]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[m(0.1), m(0.1), w + m(2), 8]} />
        </mesh>
      ))}
      {/* 壇上的火：炭床＋跳動的火焰 */}
      <mesh material={mat.ember} position={[0, h + 0.04, 0]}>
        <boxGeometry args={[w * 0.8, 0.1, w * 0.8]} />
      </mesh>
      <Flames w={w * 0.6} y={h + 0.08} />
      <pointLight ref={fire} color="#ff8a3a" position={[0, h + 0.8, 0]} distance={12} decay={1.6} />
      <Smoke position={[0, h + 0.2, 0]} scale={1.4} />
    </group>
  )
}

/** 銅網：四面各一排細銅條 */
function Grating({ w, y, hgt }: { w: number; y: number; hgt: number }) {
  const bars = useMemo(() => {
    const out: { p: [number, number, number]; r: number }[] = []
    const n = 16
    for (let side = 0; side < 4; side++)
      for (let i = 0; i < n; i++) {
        const t = -w / 2 + ((i + 0.5) / n) * w
        const r = (side * Math.PI) / 2
        const off = w / 2 + 0.03
        out.push({ p: [Math.cos(r) * off - Math.sin(r) * t, y, Math.sin(r) * off + Math.cos(r) * t], r })
      }
    return out
  }, [w, y])
  return (
    <group>
      {bars.map((b, i) => (
        <mesh key={i} material={mat.bronze} position={b.p} rotation={[0, -b.r, 0]}>
          <boxGeometry args={[0.03, hgt, 0.04]} />
        </mesh>
      ))}
      {[y - hgt / 2, y + hgt / 2].map((yy) => (
        <mesh key={yy} material={mat.bronze} position={[0, yy, 0]}>
          <boxGeometry args={[w + 0.1, 0.04, w + 0.1]} />
        </mesh>
      ))}
    </group>
  )
}

/** 燔祭壇上的火焰 */
function Flames({ w, y }: { w: number; y: number }) {
  const refs = useRef<THREE.Mesh[]>([])
  const spots = useMemo(() => Array.from({ length: 14 }, () => [(Math.random() - 0.5) * w, (Math.random() - 0.5) * w, Math.random() * 10] as const), [w])
  useFrame(({ clock }) => {
    refs.current.forEach((f, i) => {
      if (!f) return
      const t = clock.elapsedTime * 6 + spots[i][2]
      const s = 0.7 + Math.sin(t) * 0.2 + Math.sin(t * 2.7) * 0.12
      f.scale.set(1, s, 1)
      f.position.y = y + 0.25 * s
    })
  })
  return (
    <group userData={{ noPathTrace: true }}>
      {spots.map(([x, z], i) => (
        <mesh key={i} ref={(el) => void (el && (refs.current[i] = el))} material={i % 3 ? mat.fire : mat.flame} position={[x, y, z]}>
          <coneGeometry args={[0.12, 0.55, 7]} />
        </mesh>
      ))}
    </group>
  )
}

/** 冒煙效果（簡易粒子） */
function Smoke({ position, scale = 1 }: { position: [number, number, number]; scale?: number }) {
  const N = 10
  const refs = useRef<THREE.Mesh[]>([])
  const seeds = useMemo(() => Array.from({ length: N }, () => Math.random()), [])
  useFrame(({ clock }) => {
    refs.current.forEach((mesh, i) => {
      if (!mesh) return
      const t = (clock.elapsedTime * 0.18 + seeds[i]) % 1
      mesh.position.set(Math.sin(t * 6 + i) * 0.3 * scale, t * 5 * scale, Math.cos(t * 5 + i) * 0.3 * scale)
      const s = (0.25 + t * 0.9) * scale
      mesh.scale.setScalar(s)
      ;(mesh.material as THREE.MeshStandardMaterial).opacity = 0.32 * (1 - t)
    })
  })
  return (
    <group position={position} userData={{ noPathTrace: true }}>
      {seeds.map((_, i) => (
        <mesh key={i} ref={(el) => void (el && (refs.current[i] = el))} material={mat.smoke.clone()}>
          <sphereGeometry args={[1, 8, 6]} />
        </mesh>
      ))}
    </group>
  )
}

/* ---------- 洗濯盆（尺寸為推測） ---------- */
function Laver({ m }: { m: M }) {
  const bowl = useMemo(() => {
    const pts = [
      new THREE.Vector2(0.05, 0),
      new THREE.Vector2(m(1.0), m(0.1)),
      new THREE.Vector2(m(1.5), m(0.6)),
      new THREE.Vector2(m(1.6), m(1.0)),
    ]
    return new THREE.LatheGeometry(pts, 28)
  }, [m])
  const standH = m(2)
  const bowlMat = useMemo(() => {
    const b = mat.bronze.clone()
    b.side = THREE.DoubleSide
    return b
  }, [])
  return (
    <group position={[m(8), 0, 0]}>
      <RigidBody type="fixed" colliders={false}>
        <CylinderCollider args={[m(1.5), m(1.4)]} position={[0, m(1.5), 0]} />
      </RigidBody>
      <mesh material={mat.bronze} position={[0, standH / 2, 0]} castShadow>
        <cylinderGeometry args={[m(0.35), m(0.8), standH, 20]} />
      </mesh>
      <mesh geometry={bowl} material={bowlMat} position={[0, standH, 0]} castShadow />
      <mesh material={mat.water} position={[0, standH + m(0.85), 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[m(1.52), 28]} />
      </mesh>
    </group>
  )
}

/* ---------- 聖所內的器具 ---------- */
function Table({ m }: { m: M }) {
  const L = m(2)
  const W = m(1)
  const Hh = m(1.5)
  return (
    <group position={[m(-10), 0, m(-3)]}>
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider args={[L / 2, Hh / 2, W / 2]} position={[0, Hh / 2, 0]} />
      </RigidBody>
      <mesh material={mat.goldIn} position={[0, Hh - 0.03, 0]} castShadow>
        <boxGeometry args={[L, 0.06, W]} />
      </mesh>
      {/* 金牙邊（四圍的框） */}
      {[-1, 1].map((sd) => (
        <group key={sd}>
          <mesh material={mat.goldIn} position={[0, Hh + 0.04, (sd * W) / 2]}>
            <boxGeometry args={[L, 0.06, 0.025]} />
          </mesh>
          <mesh material={mat.goldIn} position={[(sd * L) / 2, Hh + 0.04, 0]}>
            <boxGeometry args={[0.025, 0.06, W]} />
          </mesh>
        </group>
      ))}
      {[
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
      ].map(([sx, sz], i) => (
        <mesh key={i} material={mat.goldIn} position={[(sx * L) / 2 * 0.9, Hh / 2, (sz * W) / 2 * 0.85]}>
          <boxGeometry args={[0.05, Hh, 0.05]} />
        </mesh>
      ))}
      {/* 陳設餅：兩行，每行六個 */}
      {[-1, 1].map((s) =>
        Array.from({ length: 6 }, (_, i) => (
          <mesh key={`${s}${i}`} material={mat.bread} position={[s * L * 0.25, Hh + 0.04 + i * 0.045, 0]}>
            <cylinderGeometry args={[W * 0.36, W * 0.38, 0.04, 16]} />
          </mesh>
        )),
      )}
    </group>
  )
}

function Lampstand({ m }: { m: M }) {
  const h = m(3.2) // 推測
  const arcs = [0.5, 0.95, 1.4].map((r) => m(r))
  return (
    <group position={[m(-10), 0, m(3)]}>
      <RigidBody type="fixed" colliders={false}>
        <CylinderCollider args={[h / 2, m(0.6)]} position={[0, h / 2, 0]} />
      </RigidBody>
      <mesh material={mat.goldIn} position={[0, m(0.15), 0]}>
        <cylinderGeometry args={[m(0.3), m(0.55), m(0.3), 16]} />
      </mesh>
      <mesh material={mat.goldIn} position={[0, h / 2, 0]}>
        <cylinderGeometry args={[0.025, 0.035, h, 10]} />
      </mesh>
      {arcs.map((r) => (
        <mesh key={r} material={mat.goldIn} position={[0, h - r, 0]} rotation={[0, 0, Math.PI]}>
          <torusGeometry args={[r, 0.02, 8, 24, Math.PI]} />
        </mesh>
      ))}
      {[-arcs[2], -arcs[1], -arcs[0], 0, arcs[0], arcs[1], arcs[2]].map((x) => (
        <group key={x} position={[x, h, 0]}>
          <mesh material={mat.goldIn}>
            <cylinderGeometry args={[0.05, 0.02, 0.06, 10]} />
          </mesh>
          <mesh material={mat.flame} position={[0, 0.07, 0]}>
            <coneGeometry args={[0.018, 0.08, 8]} />
          </mesh>
        </group>
      ))}
      <pointLight color="#ffc070" position={[0, h + 0.2, 0]} intensity={5} distance={10} decay={1.4} />
    </group>
  )
}

function IncenseAltar({ m }: { m: M }) {
  const w = m(1)
  const h = m(2)
  return (
    <group position={[m(-18), 0, 0]}>
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider args={[w / 2, h / 2, w / 2]} position={[0, h / 2, 0]} />
      </RigidBody>
      <mesh material={mat.goldIn} position={[0, h / 2, 0]} castShadow>
        <boxGeometry args={[w, h, w]} />
      </mesh>
      {[
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
      ].map(([sx, sz], i) => (
        <mesh key={i} material={mat.goldIn} position={[(sx * w) / 2 - sx * 0.04, h + 0.06, (sz * w) / 2 - sz * 0.04]}>
          <coneGeometry args={[0.04, 0.12, 6]} />
        </mesh>
      ))}
      <Smoke position={[0, h, 0]} scale={0.35} />
    </group>
  )
}

function Ark({ m }: { m: M }) {
  const L = m(2.5)
  const W = m(1.5)
  const H = m(1.5)
  const Cherub = ({ side }: { side: number }) => (
    <group position={[(side * L) / 2 - side * 0.18, H + 0.06, 0]} rotation={[0, side > 0 ? Math.PI : 0, 0]}>
      <mesh material={mat.goldIn} position={[0, 0.18, 0]}>
        <coneGeometry args={[0.1, 0.36, 8]} />
      </mesh>
      <mesh material={mat.goldIn} position={[0.02, 0.4, 0]}>
        <sphereGeometry args={[0.07, 10, 8]} />
      </mesh>
      {/* 翅膀向上張開、向施恩座遮掩 */}
      {[-1, 1].map((s) => (
        <mesh key={s} material={mat.goldIn} position={[0.18, 0.42, s * 0.14]} rotation={[s * 0.5, 0, -0.9]}>
          <boxGeometry args={[0.5, 0.02, 0.18]} />
        </mesh>
      ))}
    </group>
  )
  return (
    <group position={[m(-25), 0, 0]}>
      <pointLight color="#fff1c9" position={[0, H + 1.2, 0]} intensity={2.5} distance={6} decay={1.5} />
      <mesh material={mat.goldIn} position={[0, H / 2, 0]} castShadow>
        <boxGeometry args={[L, H, W]} />
      </mesh>
      {/* 施恩座 */}
      <mesh material={mat.goldIn} position={[0, H + 0.03, 0]}>
        <boxGeometry args={[L + 0.02, 0.06, W + 0.02]} />
      </mesh>
      <Cherub side={-1} />
      <Cherub side={1} />
      {/* 槓（向東伸出，參列王紀上 8:8） */}
      {[-1, 1].map((s) => (
        <mesh key={s} material={mat.goldIn} position={[0, H * 0.25, s * (W / 2 + 0.05)]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.03, 0.03, L + m(2), 8]} />
        </mesh>
      ))}
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
