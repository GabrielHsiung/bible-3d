import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { Person, STYLES, type PersonStyle } from './Person'

interface Walker {
  style: PersonStyle
  path: [number, number][] // 肘
  speed: number
  pause?: number // 每個點停留秒數
  lamb?: boolean
}

/** 簡單的路徑行走 NPC */
function NPC({ w, C }: { w: Walker; C: number }) {
  const g = useRef<THREE.Group>(null)
  const speedRef = useRef(0)
  const st = useRef({ i: 0, t: 0, wait: Math.random() * 2, pos: new THREE.Vector3(w.path[0][0] * C, 0, w.path[0][1] * C) })
  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    const s = st.current
    if (!g.current) return
    if (s.wait > 0) {
      s.wait -= dt
      speedRef.current = THREE.MathUtils.lerp(speedRef.current, 0, 0.2)
    } else {
      const next = w.path[(s.i + 1) % w.path.length]
      const tx = next[0] * C
      const tz = next[1] * C
      const dx = tx - s.pos.x
      const dz = tz - s.pos.z
      const d = Math.hypot(dx, dz)
      if (d < 0.05) {
        s.i = (s.i + 1) % w.path.length
        s.wait = w.pause ?? 0
      } else {
        const step = Math.min(d, w.speed * dt)
        s.pos.x += (dx / d) * step
        s.pos.z += (dz / d) * step
        const yaw = Math.atan2(dx, dz)
        let dd = yaw - g.current.rotation.y
        dd = Math.atan2(Math.sin(dd), Math.cos(dd))
        g.current.rotation.y += dd * Math.min(1, dt * 6)
        speedRef.current = THREE.MathUtils.lerp(speedRef.current, w.speed, 0.2)
      }
    }
    g.current.position.copy(s.pos)
  })
  return (
    <group ref={g}>
      <Person style={w.style} speedRef={speedRef} />
      {w.lamb && <Lamb />}
    </group>
  )
}

/** 帶來獻祭的羊羔 */
function Lamb() {
  return (
    <group position={[0.45, 0, 0.35]}>
      <mesh position={[0, 0.35, 0]} castShadow>
        <capsuleGeometry args={[0.16, 0.3, 4, 8]} />
        <meshStandardMaterial color="#efe8da" roughness={1} />
      </mesh>
      <mesh position={[0, 0.48, 0.28]} rotation={[0.3, 0, 0]}>
        <sphereGeometry args={[0.1, 10, 8]} />
        <meshStandardMaterial color="#d9cfbf" roughness={1} />
      </mesh>
      {[
        [-0.08, -0.12],
        [0.08, -0.12],
        [-0.08, 0.14],
        [0.08, 0.14],
      ].map(([x, z], i) => (
        <mesh key={i} position={[x, 0.11, z]}>
          <cylinderGeometry args={[0.025, 0.025, 0.22, 6]} />
          <meshStandardMaterial color="#3a2f26" />
        </mesh>
      ))}
    </group>
  )
}

export function NPCs({ C }: { C: number }) {
  const walkers = useMemo<Walker[]>(
    () => [
      // 祭司在壇與洗濯盆之間來回（出 30:19–20）
      { style: STYLES.priest, path: [[16, 4], [10, 2.5], [10, -2.5], [16, -4]], speed: 1.1, pause: 2.5 },
      { style: STYLES.priest, path: [[23.5, -1], [23.5, 2]], speed: 0.6, pause: 4 },
      { style: STYLES.priest, path: [[3, -3], [3, 3]], speed: 0.8, pause: 6 },
      // 帶著羊羔來到院子門口的以色列人
      { style: STYLES.israelite1, path: [[95, 6], [56, 4], [56, 4], [95, 6]], speed: 1.0, pause: 3, lamb: true },
      { style: STYLES.israelite2, path: [[58, -6], [80, -10], [110, -8]], speed: 1.2, pause: 1 },
      { style: STYLES.woman, path: [[70, 14], [100, 20], [85, 30]], speed: 0.9, pause: 2 },
      { style: STYLES.israelite3, path: [[-30, -40], [30, -40], [55, -36]], speed: 1.3, pause: 1 },
      { style: STYLES.israelite1, path: [[60, 35], [-40, 38], [-60, 34]], speed: 1.1 },
      { style: STYLES.woman, path: [[-70, -10], [-70, 20]], speed: 0.8, pause: 5 },
    ],
    [],
  )
  return (
    <group>
      {walkers.map((w, i) => (
        <NPC key={i} w={w} C={C} />
      ))}
    </group>
  )
}
