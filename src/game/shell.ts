/**
 * 遊戲外框的狀態：畫面流程、場景切換、暫停、設定與存檔。
 *
 * 開機 → 標題 → 主選單 →（章節／模式／圖鑑／設定／製作群）→ 載入 → 遊戲中 ⇄ 暫停 → 回主選單
 */
import { create } from 'zustand'
import { ITEMS } from '../data/tabernacle'
import { useStore, input, type Quality } from '../store'
import { applyMix } from '../audio/ui'
import { bootSave, clearSave, writeSave, type LastPlay, type SaveData, type Settings } from './save'
import { SCENES, type ModeId, type SceneId } from './scenes'
import { loadingContent, type Quote } from './loading'

export type Screen = 'boot' | 'title' | 'menu' | 'chapters' | 'modes' | 'codex' | 'settings' | 'credits' | 'loading' | 'game'
export type PausePage = 'main' | 'settings'

export interface Loading {
  scene: SceneId
  mode: ModeId
  chapter?: number
  quote: Quote
  fact: string
  t0: number
  /** 載入完成後去哪裡：遊戲中或主選單 */
  then: 'game' | 'menu'
  /** in：淡入中；wait：等場景；out：淡出中 */
  stage: 'in' | 'wait' | 'out'
}

interface ShellState {
  screen: Screen
  /** 目前掛上的場景 */
  scene: SceneId
  /** 場景是否已畫出第一個畫面 */
  sceneReady: boolean
  /** 遊戲中（不是背景） */
  inGame: boolean
  mode: ModeId
  chapter?: number
  loading: Loading | null
  paused: boolean
  pausePage: PausePage
  save: SaveData
  toast: { text: string; sub?: string; n: number } | null
  /** 章節開頭的標題卡 */
  chapterCard: { n: number; key: number } | null

  go: (s: Screen) => void
  enter: (scene: SceneId, mode: ModeId, chapter?: number, then?: 'game' | 'menu') => void
  markReady: () => void
  toMenu: () => void
  setPaused: (p: boolean, page?: PausePage) => void
  setPausePage: (p: PausePage) => void
  setSetting: <K extends keyof Settings>(k: K, v: Settings[K]) => void
  showToast: (text: string, sub?: string) => void
  resetProgress: () => void
}

/** 載入畫面最短停留時間（讓玩家讀得完經文） */
export const LOAD_MIN_MS = 3200
const FADE_MS = 700

const qs = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams()
const isTouch = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches
/** ?play：跳過外框直接進遊戲（給其他 agent 截圖用） */
const SKIP = qs.has('play')

export const useShell = create<ShellState>((set, get) => ({
  screen: SKIP ? 'game' : 'boot',
  scene: 'tabernacle',
  sceneReady: false,
  inGame: SKIP,
  mode: 'explore',
  chapter: undefined,
  loading: null,
  paused: false,
  pausePage: 'main',
  save: bootSave,
  toast: null,
  chapterCard: null,

  go: (screen) => set({ screen }),

  enter: (scene, mode, chapter, then = 'game') => {
    const st = get()
    if (st.loading) return
    const { quote, fact } = loadingContent(scene)
    set({ loading: { scene, mode, chapter, quote, fact, t0: performance.now(), then, stage: 'in' }, screen: 'loading', paused: false, pausePage: 'main', chapterCard: null })
    input.keys.clear()
    setTimeout(() => {
      const s = get()
      if (!s.loading) return
      // 先離開遊戲狀態（場景回到背景模式），再換場景
      if (s.scene !== scene) set({ scene, sceneReady: false, inGame: false })
      else set({ inGame: false })
      set({ loading: { ...s.loading, stage: 'wait' } })
    }, FADE_MS)
  },

  markReady: () => {
    if (!get().sceneReady) set({ sceneReady: true })
  },

  toMenu: () => {
    const st = get()
    input.keys.clear()
    set({ paused: false, pausePage: 'main', chapterCard: null })
    if (st.scene !== 'tabernacle') {
      // 主選單的背景是會幕空拍：換回會幕（經過載入畫面）
      get().enter('tabernacle', 'explore', undefined, 'menu')
    } else {
      set({ screen: 'menu', inGame: false })
    }
  },

  setPaused: (paused, page = 'main') => {
    input.keys.clear()
    input.joy.x = 0
    input.joy.y = 0
    set({ paused, pausePage: page })
  },
  setPausePage: (pausePage) => set({ pausePage }),

  setSetting: (k, v) => {
    const save = { ...get().save, settings: { ...get().save.settings, [k]: v } }
    set({ save })
    writeSave(save)
    applySettings(save.settings, k)
  },

  showToast: (text, sub) => set((s) => ({ toast: { text, sub, n: (s.toast?.n ?? 0) + 1 } })),

  resetProgress: () => {
    clearSave()
    const save: SaveData = { ...get().save, visited: [], completed: [], last: null }
    set({ save })
    writeSave(save)
  },
}))

/** 載入畫面：場景準備好、最短時間到了以後，淡出並開始遊戲 */
export function finishLoading() {
  const s = useShell.getState()
  const L = s.loading
  if (!L || L.stage !== 'wait') return
  if (L.then === 'menu') {
    useShell.setState({ loading: { ...L, stage: 'out' }, screen: 'menu', inGame: false })
    setTimeout(() => useShell.setState({ loading: null }), 1100)
    return
  }
  const last: LastPlay = { scene: L.scene, mode: L.mode, chapter: L.chapter, at: Date.now() }
  const save = { ...s.save, last }
  writeSave(save)
  useShell.setState({
    loading: { ...L, stage: 'out' },
    screen: 'game',
    inGame: true,
    mode: L.mode,
    chapter: L.chapter,
    save,
    chapterCard: L.mode === 'chapter' && L.chapter ? { n: L.chapter, key: Date.now() } : null,
  })
  setTimeout(() => useShell.setState({ loading: null }), 1100)
  setTimeout(() => {
    const c = useShell.getState().chapterCard
    if (c && c.key === useShell.getState().chapterCard?.key) useShell.setState({ chapterCard: null })
  }, 9000)
}

/* ---------------- 設定套用 ---------------- */
const CAP = { s: 0.85, m: 1, l: 1.25 }
const AUTO_START: Quality = isTouch ? 'medium' : 'high'

function applySettings(s: Settings, only?: keyof Settings) {
  if (!only || only === 'music' || only === 'sfx') applyMix(s.music, s.sfx)
  if (!only || only === 'caption') document.documentElement.style.setProperty('--cap', String(CAP[s.caption]))
  if (only === 'cubit') useStore.getState().setCubit(s.cubit)
  if (only === 'quality') useStore.getState().setQuality(s.quality === 'auto' ? AUTO_START : s.quality)
}
applySettings(bootSave.settings)

/** 第一章的完成度：看過幾件器具 */
export const CH1_TOTAL = ITEMS.length
export function chapterProgress(n: number, save: SaveData) {
  if (save.completed.includes(n)) return 1
  if (n === 1) return Math.min(1, save.visited.filter((id) => ITEMS.some((i) => i.id === id)).length / CH1_TOTAL)
  return 0
}

/* ---------------- 遊戲中事件 → 存檔 ---------------- */
// 靠近器具 = 在圖鑑中「看過」；第 1 章看完全部器具就算完成
useStore.subscribe((st, prev) => {
  if (st.nearId === prev.nearId || !st.nearId) return
  const sh = useShell.getState()
  if (!sh.inGame || sh.scene !== 'tabernacle') return
  if (sh.save.visited.includes(st.nearId)) return
  const visited = [...sh.save.visited, st.nearId]
  let completed = sh.save.completed
  const save = { ...sh.save, visited }
  if (visited.filter((id) => ITEMS.some((i) => i.id === id)).length >= CH1_TOTAL && !completed.includes(1)) {
    completed = [...completed, 1]
    save.completed = completed
    sh.showToast('第一章　地中央的帳幕　完成', '你走遍了會幕中所有的器具')
  } else {
    const it = ITEMS.find((i) => i.id === st.nearId)
    if (it) sh.showToast(`圖鑑・${it.name}`, `已收錄 ${visited.length}/${CH1_TOTAL}`)
  }
  useShell.setState({ save })
  writeSave(save)
})
// HUD 上切換肘的標準也要記住
useStore.subscribe((st, prev) => {
  if (st.cubit === prev.cubit) return
  const sh = useShell.getState()
  if (sh.save.settings.cubit === st.cubit) return
  const save = { ...sh.save, settings: { ...sh.save.settings, cubit: st.cubit } }
  useShell.setState({ save })
  writeSave(save)
})

export const sceneDef = (id: SceneId) => SCENES[id]
