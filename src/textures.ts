import * as THREE from 'three'

const cache = new Map<string, THREE.Texture>()

function canvasTex(key: string, w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, repeat?: [number, number]) {
  const k = key + (repeat ? repeat.join('x') : '')
  const hit = cache.get(k)
  if (hit) return hit
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  draw(c.getContext('2d')!)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping
    t.repeat.set(repeat[0], repeat[1])
  }
  cache.set(k, t)
  return t
}

function noise(g: CanvasRenderingContext2D, w: number, h: number, base: string, spread: number, n: number) {
  g.fillStyle = base
  g.fillRect(0, 0, w, h)
  for (let i = 0; i < n; i++) {
    const v = (Math.random() - 0.5) * spread
    g.fillStyle = v > 0 ? `rgba(255,255,255,${v})` : `rgba(60,40,20,${-v})`
    const s = 1 + Math.random() * 3
    g.fillRect(Math.random() * w, Math.random() * h, s, s)
  }
}

/** 沙地 */
export const sandTex = (repeat: number) =>
  canvasTex('sand', 512, 512, (g) => {
    noise(g, 512, 512, '#b8956a', 0.2, 26000)
    for (let i = 0; i < 40; i++) {
      g.strokeStyle = 'rgba(150,115,70,0.10)'
      g.lineWidth = 2
      g.beginPath()
      const y = Math.random() * 512
      g.moveTo(0, y)
      g.bezierCurveTo(170, y + 20, 340, y - 20, 512, y + 6)
      g.stroke()
    }
  }, [repeat, repeat])

/** 撚的細麻（白色帷子） */
export const linenTex = (rx: number, ry: number) =>
  canvasTex('linen', 256, 256, (g) => {
    noise(g, 256, 256, '#efe9da', 0.1, 6000)
    g.strokeStyle = 'rgba(120,100,70,0.08)'
    for (let x = 0; x < 256; x += 3) {
      g.beginPath()
      g.moveTo(x, 0)
      g.lineTo(x, 256)
      g.stroke()
    }
    // 垂墜的皺褶
    for (let x = 0; x < 256; x += 32) {
      const grd = g.createLinearGradient(x, 0, x + 32, 0)
      grd.addColorStop(0, 'rgba(0,0,0,0.10)')
      grd.addColorStop(0.5, 'rgba(255,255,255,0.06)')
      grd.addColorStop(1, 'rgba(0,0,0,0.10)')
      g.fillStyle = grd
      g.fillRect(x, 0, 32, 256)
    }
  }, [rx, ry])

/** 藍色、紫色、朱紅色線和細麻繡成的門簾／幔子 */
export const wovenTex = (kind: 'gate' | 'veil', rx = 1) =>
  canvasTex('woven-' + kind, 512, 512, (g) => {
    noise(g, 512, 512, '#e9e2cf', 0.08, 5000)
    const cols = ['#1d3a8a', '#5a2675', '#a8222d', '#e9e2cf']
    if (kind === 'gate') {
      // 直條繡紋
      for (let i = 0; i < 16; i++) {
        g.fillStyle = cols[i % 4]
        g.fillRect(i * 32, 0, 32, 512)
      }
      g.globalAlpha = 0.55
      for (let y = 20; y < 512; y += 60) {
        for (let x = 0; x < 512; x += 32) {
          g.fillStyle = '#e9e2cf'
          g.beginPath()
          g.moveTo(x + 16, y)
          g.lineTo(x + 26, y + 14)
          g.lineTo(x + 16, y + 28)
          g.lineTo(x + 6, y + 14)
          g.fill()
        }
      }
      g.globalAlpha = 1
    } else {
      // 幔子：深色底，繡上基路伯（以展翅的金色圖樣象徵）
      g.fillStyle = '#2a1f5e'
      g.fillRect(0, 0, 512, 512)
      for (let i = 0; i < 4; i++) {
        g.fillStyle = cols[i]
        g.fillRect(0, i * 10, 512, 6)
        g.fillRect(0, 512 - i * 10 - 6, 512, 6)
      }
      g.strokeStyle = '#d9b04a'
      g.fillStyle = 'rgba(217,176,74,0.85)'
      g.lineWidth = 3
      for (const [cx, cy] of [[128, 180], [384, 180], [128, 380], [384, 380]]) {
        g.beginPath()
        g.ellipse(cx, cy, 14, 22, 0, 0, Math.PI * 2)
        g.fill()
        for (const s of [-1, 1]) {
          g.beginPath()
          g.moveTo(cx + s * 10, cy - 8)
          g.quadraticCurveTo(cx + s * 70, cy - 70, cx + s * 90, cy - 10)
          g.quadraticCurveTo(cx + s * 60, cy - 20, cx + s * 12, cy + 10)
          g.closePath()
          g.fill()
          g.stroke()
        }
      }
      g.fillStyle = 'rgba(168,34,45,0.5)'
      for (let x = 0; x < 512; x += 24) g.fillRect(x, 270, 12, 6)
    }
  }, [rx, 1])

/** 包金的皂莢木豎板 */
export const boardsTex = (rx: number) =>
  canvasTex('boards', 256, 256, (g) => {
    const grd = g.createLinearGradient(0, 0, 256, 0)
    grd.addColorStop(0, '#b8862c')
    grd.addColorStop(0.5, '#f1cd6a')
    grd.addColorStop(1, '#b8862c')
    g.fillStyle = grd
    g.fillRect(0, 0, 256, 256)
    g.fillStyle = 'rgba(90,60,10,0.6)'
    g.fillRect(0, 0, 4, 256)
    g.fillRect(252, 0, 4, 256)
    g.fillStyle = 'rgba(90,60,10,0.35)'
    for (const y of [50, 128, 206]) g.fillRect(0, y, 256, 5) // 橫閂
  }, [rx, 1])

/** 海狗皮外罩 */
export const hideTex = (rx: number, ry: number) =>
  canvasTex('hide', 256, 256, (g) => {
    noise(g, 256, 256, '#5b4a3c', 0.22, 9000)
    g.strokeStyle = 'rgba(30,20,10,0.35)'
    for (let x = 0; x < 256; x += 64) {
      g.beginPath()
      g.moveTo(x, 0)
      g.lineTo(x, 256)
      g.stroke()
    }
  }, [rx, ry])

/** 內層幕幔：細麻繡基路伯（天花板） */
export const ceilingTex = () =>
  canvasTex('ceiling', 512, 256, (g) => {
    g.fillStyle = '#1d2f6e'
    g.fillRect(0, 0, 512, 256)
    for (let x = 0; x < 512; x += 64) {
      g.fillStyle = x % 128 ? '#5a2675' : '#a8222d'
      g.fillRect(x, 0, 6, 256)
    }
    g.fillStyle = 'rgba(217,176,74,0.8)'
    for (let x = 32; x < 512; x += 128)
      for (let y = 64; y < 256; y += 128) {
        g.beginPath()
        g.moveTo(x, y)
        g.quadraticCurveTo(x - 40, y - 40, x - 50, y + 5)
        g.quadraticCurveTo(x - 20, y, x, y + 15)
        g.quadraticCurveTo(x + 20, y, x + 50, y + 5)
        g.quadraticCurveTo(x + 40, y - 40, x, y)
        g.fill()
      }
  }, [3, 1])

/** 山羊毛帳棚（營地） */
export const goatHairTex = () =>
  canvasTex('goat', 128, 128, (g) => {
    noise(g, 128, 128, '#3b3029', 0.25, 3000)
    g.strokeStyle = 'rgba(200,180,150,0.15)'
    for (let y = 0; y < 128; y += 16) {
      g.beginPath()
      g.moveTo(0, y)
      g.lineTo(128, y)
      g.stroke()
    }
  })
