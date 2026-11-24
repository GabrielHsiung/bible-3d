/**
 * 程序動畫：每個動作給一組骨骼目標角度（平滑過渡），走路是疊加上去的週期運動。
 * 角度慣例（綁定姿勢骨骼沒有旋轉，軸向等於世界軸）：
 *   x 正 = 往前彎（脊椎前傾、手往後擺／腿往後）；手往前舉、腿往前抬是 x 負。
 *   左側手臂 z 正 = 外展；右側自動鏡像。
 */
import * as THREE from 'three'
import { B } from './body'

export type Action = 'idle' | 'walk' | 'bend' | 'wash' | 'reach' | 'sit' | 'talk' | 'kneel' | 'grind' | 'carry' | 'jar' | 'lead' | 'receive' | 'staff' | 'pray'

const NB = 17
type Tgt = Float32Array // NB*3 + 3（最後三個是髖部位移）
const OFF = NB * 3

function blank(): Tgt {
  return new Float32Array(NB * 3 + 3)
}
function set(t: Tgt, b: number, x: number, y = 0, z = 0) {
  t[b * 3] = x
  t[b * 3 + 1] = y
  t[b * 3 + 2] = z
}
/** 左右對稱設定（左側慣例，右側鏡像 y、z） */
function arm(t: Tgt, side: 1 | -1, ua: [number, number, number], fa: [number, number, number], hand: [number, number, number] = [0, 0, 0]) {
  const [u, f, h] = side > 0 ? [B.UA_L, B.FA_L, B.HAND_L] : [B.UA_R, B.FA_R, B.HAND_R]
  set(t, u, ua[0], ua[1] * side, ua[2] * side)
  set(t, f, fa[0], fa[1] * side, fa[2] * side)
  set(t, h, hand[0], hand[1] * side, hand[2] * side)
}
function leg(t: Tgt, side: 1 | -1, th: number, sh: number, ft: number, thz = 0) {
  const [a, b2, c] = side > 0 ? [B.TH_L, B.SH_L, B.FT_L] : [B.TH_R, B.SH_R, B.FT_R]
  set(t, a, th, 0, thz * side)
  set(t, b2, sh)
  set(t, c, ft)
}

export interface AnimState {
  phase: number
  walk: number
  cur: Tgt
  t: number
  seed: number
  elder: boolean
  child: boolean
}

export function newAnim(seed: number, elder = false, child = false): AnimState {
  return { phase: seed * 3.1, walk: 0, cur: blank(), t: seed * 11.3, seed, elder, child }
}

/** 這個動作下，手臂是否自由擺動（左、右） */
function armsFree(a: Action): [number, number] {
  switch (a) {
    case 'carry':
    case 'receive':
    case 'wash':
    case 'reach':
      return [0, 0]
    case 'jar':
    case 'lead':
    case 'staff':
      return [1, 0]
    default:
      return [1, 1]
  }
}

function target(a: Action, s: AnimState): Tgt {
  const t = blank()
  const T = s.t
  const sd = s.seed
  // 基本站姿：手肘微彎
  arm(t, 1, [0.04, 0, -0.03], [-0.16, 0, 0], [-0.08, 0, 0])
  arm(t, -1, [0.04, 0, -0.03], [-0.16, 0, 0], [-0.08, 0, 0])
  if (s.elder) {
    set(t, B.SPINE, 0.12)
    set(t, B.CHEST, 0.1)
    set(t, B.NECK, -0.1)
    leg(t, 1, -0.08, 0.14, -0.06)
    leg(t, -1, -0.08, 0.14, -0.06)
    t[OFF + 1] = -0.012
  }
  switch (a) {
    case 'idle':
    case 'walk': {
      // 重心在兩腳間緩慢移動、頭偶爾轉動
      const sh = Math.sin(T * 0.27 + sd) * 0.035
      set(t, B.HIPS, 0, Math.sin(T * 0.11 + sd) * 0.05, sh)
      t[OFF] = sh * 0.5
      leg(t, 1, t[B.TH_L * 3], t[B.SH_L * 3], t[B.FT_L * 3], -sh)
      leg(t, -1, t[B.TH_R * 3], t[B.SH_R * 3], t[B.FT_R * 3], sh)
      set(t, B.HEAD, Math.sin(T * 0.17 + sd * 2) * 0.06, Math.sin(T * 0.21 + sd) * Math.sin(T * 0.13 + sd * 3) * 0.45, 0)
      break
    }
    case 'bend': {
      set(t, B.SPINE, 0.55)
      set(t, B.CHEST, 0.42)
      set(t, B.NECK, 0.15)
      set(t, B.HEAD, 0.2)
      leg(t, 1, -0.3, 0.6, -0.3)
      leg(t, -1, -0.3, 0.6, -0.3)
      t[OFF + 1] = -0.07
      t[OFF + 2] = -0.07
      const rub = Math.sin(T * 6) * 0.12
      arm(t, 1, [-0.85 + rub, 0, -0.1], [-0.35, 0, 0])
      arm(t, -1, [-0.85 - rub, 0, -0.1], [-0.35, 0, 0])
      break
    }
    case 'wash': {
      set(t, B.SPINE, 0.14)
      set(t, B.CHEST, 0.1)
      set(t, B.HEAD, 0.35)
      const rub = Math.sin(T * 7)
      arm(t, 1, [-0.7, 0.1, -0.22], [-0.95 + rub * 0.1, 0.25 * rub, 0], [0.2, 0, 0])
      arm(t, -1, [-0.7, 0.1, -0.22], [-0.95 - rub * 0.1, -0.25 * rub, 0], [0.2, 0, 0])
      break
    }
    case 'reach': {
      set(t, B.SPINE, -0.04)
      set(t, B.HEAD, -0.15)
      arm(t, 1, [-1.35, 0, -0.12], [-0.45, 0, 0])
      arm(t, -1, [-1.35, 0, -0.12], [-0.45, 0, 0])
      break
    }
    case 'receive': {
      const k = 0.5 + 0.5 * Math.sin(T * 0.6 + sd)
      set(t, B.HEAD, 0.12)
      arm(t, 1, [-0.45 - k * 0.2, -0.2, -0.05], [-0.8, -0.5, 0], [0.2, 0, 0])
      arm(t, -1, [-0.45 - k * 0.2, -0.2, -0.05], [-0.8, -0.5, 0], [0.2, 0, 0])
      break
    }
    case 'pray': {
      set(t, B.HEAD, -0.12)
      set(t, B.NECK, -0.05)
      arm(t, 1, [-0.75, 0, 0.35], [-1.0, 0, 0.4], [-0.3, 0, 0])
      arm(t, -1, [-0.75, 0, 0.35], [-1.0, 0, 0.4], [-0.3, 0, 0])
      break
    }
    case 'carry': {
      set(t, B.SPINE, -0.07)
      set(t, B.HEAD, 0.08)
      arm(t, 1, [-0.5, 0, -0.18], [-1.25, 0.35, 0], [0.1, 0, 0])
      arm(t, -1, [-0.5, 0, -0.18], [-1.25, 0.35, 0], [0.1, 0, 0])
      break
    }
    case 'jar': {
      // 右手扶著頭上的水罐
      arm(t, -1, [-0.15, 0, 2.55], [-0.1, 0, 1.25], [0, 0, 0.3])
      set(t, B.CHEST, 0, 0, -0.04)
      set(t, B.NECK, 0, 0, 0.03)
      break
    }
    case 'lead': {
      arm(t, -1, [-0.42, 0, 0.12], [-0.55, 0, 0], [0.1, 0, 0])
      break
    }
    case 'staff': {
      arm(t, -1, [-0.32, 0, 0.12], [-0.75, -0.2, 0], [0, 0, 0])
      break
    }
    case 'sit':
    case 'talk': {
      t[OFF + 1] = -0.41
      t[OFF + 2] = -0.02
      leg(t, 1, -1.48, 1.42, 0.02, 0.08)
      leg(t, -1, -1.48, 1.42, 0.02, 0.08)
      set(t, B.SPINE, 0.1)
      set(t, B.CHEST, 0.06)
      set(t, B.HEAD, Math.sin(T * 0.3 + sd) * 0.08, Math.sin(T * 0.19 + sd) * 0.35, 0)
      arm(t, 1, [-0.45, 0, -0.08], [-0.75, 0.2, 0], [0.2, 0, 0])
      arm(t, -1, [-0.45, 0, -0.08], [-0.75, 0.2, 0], [0.2, 0, 0])
      if (a === 'talk') {
        // 說話時右手比劃
        const g = Math.max(0, Math.sin(T * 0.9 + sd))
        arm(t, -1, [-0.5 - g * 0.5, 0, 0.1 + g * 0.2], [-1.1 + Math.sin(T * 3.1) * 0.25 * g, 0.3, 0], [0.3, 0, 0])
        set(t, B.HEAD, 0.05, -0.25 + Math.sin(T * 0.5) * 0.15, 0)
      }
      break
    }
    case 'kneel':
    case 'grind': {
      t[OFF + 1] = -0.5
      t[OFF + 2] = -0.04
      leg(t, 1, -0.25, 1.75, -0.35, 0.06)
      leg(t, -1, -0.25, 1.75, -0.35, 0.06)
      set(t, B.SPINE, 0.2)
      set(t, B.CHEST, 0.1)
      if (a === 'grind') {
        // 跪著推磨石：上身前後擺動
        const m = Math.sin(T * 2.2)
        set(t, B.SPINE, 0.55 + m * 0.12)
        set(t, B.CHEST, 0.25 + m * 0.05)
        set(t, B.HEAD, -0.25)
        arm(t, 1, [-1.05 - m * 0.2, 0, -0.18], [-0.15, 0, 0], [0.3, 0, 0])
        arm(t, -1, [-1.05 - m * 0.2, 0, -0.18], [-0.15, 0, 0], [0.3, 0, 0])
      } else {
        arm(t, 1, [-0.3, 0, -0.1], [-0.9, 0, 0])
        arm(t, -1, [-0.3, 0, -0.1], [-0.9, 0, 0])
      }
      break
    }
  }
  return t
}

const e = new THREE.Euler()
/**
 * 每幀更新骨骼。speed：公尺／秒（未縮放）；scale：身高比例。
 */
export function animate(s: AnimState, bones: THREE.Bone[], rest: THREE.Vector3[], action: Action, speed: number, dt: number, scale: number) {
  s.t += dt
  const tg = target(action, s)
  const k = 1 - Math.exp(-dt * 5)
  for (let i = 0; i < tg.length; i++) s.cur[i] += (tg[i] - s.cur[i]) * k
  // 走路幅度
  const moving = speed > 0.08 ? 1 : 0
  s.walk += (moving - s.walk) * (1 - Math.exp(-dt * 8))
  const sp = speed / scale
  const run = THREE.MathUtils.clamp((sp - 2.6) / 1.8, 0, 1)
  const stride = 0.62 + 0.22 * Math.min(sp, 3)
  s.phase += ((dt * Math.PI * Math.max(sp, 0.6)) / stride) * (moving ? 1 : 0.3)
  const w = s.walk
  const A = (0.34 + Math.min(sp, 2.5) * 0.04 + run * 0.22) * w
  const ph = s.phase
  const sn = Math.sin(ph)
  const cs = Math.cos(ph)
  const [fl, fr] = armsFree(action)

  const c = s.cur
  const R = (b: number, ax: number) => c[b * 3 + ax]
  for (let b = 0; b < NB; b++) {
    let x = R(b, 0)
    let y = R(b, 1)
    let z = R(b, 2)
    if (w > 0.001) {
      switch (b) {
        case B.HIPS:
          y += -sn * 0.12 * A
          z += cs * 0.05 * A
          break
        case B.SPINE:
          x += run * 0.18 * w + 0.03 * w
          y += sn * 0.08 * A
          break
        case B.CHEST:
          y += sn * 0.1 * A
          break
        case B.HEAD:
          y -= sn * 0.1 * A
          x -= run * 0.12 * w
          break
        case B.TH_L:
        case B.TH_R: {
          const side = b === B.TH_L ? 1 : -1
          x += -side * sn * A * 1.15
          break
        }
        case B.SH_L:
        case B.SH_R: {
          const side = b === B.SH_L ? 1 : -1
          // 擺動期（腿往前送）膝蓋彎；著地期微彎
          const swing = Math.max(0, side * cs)
          x += (swing * swing * (0.95 + run * 0.9) + 0.08) * w
          break
        }
        case B.FT_L:
        case B.FT_R: {
          const side = b === B.FT_L ? 1 : -1
          const th = -side * sn * A * 1.15
          const swing = Math.max(0, side * cs)
          const sh = (swing * swing * (0.95 + run * 0.9) + 0.08) * w
          x += -(th + sh) * 0.75 + (side * sn > 0.6 ? 0 : 0.1 * w)
          break
        }
        case B.UA_L:
          x += sn * A * 0.85 * fl
          break
        case B.UA_R:
          x -= sn * A * 0.85 * fr
          break
        case B.FA_L:
          x -= (0.12 + Math.max(0, -sn) * 0.35 + run * 0.9) * A * fl
          break
        case B.FA_R:
          x -= (0.12 + Math.max(0, sn) * 0.35 + run * 0.9) * A * fr
          break
      }
    }
    // 呼吸
    if (b === B.CHEST) x += Math.sin(s.t * (1.5 + run)) * 0.012
    if (b === B.NECK) x -= Math.sin(s.t * 1.5) * 0.008
    e.set(x, y, z)
    bones[b].quaternion.setFromEuler(e)
  }
  // 髖部位置：走路時上下起伏（直立腿時最高）、左右移動
  const hip = bones[B.HIPS]
  const thA = A * 1.15 * Math.abs(sn)
  const bob = -0.88 * (1 - Math.cos(thA)) + (run * 0.04 * Math.abs(cs)) * w
  hip.position.set(rest[B.HIPS].x + c[OFF] + cs * 0.018 * w, rest[B.HIPS].y + c[OFF + 1] + bob, rest[B.HIPS].z + c[OFF + 2])
  // 呼吸：胸腔微微起伏
  const br = 1 + Math.sin(s.t * 1.5) * 0.006
  bones[B.CHEST].scale.set(br, 1, br)
}
