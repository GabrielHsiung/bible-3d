/**
 * E-4 故事章節：三幕十二章（內容照 docs/WORKBOOK.md「故事章節」表）。
 * `scene` 指向 src/game/scenes.ts 的場景 id；`playable` 為 false 的章節在選單中上鎖、顯示「建置中」。
 */
import type { SceneId } from './scenes'

export interface Chapter {
  n: number
  act: number
  title: string
  /** 場景說明（顯示在卡片上） */
  place: string
  /** 經文出處 */
  refs: string
  /** 可玩內容 */
  summary: string
  playable: boolean
  /** 可玩章節進入的場景 */
  scene?: SceneId
}

export const ACTS = [
  { n: 1, title: '曠野的帳幕', roman: '第一幕' },
  { n: 2, title: '王的城', roman: '第二幕' },
  { n: 3, title: '殿中的人子', roman: '第三幕' },
] as const

export const CHAPTERS: Chapter[] = [
  { n: 1, act: 1, title: '地中央的帳幕', place: '西乃山下的會幕', refs: '出 25–40', summary: '以祭司身分完成一日的早晨獻祭：洗濯、獻祭、點燈、燒香', playable: true, scene: 'tabernacle' },
  { n: 2, act: 1, title: '榮光充滿', place: '會幕立起之日', refs: '出 40:34–38', summary: '雲彩降下的過場，營地依民 2 列隊', playable: false },
  { n: 3, act: 1, title: '贖罪日', place: '至聖所', refs: '利 16', summary: '大祭司年度唯一一次進入幔子內', playable: false },
  { n: 4, act: 2, title: '大衛的城', place: '俄斐勒山丘', refs: '撒下 5、6', summary: '運約櫃上耶路撒冷的遊行', playable: false },
  { n: 5, act: 2, title: '所羅門建殿', place: '第一聖殿', refs: '王上 6–8', summary: '工地、銅海、雅斤與波阿斯，獻殿禮', playable: false },
  { n: 6, act: 2, title: '希西家的水道', place: '城牆與地下水道', refs: '王下 20:20', summary: '走過真實尺寸的岩石水道', playable: false },
  { n: 7, act: 2, title: '城破之日', place: '耶路撒冷與聖殿被焚', refs: '王下 25', summary: '滅亡的耶路撒冷，進入被擄', playable: false },
  { n: 8, act: 3, title: '歸回與重建', place: '所羅巴伯聖殿、尼希米的城牆', refs: '拉 3–6；尼 2–6', summary: '修城牆，老人為舊殿哭泣', playable: false },
  { n: 9, act: 3, title: '十二歲的孩子', place: '希律聖殿與朝聖人潮', refs: '路 2:41–52', summary: '跟著朝聖隊伍上城，在殿裡找到耶穌', playable: false },
  { n: 10, act: 3, title: '加利利的春天', place: '拿撒勒、迦百農、加利利海', refs: '路 4；可 1–4', summary: '會堂、漁船、彼得的家，生活場景', playable: false },
  { n: 11, act: 3, title: '最後的一週', place: '耶路撒冷城內', refs: '太 21–27；約 13–19', summary: '潔淨聖殿、上房、客西馬尼、各各他', playable: false },
  { n: 12, act: 3, title: '沒有一塊石頭', place: '主後 70 年', refs: '太 24:1–2', summary: '聖殿被毀，結尾接到時空綜觀的今日', playable: false },
]

export const chapterNumeral = (n: number) => ['〇', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二'][n] ?? String(n)
