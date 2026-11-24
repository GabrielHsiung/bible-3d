/**
 * E-6 載入畫面：一句經文引言＋一則背景小知識＋進度條。
 * 場景就緒（onReady）且最短停留時間到了，進度條補滿後淡出。
 */
import { useEffect, useState } from 'react'
import { LOAD_MIN_MS, finishLoading, useShell } from '../game/shell'
import { SCENES } from '../game/scenes'
import { chapterNumeral, CHAPTERS } from '../game/chapters'

export function LoadingScreen() {
  const L = useShell((s) => s.loading)
  const ready = useShell((s) => s.sceneReady)
  const [p, setP] = useState(0)

  useEffect(() => {
    if (!L || L.stage === 'out') return
    let raf = 0
    let doneAt = 0
    const tick = () => {
      const s = useShell.getState()
      const el = performance.now() - L.t0
      const isReady = s.sceneReady && s.loading?.stage === 'wait'
      // 沒就緒前慢慢逼近 90%；就緒後在最短時間內補滿
      const soft = 0.9 * (1 - Math.exp(-el / 2600))
      const timeP = Math.min(1, el / LOAD_MIN_MS)
      const target = isReady ? Math.max(soft, timeP) : Math.min(soft, 0.9)
      setP((v) => v + (target - v) * 0.12)
      if (isReady && timeP >= 1) {
        if (!doneAt) doneAt = performance.now()
        setP(1)
        if (performance.now() - doneAt > 450) {
          finishLoading()
          return
        }
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [L])

  if (!L) return null
  const def = SCENES[L.scene]
  const ch = L.chapter ? CHAPTERS.find((c) => c.n === L.chapter) : undefined
  return (
    <div className={`loading ${L.stage}`} role="status" aria-live="polite">
      <div className="ld-quote">
        <p>{L.quote.text}</p>
        <cite>{L.quote.ref}・和合本</cite>
      </div>
      <div className="ld-foot">
        <div className="ld-where">
          {ch ? (
            <>
              <span>第{chapterNumeral(ch.n)}章</span>
              {ch.title}
            </>
          ) : L.then === 'menu' ? (
            <>
              <span>返回</span>主選單
            </>
          ) : (
            <>
              <span>{def.sub}</span>
              {def.name}
            </>
          )}
        </div>
        <div className="ld-fact">
          <b>你知道嗎</b>
          {L.fact}
        </div>
        <div className="ld-bar" aria-label={`載入 ${Math.round(p * 100)}%`}>
          <i style={{ transform: `scaleX(${p})` }} />
        </div>
        <div className="ld-state">{p >= 1 ? '準備好了' : ready && L.stage === 'wait' ? '正在進入…' : '正在建造場景…'}</div>
      </div>
    </div>
  )
}
