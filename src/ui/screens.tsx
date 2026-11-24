/**
 * E-3／E-4：開機、標題、主選單、章節、模式、圖鑑、製作群。
 */
import { useEffect, useState } from 'react'
import { ITEMS } from '../data/tabernacle'
import { useShell, chapterProgress } from '../game/shell'
import { ACTS, CHAPTERS, chapterNumeral } from '../game/chapters'
import { MODES, MODE_NAME } from '../game/modes'
import { SCENES } from '../game/scenes'
import { startAudio, ui } from '../audio/ui'
import { KeyHints, MenuList, PageHead, useMenuKeys, type MenuItem } from './menu'
import { SettingsPanel } from './Settings'

const isTouch = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches

/* ---------------- 標誌 ---------------- */
function Mark({ size = 56 }: { size?: number }) {
  // 一盞七枝燈臺的線條（內嵌 SVG）
  return (
    <svg className="mark" viewBox="0 0 64 64" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" aria-hidden>
      <circle cx="32" cy="32" r="30" strokeOpacity=".35" />
      <path d="M32 14v34M24 52h16M28 48h8" />
      {[6, 11, 16].map((r) => (
        <path key={r} d={`M${32 - r} 18v6a${r} ${r} 0 0 0 ${r * 2} 0v-6`} />
      ))}
      {[-16, -11, -6, 0, 6, 11, 16].map((x) => (
        <path key={x} d={`M${32 + x} 15.5q-1 -2 0 -3.5q1 1.5 0 3.5`} strokeWidth=".9" />
      ))}
    </svg>
  )
}

/* ---------------- 開機 ---------------- */
export function Boot() {
  const go = useShell((s) => s.go)
  const [leaving, setLeaving] = useState(false)
  const start = () => {
    if (leaving) return
    // 必須在使用者的點擊／按鍵事件裡啟動音訊
    startAudio()
    setTimeout(() => ui.start(), 60)
    setLeaving(true)
    setTimeout(() => go('title'), 1200)
  }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return
      start()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })
  return (
    <div className={`boot${leaving ? ' leaving' : ''}`} onClick={start} role="button" aria-label="開始">
      <div className="boot-inner">
        <Mark size={64} />
        <div className="boot-name">聖經 3D 世界</div>
        <div className="boot-sub">BIBLE · 3D · WORLD</div>
        <div className="boot-phones">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden>
            <path d="M4 15v-3a8 8 0 0 1 16 0v3" />
            <rect x="3" y="14" width="4" height="6" rx="1.5" />
            <rect x="17" y="14" width="4" height="6" rx="1.5" />
          </svg>
          建議戴上耳機，以獲得最佳的沉浸體驗
        </div>
        <div className="boot-cta">{isTouch ? '輕觸畫面開始' : '點擊或按任意鍵開始'}</div>
      </div>
    </div>
  )
}

/* ---------------- 標題 ---------------- */
export function Title() {
  const go = useShell((s) => s.go)
  const ready = useShell((s) => s.sceneReady)
  const [leaving, setLeaving] = useState(false)
  const next = () => {
    if (leaving) return
    ui.select()
    setLeaving(true)
    setTimeout(() => go('menu'), 700)
  }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return
      next()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })
  return (
    <div className={`title-screen${leaving ? ' leaving' : ''}${ready ? '' : ' dark'}`} onClick={next}>
      <div className="title-block">
        <div className="title-kicker">走進經文中的聖所與城</div>
        <h1 className="title-main">
          聖經<span>3D</span>世界
        </h1>
        <div className="title-rule" />
        <div className="title-sub">會幕・聖殿・耶路撒冷</div>
      </div>
      <div className="title-press">{ready ? (isTouch ? '輕觸畫面' : '按任意鍵') : '正在搭起帳幕…'}</div>
    </div>
  )
}

/* ---------------- 主選單 ---------------- */
export function MainMenu() {
  const go = useShell((s) => s.go)
  const enter = useShell((s) => s.enter)
  const last = useShell((s) => s.save.last)
  const ch = last?.chapter ? CHAPTERS.find((c) => c.n === last.chapter) : undefined
  const lastScene = last && (SCENES as Record<string, (typeof SCENES)['tabernacle']>)[last.scene]
  const items: MenuItem[] = [
    last && lastScene
      ? {
          id: 'continue',
          label: '繼續遊戲',
          desc: ch ? `第${chapterNumeral(ch.n)}章・${ch.title}` : `${MODE_NAME[last.mode as keyof typeof MODE_NAME] ?? ''}・${lastScene.name}`,
          onSelect: () => enter(lastScene.id, last.mode as never, last.chapter),
        }
      : { id: 'continue', label: '開始旅程', desc: '從第一章開始：西乃山下，地中央的帳幕。', onSelect: () => enter('tabernacle', 'chapter', 1) },
    { id: 'chapters', label: '故事章節', desc: '三幕十二章：從曠野的帳幕到殿中的人子。', onSelect: () => go('chapters') },
    { id: 'modes', label: '遊戲模式', desc: '自由探索、時空綜觀、導覽、攝影、測驗。', onSelect: () => go('modes') },
    { id: 'codex', label: '圖鑑', tag: '即將推出', desc: '收集看過的器具、地點與人物。', onSelect: () => go('codex') },
    { id: 'settings', label: '設定', desc: '畫質、音量、字幕、肘的標準、操作說明。', onSelect: () => go('settings') },
    { id: 'credits', label: '製作群', desc: '這個作品是怎麼做出來的。', onSelect: () => go('credits') },
  ]
  return (
    <section className="page mainmenu">
      <div className="mm-brand">
        <Mark size={30} />
        <span>
          聖經 3D 世界
          <small>會幕・聖殿・耶路撒冷</small>
        </span>
      </div>
      <MenuList items={items} onBack={() => go('title')} />
      <KeyHints>↑↓ 選擇　Enter 確認　Esc 返回</KeyHints>
    </section>
  )
}

/* ---------------- 章節選單 ---------------- */
export function Chapters() {
  const go = useShell((s) => s.go)
  const enter = useShell((s) => s.enter)
  const save = useShell((s) => s.save)
  const [i, setI] = useState(0)
  const [shake, setShake] = useState(-1)
  const cols = typeof window !== 'undefined' && window.innerWidth < 640 ? 1 : 4
  const choose = (k: number) => {
    const c = CHAPTERS[k]
    if (!c.playable || !c.scene) {
      ui.deny()
      setShake(k)
      setTimeout(() => setShake(-1), 400)
      return
    }
    ui.select()
    enter(c.scene, 'chapter', c.n)
  }
  const mv = (d: number) => {
    setI((v) => {
      const n = Math.min(CHAPTERS.length - 1, Math.max(0, v + d))
      if (n !== v) ui.move()
      return n
    })
  }
  useMenuKeys({
    left: () => mv(-1),
    right: () => mv(1),
    up: () => mv(-cols),
    down: () => mv(cols),
    enter: () => choose(i),
    back: () => (ui.back(), go('menu')),
  })
  useEffect(() => {
    document.getElementById(`ch-${i}`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [i])
  const cur = CHAPTERS[i]
  return (
    <section className="page chapters">
      <PageHead kicker="故事" title="章節" onBack={() => go('menu')} />
      <div className="ch-scroll">
        {ACTS.map((a) => (
          <div key={a.n} className="act">
            <div className="act-head">
              <span>{a.roman}</span>
              {a.title}
            </div>
            <div className="ch-grid">
              {CHAPTERS.filter((c) => c.act === a.n).map((c) => {
                const k = CHAPTERS.indexOf(c)
                const p = chapterProgress(c.n, save)
                return (
                  <button
                    key={c.n}
                    id={`ch-${k}`}
                    className={`ch-card${k === i ? ' focus' : ''}${c.playable ? '' : ' locked'}${shake === k ? ' shake' : ''}`}
                    style={{ animationDelay: `${0.1 + k * 0.04}s` }}
                    onPointerEnter={(e) => e.pointerType === 'mouse' && k !== i && (setI(k), ui.move())}
                    onClick={() => {
                      setI(k)
                      choose(k)
                    }}
                  >
                    <span className={`ch-cover act${c.act}`}>
                      <span className="ch-num">{chapterNumeral(c.n)}</span>
                      {!c.playable && (
                        <svg className="lock" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.3" aria-label="未解鎖">
                          <rect x="5" y="11" width="14" height="9" rx="1.5" />
                          <path d="M8 11V8a4 4 0 0 1 8 0v3" />
                        </svg>
                      )}
                    </span>
                    <span className="ch-body">
                      <span className="ch-k">第{chapterNumeral(c.n)}章</span>
                      <span className="ch-title">{c.title}</span>
                      <span className="ch-place">{c.place}</span>
                      <span className="ch-refs">{c.refs}</span>
                      {c.playable ? (
                        <span className="ch-prog">
                          <i style={{ width: `${p * 100}%` }} />
                          <em>{p >= 1 ? '已完成' : `${Math.round(p * 100)}%`}</em>
                        </span>
                      ) : (
                        <span className="ch-soon">建置中</span>
                      )}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>
      <p key={cur.n} className="menu-desc ch-desc">
        <b>
          第{chapterNumeral(cur.n)}章　{cur.title}
        </b>
        {cur.summary}
        {!cur.playable && '（建置中）'}
      </p>
      <KeyHints>←→↑↓ 選擇　Enter 開始　Esc 返回</KeyHints>
    </section>
  )
}

/* ---------------- 模式選單 ---------------- */
export function Modes() {
  const go = useShell((s) => s.go)
  const enter = useShell((s) => s.enter)
  const items: MenuItem[] = MODES.map((m) => ({
    id: m.id,
    label: m.name,
    desc: m.desc + (m.scene && SCENES[m.scene].building ? '（場景建置中）' : ''),
    tag: m.soon ? '即將推出' : m.scene && SCENES[m.scene].building ? '建置中' : undefined,
    disabled: m.soon,
    onSelect: () => m.scene && enter(m.scene, m.id),
  }))
  return (
    <section className="page modes">
      <PageHead kicker="遊戲" title="模式" onBack={() => go('menu')} />
      <MenuList items={items} onBack={() => go('menu')} />
      <KeyHints>↑↓ 選擇　Enter 確認　Esc 返回</KeyHints>
    </section>
  )
}

/* ---------------- 圖鑑（空殼） ---------------- */
export function Codex() {
  const go = useShell((s) => s.go)
  const visited = useShell((s) => s.save.visited)
  useMenuKeys({ back: () => (ui.back(), go('menu')), enter: () => (ui.back(), go('menu')) })
  const n = ITEMS.filter((i) => visited.includes(i.id)).length
  return (
    <section className="page codex">
      <PageHead kicker="收藏" title="圖鑑" onBack={() => go('menu')} />
      <p className="soon-line">
        <span>即將推出</span>器具、地點與人物的完整圖鑑。現在先記錄你在會幕中看過的器具：{n}／{ITEMS.length}
      </p>
      <div className="codex-grid">
        {ITEMS.map((it, k) => {
          const seen = visited.includes(it.id)
          return (
            <div key={it.id} className={`codex-tile${seen ? ' seen' : ''}`} style={{ animationDelay: `${0.1 + k * 0.03}s` }}>
              <span className="codex-n">{String(k + 1).padStart(2, '0')}</span>
              {seen ? it.name : '未發現'}
            </div>
          )
        })}
      </div>
      <KeyHints>Esc 返回</KeyHints>
    </section>
  )
}

/* ---------------- 設定（主選單） ---------------- */
export function SettingsPage() {
  const go = useShell((s) => s.go)
  return <SettingsPanel onBack={() => go('menu')} />
}

/* ---------------- 製作群 ---------------- */
const CREDITS: [string, string[]][] = [
  ['企劃與監製', ['GabrielHsiung']],
  ['開發', ['Claude（Anthropic）多 agent 協作：聖器、建築、人物、體驗、外框、耶路撒冷']],
  ['經文', ['和合本']],
  ['造型參考', ['《3D聖經世界》圖集（只參考造型，不使用圖片）']],
  ['技術', ['three.js・React Three Fiber・drei', 'Rapier 物理引擎', 'postprocessing・N8AO', 'three-gpu-pathtracer']],
  ['聲音', ['全部以 Web Audio 程序合成，沒有使用任何音檔']],
]
export function Credits() {
  const go = useShell((s) => s.go)
  useMenuKeys({ back: () => (ui.back(), go('menu')), enter: () => (ui.back(), go('menu')) })
  return (
    <section className="page credits">
      <PageHead kicker="聖經 3D 世界" title="製作群" onBack={() => go('menu')} />
      <div className="credits-list">
        {CREDITS.map(([h, names], k) => (
          <div key={h} className="credit" style={{ animationDelay: `${0.2 + k * 0.12}s` }}>
            <div className="credit-h">{h}</div>
            {names.map((n) => (
              <div key={n} className="credit-n">
                {n}
              </div>
            ))}
          </div>
        ))}
        <p className="credit-foot">原始碼：GitHub GabrielHsiung/bible-3d</p>
      </div>
      <KeyHints>Esc 返回</KeyHints>
    </section>
  )
}
