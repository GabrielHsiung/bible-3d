import { verses } from '../data/tabernacle'

/**
 * 導覽模式：沿著祭司的路線，從東邊的門慢慢走到幔子前。
 * 座標單位是「肘」（x 向東、z 向南），由 Player 換算成公尺。
 * 每一站的字幕逐段出現；說明文字是本專案自己撰寫，經文引自和合本。
 */
export interface TourLine {
  text: string
  /** 經文出處（例如 '30:19'）；有的話字幕下方顯示和合本原文 */
  ref?: string
}
export interface TourStop {
  id: string
  title: string
  /** 走到這一站之前要經過的點 */
  via: [number, number][]
  /** 站立位置 */
  at: [number, number]
  /** 看向哪裡 */
  look: [number, number]
  lines: TourLine[]
}

export const TOUR: TourStop[] = [
  {
    id: 'gate',
    title: '院子的門',
    via: [],
    at: [58, 0],
    look: [48, 0],
    lines: [
      { text: '清晨，營地的炊煙剛升起。十二支派的帳棚圍繞著中間這一圈白色的細麻帷子。' },
      { text: '院子只有一個入口，朝向東方。藍色、紫色、朱紅色的門簾，迎著剛出來的太陽。', ref: '27:16' },
    ],
  },
  {
    id: 'altar',
    title: '燔祭壇',
    via: [[50, 0]],
    at: [26.5, 0],
    look: [20, 0],
    lines: [
      { text: '一進門，最先遇見的是銅壇。獻祭的人按手在祭牲頭上，祭司把祭物放在壇上焚燒。' },
      { text: '壇上的火從早到晚不熄滅，煙柱在營地的每個角落都看得見。', ref: '27:1' },
    ],
  },
  {
    id: 'laver',
    title: '洗濯盆',
    via: [
      [24, 5.5],
      [15, 5.5],
    ],
    at: [11.5, 3.2],
    look: [8, 0],
    lines: [
      { text: '在壇和帳幕中間，是盛滿水的銅盆。祭司要先在這裡洗手洗腳，才能往前走。', ref: '30:19' },
      { text: '經文記載，這個盆是用會幕門前伺候的婦人所獻的銅鏡做成的。', ref: '38:8' },
    ],
  },
  {
    id: 'holy',
    title: '聖所',
    via: [
      [6.5, 3.6],
      [2.5, 0.6],
      [-3, 0],
    ],
    at: [-6.5, 0],
    look: [-12, 0],
    lines: [
      { text: '掀開門簾，外面的風聲安靜下來。只有祭司可以進入聖所。' },
      { text: '北邊是擺著十二個陳設餅的金桌子，南邊是七盞燈的金燈臺，燈光映在包金的豎板上。', ref: '26:35' },
      { text: '祭司從晚上到早晨照管這燈，使燈常常點著。', ref: '27:20' },
    ],
  },
  {
    id: 'veil',
    title: '幔子前',
    via: [[-11, 0]],
    at: [-15.6, 0],
    look: [-21, 0],
    lines: [
      { text: '金香壇立在幔子前面。祭司每天早晚在這裡燒香，香煙升到幔子上。', ref: '30:7' },
      { text: '幔子後面是至聖所，安放著法櫃。只有大祭司一年一次能進去。' },
      { text: '整座會幕的意義，濃縮在一句話裡：', ref: '25:8' },
    ],
  },
]

/** 取得字幕下方要顯示的經文 */
export function tourVerse(ref?: string) {
  if (!ref) return undefined
  const v = verses(ref)[0]
  return v ? `${v.text}（${v.ref}）` : undefined
}

/** 每段字幕停留的秒數（依字數） */
export function lineSeconds(l: TourLine) {
  const extra = l.ref ? (tourVerse(l.ref)?.length ?? 0) * 0.08 : 0
  return Math.max(5, l.text.length * 0.16 + extra + 1.5)
}
