import { useEffect, useRef } from 'react'
import { useJ } from './state'
import { CONFIDENCE_LABEL, ERAS, EVENTS, fmtYear, posOfYear, yearAt } from './timeline'
import './jerusalem.css'

const N = EVENTS.length
const PLAY_STEP_MS = 7500

const Svg = ({ d, fill }: { d: string; fill?: boolean }) => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill={fill ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d={d} />
  </svg>
)

export function JerusalemHUD({ onExit, paused }: { onExit?: () => void; paused: boolean }) {
  const pos = useJ((s) => s.pos)
  const sel = useJ((s) => s.sel)
  const playing = useJ((s) => s.playing)
  const labels = useJ((s) => s.labels)
  const track = useRef<HTMLDivElement>(null)
  const year = yearAt(pos)
  const near = Math.round(pos)

  // 播放：從古到今每一站停一下
  useEffect(() => {
    if (!playing || paused) return
    const id = setInterval(() => {
      const st = useJ.getState()
      const next = Math.round(st.pos) + 1
      if (next >= N) st.setPlaying(false)
      else st.select(next)
    }, PLAY_STEP_MS)
    return () => clearInterval(id)
  }, [playing, paused])

  // 鍵盤：← → 上一個／下一個事件，空白鍵播放
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (paused) return
      const st = useJ.getState()
      if (e.code === 'ArrowRight') st.select(Math.min(N - 1, Math.round(st.pos) + 1))
      else if (e.code === 'ArrowLeft') st.select(Math.max(0, Math.round(st.pos) - 1))
      else if (e.code === 'Space') togglePlay()
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [paused])

  const posFromX = (clientX: number) => {
    const r = track.current!.getBoundingClientRect()
    return ((clientX - r.left) / r.width) * (N - 1)
  }

  const ev = sel !== null ? EVENTS[sel] : null
  const eraNow = ERAS.find((e) => year >= e.from && year < e.to) ?? ERAS[ERAS.length - 1]

  return (
    <div className="jer-ui" onPointerDown={(e) => e.stopPropagation()}>
      <div className="jer-top">
        {onExit && (
          <button className="jer-ibtn" onClick={onExit} aria-label="回主選單" title="回主選單">
            <Svg d="M15 5l-7 7 7 7" />
          </button>
        )}
        <div className="jer-brand">
          耶路撒冷<small>時空綜觀・拖曳時間軸看三千年的城</small>
        </div>
        <button className={`jer-ibtn${labels ? ' on' : ''}`} onClick={() => useJ.getState().toggleLabels()} aria-label="地名" title="地名">
          <Svg d="M12 21s-6-5.3-6-10a6 6 0 0 1 12 0c0 4.7-6 10-6 10zM12 13a2 2 0 1 0 0-4 2 2 0 0 0 0 4z" />
        </button>
      </div>

      {ev && (
        <div className="jer-card" key={ev.id}>
          <div className="jer-card-head">
            <div>
              <div className="jer-card-date">{ev.date}・{ev.era}</div>
              <div className="jer-card-title">{ev.title}</div>
            </div>
            <button className="jer-x" onClick={() => useJ.getState().closeCard()} aria-label="關閉">
              ×
            </button>
          </div>
          <div className="jer-badges">
            <span className={`jer-badge ${ev.confidence}`}>{CONFIDENCE_LABEL[ev.confidence]}</span>
            <span className="jer-badge infer">建築外觀：重建推測</span>
          </div>
          <p className="jer-text">{ev.text}</p>
          {ev.quote && (
            <blockquote className="jer-quote">
              {ev.quote.text}
              <cite>{ev.quote.ref}（和合本）</cite>
            </blockquote>
          )}
          <div className="jer-refs">經文：{ev.refs}</div>
          <div className="jer-model">{ev.model}</div>
        </div>
      )}

      <div className="jer-bar">
        <div className="jer-row">
          <div className="jer-year">
            <span className="jer-year-big">{fmtYear(year)}</span>
            <span className="jer-era" style={{ color: eraNow.color }}>
              {eraNow.name}
            </span>
            <span className="jer-now">{EVENTS[near].title}</span>
          </div>
          <div className="jer-ctrls">
            <button className="jer-ibtn" onClick={() => useJ.getState().select(Math.max(0, near - 1))} aria-label="上一個事件">
              <Svg d="M15 5l-7 7 7 7" />
            </button>
            <button className={`jer-ibtn play${playing ? ' on' : ''}`} onClick={togglePlay} aria-label={playing ? '暫停播放' : '播放'}>
              {playing ? <Svg d="M8 5v14M16 5v14" /> : <Svg d="M8 5l11 7-11 7z" fill />}
            </button>
            <button className="jer-ibtn" onClick={() => useJ.getState().select(Math.min(N - 1, near + 1))} aria-label="下一個事件">
              <Svg d="M9 5l7 7-7 7" />
            </button>
          </div>
        </div>
        <div
          className="jer-track"
          ref={track}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId)
            const st = useJ.getState()
            st.setPlaying(false)
            st.setDragging(true)
            st.setPos(posFromX(e.clientX))
          }}
          onPointerMove={(e) => {
            if (!useJ.getState().dragging) return
            useJ.getState().setPos(posFromX(e.clientX))
          }}
          onPointerUp={() => {
            const st = useJ.getState()
            st.setDragging(false)
            st.select(Math.round(st.pos))
          }}
          onPointerCancel={() => useJ.getState().setDragging(false)}
        >
          <div className="jer-eras">
            {ERAS.map((e) => {
              const a = (posOfYear(e.from) / (N - 1)) * 100
              const b = (posOfYear(e.to) / (N - 1)) * 100
              return (
                <div key={e.name} className="jer-era-band" style={{ left: `${a}%`, width: `${b - a}%`, background: e.color }} title={e.name}>
                  {b - a > 5 && <span>{e.name}</span>}
                </div>
              )
            })}
          </div>
          <div className="jer-line" />
          {EVENTS.map((e, i) => (
            <div key={e.id} className={`jer-tick${i === near ? ' on' : ''}`} style={{ left: `${(i / (N - 1)) * 100}%` }} title={`${e.date} ${e.title}`}>
              <i />
              <span>{e.year >= 2026 ? '今' : e.year < 0 ? -e.year : e.year}</span>
            </div>
          ))}
          <div className="jer-thumb" style={{ left: `${(pos / (N - 1)) * 100}%` }} />
        </div>
      </div>
    </div>
  )
}

function togglePlay() {
  const st = useJ.getState()
  if (st.playing) return st.setPlaying(false)
  if (Math.round(st.pos) >= N - 1) st.select(0)
  st.setPlaying(true)
}
