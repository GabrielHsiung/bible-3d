/**
 * E-6 載入畫面的內容：一句經文引言＋一則背景小知識。
 * 會幕的經文直接從 src/data/exodus.json（和合本）取，不手打。
 * 小知識是本專案自己撰寫的說明文字。
 */
import exodus from '../data/exodus.json'
import type { SceneId } from './scenes'

const ex = exodus as Record<string, string>

export interface Quote {
  text: string
  ref: string
}

const exo = (k: string): Quote | null => (ex[k] ? { text: ex[k], ref: `出埃及記 ${k}` } : null)

const VERSES: Record<SceneId, Quote[]> = {
  tabernacle: ['25:8', '25:9', '25:40', '40:34', '40:38', '26:30', '27:20', '40:17', '25:22', '39:43']
    .map(exo)
    .filter((q): q is Quote => !!q),
  // 非出埃及記的經文：A-5 全本和合本資料進來之後，改成從資料層取
  jerusalem: [
    { text: '你們要為耶路撒冷求平安；耶路撒冷啊，愛你的人必亨通。', ref: '詩篇 122:6' },
    { text: '在北面的錫安山，大君王的城，居高華美，為全地所喜悅。', ref: '詩篇 48:2' },
  ],
}

const TRIVIA: Record<SceneId, string[]> = {
  tabernacle: [
    '院子長一百肘、寬五十肘（出 27:18）。用一般肘換算，大約是 44 公尺乘 22 公尺。',
    '洗濯盆是用會幕門前伺候的婦人所獻的銅鏡做成的（出 38:8）。',
    '金燈臺連同所有的器具，是用一他連得的精金打成的（出 25:39），大約三十多公斤。',
    '百姓獻上的材料多到用不完，摩西只好傳令營中，叫大家不要再拿來（出 36:5–7）。',
    '帳幕的南北兩面各有二十塊豎板，西面六塊，再加兩個拐角，一共四十八塊（出 26:15–25）。',
    '「肘」是從手肘到中指尖的長度。以西結書提到的長肘，是「一肘零一掌」（結 40:5）。設定裡可以切換。',
    '帳幕在出埃及第二年的正月初一立起來（出 40:17），離開埃及還不滿一年。',
    '會幕所有的器具都有環子和槓，可以拆開、扛著走。以色列人在曠野遷移時，整座會幕跟著他們走。',
    '至聖所裡只有一件器具：法櫃。大祭司一年只能進去一次（利 16）。',
  ],
  jerusalem: [
    '大衛從耶布斯人手中奪取了錫安的保障，就是後來所稱的「大衛的城」（撒下 5:7）。',
    '所羅門建殿共用了七年（王上 6:38）。',
    '希西家的水道在岩石中鑿穿，長約 530 公尺，把基訓泉的水引進城內（王下 20:20）。',
    '猶太人對耶穌說：「這殿是四十六年才造成的。」希律從主前約 20 年開始重修聖殿（約 2:20）。',
    '今天的西牆是希律聖殿山的擋土牆，有些石塊長達十多公尺。',
    '橄欖山在聖殿山的東邊，中間隔著汲淪谷；從山上可以俯瞰整座城。',
  ],
}

const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)]

export function loadingContent(scene: SceneId) {
  return { quote: pick(VERSES[scene]), fact: pick(TRIVIA[scene]) }
}
