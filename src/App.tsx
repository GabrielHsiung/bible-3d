import { SceneHost } from './ui/SceneHost'
import { Shell } from './ui/Shell'

/**
 * 最上層：場景（由場景管理器依狀態掛上）＋遊戲外框（選單、載入、暫停）。
 * 會幕場景的內容在 src/scenes/Tabernacle；場景註冊表在 src/game/scenes.ts。
 */
export default function App() {
  return (
    <>
      <SceneHost />
      <Shell />
    </>
  )
}
