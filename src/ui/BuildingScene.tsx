/**
 * 場景檔案還不存在（或載入失敗）時的佔位畫面：「建置中」。
 */
import { useEffect } from 'react'
import type { SceneProps } from '../game/scenes'
import { useShell } from '../game/shell'
import { ui } from '../audio/ui'

export default function BuildingScene({ onReady, background, error }: SceneProps & { error?: string }) {
  useEffect(() => {
    onReady?.()
  }, [onReady])
  const scene = useShell((s) => s.loading?.scene ?? s.scene)
  return (
    <div className="building">
      <div className="building-sky" />
      {!background && (
        <div className="building-inner">
          <div className="page-kicker">{scene === 'jerusalem' ? '時空綜觀・耶路撒冷' : '場景'}</div>
          <h2 className="page-title">建置中</h2>
          <p>{error ? `這個場景暫時無法載入（${error}）。` : '從橄欖山俯瞰三千年的耶路撒冷：這個場景正在建造，下一個版本就會開放。'}</p>
          <button
            className="menu-item focus ui"
            onClick={() => {
              ui.back()
              useShell.getState().toMenu()
            }}
          >
            <span className="menu-rule" />
            <span className="menu-label">回主選單</span>
          </button>
        </div>
      )}
    </div>
  )
}
