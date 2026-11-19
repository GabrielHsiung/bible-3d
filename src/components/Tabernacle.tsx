import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { CuboidCollider, CylinderCollider, RigidBody } from '@react-three/rapier'
import * as THREE from 'three'
import { input, useStore } from '../store'
import { boards, ceiling, hide, linen, mat, woven } from '../materials'

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
