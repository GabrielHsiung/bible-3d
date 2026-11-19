import { useRef, type MutableRefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

export interface PersonStyle {
  robe: string
  sash: string
  head: string // 頭巾顏色
  skin?: string
  turban?: boolean // 祭司的細麻頭巾
  beard?: boolean
}

/** 簡易人物（約 1.65 公尺），以 speedRef 驅動走路動畫 */
export function Person({ style, speedRef }: { style: PersonStyle; speedRef: MutableRefObject<number> }) {
  const body = useRef<THREE.Group>(null)
  const armL = useRef<THREE.Group>(null)
  const armR = useRef<THREE.Group>(null)
  const legL = useRef<THREE.Mesh>(null)
  const legR = useRef<THREE.Mesh>(null)
  const phase = useRef(Math.random() * 10)
  const skin = style.skin ?? '#b07a52'

  useFrame((_, dt) => {
    const v = speedRef.current
    phase.current += dt * (3 + v * 2.6)
    const a = Math.min(v / 2, 1)
    const s = Math.sin(phase.current)
    if (armL.current) armL.current.rotation.x = s * 0.7 * a
    if (armR.current) armR.current.rotation.x = -s * 0.7 * a
    if (legL.current) legL.current.position.z = s * 0.16 * a
    if (legR.current) legR.current.position.z = -s * 0.16 * a
    if (body.current) body.current.position.y = Math.abs(Math.cos(phase.current)) * 0.04 * a
  })

  return (
    <group>
      {/* 腳（涼鞋） */}
      <mesh ref={legL} position={[-0.09, 0.04, 0]}>
        <boxGeometry args={[0.09, 0.08, 0.22]} />
        <meshStandardMaterial color="#5a3b22" />
      </mesh>
      <mesh ref={legR} position={[0.09, 0.04, 0]}>
        <boxGeometry args={[0.09, 0.08, 0.22]} />
        <meshStandardMaterial color="#5a3b22" />
      </mesh>
      <group ref={body}>
        {/* 長袍 */}
        <mesh position={[0, 0.66, 0]} castShadow>
          <cylinderGeometry args={[0.17, 0.3, 1.12, 12]} />
          <meshStandardMaterial color={style.robe} roughness={0.95} />
        </mesh>
        {/* 腰帶 */}
        <mesh position={[0, 0.88, 0]}>
          <cylinderGeometry args={[0.215, 0.225, 0.08, 12]} />
          <meshStandardMaterial color={style.sash} roughness={0.9} />
        </mesh>
        {/* 肩 */}
        <mesh position={[0, 1.24, 0]} castShadow>
          <sphereGeometry args={[0.2, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <meshStandardMaterial color={style.robe} roughness={0.95} />
        </mesh>
        {/* 手臂 */}
        {[
          [armL, -0.22],
          [armR, 0.22],
        ].map(([ref, x], i) => (
          <group key={i} ref={ref as MutableRefObject<THREE.Group>} position={[x as number, 1.22, 0]}>
            <mesh position={[0, -0.27, 0]} castShadow>
              <cylinderGeometry args={[0.06, 0.075, 0.55, 8]} />
              <meshStandardMaterial color={style.robe} roughness={0.95} />
            </mesh>
            <mesh position={[0, -0.57, 0]}>
              <sphereGeometry args={[0.045, 8, 6]} />
              <meshStandardMaterial color={skin} />
            </mesh>
          </group>
        ))}
        {/* 頭 */}
        <mesh position={[0, 1.44, 0]} castShadow>
          <sphereGeometry args={[0.11, 14, 12]} />
          <meshStandardMaterial color={skin} roughness={0.7} />
        </mesh>
        {style.beard && (
          <mesh position={[0, 1.37, 0.06]}>
            <sphereGeometry args={[0.075, 10, 8]} />
            <meshStandardMaterial color="#2b1d14" roughness={1} />
          </mesh>
        )}
        {style.turban ? (
          <mesh position={[0, 1.54, 0]}>
            <cylinderGeometry args={[0.11, 0.12, 0.12, 14]} />
            <meshStandardMaterial color={style.head} roughness={0.9} />
          </mesh>
        ) : (
          <>
            <mesh position={[0, 1.49, -0.02]}>
              <sphereGeometry args={[0.125, 14, 10, 0, Math.PI * 2, 0, Math.PI / 1.7]} />
              <meshStandardMaterial color={style.head} roughness={0.95} side={THREE.DoubleSide} />
            </mesh>
            <mesh position={[0, 1.3, -0.08]}>
              <boxGeometry args={[0.26, 0.3, 0.04]} />
              <meshStandardMaterial color={style.head} roughness={0.95} />
            </mesh>
          </>
        )}
      </group>
    </group>
  )
}

export const STYLES = {
  priest: { robe: '#f1ece0', sash: '#5a2675', head: '#f4f0e6', turban: true, beard: true },
  israelite1: { robe: '#a9875f', sash: '#7a2b22', head: '#d8cbb0', beard: true },
  israelite2: { robe: '#6d6253', sash: '#c49a4a', head: '#8b6b45', beard: true },
  israelite3: { robe: '#c5b49a', sash: '#2c4a7a', head: '#a24a33' },
  woman: { robe: '#7d4a5a', sash: '#d8c08a', head: '#3d5a7a', skin: '#c08a62' },
} satisfies Record<string, PersonStyle>
