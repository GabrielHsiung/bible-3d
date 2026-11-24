/**
 * E-5 設定：畫質、音樂與音效音量、字幕大小、肘的標準、操作說明。
 * ↑↓ 選列、←→ 調整、Enter 開啟、Esc 返回；觸控直接點左右箭頭。
 */
import { useState } from 'react'
import { CUBITS, type CubitKey } from '../data/tabernacle'
import { useShell } from '../game/shell'
import { storageOk, type CaptionSize, type QualityMode } from '../game/save'
import { useStore } from '../store'
import { ui } from '../audio/ui'
import { KeyHints, PageHead, useMenuKeys } from './menu'

const Q: [QualityMode, string][] = [
  ['auto', '自動'],
  ['high', '高'],
  ['medium', '中'],
  ['low', '低'],
]
const CAPS: [CaptionSize, string][] = [
  ['s', '小'],
  ['m', '中'],
  ['l', '大'],
]
const CUBIT_KEYS = Object.keys(CUBITS) as CubitKey[]

interface Row {
  id: string
  label: string
  value: string
  desc: string
  /** 數值列：0–10 格 */
  level?: number
  step?: (d: number) => void
  enter?: () => void
}

function cycle<T>(list: T[], cur: T, d: number) {
  const i = list.indexOf(cur)
  return list[(i + d + list.length) % list.length]
}

export function SettingsPanel({ onBack, kicker }: { onBack: () => void; kicker?: string }) {
  const s = useShell((st) => st.save.settings)
  const setSetting = useShell((st) => st.setSetting)
  const resetProgress = useShell((st) => st.resetProgress)
  const quality = useStore((st) => st.quality)
  const [i, setI] = useState(0)
  const [view, setView] = useState<'list' | 'controls' | 'reset'>('list')

  const vol = (k: 'music' | 'sfx') => (d: number) => {
    const v = Math.round(Math.min(10, Math.max(0, s[k] * 10 + d))) / 10
    if (v !== s[k]) {
      setSetting(k, v)
      ui.tick()
    }
  }
  const rows: Row[] = [
    {
      id: 'quality',
      label: '畫質',
      value: Q.find((q) => q[0] === s.quality)![1] + (s.quality === 'auto' ? `（目前：${Q.find((q) => q[0] === quality)?.[1]}）` : ''),
      desc: '自動：依裝置與幀率調整，掉幀時降低解析度、陰影與環境光遮蔽。',
      step: (d) => {
        setSetting('quality', cycle(Q.map((q) => q[0]), s.quality, d))
        ui.tick()
      },
    },
    { id: 'music', label: '音樂音量', value: String(Math.round(s.music * 10)), level: s.music * 10, desc: '程序合成的基尼琴、笛與低音持續音。', step: vol('music') },
    { id: 'sfx', label: '音效音量', value: String(Math.round(s.sfx * 10)), level: s.sfx * 10, desc: '風聲、營地、腳步、羊角號與選單音效。', step: vol('sfx') },
    {
      id: 'caption',
      label: '字幕大小',
      value: CAPS.find((c) => c[0] === s.caption)![1],
      desc: '導覽字幕與經文卡片的字級。',
      step: (d) => {
        setSetting('caption', cycle(CAPS.map((c) => c[0]), s.caption, d))
        ui.tick()
      },
    },
    {
      id: 'cubit',
      label: '肘的標準',
      value: `${CUBITS[s.cubit].label} ${(CUBITS[s.cubit].meters * 100).toFixed(1)} 公分`,
      desc: '一般肘約 44.5 公分；長肘多一掌（結 40:5）。切換後場景依新尺寸重建。',
      step: (d) => {
        setSetting('cubit', cycle(CUBIT_KEYS, s.cubit, d))
        ui.tick()
      },
    },
    { id: 'controls', label: '操作說明', value: '', desc: '鍵盤、滑鼠與觸控的操作方式。', enter: () => setView('controls') },
    { id: 'reset', label: '清除進度', value: '', desc: '清除圖鑑、已完成章節與上次的位置（設定會保留）。', enter: () => setView('reset') },
  ]

  useMenuKeys(
    {
      up: () => {
        setI((v) => (v + rows.length - 1) % rows.length)
        ui.move()
      },
      down: () => {
        setI((v) => (v + 1) % rows.length)
        ui.move()
      },
      left: () => rows[i].step?.(-1),
      right: () => rows[i].step?.(1),
      enter: () => {
        const r = rows[i]
        if (r.enter) {
          ui.select()
          r.enter()
        } else r.step?.(1)
      },
      back: () => {
        ui.back()
        onBack()
      },
    },
    view === 'list',
  )

  if (view === 'controls') return <Controls onBack={() => setView('list')} />
  if (view === 'reset')
    return (
      <Confirm
        title="清除進度？"
        body="圖鑑、已完成的章節與「繼續遊戲」的紀錄都會清除，無法復原。"
        yes="清除"
        onYes={() => {
          resetProgress()
          setView('list')
        }}
        onNo={() => setView('list')}
      />
    )

  return (
    <section className="page settings">
      <PageHead kicker={kicker} title="設定" onBack={onBack} />
      <div className="set-rows" role="list">
        {rows.map((r, k) => (
          <div
            key={r.id}
            role="listitem"
            className={`set-row${k === i ? ' focus' : ''}`}
            style={{ animationDelay: `${0.15 + k * 0.05}s` }}
            onPointerEnter={(e) => e.pointerType === 'mouse' && k !== i && (setI(k), ui.move())}
            onClick={() => {
              setI(k)
              if (r.enter) {
                ui.select()
                r.enter()
              }
            }}
          >
            <span className="menu-rule" />
            <span className="set-label">{r.label}</span>
            {r.step ? (
              <span className="set-ctl">
                <button className="arrow" aria-label={`${r.label}：減少`} onClick={(e) => (e.stopPropagation(), setI(k), r.step!(-1))}>
                  ‹
                </button>
                {r.level !== undefined ? (
                  <span className="set-level" aria-label={r.value}>
                    {Array.from({ length: 10 }, (_, n) => (
                      <i key={n} className={n < Math.round(r.level!) ? 'on' : ''} />
                    ))}
                  </span>
                ) : (
                  <span className="set-value">{r.value}</span>
                )}
                <button className="arrow" aria-label={`${r.label}：增加`} onClick={(e) => (e.stopPropagation(), setI(k), r.step!(1))}>
                  ›
                </button>
              </span>
            ) : (
              <span className="set-ctl">
                <span className="set-value dim">›</span>
              </span>
            )}
          </div>
        ))}
      </div>
      <p key={rows[i].id} className="menu-desc">
        {rows[i].desc}
      </p>
      {!storageOk && <p className="menu-desc warn">這個頁面無法使用瀏覽器儲存空間：設定與進度只會保留到關閉頁面為止。</p>}
      <KeyHints>↑↓ 選擇　←→ 調整　Enter 開啟　Esc 返回</KeyHints>
    </section>
  )
}

function Controls({ onBack }: { onBack: () => void }) {
  useMenuKeys({ back: () => (ui.back(), onBack()), enter: () => (ui.back(), onBack()) })
  return (
    <section className="page controls">
      <PageHead kicker="設定" title="操作說明" onBack={onBack} />
      <div className="ctl-grid">
        <div>
          <h3>電腦</h3>
          <dl>
            <dt>W A S D／方向鍵</dt>
            <dd>移動</dd>
            <dt>Shift</dt>
            <dd>奔跑</dd>
            <dt>拖曳畫面</dt>
            <dd>轉動視角</dd>
            <dt>Esc</dt>
            <dd>暫停選單／關閉視窗</dd>
            <dt>M</dt>
            <dd>靜音</dd>
          </dl>
        </div>
        <div>
          <h3>手機與平板</h3>
          <dl>
            <dt>左下搖桿</dt>
            <dd>移動（推到底會跑）</dd>
            <dt>滑動畫面</dt>
            <dd>轉動視角</dd>
            <dt>右上 ❙❙</dt>
            <dd>暫停選單</dd>
          </dl>
        </div>
        <div>
          <h3>右側按鈕</h3>
          <dl>
            <dt>▶ 導覽</dt>
            <dd>跟著祭司的路線自動走</dd>
            <dt>目錄</dt>
            <dd>經文目錄，直接前往器具</dd>
            <dt>剖面</dt>
            <dd>拿掉帳幕外罩，看見內部</dd>
            <dt>肘</dt>
            <dd>切換一般肘／長肘</dd>
            <dt>相機</dt>
            <dd>路徑追蹤拍照</dd>
          </dl>
        </div>
      </div>
      <KeyHints>Esc 返回</KeyHints>
    </section>
  )
}

export function Confirm({ title, body, yes, onYes, onNo }: { title: string; body: string; yes: string; onYes: () => void; onNo: () => void }) {
  const [i, setI] = useState(1)
  const pick = (k: number) => {
    if (k === 0) {
      ui.select()
      onYes()
    } else {
      ui.back()
      onNo()
    }
  }
  useMenuKeys({
    left: () => (setI(0), ui.move()),
    right: () => (setI(1), ui.move()),
    up: () => (setI(0), ui.move()),
    down: () => (setI(1), ui.move()),
    enter: () => pick(i),
    back: () => pick(1),
  })
  return (
    <section className="page confirm">
      <h2 className="page-title">{title}</h2>
      <p className="confirm-body">{body}</p>
      <div className="confirm-btns">
        {[yes, '取消'].map((l, k) => (
          <button key={l} className={`menu-item${k === i ? ' focus' : ''}`} onClick={() => pick(k)} onPointerEnter={(e) => e.pointerType === 'mouse' && setI(k)}>
            <span className="menu-rule" />
            <span className="menu-label">{l}</span>
          </button>
        ))}
      </div>
    </section>
  )
}
