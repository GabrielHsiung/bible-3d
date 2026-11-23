/**
 * A-6 場景管理器：場景註冊表。
 *
 * ## 場景模組的介面約定（給各場景 agent）
 * 每個場景是 `src/scenes/<名稱>/index.tsx`，**default export** 一個 React 元件，收 `SceneProps`：
 * - 元件自己渲染全螢幕的 `<Canvas>` 與自己的遊戲中 HUD（DOM）。外框（主選單、暫停、載入畫面）蓋在上面。
 * - 切換場景時外框會**卸載**整個元件（Canvas 與 GPU 資源一起釋放），所以不要把狀態放在模組層級的全域變數裡期待保留。
 * - `onReady()`：第一個畫面畫好時呼叫一次，載入畫面才會淡出。沒有呼叫的話，元件掛上後（Suspense 結束）2 秒自動淡出。
 * - `paused`：暫停選單打開時為 true。請停止動畫與輸入（建議 `<Canvas frameloop={paused ? 'never' : 'always'}>`）。
 * - `background`：作為主選單背景時為 true（只播空拍、不顯示 HUD、不接受輸入）。目前只有會幕當背景。
 * - `mode`：玩家從哪個模式進來（見 `ModeId`）。
 * - 右上角 64×64 的區域保留給外框的「暫停」按鈕；需要畫質時讀 `useStore((s) => s.quality)`。
 * - 字幕大小：CSS 變數 `--cap`（0.85／1／1.25），字幕字級乘上它即可。
 * - 需要回主選單：`useShell.getState().toMenu()`（src/game/shell.ts）。
 */
import { lazy, type ComponentType, type LazyExoticComponent } from 'react'
import type { Zone } from '../store'
import BuildingScene from '../ui/BuildingScene'

export type ModeId = 'chapter' | 'explore' | 'overview' | 'tour' | 'photo' | 'quiz'

export interface SceneProps {
  mode: ModeId
  chapter?: number
  paused: boolean
  background: boolean
  onReady?: () => void
}

export type SceneId = 'tabernacle' | 'jerusalem'

export interface SceneDef {
  id: SceneId
  name: string
  /** 副標（載入畫面、繼續遊戲的說明） */
  sub: string
  Component: LazyExoticComponent<ComponentType<SceneProps>>
  /** 出生點（肘；x 向東、z 向南） */
  spawn: [number, number]
  /** 配樂區：進場時的音樂區域 */
  music: Zone
  /** 檔案還不存在（顯示「建置中」） */
  building: boolean
  /** 場景會自己呼叫 onReady；false 的話外框在元件掛上後 2 秒自動視為就緒 */
  signalsReady: boolean
}

// 用 glob 找場景檔：檔案不存在時回傳空物件，建置不會失敗
const jerusalemMod = import.meta.glob<{ default: ComponentType<SceneProps> }>('../scenes/Jerusalem/index.tsx')
const jerusalemLoader = Object.values(jerusalemMod)[0]

export const SCENES: Record<SceneId, SceneDef> = {
  tabernacle: {
    id: 'tabernacle',
    name: '會幕',
    sub: '西乃曠野・出埃及記 25–40 章',
    Component: lazy(() => import('../scenes/Tabernacle')),
    spawn: [62, 0],
    music: 'camp',
    building: false,
    signalsReady: true,
  },
  jerusalem: {
    id: 'jerusalem',
    name: '耶路撒冷・時空綜觀',
    sub: '從橄欖山俯瞰三千年的城',
    Component: lazy(jerusalemLoader ?? (() => Promise.resolve({ default: BuildingScene }))),
    spawn: [0, 0],
    music: 'camp',
    building: !jerusalemLoader,
    signalsReady: false,
  },
}
