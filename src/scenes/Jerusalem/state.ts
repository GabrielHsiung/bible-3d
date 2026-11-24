import { create } from 'zustand'
import { EVENTS, yearAt, type Focus } from './timeline'

/** 場景內的狀態（元件掛上時 reset，切換場景後不保留） */
interface JState {
  /** 時間軸位置（0…N-1，可為小數） */
  pos: number
  /** 選到的事件（卡片） */
  sel: number | null
  playing: boolean
  dragging: boolean
  /** 鏡頭飛行要求（每次 n 加一） */
  fly: { focus: Focus; n: number } | null
  labels: boolean
  setPos: (p: number) => void
  select: (i: number, fly?: boolean) => void
  closeCard: () => void
  setPlaying: (p: boolean) => void
  setDragging: (d: boolean) => void
  toggleLabels: () => void
  reset: (i: number) => void
}

export const useJ = create<JState>((set, get) => ({
  pos: 0,
  sel: 0,
  playing: false,
  dragging: false,
  fly: null,
  labels: true,
  setPos: (pos) => set({ pos: Math.max(0, Math.min(EVENTS.length - 1, pos)) }),
  select: (i, fly = true) =>
    set({ sel: i, pos: i, fly: fly ? { focus: EVENTS[i].focus, n: (get().fly?.n ?? 0) + 1 } : get().fly }),
  closeCard: () => set({ sel: null }),
  setPlaying: (playing) => set({ playing }),
  setDragging: (dragging) => set({ dragging }),
  toggleLabels: () => set({ labels: !get().labels }),
  reset: (i) => set({ pos: i, sel: i, playing: false, dragging: false, fly: { focus: EVENTS[i].focus, n: 1 } }),
}))

export const currentYear = () => yearAt(useJ.getState().pos)
