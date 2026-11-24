/**
 * E-5 暫停選單：繼續、經文目錄、設定、操作說明、回主選單。
 */
import { useState } from 'react'
import { useShell } from '../game/shell'
import { SCENES } from '../game/scenes'
import { MODE_NAME } from '../game/modes'
import { CHAPTERS, chapterNumeral } from '../game/chapters'
import { useStore } from '../store'
import { ui } from '../audio/ui'
import { KeyHints, MenuList, type MenuItem } from './menu'
import { Confirm, SettingsPanel } from './Settings'

export function PauseMenu() {
  const page = useShell((s) => s.pausePage)
  const setPaused = useShell((s) => s.setPaused)
  const setPausePage = useShell((s) => s.setPausePage)
  const toMenu = useShell((s) => s.toMenu)
  const scene = useShell((s) => s.scene)
  const mode = useShell((s) => s.mode)
  const chapter = useShell((s) => s.chapter)
  const [confirm, setConfirm] = useState(false)
  const ch = chapter ? CHAPTERS.find((c) => c.n === chapter) : undefined
  const resume = () => setPaused(false)

  const items: MenuItem[] = [
    { id: 'resume', label: '繼續', desc: '回到遊戲。', onSelect: resume },
    ...(scene === 'tabernacle'
      ? [
          {
            id: 'index',
            label: '經文目錄',
            desc: '依祭司的路線列出每件器具與經文，可以直接前往。',
            onSelect: () => {
              setPaused(false)
              useStore.getState().setIndex(true)
            },
          },
        ]
      : []),
    { id: 'settings', label: '設定', desc: '畫質、音量、字幕、肘的標準、操作說明。', onSelect: () => setPausePage('settings') },
    { id: 'menu', label: '回主選單', desc: '進度會自動保存。', onSelect: () => setConfirm(true) },
  ]

  return (
    <div className="shell-layer pause">
      <div className="pause-veil" onClick={() => page === 'main' && !confirm && (ui.back(), resume())} />
      {page === 'settings' ? (
        <SettingsPanel kicker="暫停" onBack={() => setPausePage('main')} />
      ) : confirm ? (
        <Confirm
          title="回到主選單？"
          body="目前的位置與圖鑑進度都已經保存，之後可以從「繼續遊戲」回來。"
          yes="回主選單"
          onYes={() => {
            setConfirm(false)
            toMenu()
          }}
          onNo={() => setConfirm(false)}
        />
      ) : (
        <section className="page pausemenu">
          <header className="page-head">
            <div className="page-kicker">{ch ? `第${chapterNumeral(ch.n)}章・${ch.title}` : `${MODE_NAME[mode]}・${SCENES[scene].name}`}</div>
            <h2 className="page-title">暫停</h2>
          </header>
          <MenuList items={items} onBack={resume} />
          <KeyHints>↑↓ 選擇　Enter 確認　Esc 繼續</KeyHints>
        </section>
      )}
    </div>
  )
}

/** 右上角的暫停按鈕（所有場景共用） */
export function PauseButton() {
  const setPaused = useShell((s) => s.setPaused)
  const photo = useStore((s) => s.photo)
  if (photo) return null
  return (
    <button
      className="ui pausebtn"
      aria-label="暫停選單"
      title="暫停選單（Esc）"
      onClick={() => {
        ui.select()
        setPaused(true)
      }}
    >
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden>
        <path d="M9 6.5v11M15 6.5v11" />
      </svg>
    </button>
  )
}
