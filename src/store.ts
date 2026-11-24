import { create } from 'zustand'
import { CUBITS, type CubitKey } from './data/tabernacle'
import { bootSave } from './game/save'

/** 體驗流程：開場空拍 → 進場運鏡 → 玩家操控 */
export type Phase = 'intro' | 'flying' | 'play'
/** 玩家所在區域（決定音樂、環境音、腳步聲） */
export type Zone = 'camp' | 'court' | 'holy' | 'holiest'
/** 畫面品質：手機或掉幀時自動往下調 */
export type Quality = 'high' | 'medium' | 'low'

const qs = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams()
const isTouch = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches
const forcedQ = qs.get('q') as Quality | null
/** 網址加 ?q=high|medium|low 可鎖定品質（不自動調整） */
export const QUALITY_LOCKED = forcedQ === 'high' || forcedQ === 'medium' || forcedQ === 'low'
const savedQ = bootSave.settings.quality
/** 畫質：網址參數 > 存檔的手動設定 > 自動（手機從 medium 開始） */
const initialQ: Quality = QUALITY_LOCKED ? forcedQ! : savedQ !== 'auto' ? savedQ : isTouch ? 'medium' : 'high'

interface State {
  cubit: CubitKey
  cutaway: boolean
  nearId: string | null
  panelOpen: boolean
  indexOpen: boolean
  teleport: { x: number; z: number; n: number } | null
  photo: boolean
  samples: number
  phase: Phase
  zone: Zone
  muted: boolean
  quality: Quality
  /** 導覽模式：目前走到第幾站（-1 = 沒有在導覽） */
  tour: number
  /** 導覽字幕 */
  caption: { text: string; ref?: string; n: number } | null
  setPhoto: (p: boolean) => void
  setSamples: (n: number) => void
  setCubit: (c: CubitKey) => void
  toggleCutaway: () => void
  setNear: (id: string | null) => void
  setPanel: (o: boolean) => void
  setIndex: (o: boolean) => void
  teleportTo: (x: number, z: number) => void
  setPhase: (p: Phase) => void
  setZone: (z: Zone) => void
  setMuted: (m: boolean) => void
  setQuality: (q: Quality) => void
  setTour: (n: number) => void
  setCaption: (text: string | null, ref?: string) => void
}

export const useStore = create<State>((set) => ({
  cubit: bootSave.settings.cubit,
  cutaway: false,
  nearId: null,
  panelOpen: false,
  indexOpen: false,
  teleport: null,
  photo: false,
  samples: 0,
  phase: qs.has('play') ? 'play' : 'intro',
  zone: 'camp',
  muted: false,
  quality: initialQ,
  tour: -1,
  caption: null,
  setPhoto: (photo) => set({ photo, samples: 0, tour: -1, caption: null }),
  setSamples: (samples) => set({ samples }),
  setCubit: (cubit) => set({ cubit, tour: -1, caption: null }),
  toggleCutaway: () => set((s) => ({ cutaway: !s.cutaway })),
  setNear: (nearId) => set((s) => (s.nearId === nearId ? s : { nearId, panelOpen: nearId ? s.panelOpen : false })),
  setPanel: (panelOpen) => set({ panelOpen }),
  setIndex: (indexOpen) => set({ indexOpen }),
  teleportTo: (x, z) => set((s) => ({ teleport: { x, z, n: (s.teleport?.n ?? 0) + 1 }, indexOpen: false, tour: -1, caption: null })),
  setPhase: (phase) => set({ phase }),
  setZone: (zone) => set((s) => (s.zone === zone ? s : { zone })),
  setMuted: (muted) => set({ muted }),
  setQuality: (quality) => set({ quality }),
  setTour: (tour) => set({ tour, ...(tour < 0 ? { caption: null } : {}) }),
  setCaption: (text, ref) => set((s) => ({ caption: text ? { text, ref, n: (s.caption?.n ?? 0) + 1 } : null })),
}))

export const cubitMeters = (k: CubitKey) => CUBITS[k].meters

/** 共用的輸入狀態（鍵盤＋搖桿＋視角拖曳） */
export const input = {
  keys: new Set<string>(),
  joy: { x: 0, y: 0 },
  yaw: Math.PI / 2, // 0 = 看向 -z；π/2 = 看向 -x（西）
  pitch: 0.14,
  player: { x: 0, y: 0, z: 0 },
  /** 玩家目前水平速度（公尺／秒），音效與鏡頭用 */
  speed: 0,
  /** 最近一次使用者拖曳視角的時間（毫秒），導覽時用來暫停自動轉鏡頭 */
  lastLook: 0,
}

/** 電影鏡頭共用狀態（每幀由 Player 寫入，後製與音效讀取） */
export const view = {
  /** 景深對焦點 */
  focus: { x: 0, y: 1.5, z: 0 },
  /** 景深強度 0–1（導覽、開場時打開） */
  dof: 0,
}
