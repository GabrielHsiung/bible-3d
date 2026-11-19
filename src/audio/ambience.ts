import { crackleBuffer, murmurBuffer, noiseBuffer, rand, stepBuffer } from './dsp'
import type { Zone } from '../store'

type V3 = { x: number; y: number; z: number }

/**
 * 環境音：曠野的風、營地人聲與羊叫、祭壇的火、腳步聲、羊角號。
 * 有位置的聲音用 PannerNode，跟著 AudioListener（相機）的位置與方向。
 */
export class Ambience {
  private ctx: BaseAudioContext
  /** 會被「帳幕內」悶住的聲音都經過這個低通 */
  private outdoor: BiquadFilterNode
  private outdoorGain: GainNode
  private windGain: GainNode
  private windFilter: BiquadFilterNode
  private whistleGain: GainNode
  private whistleFilter: BiquadFilterNode
  private murmurGain: GainNode
  private murmurFilter: BiquadFilterNode
  private firePanner: PannerNode
  private fireGain: GainNode
  private stepsOut: GainNode
  private stepsFilter: BiquadFilterNode
  private steps: { sand: AudioBuffer[]; tent: AudioBuffer[] }
  private dest: AudioNode
  private send: AudioNode
  private nextGust = 0
  private nextSheep = 4
  private nextShofar = 7
  private stepPhase = 0
  private stepSide = 1
  private inside = 0

  constructor(ctx: BaseAudioContext, dest: AudioNode, reverbSend: AudioNode) {
    this.ctx = ctx
    this.dest = dest
    this.send = reverbSend

    this.outdoor = ctx.createBiquadFilter()
    this.outdoor.type = 'lowpass'
    this.outdoor.frequency.value = ctx.sampleRate * 0.45
    this.outdoorGain = ctx.createGain()
    this.outdoor.connect(this.outdoorGain).connect(dest)
    const outSend = ctx.createGain()
    outSend.gain.value = 0.25
    this.outdoorGain.connect(outSend).connect(reverbSend)

    // ---- 風：低沉的呼呼聲＋偶爾的細高呼嘯 ----
    const brown = ctx.createBufferSource()
    brown.buffer = noiseBuffer(ctx, 6, 'brown', 2)
    brown.loop = true
    this.windFilter = ctx.createBiquadFilter()
    this.windFilter.type = 'bandpass'
    this.windFilter.frequency.value = 380
    this.windFilter.Q.value = 0.5
    this.windGain = ctx.createGain()
    this.windGain.gain.value = 0.12
    brown.connect(this.windFilter).connect(this.windGain).connect(this.outdoor)
    brown.start()

    const pink = ctx.createBufferSource()
    pink.buffer = noiseBuffer(ctx, 5, 'pink', 2)
    pink.loop = true
    this.whistleFilter = ctx.createBiquadFilter()
    this.whistleFilter.type = 'bandpass'
    this.whistleFilter.frequency.value = 1400
    this.whistleFilter.Q.value = 4
    this.whistleGain = ctx.createGain()
    this.whistleGain.gain.value = 0.02
    pink.connect(this.whistleFilter).connect(this.whistleGain).connect(this.outdoor)
    pink.start()

    // ---- 營地人聲：兩組低語，左右分開 ----
    this.murmurFilter = ctx.createBiquadFilter()
    this.murmurFilter.type = 'lowpass'
    this.murmurFilter.frequency.value = 900
    this.murmurGain = ctx.createGain()
    this.murmurGain.gain.value = 0.05
    this.murmurFilter.connect(this.murmurGain).connect(this.outdoor)
    const mb = murmurBuffer(ctx, 9)
    for (const [pan, rate, off] of [
      [-0.65, 0.97, 0],
      [0.6, 1.04, 4.3],
    ]) {
      const s = ctx.createBufferSource()
      s.buffer = mb
      s.loop = true
      s.playbackRate.value = rate
      const p = 'createStereoPanner' in ctx ? ctx.createStereoPanner() : null
      if (p) {
        p.pan.value = pan
        s.connect(p).connect(this.murmurFilter)
      } else s.connect(this.murmurFilter)
      s.start(ctx.currentTime, off)
    }

    // ---- 祭壇的火：低沉的燃燒聲＋劈啪 ----
    this.firePanner = this.panner(2.5, 1.5)
    this.fireGain = ctx.createGain()
    this.fireGain.gain.value = 0.9
    this.fireGain.connect(this.firePanner).connect(this.outdoor)
    const roar = ctx.createBufferSource()
    roar.buffer = noiseBuffer(ctx, 4, 'brown')
    roar.loop = true
    const roarLp = ctx.createBiquadFilter()
    roarLp.type = 'lowpass'
    roarLp.frequency.value = 520
    const roarG = ctx.createGain()
    roarG.gain.value = 0.55
    roar.connect(roarLp).connect(roarG).connect(this.fireGain)
    // 火焰的忽大忽小
    const flick = ctx.createOscillator()
    flick.frequency.value = 0.7
    const flickAmt = ctx.createGain()
    flickAmt.gain.value = 0.18
    flick.connect(flickAmt).connect(roarG.gain)
    flick.start()
    roar.start()
    const crk = ctx.createBufferSource()
    crk.buffer = crackleBuffer(ctx, 7)
    crk.loop = true
    const crkHp = ctx.createBiquadFilter()
    crkHp.type = 'highpass'
    crkHp.frequency.value = 900
    const crkG = ctx.createGain()
    crkG.gain.value = 0.7
    crk.connect(crkHp).connect(crkG).connect(this.fireGain)
    crk.start()

    // ---- 腳步 ----
    this.steps = {
      sand: [0, 1, 2, 3].map(() => stepBuffer(ctx, false)),
      tent: [0, 1, 2].map(() => stepBuffer(ctx, true)),
    }
    this.stepsFilter = ctx.createBiquadFilter()
    this.stepsFilter.type = 'lowpass'
    this.stepsFilter.frequency.value = 3200
    this.stepsOut = ctx.createGain()
    this.stepsOut.gain.value = 0.32
    this.stepsFilter.connect(this.stepsOut).connect(dest)
    const stepSend = ctx.createGain()
    stepSend.gain.value = 0.12
    this.stepsOut.connect(stepSend).connect(reverbSend)
  }

  private panner(ref: number, rolloff: number) {
    const p = this.ctx.createPanner()
    p.panningModel = 'equalpower'
    p.distanceModel = 'inverse'
    p.refDistance = ref
    p.rolloffFactor = rolloff
    p.maxDistance = 600
    return p
  }

  private setPos(p: PannerNode, v: V3) {
    if (p.positionX) {
      p.positionX.value = v.x
      p.positionY.value = v.y
      p.positionZ.value = v.z
    } else (p as unknown as { setPosition: (x: number, y: number, z: number) => void }).setPosition(v.x, v.y, v.z)
  }

  setAltar(v: V3) {
    this.setPos(this.firePanner, v)
  }

  /** 羊叫：鋸齒波＋快速的顫抖（咩～～）＋兩個共振峰 */
  sheep(t: number, at: V3) {
    const ctx = this.ctx
    const p = this.panner(6, 1)
    this.setPos(p, at)
    const f0 = rand(330, 520)
    const dur = rand(0.55, 1.1)
    const o = ctx.createOscillator()
    o.type = 'sawtooth'
    o.frequency.setValueAtTime(f0 * 0.92, t)
    o.frequency.linearRampToValueAtTime(f0, t + 0.08)
    o.frequency.linearRampToValueAtTime(f0 * 0.86, t + dur)
    const trem = ctx.createOscillator()
    trem.frequency.value = rand(17, 24)
    const tremAmt = ctx.createGain()
    tremAmt.gain.value = 0.5
    const am = ctx.createGain()
    am.gain.value = 0.5
    trem.connect(tremAmt).connect(am.gain)
    const env = ctx.createGain()
    env.gain.setValueAtTime(0, t)
    env.gain.linearRampToValueAtTime(0.32, t + 0.05)
    env.gain.setValueAtTime(0.3, t + dur * 0.7)
    env.gain.linearRampToValueAtTime(0, t + dur)
    const f1 = ctx.createBiquadFilter()
    f1.type = 'bandpass'
    f1.frequency.value = rand(900, 1200)
    f1.Q.value = 3
    const f2 = ctx.createBiquadFilter()
    f2.type = 'bandpass'
    f2.frequency.value = rand(2300, 2800)
    f2.Q.value = 5
    o.connect(am)
    am.connect(f1).connect(env)
    am.connect(f2).connect(env)
    env.connect(p).connect(this.outdoor)
    o.start(t)
    trem.start(t)
    o.stop(t + dur + 0.1)
    trem.stop(t + dur + 0.1)
    o.onended = () => p.disconnect()
  }

  /**
   * 羊角號（shofar）：鋸齒波經過削波（粗糙的號角聲）＋共振峰，
   * 先往上滑到音高，結尾向上「破」到高泛音。
   * 吹法：長音（tekiah）— 三短（shevarim）— 長音。
   */
  shofar(t: number, at: V3) {
    const ctx = this.ctx
    const p = this.panner(25, 0.6)
    this.setPos(p, at)
    const out = ctx.createGain()
    out.gain.value = 0.9
    out.connect(p).connect(this.dest)
    const wet = ctx.createGain()
    wet.gain.value = 0.9
    p.connect(wet).connect(this.send)
    const shaper = ctx.createWaveShaper()
    const curve = new Float32Array(1024)
    for (let i = 0; i < 1024; i++) {
      const x = (i / 1023) * 2 - 1
      curve[i] = Math.tanh(x * 2.6)
    }
    shaper.curve = curve
    const f1 = ctx.createBiquadFilter()
    f1.type = 'peaking'
    f1.frequency.value = 1150
    f1.Q.value = 1.4
    f1.gain.value = 9
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 3200
    shaper.connect(f1).connect(lp).connect(out)

    const f0 = rand(285, 320)
    const blast = (start: number, dur: number, breakUp: boolean) => {
      const o = ctx.createOscillator()
      o.type = 'sawtooth'
      o.frequency.setValueAtTime(f0 * 0.7, start)
      o.frequency.exponentialRampToValueAtTime(f0, start + 0.22)
      o.frequency.setValueAtTime(f0, start + dur - (breakUp ? 0.55 : 0.05))
      if (breakUp) {
        o.frequency.exponentialRampToValueAtTime(f0 * 1.5, start + dur - 0.45)
        o.frequency.setValueAtTime(f0 * 1.5, start + dur - 0.1)
      }
      const wob = ctx.createOscillator()
      wob.frequency.value = 5.5
      const wobAmt = ctx.createGain()
      wobAmt.gain.value = f0 * 0.008
      wob.connect(wobAmt).connect(o.frequency)
      const g = ctx.createGain()
      g.gain.setValueAtTime(0, start)
      g.gain.linearRampToValueAtTime(0.09, start + 0.12)
      g.gain.setValueAtTime(0.09, start + dur - 0.12)
      g.gain.linearRampToValueAtTime(0, start + dur)
      o.connect(g).connect(shaper)
      o.start(start)
      wob.start(start)
      o.stop(start + dur + 0.05)
      wob.stop(start + dur + 0.05)
    }
    let time = t
    blast(time, 3.2, true)
    time += 3.8
    for (let i = 0; i < 3; i++) {
      blast(time, 0.75, false)
      time += 1.0
    }
    time += 0.4
    blast(time, 4.4, true)
    setTimeout(() => out.disconnect(), (time + 6 - ctx.currentTime) * 1000)
  }

  private step(t: number, inside: boolean, intensity: number) {
    const ctx = this.ctx
    const list = inside ? this.steps.tent : this.steps.sand
    const s = ctx.createBufferSource()
    s.buffer = list[Math.floor(Math.random() * list.length)]
    s.playbackRate.value = rand(0.88, 1.12)
    const g = ctx.createGain()
    g.gain.value = intensity * rand(0.75, 1)
    this.stepSide = -this.stepSide
    if ('createStereoPanner' in ctx) {
      const p = ctx.createStereoPanner()
      p.pan.value = this.stepSide * 0.12
      s.connect(g).connect(p).connect(this.stepsFilter)
    } else s.connect(g).connect(this.stepsFilter)
    s.start(t)
  }

  /** 排程偶發事件（羊叫、陣風、羊角號） */
  tick(now: number, ahead: number, listener: V3, sacred: boolean) {
    const horizon = now + ahead
    while (this.nextGust < horizon) {
      const t = Math.max(now, this.nextGust)
      const strength = rand(0.06, 0.2)
      this.windGain.gain.setTargetAtTime(strength, t, rand(0.8, 2))
      this.windFilter.frequency.setTargetAtTime(rand(250, 650), t, 1.5)
      this.whistleGain.gain.setTargetAtTime(Math.random() < 0.25 ? rand(0.02, 0.05) : 0.006, t, 1.8)
      this.whistleFilter.frequency.setTargetAtTime(rand(900, 2200), t, 2)
      this.nextGust = t + rand(1.5, 4)
    }
    while (this.nextSheep < horizon) {
      const t = Math.max(now, this.nextSheep)
      const a = Math.random() * Math.PI * 2
      const r = rand(45, 120)
      const at = { x: listener.x * 0.3 + Math.cos(a) * r, y: 0.6, z: listener.z * 0.3 + Math.sin(a) * r }
      this.sheep(t, at)
      // 有時一隻叫完另一隻回應
      if (Math.random() < 0.35) this.sheep(t + rand(0.9, 2), { x: at.x + rand(-8, 8), y: 0.6, z: at.z + rand(-8, 8) })
      this.nextSheep = t + rand(6, 18)
    }
    while (this.nextShofar < horizon) {
      const t = Math.max(now, this.nextShofar)
      // 號聲從營地東邊傳來（早晚獻祭時）
      if (!sacred) this.shofar(t, { x: 95, y: 8, z: -35 })
      this.nextShofar = t + rand(150, 240)
    }
  }

  /** 每幀：依位置與速度調整音量、濾波，產生腳步 */
  update(t: number, dt: number, player: V3, speed: number, zone: Zone, courtHalf: { x: number; z: number }) {
    const inside = zone === 'holy' || zone === 'holiest' ? 1 : 0
    if (inside !== this.inside) {
      this.inside = inside
      this.outdoor.frequency.setTargetAtTime(inside ? 650 : this.ctx.sampleRate * 0.45, t, 0.6)
      this.outdoorGain.gain.setTargetAtTime(inside ? 0.45 : 1, t, 0.8)
      this.stepsFilter.frequency.setTargetAtTime(inside ? 1500 : 3200, t, 0.3)
    }
    // 營地人聲：離院子邊緣越近越清楚
    const dx = Math.max(0, Math.abs(player.x) - courtHalf.x)
    const dz = Math.max(0, Math.abs(player.z) - courtHalf.z)
    const outsideCourt = Math.hypot(dx, dz)
    const campNear = zone === 'camp' ? Math.min(1, 0.45 + outsideCourt / 25) : 0.28
    this.murmurGain.gain.setTargetAtTime(0.055 * campNear, t, 1)
    this.murmurFilter.frequency.setTargetAtTime(600 + campNear * 900, t, 1)
    // 腳步：步頻隨速度
    if (speed > 0.35) {
      const rate = 1.55 + speed * 0.28 // 每秒步數
      this.stepPhase += dt * rate
      if (this.stepPhase >= 1) {
        this.stepPhase -= 1
        const intensity = Math.min(1.3, 0.55 + speed * 0.14) * (inside ? 0.7 : 1)
        this.step(t + 0.01, inside === 1, intensity)
      }
    } else this.stepPhase = 0.7
  }
}
