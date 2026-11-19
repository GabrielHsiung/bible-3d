/**
 * 程序合成用的小工具：雜訊、殘響衝擊響應、Karplus-Strong 撥弦。
 * 全部在 JS 裡算出 AudioBuffer，不載入任何音檔。
 */

export const midiHz = (m: number) => 440 * Math.pow(2, (m - 69) / 12)
export const rand = (a: number, b: number) => a + Math.random() * (b - a)
export const pick = <T>(arr: readonly T[]) => arr[Math.floor(Math.random() * arr.length)]

export type NoiseColor = 'white' | 'pink' | 'brown'

/** 可無縫循環的雜訊（頭尾交叉淡入淡出） */
export function noiseBuffer(ctx: BaseAudioContext, seconds: number, color: NoiseColor, channels = 1) {
  const sr = ctx.sampleRate
  const n = Math.floor(sr * seconds)
  const X = Math.floor(sr * 0.25)
  const buf = ctx.createBuffer(channels, n, sr)
  for (let ch = 0; ch < channels; ch++) {
    const tmp = new Float32Array(n + X)
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0
    let last = 0
    for (let i = 0; i < n + X; i++) {
      const w = Math.random() * 2 - 1
      if (color === 'white') tmp[i] = w * 0.5
      else if (color === 'pink') {
        // Paul Kellet 的粉紅雜訊濾波
        b0 = 0.99886 * b0 + w * 0.0555179
        b1 = 0.99332 * b1 + w * 0.0750759
        b2 = 0.969 * b2 + w * 0.153852
        b3 = 0.8665 * b3 + w * 0.3104856
        b4 = 0.55 * b4 + w * 0.5329522
        b5 = -0.7616 * b5 - w * 0.016898
        tmp[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11
        b6 = w * 0.115926
      } else {
        last = (last + 0.02 * w) / 1.02
        tmp[i] = last * 3.5
      }
    }
    const out = buf.getChannelData(ch)
    for (let i = 0; i < n; i++) out[i] = tmp[i]
    for (let i = 0; i < X; i++) {
      const t = i / X
      out[i] = tmp[i] * t + tmp[n + i] * (1 - t)
    }
  }
  return buf
}

/**
 * 程序產生的殘響衝擊響應：早期反射＋指數衰減的雜訊尾巴，
 * 高頻衰減得比低頻快（像空曠的石頭山谷）。
 */
export function impulseResponse(ctx: BaseAudioContext, seconds: number, decay: number, opts: { predelay?: number; damp?: number } = {}) {
  const sr = ctx.sampleRate
  const n = Math.floor(sr * seconds)
  const pre = Math.floor(sr * (opts.predelay ?? 0.02))
  const damp = opts.damp ?? 0.6
  const buf = ctx.createBuffer(2, n, sr)
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch)
    let lp = 0
    for (let i = pre; i < n; i++) {
      const t = (i - pre) / sr
      const env = Math.pow(1 - (i - pre) / (n - pre), decay) * Math.exp(-t * 0.6)
      // 越後面越暗：一階低通的係數隨時間變小
      const k = Math.max(0.04, 0.9 - damp * (t / seconds) * 1.6)
      lp += ((Math.random() * 2 - 1) - lp) * k
      d[i] = lp * env
    }
    // 早期反射：山壁、帳棚的幾道回聲
    for (let r = 0; r < 14; r++) {
      const at = pre + Math.floor(sr * rand(0.008, 0.11))
      if (at < n) d[at] += (Math.random() < 0.5 ? -1 : 1) * rand(0.2, 0.6) * (1 - r / 14)
    }
    // 正規化
    let peak = 0
    for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(d[i]))
    if (peak > 0) for (let i = 0; i < n; i++) d[i] /= peak * 2.2
  }
  return buf
}

/**
 * Karplus-Strong 撥弦（基尼琴／豎琴）。
 * 迴路：延遲線 → 兩點平均（低通）→ 全通濾波（分數延遲，讓音準正確）→ 衰減。
 */
export function pluckBuffer(ctx: BaseAudioContext, freq: number, opts: { bright?: number; t60?: number } = {}) {
  const sr = ctx.sampleRate
  const t60 = opts.t60 ?? Math.min(5.5, Math.max(1.4, 5 * Math.sqrt(110 / freq)))
  const dur = Math.min(6, t60 + 0.3)
  const n = Math.floor(sr * dur)
  const buf = ctx.createBuffer(1, n, sr)
  const out = buf.getChannelData(0)
  const P = sr / freq
  const N = Math.max(2, Math.floor(P - 0.6))
  const f = P - 0.5 - N
  const c = (1 - f) / (1 + f)
  const d = new Float32Array(N)
  // 激發：帶顏色的雜訊（手指撥弦較柔、不刺耳）＋撥弦位置的梳狀效果
  const bright = opts.bright ?? 0.5
  let lp = 0
  for (let i = 0; i < N; i++) {
    lp += (Math.random() * 2 - 1 - lp) * (0.2 + bright * 0.6)
    d[i] = lp
  }
  const pp = Math.max(1, Math.floor(N * 0.14))
  const ex = d.slice()
  for (let i = 0; i < N; i++) d[i] = ex[i] - 0.8 * ex[(i + pp) % N]
  let mean = 0
  for (let i = 0; i < N; i++) mean += d[i]
  mean /= N
  for (let i = 0; i < N; i++) d[i] -= mean
  const loss = Math.pow(10, -3 / (t60 * freq))
  let ptr = 0
  let prevX = 0
  let apX = 0
  let apY = 0
  let hpX = 0
  let hpY = 0
  for (let i = 0; i < n; i++) {
    const x = d[ptr]
    const avg = 0.5 * (x + prevX)
    prevX = x
    const ap = c * avg + apX - c * apY
    apX = avg
    apY = ap
    d[ptr] = ap * loss
    ptr = ptr + 1 === N ? 0 : ptr + 1
    // 去直流
    const hp = x - hpX + 0.995 * hpY
    hpX = x
    hpY = hp
    out[i] = hp * 0.6
  }
  const fade = Math.floor(sr * 0.08)
  for (let i = 0; i < fade; i++) out[n - 1 - i] *= i / fade
  return buf
}

/** 短促的沙地腳步聲（許多細小的沙粒摩擦聲） */
export function stepBuffer(ctx: BaseAudioContext, soft: boolean) {
  const sr = ctx.sampleRate
  const dur = soft ? 0.22 : 0.28
  const n = Math.floor(sr * dur)
  const buf = ctx.createBuffer(1, n, sr)
  const d = buf.getChannelData(0)
  // 腳跟落地的悶響
  const thumpF = soft ? 70 : 90
  for (let i = 0; i < n; i++) {
    const t = i / sr
    d[i] += Math.sin(2 * Math.PI * thumpF * t) * Math.exp(-t * 38) * 0.5
  }
  // 沙粒：隨機的小脈衝，前密後疏
  const grains = soft ? 90 : 220
  for (let g = 0; g < grains; g++) {
    const at = Math.floor(Math.pow(Math.random(), 1.8) * n * 0.9)
    const amp = rand(0.05, 0.35) * (1 - at / n)
    const len = Math.floor(sr * rand(0.0005, 0.003))
    for (let i = 0; i < len && at + i < n; i++) d[at + i] += (Math.random() * 2 - 1) * amp * (1 - i / len)
  }
  // 整體包絡
  for (let i = 0; i < n; i++) {
    const t = i / n
    d[i] *= Math.min(1, t * 40) * Math.pow(1 - t, 1.5)
  }
  return buf
}

/** 營火的劈啪聲：稀疏的爆裂 */
export function crackleBuffer(ctx: BaseAudioContext, seconds: number) {
  const sr = ctx.sampleRate
  const n = Math.floor(sr * seconds)
  const buf = ctx.createBuffer(1, n, sr)
  const d = buf.getChannelData(0)
  const pops = Math.floor(seconds * 14)
  for (let p = 0; p < pops; p++) {
    const at = Math.floor(Math.random() * n)
    const amp = Math.pow(Math.random(), 3) * 0.9 + 0.05
    const len = Math.floor(sr * rand(0.002, 0.02))
    const tone = rand(0.2, 0.9)
    let v = 0
    for (let i = 0; i < len; i++) {
      v += ((Math.random() * 2 - 1) - v) * tone
      d[(at + i) % n] += v * amp * Math.exp((-i / len) * 5)
    }
  }
  return buf
}

/**
 * 遠方營地的人聲低語：幾個「說話的人」，
 * 每人是帶抖動的聲門脈衝 → 兩個共振峰（母音）→ 音節般的開關。
 * 不是任何語言，只是聽起來像遠處有人在交談。
 */
export function murmurBuffer(ctx: BaseAudioContext, seconds: number, speakers = 6) {
  const sr = ctx.sampleRate
  const n = Math.floor(sr * seconds)
  const X = Math.floor(sr * 0.4)
  const tmp = new Float32Array(n + X)
  const vowels = [
    [730, 1090],
    [530, 1840],
    [270, 2290],
    [570, 840],
    [300, 870],
    [660, 1720],
  ]
  // 二階帶通（RBJ）
  const bp = (f: number, q: number) => {
    const w = (2 * Math.PI * f) / sr
    const al = Math.sin(w) / (2 * q)
    const a0 = 1 + al
    return { b0: al / a0, b2: -al / a0, a1: (-2 * Math.cos(w)) / a0, a2: (1 - al) / a0 }
  }
  for (let s = 0; s < speakers; s++) {
    const female = Math.random() < 0.4
    const f0base = female ? rand(190, 240) : rand(100, 135)
    let phase = 0
    let syl = 0
    let sylLen = 0
    let talking = Math.random() < 0.6
    let segLeft = Math.floor(sr * rand(0.5, 3))
    let v = pick(vowels)
    let f1 = v[0]
    let f2 = v[1]
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0, z1 = 0, z2 = 0, w1 = 0, w2 = 0
    let env = 0
    let A = bp(f1, 6)
    let B = bp(f2, 8)
    const gain = rand(0.5, 1)
    for (let i = 0; i < n + X; i++) {
      if (--segLeft <= 0) {
        talking = !talking
        segLeft = Math.floor(sr * (talking ? rand(1.2, 4) : rand(0.4, 2.5)))
      }
      if (syl <= 0) {
        sylLen = Math.floor(sr * rand(0.11, 0.26))
        syl = sylLen
        v = pick(vowels)
      }
      syl--
      f1 += (v[0] - f1) * 0.002
      f2 += (v[1] - f2) * 0.002
      const sylT = 1 - syl / sylLen
      const target = talking ? Math.sin(Math.PI * sylT) : 0
      env += (target - env) * 0.004
      const f0 = f0base * (1 + 0.08 * Math.sin(i / sr * 1.7 + s) + 0.03 * Math.sin(i / sr * 5.3))
      phase += f0 / sr
      let src = 0
      if (phase >= 1) {
        phase -= 1
        src = 1
      }
      src += (Math.random() * 2 - 1) * 0.05
      // 每 64 個取樣更新一次濾波係數就夠了
      if ((i & 63) === 0) {
        A = bp(f1, 6)
        B = bp(f2, 8)
      }
      const a = A.b0 * src + A.b2 * x2 - A.a1 * y1 - A.a2 * y2
      x2 = x1; x1 = src; y2 = y1; y1 = a
      const b = B.b0 * src + B.b2 * w2 - B.a1 * z1 - B.a2 * z2
      w2 = w1; w1 = src; z2 = z1; z1 = b
      tmp[i] += (a + b * 0.6) * env * gain
    }
  }
  const buf = ctx.createBuffer(1, n, sr)
  const out = buf.getChannelData(0)
  let peak = 0
  for (let i = 0; i < n; i++) {
    out[i] = i < X ? tmp[i] * (i / X) + tmp[n + i] * (1 - i / X) : tmp[i]
    peak = Math.max(peak, Math.abs(out[i]))
  }
  if (peak > 0) for (let i = 0; i < n; i++) out[i] /= peak
  return buf
}
