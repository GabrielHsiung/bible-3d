import { useEffect, useRef, useState, type ReactNode } from 'react'
import { CONFIDENCE_LABEL, CUBITS, ITEMS, fmtRefs, verses, type Item } from '../data/tabernacle'
import { input, useStore, type Zone } from '../store'
import { audio } from '../audio'
import { TOUR } from '../experience/tour'

const isTouch = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches

function fmtDim(cubits: number | null, meters: number) {
  if (cubits === null) return '經文未記載'
  const m = cubits * meters
  return `${cubits} 肘（約 ${m < 10 ? m.toFixed(2) : m.toFixed(1)} 公尺）`
}

/* ---------------- 圖示（內嵌 SVG，不載入外部檔案） ---------------- */
const Svg = ({ children }: { children: ReactNode }) => (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    {children}
  </svg>
)
const Icon = {
  sound: (
    <Svg>
      <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" />
      <path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" />
    </Svg>
  ),
  muted: (
    <Svg>
      <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" />
      <path d="M16 9.5l5 5M21 9.5l-5 5" />
    </Svg>
  ),
  list: (
    <Svg>
      <path d="M9 6.5h11M9 12h11M9 17.5h11" />
      <circle cx="4.5" cy="6.5" r="1" />
      <circle cx="4.5" cy="12" r="1" />
      <circle cx="4.5" cy="17.5" r="1" />
    </Svg>
  ),
  cut: (
    <Svg>
      <path d="M3 10l9-6 9 6v10H3z" />
      <path d="M3 10h18" strokeDasharray="2 2" />
      <path d="M9 20v-6h6v6" />
    </Svg>
  ),
  camera: (
    <Svg>
      <path d="M4 8h3l1.6-2.2h6.8L17 8h3v11H4z" />
      <circle cx="12" cy="13.2" r="3.4" />
    </Svg>
  ),
  tour: (
    <Svg>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M10 8.6l5.2 3.4-5.2 3.4z" fill="currentColor" stroke="none" />
    </Svg>
  ),
  stop: (
    <Svg>
      <circle cx="12" cy="12" r="8.5" />
      <rect x="9" y="9" width="6" height="6" fill="currentColor" stroke="none" />
    </Svg>
  ),
}

function IconButton({ label, onClick, on, children }: { label: string; onClick: () => void; on?: boolean; children: ReactNode }) {
  return (
    <button className={`ibtn${on ? ' on' : ''}`} onClick={onClick} aria-label={label} title={label}>
      {children}
      <span className="tip">{label}</span>
    </button>
  )
}

/* ---------------- 開場畫面 ---------------- */
function Intro() {
  const setPhase = useStore((s) => s.setPhase)
  const muted = useStore((s) => s.muted)
  const [leaving, setLeaving] = useState(false)
  const start = () => {
    // 必須在點擊事件裡啟動音訊
    audio.start()
    audio.setMuted(muted)
    setLeaving(true)
    setPhase('flying')
  }
  return (
    <div className={`ui intro${leaving ? ' leaving' : ''}`}>
      <div className="intro-inner">
        <div className="intro-kicker">出埃及記 25–40 章・曠野中的聖所</div>
        <h1 className="intro-title">會幕</h1>
        <p className="intro-line">曠野的清晨，炊煙從營地升起。穿過東方的門，一步一步走近那至聖的所在。</p>
        <button className="intro-start" onClick={start} disabled={leaving}>
          開始體驗
        </button>
        <div className="intro-note">含音樂與環境音・建議戴上耳機</div>
      </div>
    </div>
  )
}

/* ---------------- 電影黑邊 ---------------- */
function Letterbox() {
  const phase = useStore((s) => s.phase)
  const tour = useStore((s) => s.tour)
  const on = phase === 'flying' || tour >= 0
  return (
    <>
      <div className={`lb top${on ? ' on' : ''}`} />
      <div className={`lb bottom${on ? ' on' : ''}`} />
    </>
  )
}

/* ---------------- 區域名稱（進入新區域時浮現） ---------------- */
const ZONES: Record<Zone, [string, string]> = {
  camp: ['以色列的營地', '西乃曠野'],
  court: ['會幕的院子', '長一百肘・寬五十肘'],
  holy: ['聖所', '只有祭司可以進入'],
  holiest: ['至聖所', '大祭司一年一次'],
}
function ZoneBanner() {
  const zone = useStore((s) => s.zone)
  const phase = useStore((s) => s.phase)
  const [show, setShow] = useState<{ z: Zone; n: number } | null>(null)
  useEffect(() => {
    if (phase !== 'play') return
    setShow((s) => ({ z: zone, n: (s?.n ?? 0) + 1 }))
    const t = setTimeout(() => setShow(null), 4200)
    return () => clearTimeout(t)
  }, [zone, phase])
  if (!show) return null
  const [name, sub] = ZONES[show.z]
  return (
    <div key={show.n} className="ui zone">
      <div className="zone-rule" />
      <div className="zone-name">{name}</div>
      <div className="zone-sub">{sub}</div>
    </div>
  )
}

/* ---------------- 器具的經文卡片（淡入淡出） ---------------- */
function ItemCard() {
  const nearId = useStore((s) => s.nearId)
  const open = useStore((s) => s.panelOpen)
  const setPanel = useStore((s) => s.setPanel)
  const cubit = useStore((s) => s.cubit)
  const [shown, setShown] = useState<Item | null>(null)
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const item = ITEMS.find((i) => i.id === nearId) ?? null
    if (item) {
      setShown(item)
      const r = requestAnimationFrame(() => setVisible(true))
      return () => cancelAnimationFrame(r)
    }
    setVisible(false)
    const t = setTimeout(() => setShown(null), 450)
    return () => clearTimeout(t)
  }, [nearId])
  if (!shown) return null
  const item = shown
  const meters = CUBITS[cubit].meters
  return (
    <div className={`ui card${visible ? ' in' : ''}${open ? ' open' : ''}`}>
      <div className="card-head">
        <div>
          <div className="card-title">{item.name}</div>
          <div className="card-ref">{fmtRefs(item.refs)}</div>
        </div>
        <span className={`badge ${item.confidence}`}>{CONFIDENCE_LABEL[item.confidence]}</span>
      </div>
      <div className="dims">
        {item.dims.map((d) => (
          <div key={d.label}>
            <span>{d.label}</span>
            {fmtDim(d.cubits, meters)}
          </div>
        ))}
      </div>
      <p className="note">{item.note}</p>
      <button className="link" onClick={() => setPanel(!open)}>
        {open ? '收起經文 ▴' : '展開經文 ▾'}
      </button>
      {open && (
        <div className="verses">
          {item.refs.flatMap(verses).map((v) => (
            <p key={v.ref}>
              <b>{v.ref}</b> {v.text}
            </p>
          ))}
          <div className="src">經文：和合本</div>
        </div>
      )}
    </div>
  )
}

/* ---------------- 導覽字幕 ---------------- */
function Caption() {
  const caption = useStore((s) => s.caption)
  if (!caption) return null
  return (
    <div key={caption.n} className="ui caption">
      <p>{caption.text}</p>
      {caption.ref && <p className="caption-verse">{caption.ref}</p>}
    </div>
  )
}

function TourChip() {
  const tour = useStore((s) => s.tour)
  const setTour = useStore((s) => s.setTour)
  if (tour < 0) return null
  return (
    <div className="ui tourchip">
      <span>
        導覽 {tour + 1}/{TOUR.length}・{TOUR[tour].title}
      </span>
      <button onClick={() => setTour(-1)}>結束導覽</button>
    </div>
  )
}

/* ---------------- 目錄 ---------------- */
function startTour() {
  const st = useStore.getState()
  st.teleportTo(60, 0)
  st.setTour(0)
}

function IndexPanel() {
  const open = useStore((s) => s.indexOpen)
  const setIndex = useStore((s) => s.setIndex)
  const teleportTo = useStore((s) => s.teleportTo)
  if (!open) return null
  return (
    <div className="ui modal" onClick={() => setIndex(false)}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <b>會幕導覽目錄</b>
          <button onClick={() => setIndex(false)} aria-label="關閉">
            ✕
          </button>
        </div>
        <button className="tour-start" onClick={startTour}>
          ▶ 跟著祭司的路線走（自動導覽）
        </button>
        <p className="hint2">或點「前往」直接走到該處。順序就是祭司從門口走到至聖所的路線。</p>
        {[...ITEMS]
          .sort((a, b) => b.pos[0] - a.pos[0])
          .map((it) => (
            <div key={it.id} className="row">
              <div>
                <div className="row-title">{it.name}</div>
                <div className="card-ref">{fmtRefs(it.refs)}</div>
              </div>
              <button
                onClick={() => {
                  // 站在器具東側（朝西看）；至聖所內的法櫃則站在幔子外
                  const x = it.id === 'ark' || it.id === 'veil' ? -18 : it.id === 'court' ? 40 : it.pos[0] + Math.max(2.2, it.radius * 0.6)
                  const z = it.id === 'court' ? -20 : it.pos[1]
                  teleportTo(x, z)
                }}
              >
                前往
              </button>
            </div>
          ))}
      </div>
    </div>
  )
}

/* ---------------- 手機搖桿 ---------------- */
function Joystick() {
  const base = useRef<HTMLDivElement>(null)
  const [knob, setKnob] = useState({ x: 0, y: 0 })
  const id = useRef<number | null>(null)
  const R = 46
  const move = (cx: number, cy: number) => {
    const r = base.current!.getBoundingClientRect()
    let dx = cx - (r.left + r.width / 2)
    let dy = cy - (r.top + r.height / 2)
    const d = Math.hypot(dx, dy)
    if (d > R) {
      dx = (dx / d) * R
      dy = (dy / d) * R
    }
    setKnob({ x: dx, y: dy })
    input.joy.x = dx / R
    input.joy.y = -dy / R
  }
  const end = () => {
    id.current = null
    setKnob({ x: 0, y: 0 })
    input.joy.x = 0
    input.joy.y = 0
  }
  return (
    <div
      ref={base}
      className="ui joystick"
      onPointerDown={(e) => {
        e.stopPropagation()
        id.current = e.pointerId
        e.currentTarget.setPointerCapture(e.pointerId)
        move(e.clientX, e.clientY)
      }}
      onPointerMove={(e) => id.current === e.pointerId && move(e.clientX, e.clientY)}
      onPointerUp={end}
      onPointerCancel={end}
    >
      <div className="knob" style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }} />
    </div>
  )
}

/* ---------------- 拍照（路徑追蹤） ---------------- */
function PhotoBar() {
  const samples = useStore((s) => s.samples)
  const setPhoto = useStore((s) => s.setPhoto)
  const [img, setImg] = useState<string | null>(null)
  // 內嵌頁面不允許直接下載：改成顯示圖片，讓使用者長按或右鍵另存
  const save = () => {
    const c = document.querySelector('canvas')
    if (c) setImg(c.toDataURL('image/png'))
  }
  return (
    <>
      {img && (
        <div className="ui modal" onClick={() => setImg(null)}>
          <div className="modal-box shot" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <b>照片（{samples} 次取樣）</b>
              <button onClick={() => setImg(null)} aria-label="關閉">
                ✕
              </button>
            </div>
            <img src={img} alt="會幕路徑追蹤照片" />
            <p className="hint2">手機：長按圖片儲存。電腦：在圖片上按右鍵「另存圖片」。</p>
          </div>
        </div>
      )}
      <div className="ui photobar">
        <div>
          <b>路徑追蹤中</b>
          <small>
            已累積 {samples} 次取樣・{samples < 64 ? '畫面會越來越清晰' : '已經很清晰了，可以存檔'}
          </small>
        </div>
        <div className="btns">
          <button onClick={save}>儲存照片</button>
          <button onClick={() => setPhoto(false)}>返回</button>
        </div>
      </div>
    </>
  )
}

/* ---------------- 傳送時的淡入 ---------------- */
function FadeCut() {
  const teleport = useStore((s) => s.teleport)
  if (!teleport) return null
  return <div key={teleport.n} className="fadecut" />
}

/* ---------------- 主 HUD ---------------- */
export function HUD() {
  const cubit = useStore((s) => s.cubit)
  const setCubit = useStore((s) => s.setCubit)
  const cutaway = useStore((s) => s.cutaway)
  const toggleCutaway = useStore((s) => s.toggleCutaway)
  const setIndex = useStore((s) => s.setIndex)
  const photo = useStore((s) => s.photo)
  const setPhoto = useStore((s) => s.setPhoto)
  const phase = useStore((s) => s.phase)
  const muted = useStore((s) => s.muted)
  const setMuted = useStore((s) => s.setMuted)
  const tour = useStore((s) => s.tour)
  const setTour = useStore((s) => s.setTour)
  const [hint, setHint] = useState(false)
  const soundOn = audio.started && !muted

  useEffect(() => {
    if (phase !== 'play') return
    setHint(true)
    const t = setTimeout(() => setHint(false), 9000)
    return () => clearTimeout(t)
  }, [phase])

  const toggleSound = () => {
    if (!audio.started) {
      audio.start()
      audio.setMuted(false)
      setMuted(false)
      return
    }
    audio.setMuted(!muted)
    setMuted(!muted)
  }

  // 鍵盤快捷鍵：M 靜音、Esc 關閉
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'KeyM') toggleSound()
      if (e.code === 'Escape') {
        const st = useStore.getState()
        st.setIndex(false)
        if (st.tour >= 0) st.setTour(-1)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (photo) return <PhotoBar />
  if (phase === 'intro') return <Intro />
  return (
    <>
      <FadeCut />
      <Letterbox />
      {phase === 'play' && (
        <>
          <div className="ui wordmark" style={{ opacity: tour >= 0 ? 0 : 1 }}>
            會幕
            <small>出埃及記 25–40 章</small>
          </div>
          <div className="ui iconbar">
            <IconButton label={tour >= 0 ? '結束導覽' : '自動導覽'} on={tour >= 0} onClick={() => (tour >= 0 ? setTour(-1) : startTour())}>
              {tour >= 0 ? Icon.stop : Icon.tour}
            </IconButton>
            <IconButton label="目錄" onClick={() => setIndex(true)}>
              {Icon.list}
            </IconButton>
            <IconButton label="剖面" on={cutaway} onClick={toggleCutaway}>
              {Icon.cut}
            </IconButton>
            <IconButton label={`肘的標準：${CUBITS[cubit].label} ${(CUBITS[cubit].meters * 100).toFixed(1)} 公分`} onClick={() => setCubit(cubit === 'common' ? 'royal' : 'common')}>
              <span className="cubit">
                肘<small>{(CUBITS[cubit].meters * 100).toFixed(1)}</small>
              </span>
            </IconButton>
            <IconButton label="拍照（路徑追蹤）" onClick={() => setPhoto(true)}>
              {Icon.camera}
            </IconButton>
            <IconButton label={soundOn ? '靜音' : '開啟聲音'} on={!soundOn} onClick={toggleSound}>
              {soundOn ? Icon.sound : Icon.muted}
            </IconButton>
          </div>
          {hint && tour < 0 && (
            <div className="ui hint" onClick={() => setHint(false)}>
              {isTouch ? '左下搖桿移動（推到底會跑）・滑動畫面轉視角' : 'WASD／方向鍵移動・Shift 奔跑・拖曳畫面轉視角・M 靜音'}
              <br />
              你是一位祭司。靠近器具會顯示經文和尺寸；按 ▶ 可以跟著祭司的路線自動導覽。
            </div>
          )}
          <ZoneBanner />
          {tour < 0 && <ItemCard />}
          <TourChip />
          <Caption />
          <IndexPanel />
          {isTouch && <Joystick />}
        </>
      )}
    </>
  )
}
