/**
 * 遊戲外框：蓋在場景上面的所有畫面（開機、標題、選單、載入、暫停、通知）。
 */
import { useEffect } from 'react'
import { useShell } from '../game/shell'
import { CHAPTERS, chapterNumeral } from '../game/chapters'
import { useStore } from '../store'
import { ui } from '../audio/ui'
import { Boot, Chapters, Codex, Credits, MainMenu, Modes, SettingsPage, Title } from './screens'
import { LoadingScreen } from './Loading'
import { PauseButton, PauseMenu } from './Pause'

const MENUS = new Set(['menu', 'chapters', 'modes', 'codex', 'settings', 'credits'])

function Toast() {
  const toast = useShell((s) => s.toast)
  const inGame = useShell((s) => s.inGame)
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => useShell.setState((s) => (s.toast?.n === toast.n ? { toast: null } : s)), 3600)
    return () => clearTimeout(t)
  }, [toast])
  if (!toast || !inGame) return null
  return (
    <div key={toast.n} className="toast" role="status">
      {toast.text}
      {toast.sub && <small>{toast.sub}</small>}
    </div>
  )
}

/** 章節開頭的標題卡（進場運鏡時浮現） */
function ChapterCard() {
  const card = useShell((s) => s.chapterCard)
  if (!card) return null
  const ch = CHAPTERS.find((c) => c.n === card.n)
  if (!ch) return null
  return (
    <div key={card.key} className="chapter-card">
      <div className="cc-k">第{chapterNumeral(ch.n)}章</div>
      <div className="cc-t">{ch.title}</div>
      <div className="cc-rule" />
      <div className="cc-s">
        {ch.place}・{ch.refs}
      </div>
    </div>
  )
}

/** 遊戲中的 Esc／P：關閉視窗 → 離開拍照 → 暫停 */
function useGameKeys(active: boolean) {
  useEffect(() => {
    if (!active) return
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Escape' && e.code !== 'KeyP') return
      const st = useStore.getState()
      const sh = useShell.getState()
      if (sh.paused || !sh.inGame) return
      if (e.code === 'Escape' && st.indexOpen) return st.setIndex(false)
      if (e.code === 'Escape' && st.photo) return st.setPhoto(false)
      ui.select()
      sh.setPaused(true)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active])
}

export function Shell() {
  const screen = useShell((s) => s.screen)
  const paused = useShell((s) => s.paused)
  const inGame = useShell((s) => s.inGame)
  const loading = useShell((s) => s.loading)
  useGameKeys(inGame && !paused)

  // 離開分頁時自動暫停
  useEffect(() => {
    const onVis = () => {
      const sh = useShell.getState()
      if (document.hidden && sh.inGame && !sh.paused && !useStore.getState().photo) sh.setPaused(true)
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [])

  return (
    <>
      {MENUS.has(screen) && (
        <div className={`shell-layer menus scr-${screen}`}>
          <div className="menu-veil" />
          {screen === 'menu' && <MainMenu />}
          {screen === 'chapters' && <Chapters />}
          {screen === 'modes' && <Modes />}
          {screen === 'codex' && <Codex />}
          {screen === 'settings' && <SettingsPage />}
          {screen === 'credits' && <Credits />}
        </div>
      )}
      {screen === 'title' && <Title />}
      {screen === 'game' && inGame && !paused && <PauseButton />}
      {screen === 'game' && paused && <PauseMenu />}
      <ChapterCard />
      <Toast />
      {loading && <LoadingScreen />}
      {screen === 'boot' && <Boot />}
    </>
  )
}
