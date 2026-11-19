/**
 * 法櫃與施恩座（出 25:10-22；37:1-9）
 * - 皂莢木做，長 2.5 肘、寬 1.5 肘、高 1.5 肘，裡外包上精金，四圍鑲金牙邊（25:10-11）
 * - 四個金環安在櫃的四腳上，槓穿在環內，不可抽出來（25:12-15）
 * - 施恩座：精金，長 2.5 肘、寬 1.5 肘（25:17）
 * - 兩個基路伯與施恩座接連一塊，高張翅膀遮掩施恩座，臉對臉，朝著施恩座（25:18-20）
 * 基路伯的形象經文沒有描述（跪姿、人形、羽翼的樣子）都屬推測；槓的方向參王上 8:8。
 */
import { useMemo } from 'react'
import * as THREE from 'three'
import { lathe, merge, rbox, smoothProfile, taperTube } from './geom'
import { sacredMat } from './materials'

type M = (n: number) => number

const L = 2.5
const D = 1.5
const HT = 1.5
const FEET = 0.1
const SEAT_T = 0.09

/* ---------- 羽翼 ---------- */
/** 一排羽毛的外形：上緣是翼的前緣，下緣是一根根羽毛的圓尖 */
function featherRow(span: number, chord: (u: number) => number, n: number, lift = 0) {
  const s = new THREE.Shape()
  s.moveTo(0, 0)
  // 前緣：從肩膀拱起到翼尖
  const tip = new THREE.Vector2(span, lift)
  s.quadraticCurveTo(span * 0.45, lift + 0.09, tip.x, tip.y)
  // 後緣：每根羽毛一個圓尖，羽尖略朝翼尖方向
  for (let i = n; i >= 0; i--) {
    const u = i / n
    const x = u * span
    const c = chord(u)
    const yEdge = lift * u + 0.09 * 4 * u * (1 - u) * 0.5
    const xTip = x - 0.02 - u * 0.03
    const prevX = ((i - 0.5) / n) * span
    s.quadraticCurveTo(xTip + 0.03, yEdge - c, xTip, yEdge - c)
    if (i > 0) s.quadraticCurveTo(prevX, yEdge - c * 0.78, Math.max(prevX - 0.01, 0), yEdge - c * 0.7)
  }
  s.lineTo(0, -chord(0) * 0.6)
  s.lineTo(0, 0)
  return s
}

/** 一隻翅膀（三層羽毛），本地座標：x 沿翼展，-y 是羽尖方向，z 是厚度 */
function wing(span: number) {
  const rows = [
    { span, n: 11, chord: (u: number) => 0.3 * (1 - 0.5 * u) + 0.12 * Math.sin(Math.PI * u), z: 0 },
    { span: span * 0.8, n: 10, chord: (u: number) => 0.17 * (1 - 0.4 * u) + 0.04, z: 0.016 },
    { span: span * 0.58, n: 8, chord: (u: number) => 0.09 + 0.02 * (1 - u), z: 0.03 },
  ]
  const parts = rows.map((r, i) => {
    const g = new THREE.ExtrudeGeometry(featherRow(r.span, r.chord, r.n, 0.06 * (1 - i * 0.3)), {
      depth: 0.012,
      bevelEnabled: true,
      bevelThickness: 0.006,
      bevelSize: 0.006,
      bevelSegments: 1,
      curveSegments: 4,
    })
    return g.translate(0, 0, r.z)
  })
  const g = merge(parts)
  // 翼面略為拱起（向 -z 彎成弧）
  const p = g.attributes.position as THREE.BufferAttribute
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) / span
    const y = p.getY(i)
    p.setZ(i, p.getZ(i) - 0.1 * Math.sin(Math.PI * Math.min(Math.max(x, 0), 1)) + y * 0.15)
  }
  g.computeVertexNormals()
  return g
}

/** 把翅膀的本地座標 (x 翼展, -y 羽尖, z 厚度) 對到世界方向 */
function orientWing(g: THREE.BufferGeometry, root: THREE.Vector3, spanDir: THREE.Vector3, trailDir: THREE.Vector3) {
  const S = spanDir.clone().normalize()
  const T = trailDir.clone().sub(S.clone().multiplyScalar(trailDir.dot(S))).normalize()
  const N = new THREE.Vector3().crossVectors(S, T)
  // 基底 (S, -T, -N)：行列式為 +1，不會翻面
  const mtx = new THREE.Matrix4().makeBasis(S, T.clone().negate(), N.clone().negate()).setPosition(root)
  return g.applyMatrix4(mtx)
}

/* ---------- 基路伯（面向 +x，跪在施恩座的一端） ---------- */
function cherub() {
  const parts: THREE.BufferGeometry[] = []
  const lean = 0.18 // 身體前傾
  // 長袍（跪姿：下襬寬）
  const robe = lathe(
    smoothProfile([[0.0, 0.0], [0.27, 0.0], [0.28, 0.06], [0.24, 0.2], [0.17, 0.38], [0.15, 0.45], [0.17, 0.58], [0.2, 0.68], [0.17, 0.74], [0.07, 0.78]], 30),
    28,
  )
  const rp = robe.attributes.position as THREE.BufferAttribute
  for (let i = 0; i < rp.count; i++) {
    const x = rp.getX(i)
    const y = rp.getY(i)
    const z = rp.getZ(i)
    const phi = Math.atan2(z, x)
    // 衣褶（下半部）＋身體前後略扁
    const fold = 1 + 0.06 * Math.sin(phi * 9) * (1 - THREE.MathUtils.smoothstep(y, 0.1, 0.45))
    rp.setXYZ(i, x * fold * 0.88 + y * lean, y, z * fold)
  }
  robe.computeVertexNormals()
  parts.push(robe)
  // 腰帶
  parts.push(new THREE.TorusGeometry(0.152, 0.016, 6, 24).rotateX(Math.PI / 2).scale(0.88, 1, 1).translate(0.45 * lean, 0.45, 0))
  // 頸、頭（低頭望著施恩座）
  const neckBase = new THREE.Vector3(0.78 * lean, 0.76, 0)
  parts.push(lathe([[0.05, 0], [0.045, 0.08]], 12).rotateZ(-0.35).translate(neckBase.x, neckBase.y, 0))
  const head = lathe(smoothProfile([[0.0, -0.1], [0.06, -0.09], [0.085, -0.04], [0.09, 0.02], [0.075, 0.07], [0.0, 0.1]], 14), 20)
  head.scale(1, 1.05, 0.9).rotateZ(-0.45)
  parts.push(head.translate(neckBase.x + 0.07, neckBase.y + 0.13, 0))
  // 髮帶
  parts.push(new THREE.TorusGeometry(0.083, 0.012, 6, 20).rotateX(Math.PI / 2).rotateZ(-0.45).translate(neckBase.x + 0.065, neckBase.y + 0.16, 0))
  // 雙臂：從肩膀垂下，雙手在胸前合攏
  for (const s of [-1, 1]) {
    const arm = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.7 * lean, 0.68, s * 0.17),
      new THREE.Vector3(0.05, 0.5, s * 0.2),
      new THREE.Vector3(0.18, 0.47, s * 0.12),
      new THREE.Vector3(0.27, 0.56, s * 0.035),
    ])
    parts.push(taperTube(arm, (t) => 0.05 - t * 0.022, 16, 10))
    parts.push(new THREE.SphereGeometry(0.033, 10, 8).scale(1.2, 1, 0.8).translate(0.29, 0.58, s * 0.025))
  }
  // 翅膀：從背上高張，向前伸到施恩座上方（25:20）
  for (const s of [-1, 1]) {
    const root = new THREE.Vector3(-0.02, 0.7, s * 0.1)
    const span = new THREE.Vector3(0.78, 0.55, s * 0.28)
    const trail = new THREE.Vector3(-0.15, -0.55, s * 0.85)
    parts.push(orientWing(wing(1.0), root, span, trail))
  }
  return merge(parts)
}

export function buildArk() {
  const gold: THREE.BufferGeometry[] = []
  const body = HT - SEAT_T - FEET
  // 四腳
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]])
    gold.push(rbox(0.2, FEET + 0.02, 0.2, 0.03).translate(sx * (L / 2 - 0.12), FEET / 2, sz * (D / 2 - 0.12)))
  // 櫃身
  gold.push(rbox(L, body, D, 0.03).translate(0, FEET + body / 2, 0))
  // 外壁的框與嵌板
  const frame = (len: number, z: number, rot: number) => {
    const f: THREE.BufferGeometry[] = []
    f.push(rbox(len - 0.06, 0.08, 0.03, 0.01).translate(0, FEET + 0.1, 0))
    f.push(rbox(len - 0.06, 0.06, 0.03, 0.01).translate(0, FEET + body - 0.17, 0))
    const n = len > 2 ? 4 : 2
    for (let i = 0; i <= n; i++) f.push(rbox(0.06, body - 0.3, 0.03, 0.01).translate(-len / 2 + 0.06 + (i * (len - 0.12)) / n, FEET + body / 2 - 0.03, 0))
    // 嵌板中央的菱形飾片
    for (let i = 0; i < n; i++)
      f.push(
        new THREE.OctahedronGeometry(0.12, 0)
          .scale(1, 1.3, 0.12)
          .translate(-len / 2 + 0.06 + ((i + 0.5) * (len - 0.12)) / n, FEET + body / 2 - 0.03, 0),
      )
    return merge(f).translate(0, 0, z).rotateY(rot)
  }
  gold.push(frame(L, D / 2 + 0.005, 0), frame(L, D / 2 + 0.005, Math.PI), frame(D, L / 2 + 0.005, Math.PI / 2), frame(D, L / 2 + 0.005, -Math.PI / 2))
  // 金牙邊：櫃口四圍的冠邊（25:11）
  const crownY = FEET + body - 0.05
  for (const s of [-1, 1]) {
    gold.push(rbox(L + 0.06, 0.1, 0.05, 0.02).translate(0, crownY, s * (D / 2 + 0.01)))
    gold.push(rbox(0.05, 0.1, D + 0.06, 0.02).translate(s * (L / 2 + 0.01), crownY, 0))
    gold.push(new THREE.CapsuleGeometry(0.02, L + 0.04, 3, 8).rotateZ(Math.PI / 2).translate(0, crownY - 0.07, s * (D / 2 + 0.02)))
    gold.push(new THREE.CapsuleGeometry(0.02, D + 0.04, 3, 8).rotateX(Math.PI / 2).translate(s * (L / 2 + 0.02), crownY - 0.07, 0))
  }
  // 施恩座
  gold.push(rbox(L + 0.02, SEAT_T, D + 0.02, 0.025).translate(0, HT - SEAT_T / 2, 0))
  // 四個金環在四腳上，兩根槓沿長邊（向東伸出）
  const poleY = 0.36
  for (const sz of [-1, 1]) {
    for (const sx of [-1, 1]) {
      gold.push(new THREE.TorusGeometry(0.075, 0.02, 8, 18).rotateY(Math.PI / 2).translate(sx * (L / 2 - 0.25), poleY, sz * (D / 2 + 0.07)))
      gold.push(rbox(0.06, 0.1, 0.08, 0.015).translate(sx * (L / 2 - 0.25), poleY + 0.08, sz * (D / 2 + 0.03)))
    }
    gold.push(new THREE.CapsuleGeometry(0.05, L + 2, 4, 12).rotateZ(Math.PI / 2).translate(0, poleY, sz * (D / 2 + 0.07)))
  }
  // 兩個基路伯，在施恩座兩頭，臉對臉
  const c = cherub()
  gold.push(c.clone().translate(-L / 2 + 0.32, HT, 0))
  gold.push(c.clone().rotateY(Math.PI).translate(L / 2 - 0.32, HT, 0))
  return merge(gold)
}

export function Ark({ m }: { m: M }) {
  const geo = useMemo(buildArk, [])
  const H = m(HT)
  return (
    <group position={[m(-25), 0, 0]}>
      <pointLight color="#fff1c9" position={[0, H + 1.2, 0]} intensity={2.5} distance={6} decay={1.5} />
      <group scale={m(1)}>
        <mesh geometry={geo} material={sacredMat.gold} castShadow receiveShadow />
      </group>
    </group>
  )
}
