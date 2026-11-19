import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { CapsuleCollider, RigidBody, useRapier, type RapierRigidBody } from '@react-three/rapier'
import * as THREE from 'three'
import { ITEMS } from '../data/tabernacle'
import { input, useStore } from '../store'
import { Person, STYLES } from './Person'

const WALK = 2.3
const RUN = 4.8
const tmp = new THREE.Vector3()
const camTarget = new THREE.Vector3()
const camPos = new THREE.Vector3()

export function Player({ C }: { C: number }) {
  const body = useRef<RapierRigidBody>(null)
  const visual = useRef<THREE.Group>(null)
  const speed = useRef(0)
  const facing = useRef(-Math.PI / 2) // 面向西
  const { camera } = useThree()
  const { world, rapier } = useRapier()
  const teleport = useStore((s) => s.teleport)
  const setNear = useStore((s) => s.setNear)

  useEffect(() => {
    if (!teleport || !body.current) return
    body.current.setTranslation({ x: teleport.x * C, y: 1, z: teleport.z * C }, true)
    body.current.setLinvel({ x: 0, y: 0, z: 0 }, true)
    // 面向目標（目標在西邊）
    input.yaw = Math.PI / 2
    facing.current = -Math.PI / 2
  }, [teleport, C])

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    const b = body.current
    if (!b) return
    // 拍照時凍結畫面
    if (useStore.getState().photo) {
      b.setLinvel({ x: 0, y: b.linvel().y, z: 0 }, true)
      return
    }

    // ---- 移動輸入 ----
    const k = input.keys
    let fx = 0
    let fz = 0
    if (k.has('KeyW') || k.has('ArrowUp')) fz += 1
    if (k.has('KeyS') || k.has('ArrowDown')) fz -= 1
    if (k.has('KeyA') || k.has('ArrowLeft')) fx -= 1
    if (k.has('KeyD') || k.has('ArrowRight')) fx += 1
    fx += input.joy.x
    fz += input.joy.y
    const mag = Math.min(Math.hypot(fx, fz), 1)
    const running = k.has('ShiftLeft') || k.has('ShiftRight') || Math.hypot(input.joy.x, input.joy.y) > 0.9
    const target = mag > 0.05 ? (running ? RUN : WALK) * mag : 0

    // 以相機方向為準
    const fwdX = -Math.sin(input.yaw)
    const fwdZ = -Math.cos(input.yaw)
    const rightX = -fwdZ
    const rightZ = fwdX
    let vx = 0
    let vz = 0
    if (mag > 0.05) {
      const n = Math.hypot(fx, fz)
      vx = ((fwdX * fz + rightX * fx) / n) * target
      vz = ((fwdZ * fz + rightZ * fx) / n) * target
      facing.current = Math.atan2(vx, vz)
    }
    const lv = b.linvel()
    b.setLinvel({ x: vx, y: lv.y, z: vz }, true)
    speed.current = THREE.MathUtils.lerp(speed.current, Math.hypot(vx, vz), 0.2)

    const p = b.translation()
    input.player.x = p.x
    input.player.y = p.y
    input.player.z = p.z

    // ---- 角色外觀 ----
    if (visual.current) {
      visual.current.position.set(p.x, p.y - 0.8, p.z)
      const cur = visual.current.rotation.y
      let d = facing.current - cur
      d = Math.atan2(Math.sin(d), Math.cos(d))
      visual.current.rotation.y = cur + d * Math.min(1, dt * 10)
    }

    // ---- 第三人稱相機 ----
    const inside = p.x < 0 && p.x > -30 * C && Math.abs(p.z) < 5 * C
    const dist = inside ? 3.2 : 6
    const ch = Math.cos(input.pitch)
    camTarget.set(p.x, p.y + 0.75, p.z)
    camPos.set(
      p.x + Math.sin(input.yaw) * dist * ch,
      p.y + 0.75 + Math.sin(input.pitch) * dist + 0.4,
      p.z + Math.cos(input.yaw) * dist * ch,
    )
    if (inside) camPos.y = Math.min(camPos.y, 10 * C - 0.4)
    // 相機碰撞：被帷子、牆擋住時把相機拉近
    tmp.copy(camPos).sub(camTarget)
    const len = tmp.length()
    tmp.divideScalar(len)
    const ray = new rapier.Ray(camTarget, tmp)
    const hit = world.castRay(ray, len, true, undefined, undefined, undefined, b)
    if (hit) {
      const toi = (hit as unknown as { timeOfImpact?: number; toi?: number }).timeOfImpact ?? (hit as unknown as { toi: number }).toi
      camPos.copy(camTarget).addScaledVector(tmp, Math.max(0.6, toi - 0.25))
    }
    camera.position.lerp(camPos, 1 - Math.exp(-dt * 10))
    tmp.copy(camTarget)
    camera.lookAt(tmp)

    // ---- 靠近哪個器具 ----
    let best: string | null = null
    let bestD = Infinity
    for (const it of ITEMS) {
      const d = Math.hypot(p.x - it.pos[0] * C, p.z - it.pos[1] * C)
      if (d < it.radius * C && d < bestD) {
        best = it.id
        bestD = d
      }
    }
    setNear(best)

    // 掉出世界時復位
    if (p.y < -5) b.setTranslation({ x: 62 * C, y: 2, z: 0 }, true)
  })

  return (
    <>
      <RigidBody ref={body} colliders={false} position={[62 * C, 1, 0]} enabledRotations={[false, false, false]} friction={0} linearDamping={0.5} ccd>
        <CapsuleCollider args={[0.5, 0.3]} friction={0} />
      </RigidBody>
      <group ref={visual}>
        <Person style={STYLES.priest} speedRef={speed} />
      </group>
    </>
  )
}
