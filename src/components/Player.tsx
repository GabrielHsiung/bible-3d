import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { CapsuleCollider, RigidBody, useRapier, type RapierRigidBody } from '@react-three/rapier'
import * as THREE from 'three'
import { ITEMS } from '../data/tabernacle'
import { input, useStore, view, type Zone } from '../store'
import { Person, STYLES } from './Person'
import { TOUR, lineSeconds, tourVerse } from '../experience/tour'

const WALK = 2.3
const RUN = 4.8
const TOUR_SPEED = 1.5
const FLY_TIME = 7.5

const tmp = new THREE.Vector3()
const camTarget = new THREE.Vector3()
const camPos = new THREE.Vector3()
const look = new THREE.Vector3()
const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()], false, 'centripetal')
const flyLook0 = new THREE.Vector3()

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}
const angDiff = (a: number, b: number) => Math.atan2(Math.sin(b - a), Math.cos(b - a))

function zoneOf(x: number, z: number, C: number): Zone {
  if (Math.abs(z) < 5 * C && x < 0 && x > -30 * C) return x < -20 * C ? 'holiest' : 'holy'
  if (Math.abs(x) < 50 * C && Math.abs(z) < 25 * C) return 'court'
  return 'camp'
}

/** 開場空拍：繞著會幕緩慢盤旋 */
function orbitPose(t: number, C: number, pos: THREE.Vector3, target: THREE.Vector3) {
  // 從東南方的營地上空開始，逆時針緩慢繞行；高度低一點才看得到地平線、西乃山和雲
  const a = 0.45 + t * 0.022
  const r = 50 * C * 3.4
  pos.set(Math.cos(a) * r - 6 * C, 13 + Math.sin(t * 0.09) * 3, Math.sin(a) * r * 0.9)
  // 會幕放在畫面右側，左邊留給標題：瞄準點往左偏
  const fx = -6 * C - pos.x
  const fz = -pos.z
  const fl = Math.hypot(fx, fz)
  const off = typeof window !== 'undefined' && window.innerWidth > window.innerHeight ? 0.3 : 0
  target.set(-6 * C + (fz / fl) * fl * off, 13, (-fx / fl) * fl * off)
}

export function Player({ C }: { C: number }) {
  const body = useRef<RapierRigidBody>(null)
  const visual = useRef<THREE.Group>(null)
  const speed = useRef(0)
  const facing = useRef(-Math.PI / 2) // 面向西
  const { camera } = useThree()
  const { world, rapier } = useRapier()
  const teleport = useStore((s) => s.teleport)
  const setNear = useStore((s) => s.setNear)

  // 鏡頭狀態
  const cam = useRef({
    target: new THREE.Vector3(62 * C, 1.5, 0),
    dist: 5.5,
    fov: 50,
    bob: 0,
    introT: 0,
    flyT: -1,
    lastPhase: '' as string,
  })
  // 導覽狀態
  const tour = useRef({ stop: -1, leg: 0, line: -1, lineT: 0, legT: 0, done: false })

  useEffect(() => {
    if (!teleport || !body.current) return
    body.current.setTranslation({ x: teleport.x * C, y: 1, z: teleport.z * C }, true)
    body.current.setLinvel({ x: 0, y: 0, z: 0 }, true)
    // 面向目標（目標在西邊）
    input.yaw = Math.PI / 2
    facing.current = -Math.PI / 2
    cam.current.target.set(teleport.x * C, 1.5, teleport.z * C)
  }, [teleport, C])

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    const b = body.current
    if (!b) return
    const st = useStore.getState()
    const cs = cam.current
    // 拍照時凍結畫面
    if (st.photo) {
      b.setLinvel({ x: 0, y: b.linvel().y, z: 0 }, true)
      return
    }
    const persp = camera as THREE.PerspectiveCamera

    // ---- 開場空拍 ----
    if (st.phase === 'intro') {
      cs.introT += dt
      orbitPose(cs.introT, C, camPos, look)
      camera.position.copy(camPos)
      camera.lookAt(look)
      view.focus.x = look.x
      view.focus.y = look.y
      view.focus.z = look.z
      view.dof = 1
      if (persp.fov !== 40) {
        persp.fov = 40
        persp.updateProjectionMatrix()
      }
      cs.lastPhase = 'intro'
      const p0 = b.translation()
      input.player.x = p0.x
      input.player.y = p0.y
      input.player.z = p0.z
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
    const flying = st.phase === 'flying'
    if (flying) {
      fx = 0
      fz = 0
    }
    const mag = Math.min(Math.hypot(fx, fz), 1)
    const running = k.has('ShiftLeft') || k.has('ShiftRight') || Math.hypot(input.joy.x, input.joy.y) > 0.9
    // 玩家自己動了就結束導覽
    if (mag > 0.05 && st.tour >= 0) st.setTour(-1)
    const target = mag > 0.05 ? (running ? RUN : WALK) * mag : 0

    const fwdX = -Math.sin(input.yaw)
    const fwdZ = -Math.cos(input.yaw)
    const rightX = -fwdZ
    const rightZ = fwdX
    let vx = 0
    let vz = 0
    const p = b.translation()

    // ---- 導覽：自動沿路線走 ----
    const tr = tour.current
    let tourLook: [number, number] | null = null
    if (st.tour >= 0 && !flying) {
      if (tr.stop !== st.tour) {
        tr.stop = st.tour
        tr.leg = 0
        tr.line = -1
        tr.lineT = 0
        tr.legT = 0
        tr.done = false
      }
      const stop = TOUR[tr.stop]
      if (stop) {
        const pts = [...stop.via, stop.at]
        if (tr.leg < pts.length) {
          const [wx, wz] = pts[tr.leg]
          const dx = wx * C - p.x
          const dz = wz * C - p.z
          const d = Math.hypot(dx, dz)
          tr.legT += dt
          if (d < 0.3 || tr.legT > d / TOUR_SPEED + 8) {
            if (d >= 0.3) b.setTranslation({ x: wx * C, y: p.y, z: wz * C }, true) // 卡住就直接過去
            tr.leg++
            tr.legT = 0
          } else {
            // 接近目標時放慢
            const sp = TOUR_SPEED * Math.min(1, 0.35 + d / 1.5)
            vx = (dx / d) * sp
            vz = (dz / d) * sp
            facing.current = Math.atan2(vx, vz)
            // 鏡頭看向前進方向；最後一段提早看向器具
            tourLook = tr.leg === pts.length - 1 && d < 3 ? stop.look : [(p.x + (dx / d) * 8) / C, (p.z + (dz / d) * 8) / C]
          }
        } else {
          // 到站：面向器具，逐段顯示字幕
          tourLook = stop.look
          facing.current = Math.atan2(stop.look[0] * C - p.x, stop.look[1] * C - p.z)
          tr.lineT -= dt
          if (tr.lineT <= 0) {
            tr.line++
            if (tr.line < stop.lines.length) {
              const l = stop.lines[tr.line]
              st.setCaption(l.text, tourVerse(l.ref))
              tr.lineT = lineSeconds(l)
            } else if (tr.stop < TOUR.length - 1) {
              st.setTour(tr.stop + 1)
            } else if (!tr.done) {
              tr.done = true
              tr.lineT = 9
              st.setCaption('導覽結束。你可以自由走動，靠近器具會顯示經文和尺寸。')
            } else st.setTour(-1)
          }
        }
      }
    } else if (mag > 0.05) {
      const n = Math.hypot(fx, fz)
      vx = ((fwdX * fz + rightX * fx) / n) * target
      vz = ((fwdZ * fz + rightZ * fx) / n) * target
      facing.current = Math.atan2(vx, vz)
    }
    if (st.tour < 0) tr.stop = -1

    const lv = b.linvel()
    b.setLinvel({ x: vx, y: lv.y, z: vz }, true)
    speed.current = THREE.MathUtils.lerp(speed.current, Math.hypot(vx, vz), 0.2)
    input.speed = speed.current

    input.player.x = p.x
    input.player.y = p.y
    input.player.z = p.z
    st.setZone(zoneOf(p.x, p.z, C))

    // ---- 角色外觀 ----
    if (visual.current) {
      visual.current.position.set(p.x, p.y - 0.8, p.z)
      const cur = visual.current.rotation.y
      const d = angDiff(cur, facing.current)
      visual.current.rotation.y = cur + d * Math.min(1, dt * 8)
    }

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
    const nearT = best ? 1 - smooth(0.4, 1, bestD / ((ITEMS.find((i) => i.id === best)?.radius ?? 1) * C)) : 0

    // ---- 導覽時鏡頭自動轉向（使用者剛拖曳過就不搶） ----
    const userLooking = performance.now() - input.lastLook < 2500
    if (tourLook && !userLooking) {
      const want = Math.atan2(-(tourLook[0] * C - p.x), -(tourLook[1] * C - p.z))
      input.yaw += angDiff(input.yaw, want) * Math.min(1, dt * 1.2)
      input.pitch += (0.1 - input.pitch) * Math.min(1, dt * 1.0)
    }

    // ---- 第三人稱電影鏡頭 ----
    const inside = p.x < 0 && p.x > -30 * C && Math.abs(p.z) < 5 * C
    let wantDist = inside ? 3.3 : 5.4
    if (st.tour >= 0) wantDist = inside ? 3.6 : 6.4
    wantDist *= 1 - 0.16 * nearT // 靠近器具時微微拉近
    // 手機直式畫面水平視角很窄：鏡頭退後一點、視野加寬
    const portrait = state.size.width < state.size.height
    if (portrait) wantDist *= 1.3
    cs.dist += (wantDist - cs.dist) * Math.min(1, dt * 1.5)

    // 走路時微晃（像手持攝影）
    const moving = Math.min(1, speed.current / WALK)
    cs.bob += dt * (1.6 + speed.current * 0.28) * Math.PI
    const bobY = Math.sin(cs.bob * 2) * 0.03 * moving
    const bobX = Math.sin(cs.bob) * 0.025 * moving
    // 跟隨點平滑（有一點延遲，鏡頭較沉穩）
    tmp.set(p.x, p.y + 0.78, p.z)
    cs.target.lerp(tmp, 1 - Math.exp(-dt * 7))
    camTarget.copy(cs.target)
    camTarget.y += bobY
    camTarget.x += bobX * Math.cos(input.yaw)
    camTarget.z -= bobX * Math.sin(input.yaw)

    const ch = Math.cos(input.pitch)
    camPos.set(
      camTarget.x + Math.sin(input.yaw) * cs.dist * ch,
      camTarget.y + Math.sin(input.pitch) * cs.dist + 0.35,
      camTarget.z + Math.cos(input.yaw) * cs.dist * ch,
    )
    if (inside) camPos.y = Math.min(camPos.y, 10 * C - 0.4)
    // 相機碰撞：被帷子、牆擋住時把相機拉近
    tmp.copy(camPos).sub(camTarget)
    const len = tmp.length()
    tmp.divideScalar(len)
    let blocked = false
    const ray = new rapier.Ray(camTarget, tmp)
    const hit = world.castRay(ray, len, true, undefined, undefined, undefined, b)
    if (hit) {
      const toi = (hit as unknown as { timeOfImpact?: number; toi?: number }).timeOfImpact ?? (hit as unknown as { toi: number }).toi
      camPos.copy(camTarget).addScaledVector(tmp, Math.max(0.6, toi - 0.25))
      blocked = true
    }

    // ---- 進場運鏡：從營地上空飛到玩家背後 ----
    if (flying) {
      if (cs.lastPhase !== 'flying') {
        cs.flyT = 0
        const pts = curve.points
        pts[0].copy(camera.position)
        pts[1].set(camPos.x + 70, 34, camPos.z + 38)
        pts[2].set(camPos.x + 14, camPos.y + 4, camPos.z + 6)
        pts[3].copy(camPos)
        curve.updateArcLengths()
        camera.getWorldDirection(flyLook0).multiplyScalar(60).add(camera.position)
        cs.lastPhase = 'flying'
      }
      cs.flyT += dt / FLY_TIME
      const t = ease(Math.min(1, cs.flyT))
      curve.points[3].copy(camPos)
      curve.getPointAt(t, camera.position)
      look.copy(flyLook0).lerp(camTarget, smooth(0.15, 0.85, t))
      camera.lookAt(look)
      persp.fov = 40 + 10 * t
      persp.updateProjectionMatrix()
      cs.fov = persp.fov
      view.dof = 1 - t
      view.focus.x = look.x
      view.focus.y = look.y
      view.focus.z = look.z
      if (cs.flyT >= 1) st.setPhase('play')
      return
    }
    cs.lastPhase = 'play'

    // 被擋住時立刻拉近（不要慢慢穿過牆），其他時候平滑跟隨
    if (blocked) camera.position.copy(camPos)
    else camera.position.lerp(camPos, 1 - Math.exp(-dt * 9))
    camera.lookAt(camTarget)

    // 視野：跑步時略寬，靠近器具、導覽時略窄（更有電影感）
    let wantFov = 50 + 4 * Math.max(0, (speed.current - WALK) / (RUN - WALK))
    wantFov -= 4 * nearT
    if (st.tour >= 0) wantFov = 45
    if (portrait) wantFov += 10
    cs.fov += (wantFov - cs.fov) * Math.min(1, dt * 2)
    if (Math.abs(persp.fov - cs.fov) > 0.01) {
      persp.fov = cs.fov
      persp.updateProjectionMatrix()
    }
    // 景深：導覽時對焦在玩家身上
    view.focus.x = camTarget.x
    view.focus.y = camTarget.y
    view.focus.z = camTarget.z
    view.dof += ((st.tour >= 0 ? 1 : 0) - view.dof) * Math.min(1, dt * 2)

    // 掉出世界時復位
    if (p.y < -5) b.setTranslation({ x: 62 * C, y: 2, z: 0 }, true)
  })

  return (
    <>
      <RigidBody ref={body} colliders={false} position={[62 * C, 1, 0]} enabledRotations={[false, false, false]} friction={0} linearDamping={0.5} ccd>
        <CapsuleCollider args={[0.5, 0.3]} friction={0} />
      </RigidBody>
      <group ref={visual} rotation={[0, -Math.PI / 2, 0]}>
        <Person style={STYLES.priest} speedRef={speed} />
      </group>
    </>
  )
}
