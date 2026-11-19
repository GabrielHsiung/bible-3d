import * as THREE from 'three'
import { bronzeMaps, goldMaps, linenMaps, silverMaps, woodMaps, hideMaps } from './pbr'
import { boardsTex, ceilingTex, wovenTex } from './textures'

/**
 * 共用材質。帳幕內部的材質（tag: interior）會改用「帳幕內部」的環境反射，
 * 這樣金器反射的是幽暗的金牆和燈光，而不是外面的天空。
 */
export const INTERIOR = new Set<THREE.MeshStandardMaterial>()

function std(p: THREE.MeshStandardMaterialParameters, interior = false) {
  const m = new THREE.MeshStandardMaterial(p)
  if (interior) INTERIOR.add(m)
  return m
}

export const mat = {
  bronze: std({ ...bronzeMaps([1, 1]), metalness: 1, roughness: 1 }),
  bronzeBig: std({ ...bronzeMaps([2, 1]), metalness: 1, roughness: 1 }),
  gold: std({ ...goldMaps([1, 1]), metalness: 1, roughness: 1 }),
  goldIn: std({ ...goldMaps([1, 1]), metalness: 1, roughness: 1 }, true),
  silver: std({ ...silverMaps([1, 1]), metalness: 1, roughness: 1 }),
  silverIn: std({ ...silverMaps([1, 1]), metalness: 1, roughness: 1 }, true),
  wood: std({ ...woodMaps([1, 3]), roughness: 1 }),
  ram: std({ color: '#7c241c', roughness: 0.8 }),
  bread: std({ color: '#c99456', roughness: 0.95 }, true),
  water: new THREE.MeshPhysicalMaterial({ color: '#2d5563', metalness: 0, roughness: 0.03, transmission: 0, clearcoat: 1, clearcoatRoughness: 0.02 }),
  fire: std({ color: '#ff8a2a', emissive: '#ff5a00', emissiveIntensity: 6 }),
  flame: std({ color: '#ffd27a', emissive: '#ffb347', emissiveIntensity: 9 }, true),
  ember: std({ color: '#1e0f08', emissive: '#ff3c00', emissiveIntensity: 1.2, roughness: 1 }),
  smoke: new THREE.MeshStandardMaterial({ color: '#d8d2c8', transparent: true, opacity: 0.25, depthWrite: false }),
}

export const linen = (rx: number) => std({ ...linenMaps([rx, 1]), roughness: 1, side: THREE.DoubleSide })
export const hide = (rx: number, ry: number) => std({ ...hideMaps([rx, ry]), roughness: 1 })

export const boards = (rx: number) =>
  std(
    {
      map: boardsTex(rx),
      normalMap: goldMaps([rx * 2, 4]).normalMap,
      roughnessMap: goldMaps([rx * 2, 4]).roughnessMap,
      metalness: 1,
      roughness: 1.4,
    },
    true,
  )

export const woven = (kind: 'gate' | 'veil', rx = 1, interior = false) =>
  std({ map: wovenTex(kind, rx), normalMap: linenMaps([rx * 3, 1]).normalMap, normalScale: new THREE.Vector2(0.6, 0.6), roughness: 0.9, side: THREE.DoubleSide }, interior)

export const ceiling = () => std({ map: ceilingTex(), roughness: 0.9, side: THREE.DoubleSide }, true)
