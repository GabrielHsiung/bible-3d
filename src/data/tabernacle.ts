import exodus from './exodus.json'

/** 可信度三級 */
export type Confidence = 'text' | 'arch' | 'infer'

export const CONFIDENCE_LABEL: Record<Confidence, string> = {
  text: '經文明載',
  arch: '考古／文獻',
  infer: '學者推測',
}

/** 肘的標準（公尺） */
export const CUBITS = {
  common: { label: '一般肘', meters: 0.445 },
  royal: { label: '長肘', meters: 0.525 },
} as const
export type CubitKey = keyof typeof CUBITS

export interface Dim {
  label: string
  cubits: number | null // null = 經文未記載
}

export interface Item {
  id: string
  name: string
  /** 位置（單位：肘）。x 向東、z 向南 */
  pos: [number, number]
  /** 觸發半徑（肘） */
  radius: number
  dims: Dim[]
  /** 經文範圍，例如 ['25:10-22'] */
  refs: string[]
  confidence: Confidence
  note: string
}

export const ITEMS: Item[] = [
  {
    id: 'gate',
    name: '院子的門簾',
    pos: [50, 0],
    radius: 9,
    dims: [
      { label: '寬', cubits: 20 },
      { label: '高', cubits: 5 },
    ],
    refs: ['27:16-17'],
    confidence: 'text',
    note: '整個院子只有這一個入口，朝向東方。門簾用藍色、紫色、朱紅色線和細麻繡成，掛在四根柱子上。',
  },
  {
    id: 'court',
    name: '院子與帷子',
    pos: [36, -22],
    radius: 7,
    dims: [
      { label: '長（東西）', cubits: 100 },
      { label: '寬（南北）', cubits: 50 },
      { label: '帷子高', cubits: 5 },
    ],
    refs: ['27:9-15', '27:18-19'],
    confidence: 'text',
    note: '白色細麻帷子圍出院子，每 5 肘一根柱子，四周共 60 根：銅座、銀鉤、銀杆。',
  },
  {
    id: 'altar',
    name: '燔祭壇（銅壇）',
    pos: [20, 0],
    radius: 7,
    dims: [
      { label: '長', cubits: 5 },
      { label: '寬', cubits: 5 },
      { label: '高', cubits: 3 },
    ],
    refs: ['27:1-8', '40:6', '40:29'],
    confidence: 'text',
    note: '進門後第一件器具，四角有角，用銅包裹，中間有銅網。尺寸是經文明載；壇在院中的確切位置則是推測。',
  },
  {
    id: 'laver',
    name: '洗濯盆',
    pos: [8, 0],
    radius: 5,
    dims: [{ label: '尺寸', cubits: null }],
    refs: ['30:17-21', '38:8', '40:30-32'],
    confidence: 'infer',
    note: '經文說明它放在會幕和壇的中間、用銅做成，但沒有記載尺寸。這裡的大小和造型是推測。',
  },
  {
    id: 'door',
    name: '帳幕的門簾',
    pos: [1, 0],
    radius: 5,
    dims: [
      { label: '寬', cubits: 10 },
      { label: '高', cubits: 10 },
    ],
    refs: ['26:36-37'],
    confidence: 'text',
    note: '五根包金的皂莢木柱子，配銅座。門簾的寬高是依帳幕內部尺寸推算。',
  },
  {
    id: 'tent',
    name: '帳幕（豎板與幕幔）',
    pos: [-15, 8],
    radius: 6,
    dims: [
      { label: '長', cubits: 30 },
      { label: '寬（推算）', cubits: 10 },
      { label: '高', cubits: 10 },
      { label: '每塊板', cubits: 1.5 },
    ],
    refs: ['26:1-14', '26:15-30'],
    confidence: 'infer',
    note: '南北各 20 塊板，每塊寬 1.5 肘，所以長 30 肘；板高 10 肘。內部寬 10 肘是依西面 6 塊板加拐角推算，屬傳統推算。頂上蓋了四層：細麻、山羊毛、染紅的公羊皮、海狗皮。',
  },
  {
    id: 'table',
    name: '陳設餅的桌子',
    pos: [-10, -3],
    radius: 3.5,
    dims: [
      { label: '長', cubits: 2 },
      { label: '寬', cubits: 1 },
      { label: '高', cubits: 1.5 },
    ],
    refs: ['25:23-30', '26:35'],
    confidence: 'text',
    note: '放在聖所北面。陳設餅共 12 個，代表以色列 12 支派（數目見利未記 24 章）。',
  },
  {
    id: 'lampstand',
    name: '金燈臺',
    pos: [-10, 3],
    radius: 3.5,
    dims: [{ label: '尺寸', cubits: null }],
    refs: ['25:31-40', '26:35'],
    confidence: 'infer',
    note: '用一他連得精金錘出來，有七盞燈，放在聖所南面，和桌子相對。經文沒有記載高度，這裡的大小是推測。',
  },
  {
    id: 'incense',
    name: '香壇（金壇）',
    pos: [-18, 0],
    radius: 3,
    dims: [
      { label: '長', cubits: 1 },
      { label: '寬', cubits: 1 },
      { label: '高', cubits: 2 },
    ],
    refs: ['30:1-10'],
    confidence: 'text',
    note: '放在幔子外面，正對法櫃上的施恩座。',
  },
  {
    id: 'veil',
    name: '幔子',
    pos: [-20, 0],
    radius: 3,
    dims: [
      { label: '寬', cubits: 10 },
      { label: '高', cubits: 10 },
    ],
    refs: ['26:31-33'],
    confidence: 'text',
    note: '把聖所和至聖所隔開，上面繡有基路伯。只有大祭司每年一次（贖罪日）能進入幔子內。可按「剖面」看裡面。',
  },
  {
    id: 'ark',
    name: '法櫃與施恩座',
    pos: [-25, 0],
    radius: 4,
    dims: [
      { label: '長', cubits: 2.5 },
      { label: '寬', cubits: 1.5 },
      { label: '高', cubits: 1.5 },
    ],
    refs: ['25:10-22', '26:33-34'],
    confidence: 'text',
    note: '至聖所內唯一的器具。施恩座上有兩個基路伯，翅膀張開、臉對臉。至聖所長寬高各 10 肘是傳統推算。',
  },
]

const ex = exodus as Record<string, string>

/** 展開 '25:10-22' 成經文陣列 */
export function verses(ref: string): { ref: string; text: string }[] {
  const [ch, range] = ref.split(':')
  const [a, b] = range.split('-').map(Number)
  const out: { ref: string; text: string }[] = []
  for (let v = a; v <= (b ?? a); v++) {
    const k = `${ch}:${v}`
    if (ex[k]) out.push({ ref: `出 ${k}`, text: ex[k] })
  }
  return out
}

export function fmtRefs(refs: string[]) {
  return '出埃及記 ' + refs.join('、')
}
