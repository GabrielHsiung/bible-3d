import { useEffect, useRef, useState } from 'react'
import { CONFIDENCE_LABEL, CUBITS, ITEMS, fmtRefs, verses } from '../data/tabernacle'
import { input, useStore } from '../store'

const isTouch = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches

function fmtDim(cubits: number | null, meters: number) {
  if (cubits === null) return '經文未記載'
  const m = cubits * meters
  return `${cubits} 肘（約 ${m < 10 ? m.toFixed(2) : m.toFixed(1)} 公尺）`
}

function ItemCard() {
  const nearId = useStore((s) => s.nearId)
  const open = useStore((s) => s.panelOpen)
  const setPanel = useStore((s) => s.setPanel)
  const cubit = useStore((s) => s.cubit)
  const item = ITEMS.find((i) => i.id === nearId)
  if (!item) return null
  const meters = CUBITS[cubit].meters
  return (
    <div className="ui card">
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
          <button onClick={() => setIndex(false)}>✕</button>
        </div>
        <p className="hint2">點「前往」直接走到該處。順序就是祭司從門口走到至聖所的路線。</p>
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

function Joystick() {
  const base = useRef<HTMLDivElement>(null)
  const [knob, setKnob] = useState({ x: 0, y: 0 })
  const id = useRef<number | null>(null)
  const R = 48
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
            <button onClick={() => setImg(null)}>✕</button>
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

export function HUD() {
  const cubit = useStore((s) => s.cubit)
  const setCubit = useStore((s) => s.setCubit)
  const cutaway = useStore((s) => s.cutaway)
  const toggleCutaway = useStore((s) => s.toggleCutaway)
  const setIndex = useStore((s) => s.setIndex)
  const photo = useStore((s) => s.photo)
  const setPhoto = useStore((s) => s.setPhoto)
  const [hint, setHint] = useState(true)
  useEffect(() => {
    const t = setTimeout(() => setHint(false), 9000)
    return () => clearTimeout(t)
  }, [])

  if (photo) return <PhotoBar />
  return (
    <>
      <div className="ui topbar">
        <div className="title">
          會幕
          <small>出埃及記 25–40 章</small>
        </div>
        <div className="btns">
          <button onClick={() => setCubit(cubit === 'common' ? 'royal' : 'common')} title="切換肘的標準">
            {CUBITS[cubit].label} {CUBITS[cubit].meters * 100} cm
          </button>
          <button className={cutaway ? 'on' : ''} onClick={toggleCutaway}>
            剖面
          </button>
          <button onClick={() => setIndex(true)}>目錄</button>
          <button className="shoot" onClick={() => setPhoto(true)}>
            📷 拍照
          </button>
        </div>
      </div>
      {hint && (
        <div className="ui hint" onClick={() => setHint(false)}>
          {isTouch ? '左下搖桿移動（推到底會跑）・滑動畫面轉視角' : 'WASD／方向鍵移動・Shift 奔跑・拖曳畫面轉視角'}
          <br />
          你是一位祭司，從東邊的院子門口走進會幕。靠近器具會顯示經文和尺寸。
        </div>
      )}
      <ItemCard />
      <IndexPanel />
      {isTouch && <Joystick />}
    </>
  )
}
