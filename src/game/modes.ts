import type { ModeId, SceneId } from './scenes'

export interface ModeDef {
  id: ModeId
  name: string
  desc: string
  scene?: SceneId
  soon?: boolean
}

/** 模式選單（E-3／工作書「遊戲模式」） */
export const MODES: ModeDef[] = [
  { id: 'explore', name: '自由探索', desc: '在會幕與營地自由走動，靠近器具就看經文與尺寸。', scene: 'tabernacle' },
  { id: 'overview', name: '時空綜觀', desc: '從橄欖山俯瞰耶路撒冷，拖動時間軸看三千年的變化。', scene: 'jerusalem' },
  { id: 'tour', name: '導覽', desc: '跟著祭司的路線慢慢走，字幕逐段講解。', scene: 'tabernacle' },
  { id: 'photo', name: '攝影', desc: '凍結畫面，用路徑追蹤算出寫實照片。', scene: 'tabernacle' },
  { id: 'quiz', name: '測驗', desc: '用經文與器具的問答複習學過的內容。', soon: true },
]

export const MODE_NAME: Record<ModeId, string> = {
  chapter: '故事章節',
  explore: '自由探索',
  overview: '時空綜觀',
  tour: '導覽',
  photo: '攝影',
  quiz: '測驗',
}
