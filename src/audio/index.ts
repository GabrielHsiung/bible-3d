import { Ambience } from './ambience'
import { impulseResponse } from './dsp'
import { Music } from './music'
import type { Zone } from '../store'

type V3 = { x: number; y: number; z: number }

export interface AudioFrame {
  /** 聽者（相機）位置與朝向 */
  listener: V3
  forward: V3
  /** 玩家位置、速度（公尺／秒）、區域 */
  player: V3
  speed: number
  zone: Zone
  /** 一肘幾公尺（祭壇、院子的位置要換算） */
  C: number
  dt: number
}

/** 把整個聲音圖建在任何 BaseAudioContext 上（即時或離線都可以） */
function build(ctx: BaseAudioContext) {
  const master = ctx.createGain()
  master.gain.value = 0
  const comp = ctx.createDynamicsCompressor()
  comp.threshold.value = -16
  comp.knee.value = 12
  comp.ratio.value = 3
  comp.attack.value = 0.02
  comp.release.value = 0.4
  master.connect(comp)
  comp.connect(ctx.destination)
  const analyser = ctx.createAnalyser()
  analyser.fftSize = 2048
  comp.connect(analyser)

  // 程序產生的殘響（曠野山谷般的長尾音）
  const reverb = ctx.createConvolver()
  reverb.buffer = impulseResponse(ctx, 4.8, 2.4, { predelay: 0.03, damp: 0.7 })
  const revIn = ctx.createGain()
  revIn.gain.value = 1
  const revOut = ctx.createGain()
  revOut.gain.value = 0.85
  revIn.connect(reverb).connect(revOut).connect(master)

  const music = new Music(ctx, master, revIn)
  // 環境音（風、營地、腳步、羊角號）走自己的匯流排，乾聲與殘響一起調整音量
  const ambBus = ctx.createGain()
  ambBus.connect(master)
  const ambRev = ctx.createGain()
  ambRev.connect(revIn)
  const amb = new Ambience(ctx, ambBus, ambRev)
  return { master, analyser, music, amb, ambBus, ambRev }
}

class AudioEngine {
  ctx: AudioContext | null = null
  private g: ReturnType<typeof build> | null = null
  private muted = false
  private listenerPos: V3 = { x: 0, y: 2, z: 0 }
  private zone: Zone = 'camp'
  private C = 0.445
  private volume = 0.85
  private mix = { music: 0.8, sfx: 0.8 }

  get started() {
    return !!this.ctx
  }

  /** 必須在使用者點擊的事件處理函式裡呼叫（瀏覽器的自動播放限制） */
  start() {
    if (this.ctx) {
      void this.ctx.resume()
      return
    }
    const AC: typeof AudioContext | undefined = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AC) return
    const ctx = new AC({ latencyHint: 'playback' })
    this.ctx = ctx
    void ctx.resume()
    try {
      this.g = build(ctx)
    } catch (e) {
      console.warn('[audio] 無法建立聲音', e)
      return
    }
    const now = ctx.currentTime
    this.applyMix(true)
    this.g.master.gain.setValueAtTime(0, now)
    this.g.master.gain.linearRampToValueAtTime(this.muted ? 0 : this.volume, now + 4)
    this.g.amb.setAltar({ x: 20 * this.C, y: 3 * this.C + 0.6, z: 0 })
    // 排程器：每 250 毫秒把未來 1.5 秒的事件排好
    const tick = () => {
      if (!this.g || !this.ctx) return
      const t = this.ctx.currentTime
      this.g.music.tick(t, 1.5)
      this.g.amb.tick(t, 1.5, this.listenerPos, this.zone === 'holy' || this.zone === 'holiest')
    }
    tick()
    setInterval(tick, 250)
    document.addEventListener('visibilitychange', this.onVis)
  }

  private onVis = () => {
    if (!this.ctx) return
    if (document.hidden) void this.ctx.suspend()
    else if (!this.muted) void this.ctx.resume()
  }

  setMuted(m: boolean) {
    this.muted = m
    if (!this.ctx || !this.g) return
    const t = this.ctx.currentTime
    this.g.master.gain.cancelScheduledValues(t)
    this.g.master.gain.setTargetAtTime(m ? 0 : this.volume, t, 0.25)
    if (!m) void this.ctx.resume()
  }

  /**
   * 音樂與環境音效的音量（0–1，預設 0.8 = 原本的混音比例）。
   * 音訊啟動前呼叫也可以，啟動時會套用。
   */
  setMix(music: number, sfx: number) {
    this.mix = { music, sfx }
    this.applyMix(false)
  }

  private applyMix(instant: boolean) {
    if (!this.ctx || !this.g) return
    const t = this.ctx.currentTime
    const m = 0.9 * (this.mix.music / 0.8)
    const a = this.mix.sfx / 0.8
    for (const [p, v] of [
      [this.g.music.out.gain, m],
      [this.g.ambBus.gain, a],
      [this.g.ambRev.gain, a],
    ] as [AudioParam, number][]) {
      if (instant) p.setValueAtTime(v, t)
      else p.setTargetAtTime(v, t, 0.15)
    }
  }

  /** 每幀呼叫 */
  update(f: AudioFrame) {
    const ctx = this.ctx
    const g = this.g
    if (!ctx || !g || ctx.state !== 'running') return
    const t = ctx.currentTime
    this.listenerPos = f.listener
    const L = ctx.listener
    if (L.positionX) {
      L.positionX.value = f.listener.x
      L.positionY.value = f.listener.y
      L.positionZ.value = f.listener.z
      L.forwardX.value = f.forward.x
      L.forwardY.value = f.forward.y
      L.forwardZ.value = f.forward.z
      L.upX.value = 0
      L.upY.value = 1
      L.upZ.value = 0
    } else {
      const l = L as unknown as { setPosition: (...a: number[]) => void; setOrientation: (...a: number[]) => void }
      l.setPosition(f.listener.x, f.listener.y, f.listener.z)
      l.setOrientation(f.forward.x, f.forward.y, f.forward.z, 0, 1, 0)
    }
    if (f.C !== this.C) {
      this.C = f.C
      g.amb.setAltar({ x: 20 * f.C, y: 3 * f.C + 0.6, z: 0 })
    }
    if (f.zone !== this.zone) {
      this.zone = f.zone
      g.music.setSacred(f.zone === 'holy' ? 1 : f.zone === 'holiest' ? 1 : 0, t)
    }
    g.amb.update(t, f.dt, f.player, f.speed, f.zone, { x: 50 * f.C, z: 25 * f.C })
  }

  /** 目前輸出的音量（RMS），驗證用 */
  level() {
    if (!this.g) return 0
    const a = this.g.analyser
    const buf = new Float32Array(a.fftSize)
    a.getFloatTimeDomainData(buf)
    let s = 0
    for (const v of buf) s += v * v
    return Math.sqrt(s / buf.length)
  }

  state() {
    return this.ctx?.state ?? 'none'
  }
}

export const audio = new AudioEngine()

/**
 * 離線自我測試：把整套聲音在 OfflineAudioContext 裡算幾秒，回報音量。
 * 在 console 執行 `await __tabernacleAudio.selfTest()`。
 */
export async function audioSelfTest(seconds = 8, sacred = false) {
  const sr = 22050
  const ctx = new OfflineAudioContext(2, Math.floor(sr * seconds), sr)
  const g = build(ctx)
  g.master.gain.value = 0.85
  if (sacred) g.music.setSacred(1, 0)
  g.amb.setAltar({ x: 8.9, y: 2, z: 0 })
  g.music.tick(0, seconds)
  g.amb.tick(0, seconds, { x: 12, y: 2, z: 0 }, sacred)
  g.amb.shofar(0.5, { x: 40, y: 8, z: -10 })
  g.music.playFlute(1, 62, 2, 63)
  const buf = await ctx.startRendering()
  const d = buf.getChannelData(0)
  let s = 0
  let peak = 0
  for (const v of d) {
    s += v * v
    peak = Math.max(peak, Math.abs(v))
  }
  // 每秒的 RMS，看看是不是一直有聲音
  const perSec: number[] = []
  for (let k = 0; k < seconds; k++) {
    let q = 0
    for (let i = k * sr; i < (k + 1) * sr; i++) q += d[i] * d[i]
    perSec.push(+Math.sqrt(q / sr).toFixed(4))
  }
  return { rms: Math.sqrt(s / d.length), peak, perSec }
}

if (typeof window !== 'undefined') {
  ;(window as unknown as Record<string, unknown>).__tabernacleAudio = { audio, selfTest: audioSelfTest, level: () => audio.level(), state: () => audio.state() }
}
