/**
 * 介面音效與音量混音（外框用）。
 *
 * - 選單音效：程序合成的細小撥弦（和配樂同一個 D 弗里吉亞屬調式），不載入音檔。
 * - 音量：音樂與環境音交給 `audio.setMix()`；介面音效有自己的匯流排，也跟著「音效音量」。
 */
import { audio } from '.'
import { midiHz, pluckBuffer } from './dsp'
import { useStore } from '../store'

const mix = { music: 0.8, sfx: 0.8 }
let uiBus: GainNode | null = null
let wiredCtx: AudioContext | null = null
const plucks = new Map<number, AudioBuffer>()

/** 第一次有 AudioContext 時接好介面音效匯流排 */
function wire(): AudioContext | null {
  const ctx = audio.ctx
  if (!ctx) return null
  if (wiredCtx === ctx) return ctx
  wiredCtx = ctx
  uiBus = ctx.createGain()
  uiBus.gain.value = mix.sfx * 0.9
  uiBus.connect(ctx.destination)
  return ctx
}

/** 設定音樂與音效音量（0–1）。在音訊啟動前呼叫也可以，啟動後會套用 */
export function applyMix(music: number, sfx: number) {
  mix.music = music
  mix.sfx = sfx
  audio.setMix(music, sfx)
  const ctx = wire()
  if (ctx && uiBus) uiBus.gain.setTargetAtTime(sfx * 0.9, ctx.currentTime, 0.05)
}

/** 啟動音訊（必須在使用者的點擊／按鍵事件裡呼叫） */
export function startAudio() {
  audio.start()
  audio.setMuted(useStore.getState().muted)
  wire()
}

function pluck(ctx: AudioContext, midi: number) {
  let b = plucks.get(midi)
  if (!b) {
    b = pluckBuffer(ctx, midiHz(midi), { bright: 0.35, t60: 1.6 })
    plucks.set(midi, b)
  }
  return b
}

function play(notes: [midi: number, delay: number, vel: number][]) {
  const ctx = wire()
  if (!ctx || !uiBus || ctx.state !== 'running' || useStore.getState().muted) return
  const t = ctx.currentTime + 0.005
  for (const [m, d, v] of notes) {
    const src = ctx.createBufferSource()
    src.buffer = pluck(ctx, m)
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 2600
    const g = ctx.createGain()
    g.gain.value = v
    src.connect(lp).connect(g).connect(uiBus)
    src.start(t + d)
    src.onended = () => g.disconnect()
  }
}

// D 弗里吉亞屬音階：D E♭ F♯ G A B♭ C
export const ui = {
  /** 游標移動 */
  move: () => play([[74, 0, 0.09]]),
  /** 確認 */
  select: () =>
    play([
      [74, 0, 0.14],
      [81, 0.07, 0.11],
    ]),
  /** 返回 */
  back: () =>
    play([
      [69, 0, 0.12],
      [62, 0.06, 0.1],
    ]),
  /** 調整數值 */
  tick: () => play([[78, 0, 0.07]]),
  /** 無法選取（上鎖） */
  deny: () =>
    play([
      [63, 0, 0.1],
      [62, 0.05, 0.08],
    ]),
  /** 開機確認：低音和弦掃弦 */
  start: () =>
    play([
      [50, 0, 0.18],
      [57, 0.09, 0.15],
      [62, 0.18, 0.14],
      [66, 0.27, 0.12],
      [69, 0.36, 0.12],
    ]),
}
