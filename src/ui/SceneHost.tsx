/**
 * A-6 場景管理器：依 useShell().scene 掛上對應的場景元件（lazy import）。
 * 換場景時 key 改變 → 舊場景整個卸載（Canvas、GPU 資源一起釋放）→ 新場景載入。
 */
import { Component, Suspense, useCallback, useEffect, type ReactNode } from 'react'
import { SCENES } from '../game/scenes'
import { useShell } from '../game/shell'
import BuildingScene from './BuildingScene'

class SceneBoundary extends Component<{ children: ReactNode; onReady: () => void }, { error: string | null }> {
  state = { error: null as string | null }
  static getDerivedStateFromError(e: unknown) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
  componentDidCatch(e: unknown) {
    console.error('[scene] 場景發生錯誤', e)
  }
  render() {
    if (this.state.error) return <BuildingScene mode="explore" paused={false} background={false} onReady={this.props.onReady} error={this.state.error} />
    return this.props.children
  }
}

/** 掛上後若場景不會自己回報就緒，2 秒後代為回報 */
function FallbackReady({ need, onReady }: { need: boolean; onReady: () => void }) {
  useEffect(() => {
    if (!need) return
    const t = setTimeout(onReady, 2000)
    return () => clearTimeout(t)
  }, [need, onReady])
  return null
}

export function SceneHost() {
  const scene = useShell((s) => s.scene)
  const inGame = useShell((s) => s.inGame)
  const paused = useShell((s) => s.paused)
  const mode = useShell((s) => s.loading?.mode ?? s.mode)
  const chapter = useShell((s) => s.loading?.chapter ?? s.chapter)
  const markReady = useShell((s) => s.markReady)
  const onReady = useCallback(() => {
    // 只接受目前這個場景的回報
    if (useShell.getState().scene === scene) markReady()
  }, [scene, markReady])
  const def = SCENES[scene]
  const Scene = def.Component
  return (
    <SceneBoundary key={scene} onReady={onReady}>
      <Suspense fallback={null}>
        <FallbackReady need={!def.signalsReady} onReady={onReady} />
        <Scene mode={mode} chapter={chapter} paused={paused} background={!inGame} onReady={onReady} />
      </Suspense>
    </SceneBoundary>
  )
}
