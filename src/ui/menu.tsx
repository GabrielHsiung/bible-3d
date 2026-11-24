/**
 * 選單的共用元件：鍵盤（↑↓／Enter／Esc）、滑鼠與觸控都能操作，選取時有細微音效。
 */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ui } from '../audio/ui'

export interface KeyHandlers {
  up?: () => void
  down?: () => void
  left?: () => void
  right?: () => void
  enter?: () => void
  back?: () => void
}

/** 註冊選單按鍵（同時只應有一個選單在監聽） */
export function useMenuKeys(h: KeyHandlers, active = true) {
  const ref = useRef(h)
  ref.current = h
  useEffect(() => {
    if (!active) return
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat && (e.code === 'Enter' || e.code === 'Escape' || e.code === 'Space')) return
      const r = ref.current
      const map: Record<string, (() => void) | undefined> = {
        ArrowUp: r.up,
        KeyW: r.up,
        ArrowDown: r.down,
        KeyS: r.down,
        ArrowLeft: r.left,
        KeyA: r.left,
        ArrowRight: r.right,
        KeyD: r.right,
        Enter: r.enter,
        NumpadEnter: r.enter,
        Space: r.enter,
        Escape: r.back,
        Backspace: r.back,
      }
      const fn = map[e.code]
      if (fn) {
        e.preventDefault()
        e.stopPropagation()
        fn()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active])
}

/** 記住每個選單上次選到哪一項（返回時游標留在原處） */
const FOCUS: Record<string, number> = {}

export interface MenuItem {
  id: string
  label: string
  /** 選取時顯示的說明 */
  desc?: string
  /** 右側小字（例如「即將推出」） */
  tag?: string
  disabled?: boolean
  onSelect: () => void
}

/** 直式選單：選取中的項目變亮、左側一條細金線 */
export function MenuList({ items, onBack, active = true, initial = 0, className = '', memo }: { items: MenuItem[]; onBack?: () => void; active?: boolean; initial?: number; className?: string; memo?: string }) {
  const [i, setI] = useState(() => Math.min(memo ? (FOCUS[memo] ?? initial) : initial, items.length - 1))
  useEffect(() => {
    if (memo) FOCUS[memo] = i
  }, [memo, i])
  const move = (d: number) => {
    setI((v) => (v + d + items.length) % items.length)
    ui.move()
  }
  const choose = (k: number) => {
    const it = items[k]
    if (!it) return
    if (it.disabled) {
      ui.deny()
      return
    }
    ui.select()
    it.onSelect()
  }
  useMenuKeys(
    {
      up: () => move(-1),
      down: () => move(1),
      enter: () => choose(i),
      back: onBack
        ? () => {
            ui.back()
            onBack()
          }
        : undefined,
    },
    active,
  )
  const cur = items[i]
  return (
    <div className={`menu ${className}`}>
      <ul role="menu">
        {items.map((it, k) => (
          <li key={it.id} role="none" style={{ animationDelay: `${0.25 + k * 0.08}s` }}>
            <button
              role="menuitem"
              className={`menu-item${k === i ? ' focus' : ''}${it.disabled ? ' disabled' : ''}`}
              onPointerEnter={(e) => {
                if (e.pointerType === 'mouse' && k !== i) {
                  setI(k)
                  ui.move()
                }
              }}
              onFocus={() => setI(k)}
              onClick={() => {
                setI(k)
                choose(k)
              }}
            >
              <span className="menu-rule" />
              <span className="menu-label">{it.label}</span>
              {it.tag && <span className="menu-tag">{it.tag}</span>}
            </button>
          </li>
        ))}
      </ul>
      <p key={cur?.id} className="menu-desc">
        {cur?.desc ?? ' '}
      </p>
    </div>
  )
}

/** 頁面標題（細字、上方一條細線） */
export function PageHead({ kicker, title, onBack }: { kicker?: string; title: string; onBack?: () => void }) {
  return (
    <header className="page-head">
      {onBack && (
        <button
          className="back ui"
          onClick={() => {
            ui.back()
            onBack()
          }}
          aria-label="返回"
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden>
            <path d="M15 5l-7 7 7 7" />
          </svg>
          返回
        </button>
      )}
      {kicker && <div className="page-kicker">{kicker}</div>}
      <h2 className="page-title">{title}</h2>
    </header>
  )
}

/** 底部的按鍵提示（觸控裝置不顯示） */
export function KeyHints({ children }: { children: ReactNode }) {
  return <div className="keyhints">{children}</div>
}
