import { useEffect, useMemo, useRef, type MutableRefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { B, boneDefs, buildPerson } from './people/body'
import { MAT_GOLD, MAT_SKIN, makeSkeleton } from './people/geo'
import { animate, newAnim, type Action } from './people/anim'
import { peopleMaterials } from './people/materials'
import { staff, waterJar, woodBundle } from './people/props'
import { makeParams, STYLES, type PersonStyle } from './people/styles'

export { STYLES, type PersonStyle }
export type { Action }
export type Carry = null | 'wood' | 'jar' | 'staff'

export interface PersonProps {
  style: PersonStyle
  /** 移動速度（公尺／秒），驅動走路動畫 */
  speedRef: MutableRefObject<number>
  /** 外觀隨機種子（體型、膚色、鬍子、衣服色差） */
  seed?: number
  /** 目前的動作（預設：依速度自動 idle／walk） */
  actionRef?: MutableRefObject<Action>
  /** 手上／頭上拿的東西 */
  carryRef?: MutableRefObject<Carry>
  /** 細節：auto = 依與相機距離切換 */
  detail?: 'auto' | 'high' | 'low'
}

const REF_H = 1.72
const LOD_DIST = 28
const tmpV = new THREE.Vector3()
const tmpQ = new THREE.Quaternion()
const tmpQ2 = new THREE.Quaternion()

function hashStyle(s: PersonStyle) {
  let h = 7
  for (const ch of JSON.stringify(s)) h = (h * 31 + ch.charCodeAt(0)) | 0
  return Math.abs(h) % 1000
}

/**
 * 程序建模的寫實人物（蒙皮骨架、約 1.05–1.77 公尺）。
 * 以 speedRef 驅動走路；actionRef 可指定彎腰、洗手、坐、跪、提水罐等動作。
 */
export function Person({ style, speedRef, seed, actionRef, carryRef, detail = 'auto' }: PersonProps) {
  const sd = seed ?? hashStyle(style)
  const built = useMemo(() => {
    const { params, height } = makeParams(style, sd)
    const mats = peopleMaterials()
    const matOf = (m: number) => (m === MAT_SKIN ? mats.skin : m === MAT_GOLD ? mats.gold : mats.cloth)
    const { bones, skeleton, rest } = makeSkeleton(boneDefs(params))
    const group = new THREE.Group()
    group.scale.setScalar(height / REF_H)
    group.add(bones[0])
    const bind = new THREE.Matrix4()
    const sphere = new THREE.Sphere(new THREE.Vector3(0, 0.85, 0), 1.25)
    const make = (d: number) => {
      const out: THREE.SkinnedMesh[] = []
      for (const [m, g] of buildPerson(params, d)) {
        const mesh = new THREE.SkinnedMesh(g, matOf(m))
        mesh.bind(skeleton, bind)
        mesh.castShadow = true
        mesh.receiveShadow = true
        mesh.boundingSphere = sphere.clone()
        group.add(mesh)
        out.push(mesh)
      }
      return out
    }
    const hi = detail === 'low' ? [] : make(1)
    const lo = detail === 'high' ? [] : make(0.5)
    hi.forEach((m) => (m.visible = true))
    lo.forEach((m) => (m.visible = detail === 'low'))
    // 道具：掛在骨骼上，保持直立
    const prop = (geo: THREE.BufferGeometry, mat: THREE.Material, bone: number) => {
      const o = new THREE.Mesh(geo, mat)
      o.castShadow = true
      o.visible = false
      bones[bone].add(o)
      return o
    }
    const props = {
      wood: prop(woodBundle(), mats.wood, B.CHEST),
      jar: prop(waterJar(), mats.clay, B.HEAD),
      staff: prop(staff(), mats.wood, B.HAND_R),
    }
    const anim = newAnim(sd, params.elder, params.child)
    return { group, bones, rest, skeleton, hi, lo, props, anim, scale: height / REF_H }
  }, [style, sd, detail])

  useEffect(
    () => () => {
      for (const m of [...built.hi, ...built.lo]) m.geometry.dispose()
      built.skeleton.dispose()
    },
    [built],
  )

  const lodState = useRef(detail === 'low')
  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    const b = built
    const speed = speedRef.current
    const action: Action = actionRef ? actionRef.current : 'idle'
    animate(b.anim, b.bones, b.rest, action, speed, dt, b.scale)

    if (detail === 'auto') {
      b.group.getWorldPosition(tmpV)
      const far = tmpV.distanceTo(state.camera.position) > (lodState.current ? LOD_DIST + 3 : LOD_DIST)
      if (far !== lodState.current) {
        lodState.current = far
        b.hi.forEach((m) => (m.visible = !far))
        b.lo.forEach((m) => (m.visible = far))
      }
    }

    const carry = carryRef ? carryRef.current : null
    const { wood, jar, staff: st } = b.props
    wood.visible = carry === 'wood'
    jar.visible = carry === 'jar'
    st.visible = carry === 'staff'
    b.group.getWorldQuaternion(tmpQ2)
    const upright = (o: THREE.Object3D, tilt = 0) => {
      ;(o.parent as THREE.Object3D).getWorldQuaternion(tmpQ)
      o.quaternion.copy(tmpQ.invert().multiply(tmpQ2))
      if (tilt) o.rotateX(tilt)
    }
    if (wood.visible) {
      // 抱在胸前；舉起時往上往前
      const reach = action === 'reach' ? 1 : 0
      const k = 1 - Math.exp(-dt * 4)
      wood.position.lerp(tmpV.set(0, reach ? 0.36 : -0.2, reach ? 0.5 : 0.26), k)
      upright(wood)
    }
    if (jar.visible) {
      jar.position.set(0, 0.18, 0.0)
      upright(jar)
    }
    if (st.visible) {
      st.position.set(0, -0.075, 0.015)
      upright(st, 0.06)
    }
  })

  return <primitive object={built.group} />
}
