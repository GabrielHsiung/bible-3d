/**
 * A-7 存檔：設定、圖鑑（看過的器具）、已完成章節、上次的場景。
 *
 * claude.ai 的內嵌頁面（sandbox iframe）可能完全不能用 localStorage，
 * 所以每次讀寫都包在 try/catch 裡；失敗就只存在記憶體中，遊戲照常進行。
 */
import type { CubitKey } from '../data/tabernacle'

export type QualityMode = 'auto' | 'high' | 'medium' | 'low'
export type CaptionSize = 's' | 'm' | 'l'

export interface Settings {
  quality: QualityMode
  /** 音樂音量 0–1 */
  music: number
  /** 音效音量 0–1（環境音、腳步、介面音效） */
  sfx: number
  caption: CaptionSize
  cubit: CubitKey
}

export interface LastPlay {
  scene: string
  mode: string
  chapter?: number
  /** 時間戳（毫秒） */
  at: number
}

export interface SaveData {
  v: 1
  settings: Settings
  /** 看過的器具 id（圖鑑、第 1 章完成度） */
  visited: string[]
  /** 已完成的章節編號 */
  completed: number[]
  last: LastPlay | null
}

const KEY = 'bible3d.save.v1'

export const DEFAULT_SETTINGS: Settings = { quality: 'auto', music: 0.8, sfx: 0.8, caption: 'm', cubit: 'common' }

const fresh = (): SaveData => ({ v: 1, settings: { ...DEFAULT_SETTINGS }, visited: [], completed: [], last: null })

/** localStorage 能不能用（第一次寫入時檢查） */
export let storageOk = true

const clamp01 = (n: unknown, d: number) => (typeof n === 'number' && isFinite(n) ? Math.min(1, Math.max(0, n)) : d)
const oneOf = <T extends string>(v: unknown, list: readonly T[], d: T): T => (list.includes(v as T) ? (v as T) : d)

/** 讀取並驗證存檔；壞掉或不存在就回傳全新的存檔 */
export function loadSave(): SaveData {
  let raw: string | null = null
  try {
    raw = window.localStorage.getItem(KEY)
  } catch {
    storageOk = false
  }
  if (!raw) return fresh()
  try {
    const d = JSON.parse(raw) as Partial<SaveData>
    const s = (d.settings ?? {}) as Partial<Settings>
    return {
      v: 1,
      settings: {
        quality: oneOf(s.quality, ['auto', 'high', 'medium', 'low'] as const, 'auto'),
        music: clamp01(s.music, DEFAULT_SETTINGS.music),
        sfx: clamp01(s.sfx, DEFAULT_SETTINGS.sfx),
        caption: oneOf(s.caption, ['s', 'm', 'l'] as const, 'm'),
        cubit: oneOf(s.cubit, ['common', 'royal'] as const, 'common'),
      },
      visited: Array.isArray(d.visited) ? d.visited.filter((x) => typeof x === 'string') : [],
      completed: Array.isArray(d.completed) ? d.completed.filter((x) => typeof x === 'number') : [],
      last: d.last && typeof d.last.scene === 'string' && typeof d.last.mode === 'string' ? (d.last as LastPlay) : null,
    }
  } catch {
    return fresh()
  }
}

let timer: ReturnType<typeof setTimeout> | null = null
let pending: SaveData | null = null

/** 寫入存檔（合併 300 毫秒內的多次寫入） */
export function writeSave(d: SaveData) {
  pending = d
  if (timer) return
  timer = setTimeout(flushSave, 300)
}

export function flushSave() {
  if (timer) clearTimeout(timer)
  timer = null
  if (!pending) return
  try {
    window.localStorage.setItem(KEY, JSON.stringify(pending))
    storageOk = true
  } catch {
    storageOk = false
  }
  pending = null
}

/** 清除存檔（設定頁的「清除進度」） */
export function clearSave() {
  pending = null
  try {
    window.localStorage.removeItem(KEY)
  } catch {
    storageOk = false
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', flushSave)
}

/** 開機時讀到的存檔（store 與外框共用的初始值） */
export const bootSave: SaveData = typeof window !== 'undefined' ? loadSave() : fresh()
