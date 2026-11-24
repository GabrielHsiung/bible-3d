/**
 * 角色種類與隨機差異（體型、膚色、鬍子、衣服顏色）。
 * 顏色以當時的天然染料為準：未染的亞麻與羊毛、茜草紅、靛藍、赭黃、核桃褐、黑山羊毛。
 */
import { mulberry } from '../../rng'
import type { BodyParams, HeadWear } from './body'
import { mixc, mulc, rgb, type RGB } from './geo'

export type Kind = 'priest' | 'highPriest' | 'levite' | 'man' | 'woman' | 'child' | 'girl' | 'elder'

export interface PersonStyle {
  kind?: Kind
  robe: string // 內袍
  sash: string // 腰帶（祭司：多色繡花）
  head: string // 頭巾
  mantle?: string // 外袍
  stripe?: string // 外袍條紋／頭巾邊
  skin?: string
  turban?: boolean // 祭司的細麻裹頭巾
  beard?: boolean
}

const SKINS = ['#a8714e', '#b47c55', '#9c6644', '#c08a62', '#8e5a3c', '#b98560', '#a26a48']
const HAIR = ['#1b1410', '#241a13', '#2f2219', '#1e1712', '#3a2a1e']
const GRAY = ['#8f8a84', '#a7a29b', '#c9c4bc', '#6f6a64']

/** 衣服顏色的組合（以色列人一般百姓） */
export const PALETTE = {
  tunic: ['#d9ccb0', '#cfc2a4', '#bfae8c', '#e2d8c2', '#a99476', '#c4b08a'],
  mantleMen: ['#6b5540', '#4a3a2c', '#8a6e4c', '#5c564c', '#7a6a52', '#3e3a36', '#9a8058'],
  stripe: ['#2e2620', '#3a4f72', '#8e3a2a', '#d8ccb2', '#5a3a28'],
  women: ['#3a4f72', '#7d3a34', '#6a4a6a', '#9a6a34', '#4e5e6a', '#8a5a3a', '#5a3a4a', '#a8783c'],
  veil: ['#e4d9c2', '#c9b48e', '#3a4f72', '#8a3a2e', '#6e5a7a', '#d8c8a8', '#5a6a5e'],
  sash: ['#7a2b22', '#c49a4a', '#2c4a7a', '#5a3a22', '#8a6a3a', '#3a3028'],
}

export const STYLES = {
  // 祭司：細麻內袍、繡花腰帶、裹頭巾（出 28:39–40）
  priest: { kind: 'priest', robe: '#d9d1bf', sash: '#5a2675', head: '#dcd5c5', turban: true, beard: true },
  highPriest: { kind: 'highPriest', robe: '#d9d1bf', sash: '#5a2675', head: '#dcd5c5', turban: true, beard: true },
  levite: { kind: 'levite', robe: '#d6ccb6', sash: '#5a3a22', head: '#e2d8c2', mantle: '#8a7a62', stripe: '#3a4f72', beard: true },
  israelite1: { kind: 'man', robe: '#cfc2a4', sash: '#7a2b22', head: '#d8cbb0', mantle: '#6b5540', stripe: '#2e2620', beard: true },
  israelite2: { kind: 'man', robe: '#bfae8c', sash: '#c49a4a', head: '#8b6b45', mantle: '#4a3a2c', stripe: '#d8ccb2', beard: true },
  israelite3: { kind: 'man', robe: '#e2d8c2', sash: '#2c4a7a', head: '#a24a33', mantle: '#7a6a52', stripe: '#3a4f72', beard: true },
  woman: { kind: 'woman', robe: '#7d3a34', sash: '#d8c08a', head: '#3a4f72', skin: '#c08a62' },
  woman2: { kind: 'woman', robe: '#3a4f72', sash: '#9a6a34', head: '#e4d9c2' },
  elder: { kind: 'elder', robe: '#d6ccb6', sash: '#4a3a2c', head: '#e9e1cf', mantle: '#4a3a2c', stripe: '#d8ccb2', beard: true },
  child: { kind: 'child', robe: '#d9ccb0', sash: '#8e3a2a', head: '#000000' },
  girl: { kind: 'girl', robe: '#9a6a34', sash: '#3a4f72', head: '#c9b48e' },
} satisfies Record<string, PersonStyle>

function kindOf(s: PersonStyle): Kind {
  if (s.kind) return s.kind
  if (s.turban) return 'priest'
  return s.beard ? 'man' : 'woman'
}

export interface Built {
  params: BodyParams
  height: number
}

/** 依樣式與種子決定一個人的外觀 */
export function makeParams(style: PersonStyle, seed: number): Built {
  const r = mulberry(seed * 7919 + 13)
  const pick = <T,>(a: T[]) => a[Math.floor(r() * a.length) % a.length]
  const jit = (c: RGB, a = 0.08): RGB => mulc(c, 1 - a + r() * a * 2)
  const kind = kindOf(style)
  const female = kind === 'woman' || kind === 'girl'
  const child = kind === 'child' || kind === 'girl'
  const elder = kind === 'elder'
  const priestly = kind === 'priest' || kind === 'highPriest'
  const skin = jit(rgb(style.skin ?? pick(SKINS)), 0.06)
  const hair = rgb(elder ? pick(GRAY) : pick(HAIR))
  let height = female ? 1.56 + r() * 0.1 : 1.64 + r() * 0.13
  if (child) height = 1.05 + r() * 0.25
  if (elder) height -= 0.03
  const beard = !style.beard || child || female ? 0 : elder ? 3 : priestly ? 2 + (r() > 0.6 ? 1 : 0) : r() < 0.2 ? 1 : 2
  const head: HeadWear = kind === 'highPriest' ? 'hpturban' : priestly ? 'turban' : female ? (kind === 'girl' && r() < 0.5 ? 'none' : 'veil') : kind === 'child' ? 'none' : 'cloth'
  const mantleOn = !!style.mantle && !priestly && !child
  const params: BodyParams = {
    seed,
    female,
    child,
    elder,
    girth: child ? 0.9 : 0.9 + r() * (elder ? 0.35 : 0.28),
    shoulder: child ? 0.92 : 0.94 + r() * 0.12,
    headScale: child ? 1.2 + (1.3 - height) * 0.4 : 0.97 + r() * 0.06,
    skin,
    hair,
    beard,
    tunic: jit(rgb(style.robe), priestly ? 0.02 : 0.08),
    tunicPattern: priestly ? 'check' : female ? 'band' : 'plain',
    tunicBand: rgb(pick(['#d8c08a', '#8e3a2a', '#e4d9c2', '#2e2620'])),
    hem: child ? 0.3 : priestly ? 0.1 : female ? 0.09 : 0.12 + r() * 0.06,
    sleeveCuff: priestly ? 0.052 : female ? 0.066 : 0.06,
    mantle: mantleOn
      ? {
          color: jit(rgb(style.mantle!), 0.1),
          stripe: rgb(style.stripe ?? pick(PALETTE.stripe)),
          stripes: elder ? 0 : kind === 'levite' ? 2 : 2 + Math.floor(r() * 3),
          hem: 0.42 + r() * 0.16,
          tassel: rgb('#2a4a8a'),
        }
      : null,
    head,
    headColor: jit(rgb(style.head), 0.05),
    headStripe: head === 'cloth' && r() < 0.5 ? rgb(pick(PALETTE.stripe)) : head === 'veil' && r() < 0.4 ? mixc(rgb(style.head), rgb('#2e2620'), 0.5) : null,
    cord: head === 'cloth' && r() < 0.55 ? rgb(pick(['#2e2620', '#5a3a28', '#3a3028'])) : null,
    // 祭司腰帶：細麻＋藍、紫、朱紅（出 39:29）
    sash: priestly ? [rgb('#efe9dc'), rgb('#2a4a8a'), rgb('#5a2675'), rgb('#a3201c')] : [jit(rgb(style.sash), 0.1)],
    sashEnds: priestly ? 0.45 : female ? 0.75 : r() < 0.5 ? 0.82 : 0.99,
    // 祭司在聖所赤腳供職（傳統推測）
    feet: priestly || (child && r() < 0.5) ? 'bare' : 'sandal',
    highPriest: kind === 'highPriest',
  }
  return { params, height }
}
