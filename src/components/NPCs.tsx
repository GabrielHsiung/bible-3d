import { useMemo, useRef, type MutableRefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { mulberry } from '../rng'
import { Person, STYLES, type Action, type Carry, type PersonStyle } from './Person'
import { peopleMaterials } from './people/materials'
import { quern, seatStone, waterJar, woodPile } from './people/props'
import { animateSheep, makeSheep, type SheepKind } from './people/sheep'

/* =====================================================================
 * 腳本：每個 NPC 有一串動作（走到某點／原地做某事），依共同時鐘循環。
 * 同一組（例如：以色列人＋接羊羔的祭司＋羊羔）長度相同，所以永遠同步。
 * 座標單位：公尺（院子內的點用 c(肘) 換算）。
 * ===================================================================== */
type P2 = [number, number]
type Seg =
  | { to: P2; speed?: number; act?: Action; carry?: Carry }
  | { act: Action; dur: number; face?: P2 | number; carry?: Carry }

interface Key {
  t0: number
  t1: number
  from: P2
  to: P2
  yaw: number
  speed: number
  act: Action
  carry: Carry
}

interface Script {
  keys: Key[]
  total: number
}

function compile(start: P2, segs: Seg[], startYaw = 0, pad = 0): Script {
  const keys: Key[] = []
  let t = 0
  let pos = start
  let yaw = startYaw
  for (const s of segs) {
    if ('to' in s) {
      const sp = s.speed ?? 1.15
      const d = Math.hypot(s.to[0] - pos[0], s.to[1] - pos[1])
      const dur = Math.max(d / sp, 0.05)
      if (d > 0.01) yaw = Math.atan2(s.to[0] - pos[0], s.to[1] - pos[1])
      keys.push({ t0: t, t1: t + dur, from: pos, to: s.to, yaw, speed: sp, act: s.act ?? 'walk', carry: s.carry ?? null })
      t += dur
      pos = s.to
    } else {
      if (typeof s.face === 'number') yaw = s.face
      else if (s.face) yaw = Math.atan2(s.face[0] - pos[0], s.face[1] - pos[1])
      keys.push({ t0: t, t1: t + s.dur, from: pos, to: pos, yaw, speed: 0, act: s.act, carry: s.carry ?? null })
      t += s.dur
    }
  }
  if (pad > t) {
    keys.push({ t0: t, t1: pad, from: pos, to: pos, yaw, speed: 0, act: 'idle', carry: null })
    t = pad
  }
  return { keys, total: t }
}

/** 到時間 t 的位置、朝向、速度、動作 */
function sample(sc: Script, time: number) {
  const t = ((time % sc.total) + sc.total) % sc.total
  let k = sc.keys[sc.keys.length - 1]
  for (const kk of sc.keys)
    if (t < kk.t1) {
      k = kk
      break
    }
  const f = k.t1 > k.t0 ? (t - k.t0) / (k.t1 - k.t0) : 1
  return { x: k.from[0] + (k.to[0] - k.from[0]) * f, z: k.from[1] + (k.to[1] - k.from[1]) * f, yaw: k.yaw, speed: k.speed, act: k.act, carry: k.carry, t }
}

/** 腳本總長（給同步用） */
const dur = (start: P2, segs: Seg[]) => compile(start, segs).total

interface ActorDef {
  id: string
  style: PersonStyle
  seed: number
  script: Script
  detail?: 'auto' | 'low'
}

type Live = { x: number; z: number; yaw: number; speed: number }
type Registry = Map<string, Live>

const clock = { t: 0 }

function Actor({ a, reg }: { a: ActorDef; reg: Registry }) {
  const g = useRef<THREE.Group>(null)
  const speed = useRef(0)
  const act = useRef<Action>('idle')
  const carry = useRef<Carry>(null)
  const yaw = useRef<number | null>(null)
  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    const s = sample(a.script, clock.t)
    if (!g.current) return
    if (yaw.current === null) yaw.current = s.yaw
    let d = s.yaw - yaw.current
    d = Math.atan2(Math.sin(d), Math.cos(d))
    yaw.current += d * Math.min(1, dt * 5)
    g.current.position.set(s.x, 0, s.z)
    g.current.rotation.y = yaw.current
    speed.current = s.speed
    act.current = s.act === 'walk' && s.speed === 0 ? 'idle' : s.act
    carry.current = s.carry
    reg.set(a.id, { x: s.x, z: s.z, yaw: yaw.current, speed: s.speed })
  })
  return (
    <group ref={g}>
      <Person style={a.style} seed={a.seed} speedRef={speed} actionRef={act} carryRef={carry} detail={a.detail ?? 'auto'} />
    </group>
  )
}

/* ---------- 羊 ---------- */
function useSheepMat() {
  return useMemo(() => peopleMaterials().wool, [])
}

/** 被牽來獻祭的羊羔：跟在某人右後方；follow 決定各時段跟誰 */
function Lamb({ reg, follow, total }: { reg: Registry; follow: { until: number; id: string | null }[]; total: number }) {
  const mat = useSheepMat()
  const s = useMemo(() => makeSheep('awassi', mat), [mat])
  const st = useRef({ x: 0, z: 0, yaw: 0, phase: 0, walk: 0, t: 0, init: false })
  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    const t = clock.t % total
    const seg = follow.find((f) => t < f.until) ?? follow[follow.length - 1]
    const L = seg.id ? reg.get(seg.id) : undefined
    s.group.visible = !!L
    if (!L) {
      st.current.init = false
      return
    }
    const o = st.current
    // 目標：領路人右側偏後
    const tx = L.x + Math.cos(L.yaw) * -0.55 + Math.sin(L.yaw) * -0.25
    const tz = L.z - Math.sin(L.yaw) * -0.55 + Math.cos(L.yaw) * -0.25
    if (!o.init) {
      o.x = tx
      o.z = tz
      o.yaw = L.yaw
      o.init = true
    }
    const dx = tx - o.x
    const dz = tz - o.z
    const d = Math.hypot(dx, dz)
    const v = Math.min(d * 3, 2.2)
    if (d > 0.02) {
      o.x += (dx / d) * v * dt
      o.z += (dz / d) * v * dt
    }
    const targetYaw = d > 0.08 ? Math.atan2(dx, dz) : L.yaw
    let dy = targetYaw - o.yaw
    dy = Math.atan2(Math.sin(dy), Math.cos(dy))
    o.yaw += dy * Math.min(1, dt * 4)
    const moving = L.speed > 0.05 || d > 0.15 ? 1 : 0
    o.walk += (moving - o.walk) * Math.min(1, dt * 6)
    o.phase += dt * 9 * Math.max(0.3, Math.min(v, 1.4)) * moving
    o.t += dt
    s.group.position.set(o.x, 0, o.z)
    s.group.rotation.y = o.yaw
    animateSheep(s.bones, s.rest, o.phase, o.walk, 0, o.t)
  })
  return <primitive object={s.group} scale={0.62} />
}

/** 羊群：在一個範圍內慢慢移動、低頭吃草 */
function Flock({ center, radius, n, seed, goats = 0 }: { center: P2; radius: number; n: number; seed: number; goats?: number }) {
  const mat = useSheepMat()
  const flock = useMemo(() => {
    const r = mulberry(seed)
    return Array.from({ length: n }, (_, i) => {
      const kind: SheepKind = i < goats ? 'goat' : r() < 0.3 ? 'cream' : 'awassi'
      const s = makeSheep(kind, mat)
      const a = r() * Math.PI * 2
      const d = Math.sqrt(r()) * radius
      const lamb = kind !== 'goat' && r() < 0.25
      s.group.scale.setScalar(lamb ? 0.62 : 0.9 + r() * 0.18)
      return {
        s,
        x: center[0] + Math.cos(a) * d,
        z: center[1] + Math.sin(a) * d,
        yaw: r() * Math.PI * 2,
        tx: 0,
        tz: 0,
        state: 'graze' as 'graze' | 'walk',
        timer: r() * 8,
        phase: r() * 6,
        walk: 0,
        graze: 1,
        t: r() * 10,
        rnd: mulberry(seed * 13 + i),
      }
    })
  }, [mat, n, seed, goats, center, radius])
  const group = useMemo(() => {
    const g = new THREE.Group()
    flock.forEach((f) => g.add(f.s.group))
    return g
  }, [flock])
  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    for (const f of flock) {
      f.t += dt
      f.timer -= dt
      if (f.timer <= 0) {
        if (f.state === 'graze') {
          f.state = 'walk'
          const a = f.rnd() * Math.PI * 2
          const d = Math.sqrt(f.rnd()) * radius
          f.tx = center[0] + Math.cos(a) * d
          f.tz = center[1] + Math.sin(a) * d
          f.timer = 12
        } else {
          f.state = 'graze'
          f.timer = 5 + f.rnd() * 12
        }
      }
      let moving = 0
      if (f.state === 'walk') {
        const dx = f.tx - f.x
        const dz = f.tz - f.z
        const d = Math.hypot(dx, dz)
        if (d < 0.2) {
          f.state = 'graze'
          f.timer = 5 + f.rnd() * 12
        } else {
          const want = Math.atan2(dx, dz)
          let dy = want - f.yaw
          dy = Math.atan2(Math.sin(dy), Math.cos(dy))
          f.yaw += dy * Math.min(1, dt * 2)
          const v = 0.45 * Math.max(0, Math.cos(dy))
          f.x += Math.sin(f.yaw) * v * dt
          f.z += Math.cos(f.yaw) * v * dt
          moving = 1
        }
      }
      // 彼此不要重疊
      for (const o of flock) {
        if (o === f) continue
        const dx = f.x - o.x
        const dz = f.z - o.z
        const d2 = dx * dx + dz * dz
        if (d2 < 0.8 && d2 > 1e-6) {
          const d = Math.sqrt(d2)
          f.x += (dx / d) * (0.9 - d) * dt
          f.z += (dz / d) * (0.9 - d) * dt
        }
      }
      f.walk += (moving - f.walk) * Math.min(1, dt * 5)
      f.graze += ((f.state === 'graze' ? 1 : 0) - f.graze) * Math.min(1, dt * 2)
      f.phase += dt * 7 * f.walk
      f.s.group.position.set(f.x, 0, f.z)
      f.s.group.rotation.y = f.yaw
      animateSheep(f.s.bones, f.s.rest, f.phase, f.walk, f.graze, f.t)
    }
  })
  return <primitive object={group} />
}

/* ---------- 靜態道具 ---------- */
function Prop({ geo, mat, pos, rot = 0, scale = 1 }: { geo: THREE.BufferGeometry; mat: THREE.Material; pos: [number, number, number]; rot?: number; scale?: number }) {
  return <mesh geometry={geo} material={mat} position={pos} rotation={[0, rot, 0]} scale={scale} castShadow receiveShadow />
}

/**
 * 營地的帳棚位置（與 World.tsx 的 Camp 用同一個亂數種子與規則），
 * 用來把營地裡的人放在帳棚旁邊、但不要站進帳棚裡。
 */
function campTents(C: number) {
  const rnd = mulberry(42)
  const out: { x: number; z: number; s: number }[] = []
  let tries = 0
  while (out.length < 340 && tries < 9000) {
    tries++
    const x = (rnd() - 0.5) * 420
    const z = (rnd() - 0.5) * 380
    if (Math.abs(x) < 50 * C + 22 && Math.abs(z) < 25 * C + 22) continue
    if (x > 0 && Math.abs(z) < 9) continue
    if (out.some((t) => (t.x - x) ** 2 + (t.z - z) ** 2 < 70)) continue
    out.push({ x, z, s: 2.4 + rnd() * 1.8 })
    rnd()
    rnd()
  }
  return out
}
function clearSpot(tents: { x: number; z: number; s: number }[], p: P2, r = 0.8): P2 {
  let [x, z] = p
  for (let it = 0; it < 40; it++) {
    const hit = tents.find((t) => Math.hypot(t.x - x, t.z - z) < t.s * 1.05 + r)
    if (!hit) break
    const dx = x - hit.x
    const dz = z - hit.z
    const d = Math.hypot(dx, dz) || 1
    x += (dx / d) * 0.6
    z += (dz / d) * 0.6
  }
  return [x, z]
}

/* =====================================================================
 * 場景：院子裡的祭司、帶羊羔來獻祭的以色列人、營地的日常
 * ===================================================================== */
export function NPCs({ C }: { C: number }) {
  const reg = useMemo<Registry>(() => new Map(), [])
  const mats = useMemo(() => peopleMaterials(), [])
  const c = (x: number, z: number): P2 => [x * C, z * C]

  const scene = useMemo(() => {
    const tents = campTents(C)
    const spot = (x: number, z: number, r = 0.8) => clearSpot(tents, [x, z], r)
    const actors: ActorDef[] = []
    const add = (id: string, style: PersonStyle, seed: number, start: P2, segs: Seg[], o: { yaw?: number; pad?: number; detail?: 'auto' | 'low' } = {}) => {
      const script = compile(start, segs, o.yaw ?? 0, o.pad)
      actors.push({ id, style, seed, script, detail: o.detail })
      return script
    }
    const W = -Math.PI / 2 // 面向西
    const E = Math.PI / 2

    // ---- 院子 ----
    // 祭司在洗濯盆洗手洗腳（出 30:19–21），然後到帳幕門口
    add('washer', STYLES.priest, 11, c(14, -6), [
      { to: c(8, -2.75) },
      { act: 'wash', dur: 5, face: c(8, 0) },
      { act: 'bend', dur: 3.5, face: c(8, 0) },
      { act: 'idle', dur: 1 },
      { to: c(3, -4) },
      { to: c(2.2, -2.2) },
      { act: 'pray', dur: 5, face: W },
      { act: 'idle', dur: 2, face: W },
      { to: c(5, -6.5) },
      { to: c(14, -6) },
      { act: 'idle', dur: 3, face: E },
    ])
    // 祭司從木柴堆搬柴到壇上（利 6:12「祭司要在壇上燒柴」）
    add('stoker', STYLES.priest, 23, c(25.5, 5.4), [
      { act: 'bend', dur: 2.8, face: c(26.8, 7) },
      { act: 'idle', dur: 0.6, carry: 'wood' },
      { to: c(24.3, 1.3), act: 'carry', carry: 'wood', speed: 0.9 },
      { act: 'reach', dur: 3, face: W, carry: 'wood' },
      { act: 'idle', dur: 1.2, face: W },
      { to: c(25.5, 5.4) },
    ])
    // 帶羊羔來獻燔祭的以色列人（利 1:3–11）：從營地走進院子，在壇的北邊把羊交給祭司
    const isrStart: P2 = [72, 3.5]
    const isrSegs: Seg[] = [
      { to: [58, 3], act: 'lead' },
      { to: c(52, 2), act: 'lead' },
      { to: c(44, 1.5), act: 'lead' },
      { to: c(26, -7), act: 'lead' },
      { act: 'bend', dur: 3, face: c(20, -7) }, // 按手在羊頭上
      { act: 'idle', dur: 3.5, face: c(20, -7) },
      { act: 'pray', dur: 7, face: W },
      { to: c(44, -1.5) },
      { to: c(52, -2) },
      { to: [58, -2.5] },
      { to: isrStart },
      { act: 'idle', dur: 4, face: W },
    ]
    const tArrive = dur(isrStart, isrSegs.slice(0, 4))
    const tHand = tArrive + 3
    const isr = add('isr', STYLES.israelite1, 31, isrStart, isrSegs, { yaw: W })
    const pr2Start = c(21.5, -9)
    const pr2Segs: Seg[] = [
      { act: 'idle', dur: Math.max(0.1, tArrive - 1.5), face: E },
      { to: c(23.8, -7.6), speed: 0.8 },
      { act: 'receive', dur: 2.5, face: c(26, -7) },
      { to: c(20.5, -6.6), act: 'lead', speed: 0.7 },
      { act: 'bend', dur: 5, face: c(20, -4) },
      { act: 'idle', dur: 2 },
      { to: pr2Start },
    ]
    add('priest2', STYLES.priest, 47, pr2Start, pr2Segs, { pad: isr.total })
    const pr2 = compile(pr2Start, pr2Segs, 0, isr.total)
    const tPriestLeave = pr2.keys[2].t1
    const tGone = pr2.keys[4].t1 - 1
    const lambFollow = [
      { until: tHand + 1.5, id: 'isr' },
      { until: tPriestLeave, id: 'isr' },
      { until: tGone, id: 'priest2' },
      { until: isr.total + 1, id: null },
    ]
    // 大祭司站在帳幕門前
    add('hp', STYLES.highPriest, 5, c(4, 3.2), [
      { act: 'idle', dur: 9, face: E },
      { act: 'pray', dur: 6, face: W },
      { act: 'idle', dur: 5, face: c(14, 4) },
    ])
    // 守門的利未人（民 3:38；代上 9:19）
    add('guard', STYLES.levite, 61, c(53, -11.5), [
      { act: 'idle', dur: 12, face: E },
      { act: 'idle', dur: 6, face: c(60, 0) },
    ])
    // 利未人從營地扛木柴來，放在門外的柴堆
    const logStart = spot(66, -14)
    add('levite', STYLES.levite, 67, logStart, [
      { to: [56, -9], act: 'carry', carry: 'wood', speed: 1.0 },
      { to: c(53.6, -15.2), act: 'carry', carry: 'wood', speed: 1.0 },
      { act: 'bend', dur: 2.5, face: c(53.5, -17.5), carry: 'wood' },
      { act: 'idle', dur: 1.5 },
      { to: [56, -9] },
      { to: logStart },
      { act: 'bend', dur: 2.5 },
      { act: 'idle', dur: 0.8, carry: 'wood' },
    ])

    // ---- 營地 ----
    // 頭頂水罐的婦女
    add('w1', STYLES.woman, 71, [34, 7.5], [
      { to: [52, 6.8], act: 'jar', carry: 'jar', speed: 0.95 },
      { to: [74, 6.5], act: 'jar', carry: 'jar', speed: 0.95 },
      { act: 'idle', dur: 4, carry: 'jar' },
      { to: [52, 7.4], act: 'jar', carry: 'jar', speed: 0.95 },
      { to: [34, 7.5], act: 'jar', carry: 'jar', speed: 0.95 },
      { act: 'idle', dur: 3, carry: 'jar' },
    ])
    add('w2', STYLES.woman2, 73, [62, -5], [
      { to: [40, -5.5], act: 'jar', carry: 'jar', speed: 0.9 },
      { to: [33, -9], act: 'jar', carry: 'jar', speed: 0.9 },
      { act: 'idle', dur: 5, face: [30, -12], carry: 'jar' },
      { to: [40, -5.5], act: 'jar', carry: 'jar', speed: 0.9 },
      { to: [62, -5], act: 'jar', carry: 'jar', speed: 0.9 },
    ])
    // 帳棚邊坐著聊天的老人與男人
    const sitA = spot(41, 14.5, 1.6)
    const sitB: P2 = [sitA[0] + 1.25, sitA[1] + 1.0]
    add('elder', STYLES.elder, 81, sitA, [{ act: 'talk', dur: 20, face: sitB }])
    add('man', STYLES.israelite2, 83, sitB, [{ act: 'sit', dur: 20, face: sitA }])
    add('kid0', STYLES.child, 85, [sitA[0] + 1.6, sitA[1] - 0.6], [
      { act: 'idle', dur: 6, face: sitA },
      { to: [sitA[0] + 2.6, sitA[1] - 1.8], speed: 1.6 },
      { act: 'idle', dur: 5, face: sitB },
      { to: [sitA[0] + 1.6, sitA[1] - 0.6], speed: 1.6 },
    ])
    // 跪著推磨的婦女與旁邊的女孩
    const grind = spot(39, -15.5, 1.6)
    add('grinder', STYLES.woman, 91, grind, [{ act: 'grind', dur: 30, face: E }])
    add('girl', STYLES.girl, 93, [grind[0] - 0.9, grind[1] + 1.1], [
      { act: 'idle', dur: 8, face: grind },
      { act: 'kneel', dur: 8, face: grind },
    ])
    // 跑來跑去的小孩
    const play = spot(35, 17.5, 3.5)
    const ring = (r: number, k: number, ph: number): Seg[] =>
      Array.from({ length: k + 1 }, (_, i) => {
        const a = ph + (i / k) * Math.PI * 2
        return { to: [play[0] + Math.cos(a) * r, play[1] + Math.sin(a) * r * 0.7] as P2, speed: 2.9 }
      })
    add('kid1', STYLES.child, 101, [play[0] + 2.6, play[1]], [...ring(2.6, 10, 0), { act: 'idle', dur: 2.5 }])
    add('kid2', STYLES.girl, 103, [play[0] + Math.cos(1.6) * 2.6, play[1] + Math.sin(1.6) * 1.8], [...ring(2.6, 10, 1.6), { act: 'idle', dur: 2.5 }])
    // 沿大路走的人
    add('walker', STYLES.israelite3, 111, [36, 1.5], [{ to: [82, 2.5] }, { act: 'idle', dur: 3 }, { to: [36, 1.5] }, { act: 'idle', dur: 4, face: W }])
    // 牧羊人
    const flockC = spot(36, -25, 4)
    add('shepherd', STYLES.israelite2, 121, [flockC[0] - 3.5, flockC[1] + 2], [
      { act: 'staff', dur: 10, face: flockC, carry: 'staff' },
      { to: [flockC[0] + 3, flockC[1] + 3], act: 'staff', carry: 'staff', speed: 0.7 },
      { act: 'staff', dur: 9, face: flockC, carry: 'staff' },
      { to: [flockC[0] - 3.5, flockC[1] + 2], act: 'staff', carry: 'staff', speed: 0.7 },
    ])
    // 一個人獨自坐著
    const sitC = spot(46, -12.5, 1.6)
    add('sitter', STYLES.israelite3, 131, sitC, [{ act: 'sit', dur: 30, face: [30, 0] }])
    // 遠處（低細節）
    add('far1', STYLES.israelite1, 141, [-40, -27], [{ to: [12, -28] }, { act: 'idle', dur: 3 }, { to: [-40, -27] }], { detail: 'low' })
    add('far2', STYLES.woman2, 143, [-35, 27], [{ to: [15, 28], act: 'jar', carry: 'jar', speed: 0.9 }, { act: 'idle', dur: 3, carry: 'jar' }, { to: [-35, 27], act: 'jar', carry: 'jar', speed: 0.9 }], { detail: 'low' })

    const seats: P2[] = [sitA, sitB, sitC]
    return { actors, lambFollow, lambTotal: isr.total, seats, grind, flockC }
  }, [C])

  // 共同時鐘
  useFrame((_, dt) => {
    clock.t += Math.min(dt, 0.05)
  })

  return (
    <group>
      {scene.actors.map((a) => (
        <Actor key={a.id} a={a} reg={reg} />
      ))}
      <Lamb reg={reg} follow={scene.lambFollow} total={scene.lambTotal} />
      <Flock center={scene.flockC} radius={5} n={11} seed={3} goats={3} />
      {/* 壇旁與門外的木柴堆 */}
      <Prop geo={woodPile()} mat={mats.wood} pos={[26.8 * C, 0, 7.2 * C]} rot={0.4} />
      <Prop geo={woodPile()} mat={mats.wood} pos={[53.5 * C, 0, -17.5 * C]} rot={1.3} />
      {scene.seats.map((s, i) => (
        <Prop key={i} geo={seatStone(i)} mat={mats.clay} pos={[s[0], 0, s[1]]} rot={i} scale={0.95} />
      ))}
      <Prop geo={quern()} mat={mats.clay} pos={[scene.grind[0] + 0.62, 0, scene.grind[1]]} rot={Math.PI / 2} />
      <Prop geo={waterJar()} mat={mats.clay} pos={[scene.grind[0] - 0.3, 0, scene.grind[1] - 0.8]} />
      <Prop geo={waterJar(0.8)} mat={mats.clay} pos={[scene.seats[0][0] - 0.7, 0, scene.seats[0][1] + 0.6]} rot={1} />
    </group>
  )
}

export type { MutableRefObject }
