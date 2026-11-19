import { create } from 'zustand'
import { CUBITS, type CubitKey } from './data/tabernacle'

interface State {
  cubit: CubitKey
  cutaway: boolean
  nearId: string | null
  panelOpen: boolean
  indexOpen: boolean
  teleport: { x: number; z: number; n: number } | null
  photo: boolean
  samples: number
  setPhoto: (p: boolean) => void
  setSamples: (n: number) => void
  setCubit: (c: CubitKey) => void
  toggleCutaway: () => void
  setNear: (id: string | null) => void
  setPanel: (o: boolean) => void
  setIndex: (o: boolean) => void
  teleportTo: (x: number, z: number) => void
}

export const useStore = create<State>((set) => ({
  cubit: 'common',
  cutaway: false,
  nearId: null,
  panelOpen: false,
  indexOpen: false,
  teleport: null,
  photo: false,
  samples: 0,
  setPhoto: (photo) => set({ photo, samples: 0 }),
  setSamples: (samples) => set({ samples }),
  setCubit: (cubit) => set({ cubit }),
  toggleCutaway: () => set((s) => ({ cutaway: !s.cutaway })),
  setNear: (nearId) => set((s) => (s.nearId === nearId ? s : { nearId, panelOpen: nearId ? s.panelOpen : false })),
  setPanel: (panelOpen) => set({ panelOpen }),
  setIndex: (indexOpen) => set({ indexOpen }),
  teleportTo: (x, z) => set((s) => ({ teleport: { x, z, n: (s.teleport?.n ?? 0) + 1 }, indexOpen: false })),
}))

export const cubitMeters = (k: CubitKey) => CUBITS[k].meters

/** 共用的輸入狀態（鍵盤＋搖桿＋視角拖曳） */
export const input = {
  keys: new Set<string>(),
  joy: { x: 0, y: 0 },
  yaw: Math.PI / 2, // 0 = 看向 -z；π/2 = 看向 -x（西）
  pitch: 0.14,
  player: { x: 0, y: 0, z: 0 },
}
