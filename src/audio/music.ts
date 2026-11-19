import { midiHz, pick, pluckBuffer, rand, noiseBuffer } from './dsp'

/**
 * 古代近東風格的生成式配樂（完全程序合成）。
 *
 * - 調式：D 弗里吉亞屬音階（Phrygian dominant / Hijaz）：D E♭ F♯ G A B♭ C
 * - 低音持續音（drone）：D 與 A／G 交替，濾波緩慢呼吸
 * - 基尼琴（kinnor）：Karplus-Strong 撥弦，隨機漫步的旋律片段、和弦掃弦、裝飾音
 * - 笛：正弦＋三角波＋帶通的氣聲雜訊，有滑音和延遲顫音
 * - 聖所：只剩像人聲合唱的 pad（鋸齒波 → 共振峰濾波），更內斂
 *
 * 所有事件都用「排程到未來」的方式（tick(now, ahead)），
 * 所以同一份程式碼可以在 OfflineAudioContext 裡跑來驗證輸出。
 */

const SCALE = [0, 1, 4, 5, 7, 8, 10] // Phrygian dominant
const ROOT = 50 // D3

/** 第 deg 個音級（可跨八度、可為負）→ MIDI */
export function degree(deg: number, root = ROOT) {
  const o = Math.floor(deg / 7)
  const i = ((deg % 7) + 7) % 7
  return root + o * 12 + SCALE[i]
}

/** 聖所 pad 的和弦（音級） */
const PAD_CHORDS = [
  [-7, -3, 0, 2], // D A D F♯
  [-7, -2, 1, 3], // D B♭ E♭ G（♭II 色彩，壓在 D 上）
  [-7, -3, 0, 4], // D A D A
  [-4, -2, 1, 3], // G B♭ E♭ G
  [-7, -3, -1, 2], // D A C F♯
]

const FORMANTS = {
  ah: [700, 1150, 2600],
  oh: [450, 800, 2500],
  oo: [325, 700, 2400],
}

export class Music {
  private ctx: BaseAudioContext
  readonly out: GainNode
  private send: AudioNode
  private kinnorBus: GainNode
  private fluteBus: GainNode
  private padBus: GainNode
  private droneBus: GainNode
  private droneFilter: BiquadFilterNode
  private droneFifth: OscillatorNode[] = []
  private padOsc: OscillatorNode[][] = []
  private padFormants: BiquadFilterNode[] = []
  private noise: AudioBuffer
  private plucks = new Map<number, AudioBuffer>()
  private sacred = 0
  // 排程狀態
  private nextKinnor = 1.2
  private nextFlute = 14
  private nextDrone = 30
  private nextPad = 0
  private padIndex = 0
  private melodyPos = 7
  private lastPhraseWasFlute = false

  constructor(ctx: BaseAudioContext, dest: AudioNode, reverbSend: AudioNode) {
    this.ctx = ctx
    this.out = ctx.createGain()
    this.out.gain.value = 0.9
    this.out.connect(dest)
    this.send = ctx.createGain()
    ;(this.send as GainNode).gain.value = 0.55
    this.out.connect(this.send)
    this.send.connect(reverbSend)

    this.noise = noiseBuffer(ctx, 3, 'white')

    // 基尼琴的琴身：一點低頻共鳴、去掉刺耳的高頻
    const body = ctx.createBiquadFilter()
    body.type = 'peaking'
    body.frequency.value = 240
    body.Q.value = 1.2
    body.gain.value = 4
    const tone = ctx.createBiquadFilter()
    tone.type = 'lowpass'
    tone.frequency.value = 3800
    this.kinnorBus = ctx.createGain()
    this.kinnorBus.gain.value = 1
    this.kinnorBus.connect(body).connect(tone).connect(this.out)

    this.fluteBus = ctx.createGain()
    this.fluteBus.gain.value = 1
    this.fluteBus.connect(this.out)

    // ---- 低音持續音 ----
    this.droneBus = ctx.createGain()
    this.droneBus.gain.value = 0.0001
    this.droneBus.gain.setTargetAtTime(0.11, ctx.currentTime + 0.1, 3)
    this.droneFilter = ctx.createBiquadFilter()
    this.droneFilter.type = 'lowpass'
    this.droneFilter.frequency.value = 420
    this.droneFilter.Q.value = 0.8
    this.droneFilter.connect(this.droneBus).connect(this.out)
    // 濾波器緩慢呼吸
    const lfo = ctx.createOscillator()
    lfo.frequency.value = 0.045
    const lfoAmt = ctx.createGain()
    lfoAmt.gain.value = 140
    lfo.connect(lfoAmt).connect(this.droneFilter.frequency)
    lfo.start()
    const mk = (type: OscillatorType, midi: number, detune: number, gain: number) => {
      const o = ctx.createOscillator()
      o.type = type
      o.frequency.value = midiHz(midi)
      o.detune.value = detune
      const g = ctx.createGain()
      g.gain.value = gain
      o.connect(g).connect(this.droneFilter)
      o.start()
      return o
    }
    mk('sawtooth', 38, -4, 0.35) // D2
    mk('sawtooth', 38, 5, 0.35)
    mk('sine', 26, 0, 0.9) // D1 的低沉基底
    this.droneFifth = [mk('triangle', 45, -3, 0.45), mk('sawtooth', 45, 6, 0.18)] // A2

    // ---- 聖所的「人聲」pad ----
    this.padBus = ctx.createGain()
    this.padBus.gain.value = 0
    const padIn = ctx.createGain()
    padIn.gain.value = 0.22
    const padHp = ctx.createBiquadFilter()
    padHp.type = 'highpass'
    padHp.frequency.value = 120
    padIn.connect(padHp)
    for (const f of FORMANTS.ah) {
      const bp = ctx.createBiquadFilter()
      bp.type = 'bandpass'
      bp.frequency.value = f
      bp.Q.value = 5
      padHp.connect(bp).connect(this.padBus)
      this.padFormants.push(bp)
    }
    this.padBus.connect(this.out)
    // 合唱般的顫音
    const vib = ctx.createOscillator()
    vib.frequency.value = 4.6
    const vibAmt = ctx.createGain()
    vibAmt.gain.value = 9
    vib.connect(vibAmt)
    vib.start()
    const chord = PAD_CHORDS[0]
    for (const d of chord) {
      const voice: OscillatorNode[] = []
      for (const det of [-9, 0, 8]) {
        const o = ctx.createOscillator()
        o.type = 'sawtooth'
        o.frequency.value = midiHz(degree(d))
        o.detune.value = det
        vibAmt.connect(o.detune)
        o.connect(padIn)
        o.start()
        voice.push(o)
      }
      this.padOsc.push(voice)
    }
  }

  /** 0 = 院子／營地（完整配樂），1 = 聖所（只剩 pad） */
  setSacred(v: number, t: number) {
    if (Math.abs(v - this.sacred) < 0.01) return
    this.sacred = v
    this.kinnorBus.gain.setTargetAtTime(1 - v * 0.8, t, 1.5)
    this.fluteBus.gain.setTargetAtTime(1 - v, t, 1.2)
    this.padBus.gain.setTargetAtTime(v * 1.0, t, 2.5)
    this.droneBus.gain.setTargetAtTime(0.11 - v * 0.05, t, 2)
    this.droneFilter.frequency.setTargetAtTime(420 - v * 180, t, 2)
  }

  private pluck(midi: number) {
    let b = this.plucks.get(midi)
    if (!b) {
      b = pluckBuffer(this.ctx, midiHz(midi), { bright: midi > 64 ? 0.45 : 0.6 })
      this.plucks.set(midi, b)
    }
    return b
  }

  private panned(pan: number): AudioNode {
    const ctx = this.ctx
    if (!('createStereoPanner' in ctx)) return this.kinnorBus
    const p = ctx.createStereoPanner()
    p.pan.value = pan
    p.connect(this.kinnorBus)
    return p
  }

  playKinnor(t: number, midi: number, vel: number, pan = 0) {
    const src = this.ctx.createBufferSource()
    src.buffer = this.pluck(midi)
    const g = this.ctx.createGain()
    g.gain.value = vel * 0.55
    src.connect(g).connect(this.panned(pan))
    src.start(t)
    src.onended = () => g.disconnect()
  }

  /** 笛：起音有氣聲、延遲出現的顫音、從上方鄰音滑入 */
  playFlute(t: number, midi: number, dur: number, from?: number, vel = 1) {
    const ctx = this.ctx
    const f = midiHz(midi)
    const env = ctx.createGain()
    env.gain.value = 0
    const peak = 0.075 * vel
    env.gain.setValueAtTime(0, t)
    env.gain.linearRampToValueAtTime(peak, t + 0.28)
    env.gain.setValueAtTime(peak, t + dur - 0.1)
    env.gain.linearRampToValueAtTime(peak * 0.85, t + dur)
    env.gain.setTargetAtTime(0, t + dur, 0.22)
    const tone = ctx.createBiquadFilter()
    tone.type = 'lowpass'
    tone.frequency.value = 2600
    env.connect(tone).connect(this.fluteBus)

    const o1 = ctx.createOscillator()
    o1.type = 'sine'
    const o2 = ctx.createOscillator()
    o2.type = 'triangle'
    const g2 = ctx.createGain()
    g2.gain.value = 0.18
    for (const o of [o1, o2]) {
      const mul = o === o2 ? 2 : 1
      if (from !== undefined) {
        o.frequency.setValueAtTime(midiHz(from) * mul, t)
        o.frequency.exponentialRampToValueAtTime(f * mul, t + 0.16)
      } else o.frequency.setValueAtTime(f * mul, t)
    }
    // 延遲顫音
    const vib = ctx.createOscillator()
    vib.frequency.value = rand(4.6, 5.6)
    const vibAmt = ctx.createGain()
    vibAmt.gain.setValueAtTime(0, t)
    vibAmt.gain.linearRampToValueAtTime(f * 0.012, t + Math.min(dur, 1.1))
    vib.connect(vibAmt)
    vibAmt.connect(o1.frequency)
    o1.connect(env)
    o2.connect(g2).connect(env)

    // 氣聲：帶通在基頻附近＋一點高頻的嘶聲
    const n = ctx.createBufferSource()
    n.buffer = this.noise
    n.loop = true
    const bp = ctx.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.value = f
    bp.Q.value = 7
    const hp = ctx.createBiquadFilter()
    hp.type = 'highpass'
    hp.frequency.value = 3000
    const nb = ctx.createGain()
    nb.gain.value = 0.55
    const nh = ctx.createGain()
    nh.gain.value = 0.05
    n.connect(bp).connect(nb).connect(env)
    n.connect(hp).connect(nh).connect(env)
    // 起音時的氣聲比較重
    const chiff = ctx.createGain()
    chiff.gain.setValueAtTime(0, t)
    chiff.gain.linearRampToValueAtTime(0.06, t + 0.04)
    chiff.gain.exponentialRampToValueAtTime(0.001, t + 0.3)
    n.connect(hp)
    hp.connect(chiff).connect(tone)

    const end = t + dur + 1.2
    for (const s of [o1, o2, vib, n]) {
      s.start(t)
      s.stop(end)
    }
    o1.onended = () => env.disconnect()
  }

  /** 排程：把 [now, now + ahead] 之間的音符都安排好 */
  tick(now: number, ahead: number) {
    const horizon = now + ahead
    // 持續音的五度：A 與 G 緩慢交替
    while (this.nextDrone < horizon) {
      const t = Math.max(this.nextDrone, now)
      const toG = Math.random() < 0.4
      for (const o of this.droneFifth) o.frequency.setTargetAtTime(midiHz(toG ? 43 : 45), t, 4)
      this.nextDrone = t + rand(28, 55)
    }
    // pad 和弦（像合唱一樣緩慢滑動）
    while (this.nextPad < horizon) {
      const t = Math.max(this.nextPad, now)
      this.padIndex = (this.padIndex + 1 + Math.floor(Math.random() * 2)) % PAD_CHORDS.length
      const chord = PAD_CHORDS[this.padIndex]
      this.padOsc.forEach((voice, i) => voice.forEach((o) => o.frequency.setTargetAtTime(midiHz(degree(chord[i])), t, 1.4)))
      const vowel = pick([FORMANTS.ah, FORMANTS.oh, FORMANTS.oo, FORMANTS.ah])
      this.padFormants.forEach((bp, i) => bp.frequency.setTargetAtTime(vowel[i], t, 3))
      this.nextPad = t + rand(9, 15)
    }
    while (this.nextKinnor < horizon) {
      const t = Math.max(this.nextKinnor, now)
      this.nextKinnor = this.sacred > 0.5 ? this.sacredBell(t) : this.kinnorPhrase(t)
    }
    while (this.nextFlute < horizon) {
      const t = Math.max(this.nextFlute, now)
      this.nextFlute = this.sacred > 0.5 ? t + 8 : this.flutePhrase(t)
    }
  }

  /** 聖所裡偶爾一聲高音的泛音撥弦，像遠處的鐘 */
  private sacredBell(t: number) {
    this.playKinnor(t, degree(pick([7, 9, 11, 14])), 0.35, rand(-0.4, 0.4))
    return t + rand(7, 13)
  }

  private kinnorPhrase(t: number) {
    const beat = rand(0.72, 0.95)
    const kind = Math.random()
    let time = t
    // 每段開頭有低音
    if (Math.random() < 0.7) this.playKinnor(time, degree(pick([-7, -7, -3, -4])), 0.8, -0.2)
    if (kind < 0.18) {
      // 掃弦：和弦由低到高
      const chord = pick([
        [0, 2, 4, 7],
        [0, 4, 7, 9],
        [-3, 0, 2, 4],
        [1, 3, 5, 8],
      ])
      chord.forEach((d, i) => this.playKinnor(time + i * 0.07, degree(d), 0.6 - i * 0.05, -0.3 + i * 0.2))
      return time + beat * 4 + rand(2, 5)
    }
    // 旋律：在音階上隨機漫步，最後停在穩定的音（D、A、高 D）
    const len = 4 + Math.floor(Math.random() * 5)
    let pos = this.melodyPos
    for (let i = 0; i < len; i++) {
      const step = pick([-1, -1, 1, 1, 1, -2, 2, 0, -1, 3, -3])
      pos = Math.max(2, Math.min(13, pos + step))
      if (i === len - 1) pos = pick([4, 7, 7, 11]) // 結束在穩定音
      const dur = i === len - 1 ? pick([2, 3]) : pick([0.5, 1, 1, 1, 1.5, 0.5])
      const vel = rand(0.45, 0.8)
      this.playKinnor(time, degree(pos), vel, rand(-0.15, 0.25))
      // 裝飾音：快速的上鄰音迴音
      if (dur >= 1 && Math.random() < 0.18) {
        this.playKinnor(time + beat * 0.25, degree(pos + 1), vel * 0.5, 0.1)
        this.playKinnor(time + beat * 0.4, degree(pos), vel * 0.5, 0.1)
      }
      // 偶爾加八度下方的雙音
      if (Math.random() < 0.15) this.playKinnor(time, degree(pos - 7), vel * 0.4, -0.2)
      time += dur * beat
    }
    this.melodyPos = pos
    // 笛在吹時，琴就讓開
    const rest = this.lastPhraseWasFlute ? rand(5, 9) : rand(2.5, 6.5)
    return time + rest
  }

  private flutePhrase(t: number) {
    this.lastPhraseWasFlute = true
    let time = t
    let pos = pick([7, 8, 9, 11])
    const len = 2 + Math.floor(Math.random() * 4)
    for (let i = 0; i < len; i++) {
      const dur = i === len - 1 ? rand(2.6, 4.2) : rand(1.1, 2.4)
      // 一半的音從上方鄰音滑下來（近東笛子常見的裝飾）
      const from = Math.random() < 0.55 ? degree(pos + 1) : undefined
      this.playFlute(time, degree(pos), dur, from, rand(0.8, 1))
      time += dur * 0.96
      pos = Math.max(5, Math.min(12, pos + pick([-1, -1, 1, -2, 1, 0])))
      if (i === len - 2) pos = pick([7, 4, 9])
    }
    // 下一段笛聲在 25–50 秒後；中間讓琴回來
    setTimeoutSafe(() => (this.lastPhraseWasFlute = false), (time - t) * 1000)
    return time + rand(25, 50)
  }
}

/** OfflineAudioContext 裡沒有真正的時間流逝：setTimeout 存在就用，失敗也無妨 */
function setTimeoutSafe(fn: () => void, ms: number) {
  if (typeof setTimeout === 'function') setTimeout(fn, ms)
}
