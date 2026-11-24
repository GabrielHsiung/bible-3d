import * as THREE from 'three'
import { mulberry } from './rng'

/**
 * 用 canvas 畫的圖案貼圖（門簾、幔子、天花板的繡紋）。
 * 織物的凹凸與粗糙度另外用 pbr.ts 的 linenMaps（法線＋ORM）疊上去。
 */
const cache = new Map<string, THREE.Texture>()

function canvasTex(key: string, w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, repeat?: [number, number]) {
  const k = key + (repeat ? repeat.join('x') : '')
  const hit = cache.get(k)
  if (hit) return hit
  const base = cache.get(key + '#base')
  let t: THREE.Texture
  if (base) {
    t = base.clone()
  } else {
    const c = document.createElement('canvas')
    c.width = w
    c.height = h
    draw(c.getContext('2d')!)
    t = new THREE.CanvasTexture(c)
    t.colorSpace = THREE.SRGBColorSpace
    t.anisotropy = 8
    cache.set(key + '#base', t)
  }
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping
    t.repeat.set(repeat[0], repeat[1])
  }
  cache.set(k, t)
  return t
}

function noise(g: CanvasRenderingContext2D, w: number, h: number, base: string, spread: number, n: number, seed = 1) {
  const rnd = mulberry(seed)
  g.fillStyle = base
  g.fillRect(0, 0, w, h)
  for (let i = 0; i < n; i++) {
    const v = (rnd() - 0.5) * spread
    g.fillStyle = v > 0 ? `rgba(255,255,255,${v})` : `rgba(60,40,20,${-v})`
    const s = 1 + rnd() * 3
    g.fillRect(rnd() * w, rnd() * h, s, s)
  }
}

/** 織紋：細的經緯線明暗，讓色塊看起來是「織」出來的，不是印的 */
function threads(g: CanvasRenderingContext2D, w: number, h: number, seed: number, strength = 1) {
  const rnd = mulberry(seed)
  for (let x = 0; x < w; x += 2) {
    const v = (rnd() - 0.5) * 0.16 * strength
    g.fillStyle = v > 0 ? `rgba(255,250,235,${v})` : `rgba(30,20,10,${-v})`
    g.fillRect(x, 0, 1, h)
  }
  for (let y = 0; y < h; y += 2) {
    const v = (rnd() - 0.5) * 0.12 * strength
    g.fillStyle = v > 0 ? `rgba(255,250,235,${v})` : `rgba(30,20,10,${-v})`
    g.fillRect(0, y, w, 1)
  }
  // 粗節與起毛
  for (let i = 0; i < (w * h) / 60; i++) {
    const v = (rnd() - 0.5) * 0.25 * strength
    g.fillStyle = v > 0 ? `rgba(255,250,235,${v})` : `rgba(30,20,10,${-v})`
    const horiz = rnd() < 0.5
    g.fillRect(rnd() * w, rnd() * h, horiz ? 3 + rnd() * 8 : 1, horiz ? 1 : 3 + rnd() * 8)
  }
}

// 古代染料：藍（靛藍／骨螺藍）、紫（骨螺紫）、朱紅（胭脂蟲），不要太鮮豔
const BLUE = '#2a3f78'
const PURPLE = '#5a2a5c'
const SCARLET = '#a2282a'
const LINEN = '#e6dcc4'
const DYES = [BLUE, PURPLE, SCARLET]

/** 繡花帶：小菱形、山形紋交替（花紋為推測） */
function band(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, seed: number) {
  const rnd = mulberry(seed)
  g.fillStyle = LINEN
  g.fillRect(x, y, w, h)
  const step = h * 0.9
  for (let i = 0; i * step < w + step; i++) {
    const cx = x + i * step + step / 2
    const cy = y + h / 2
    g.fillStyle = DYES[i % 3]
    g.beginPath()
    g.moveTo(cx, cy - h * 0.36)
    g.lineTo(cx + step * 0.36, cy)
    g.lineTo(cx, cy + h * 0.36)
    g.lineTo(cx - step * 0.36, cy)
    g.closePath()
    g.fill()
    g.fillStyle = LINEN
    g.fillRect(cx - 1.5, cy - 1.5, 3, 3)
    if (rnd() < 0.5) {
      g.fillStyle = DYES[(i + 1) % 3]
      g.fillRect(cx + step * 0.42, cy - 1, step * 0.16, 2)
    }
  }
  g.fillStyle = SCARLET
  g.fillRect(x, y, w, 2)
  g.fillRect(x, y + h - 2, w, 2)
}

/** 石榴與花苞（裝飾用；經文只說「繡花」，紋樣為推測） */
function pomegranate(g: CanvasRenderingContext2D, cx: number, cy: number, r: number, col: string) {
  g.fillStyle = col
  g.beginPath()
  g.ellipse(cx, cy, r * 0.8, r, 0, 0, Math.PI * 2)
  g.fill()
  g.beginPath()
  g.moveTo(cx - r * 0.35, cy - r * 0.8)
  g.lineTo(cx - r * 0.45, cy - r * 1.35)
  g.lineTo(cx - r * 0.15, cy - r * 1.1)
  g.lineTo(cx, cy - r * 1.45)
  g.lineTo(cx + r * 0.15, cy - r * 1.1)
  g.lineTo(cx + r * 0.45, cy - r * 1.35)
  g.lineTo(cx + r * 0.35, cy - r * 0.8)
  g.fill()
  g.fillStyle = 'rgba(255,240,220,0.35)'
  g.beginPath()
  g.ellipse(cx - r * 0.25, cy - r * 0.2, r * 0.18, r * 0.3, -0.4, 0, Math.PI * 2)
  g.fill()
}

/** 基路伯（展翅的人形；造型為推測，經文只說「巧匠的手工繡上基路伯」） */
function cherub(g: CanvasRenderingContext2D, cx: number, cy: number, s: number, body: string, line: string) {
  g.save()
  g.translate(cx, cy)
  g.scale(s, s)
  g.lineJoin = 'round'
  // 翅膀：兩對，上面一對高舉，下面一對垂下遮身
  for (const sd of [-1, 1]) {
    g.fillStyle = body
    g.beginPath()
    g.moveTo(sd * 6, -18)
    g.bezierCurveTo(sd * 30, -60, sd * 70, -66, sd * 96, -48)
    g.bezierCurveTo(sd * 80, -40, sd * 74, -30, sd * 82, -22)
    g.bezierCurveTo(sd * 60, -24, sd * 40, -14, sd * 10, -2)
    g.closePath()
    g.fill()
    g.strokeStyle = line
    g.lineWidth = 2.2
    g.stroke()
    // 羽毛
    g.lineWidth = 1.4
    for (let k = 0; k < 7; k++) {
      const t = k / 7
      g.beginPath()
      g.moveTo(sd * (14 + t * 60), -16 - t * 30)
      g.lineTo(sd * (20 + t * 66), -6 - t * 22)
      g.stroke()
    }
    g.fillStyle = body
    g.beginPath()
    g.moveTo(sd * 8, 4)
    g.bezierCurveTo(sd * 30, 10, sd * 40, 40, sd * 30, 70)
    g.bezierCurveTo(sd * 22, 56, sd * 14, 40, sd * 6, 30)
    g.closePath()
    g.fill()
    g.lineWidth = 2
    g.stroke()
  }
  // 身體與頭
  g.fillStyle = body
  g.beginPath()
  g.moveTo(-9, -12)
  g.lineTo(9, -12)
  g.lineTo(13, 64)
  g.lineTo(-13, 64)
  g.closePath()
  g.fill()
  g.strokeStyle = line
  g.lineWidth = 2
  g.stroke()
  g.beginPath()
  g.arc(0, -24, 10, 0, Math.PI * 2)
  g.fill()
  g.stroke()
  g.lineWidth = 1.2
  for (let y = 4; y < 60; y += 9) {
    g.beginPath()
    g.moveTo(-10, y)
    g.lineTo(10, y + 3)
    g.stroke()
  }
  g.restore()
}

/**
 * 藍色、紫色、朱紅色線和撚的細麻繡成的門簾（院門、帳幕門）／幔子。
 * gate：寬 20 肘 × 高 5 肘；door：10 × 10 肘；veil：10 × 10 肘（有基路伯）。
 */
export const wovenTex = (kind: 'gate' | 'door' | 'veil', rx = 1) => {
  const [W, H] = kind === 'gate' ? [1024, 256] : [1024, 1024]
  return canvasTex(
    'woven-' + kind,
    W,
    H,
    (g) => {
      g.fillStyle = LINEN
      g.fillRect(0, 0, W, H)
      if (kind !== 'veil') {
        // 直條：藍、細麻、紫、細麻、朱紅、細麻……（排列為推測）
        const n = kind === 'gate' ? 16 : 12
        const pw = W / n
        for (let i = 0; i < n; i++) {
          const x = i * pw
          const col = i % 2 ? LINEN : DYES[(i >> 1) % 3]
          g.fillStyle = col
          g.fillRect(x, 0, pw, H)
          // 色條兩旁的細滾邊
          if (i % 2 === 0) {
            g.fillStyle = DYES[((i >> 1) + 1) % 3]
            g.fillRect(x, 0, 3, H)
            g.fillRect(x + pw - 3, 0, 3, H)
          } else {
            // 細麻條上繡一串石榴（推測）
            const r = Math.min(pw * 0.22, 11)
            for (let y = H * 0.2; y < H * 0.86; y += r * 4.2) pomegranate(g, x + pw / 2, y + r * 1.5, r, DYES[(i + ((y / 30) | 0)) % 3])
          }
        }
        // 上下繡花帶
        const bh = kind === 'gate' ? 22 : 40
        band(g, 0, 8, W, bh, 3)
        band(g, 0, H - bh - 14, W, bh, 4)
        // 下緣流蘇
        const rnd = mulberry(9)
        for (let x = 0; x < W; x += 3) {
          g.fillStyle = DYES[(x / 9) % 3 | 0]
          g.fillRect(x, H - 12, 2, 8 + rnd() * 4)
        }
      } else {
        // 幔子：藍底，三色條紋框，基路伯（排列為推測）
        g.fillStyle = BLUE
        g.fillRect(0, 0, W, H)
        const rnd = mulberry(5)
        for (let i = 0; i < 400; i++) {
          g.fillStyle = `rgba(${rnd() < 0.5 ? '20,25,60' : '70,90,150'},${0.1 + rnd() * 0.15})`
          g.fillRect(rnd() * W, 0, 1 + rnd() * 3, H)
        }
        for (let i = 0; i < 4; i++) {
          const c = [SCARLET, PURPLE, LINEN, SCARLET][i]
          g.fillStyle = c
          g.fillRect(0, 14 + i * 14, W, 8)
          g.fillRect(0, H - 22 - i * 14, W, 8)
          g.fillRect(14 + i * 14, 0, 8, H)
          g.fillRect(W - 22 - i * 14, 0, 8, H)
        }
        // 中間的直條紋
        for (let x = 256; x < W - 100; x += 256) {
          g.fillStyle = PURPLE
          g.fillRect(x - 10, 70, 20, H - 140)
          g.fillStyle = SCARLET
          g.fillRect(x - 3, 70, 6, H - 140)
        }
        for (const [cx, cy] of [
          [128, 300],
          [384, 300],
          [640, 300],
          [896, 300],
          [128, 720],
          [384, 720],
          [640, 720],
          [896, 720],
        ])
          cherub(g, cx, cy, 1.05, '#ddd0b0', SCARLET)
        band(g, 70, H / 2 - 18, W - 140, 36, 7)
      }
      threads(g, W, H, kind.length * 7, kind === 'veil' ? 1.4 : 1)
    },
    [rx, 1],
  )
}

/**
 * 內層幕幔：細麻繡基路伯（天花板）。
 * 每幅寬 4 肘，沿南北方向橫跨帳幕。貼圖寬 = 2 幅（8 肘），高 = 10 肘。
 * u 沿東西向（帳幕長邊），v 沿南北向。
 */
export const ceilingTex = (repeatX = 3.75) =>
  canvasTex(
    'ceiling',
    1024,
    640,
    (g) => {
      const W = 1024
      const H = 640
      g.fillStyle = '#22336e'
      g.fillRect(0, 0, W, H)
      const rnd = mulberry(13)
      for (let i = 0; i < 500; i++) {
        g.fillStyle = `rgba(${rnd() < 0.5 ? '10,15,45' : '60,80,140'},${0.08 + rnd() * 0.12})`
        g.fillRect(rnd() * W, 0, 1 + rnd() * 3, H)
      }
      for (let s = 0; s < 2; s++) {
        const x0 = s * 512
        // 幅的兩邊：朱紅與紫色滾邊、接縫的藍色鈕扣（出 26:4-5）
        for (const [off, c, w] of [
          [0, SCARLET, 10],
          [12, PURPLE, 8],
          [22, LINEN, 4],
          [512 - 10, SCARLET, 10],
          [512 - 20, PURPLE, 8],
          [512 - 26, LINEN, 4],
        ] as [number, string, number][]) {
          g.fillStyle = c
          g.fillRect(x0 + off, 0, w, H)
        }
        g.fillStyle = '#1a2a66'
        for (let y = 6; y < H; y += 26) {
          g.beginPath()
          g.ellipse(x0 + 3, y, 3, 6, 0, 0, Math.PI * 2)
          g.fill()
        }
        // 基路伯：每幅三個，朝向交錯
        for (let k = 0; k < 3; k++) {
          const cy = 110 + k * 210
          cherub(g, x0 + 256, cy, 0.95, k % 2 ? '#d9c79a' : '#e2d4b2', k % 2 ? PURPLE : SCARLET)
        }
        // 基路伯之間的花飾
        for (let k = 0; k < 4; k++) {
          const cy = 5 + k * 210
          for (const dx of [-120, 0, 120]) {
            g.fillStyle = DYES[(k + dx / 120 + 3) % 3]
            g.beginPath()
            for (let p = 0; p < 8; p++) {
              const a = (p / 8) * Math.PI * 2
              g.ellipse(x0 + 256 + dx + Math.cos(a) * 9, cy + Math.sin(a) * 9, 6, 3, a, 0, Math.PI * 2)
            }
            g.fill()
          }
        }
      }
      threads(g, W, H, 17, 1.3)
    },
    [repeatX, 1],
  )

/* ---------- 以下為舊版的簡易貼圖（保留相容） ---------- */

/** 沙地 */
export const sandTex = (repeat: number) =>
  canvasTex('sand', 256, 256, (g) => noise(g, 256, 256, '#b8956a', 0.2, 6000), [repeat, repeat])

/** 撚的細麻（白色帷子） */
export const linenTex = (rx: number, ry: number) =>
  canvasTex('linen', 256, 256, (g) => {
    noise(g, 256, 256, '#efe9da', 0.1, 6000)
    threads(g, 256, 256, 3)
  }, [rx, ry])

/** 包金的皂莢木豎板（舊版；新版豎板用 goldMaps） */
export const boardsTex = (rx: number) =>
  canvasTex('boards', 64, 64, (g) => {
    g.fillStyle = '#e0b14e'
    g.fillRect(0, 0, 64, 64)
  }, [rx, 1])

/** 海狗皮外罩（舊版） */
export const hideTex = (rx: number, ry: number) => canvasTex('hide', 128, 128, (g) => noise(g, 128, 128, '#5b4a3c', 0.22, 3000), [rx, ry])

/** 山羊毛帳棚（舊版） */
export const goatHairTex = () => canvasTex('goat', 128, 128, (g) => noise(g, 128, 128, '#3b3029', 0.25, 3000))
