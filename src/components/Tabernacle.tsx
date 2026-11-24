import { useMemo } from 'react'
import * as THREE from 'three'
import { useStore } from '../store'
import { Courtyard } from './structure/Courtyard'
import { Tent } from './structure/Tent'
import { Altar, Ark, IncenseAltar, Lampstand, Laver, Table } from './sacred'

type M = (n: number) => number

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
