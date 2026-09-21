import type { Cloth } from './types'

const TAU = Math.PI * 2
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))

type SceneHooks = {
  canvas: HTMLCanvasElement
  onSeek?: (info: { phase: 'start' | 'move' | 'end'; fraction: number }) => void
  onSwipe?: (dir: -1 | 1) => void
}

export function createScene(hooks: SceneHooks) {
  const canvas = hooks.canvas
  const ctx = canvas.getContext('2d', { alpha: false })!
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)')

  const state = {
    cloth: null as Cloth | null,
    progress: 0,
    playing: false,
    spin: 0,
    scrubbing: false,
    hoverRing: false,
    figures: 36,
  }

  let W = 0
  let H = 0
  let R = 0
  let CX = 0
  let CY = 0
  let dpr = 1
  let last = performance.now()

  const resize = () => {
    dpr = Math.min(window.devicePixelRatio || 1, 2)
    const rect = canvas.getBoundingClientRect()
    W = Math.max(1, Math.floor(rect.width))
    H = Math.max(1, Math.floor(rect.height))
    canvas.width = Math.floor(W * dpr)
    canvas.height = Math.floor(H * dpr)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    CX = W / 2
    CY = H * 0.48
    R = Math.min(W, H) * 0.34
    state.figures = clamp(Math.round(R / 7), 24, 56)
  }

  const ringHit = (x: number, y: number) => {
    const dx = x - CX
    const dy = y - CY
    const dist = Math.hypot(dx, dy)
    return Math.abs(dist - R) < 28
  }

  const fractionAt = (x: number, y: number) => {
    let a = Math.atan2(y - CY, x - CX) + Math.PI / 2
    if (a < 0) a += TAU
    return clamp(a / TAU, 0, 1)
  }

  let pointerId: number | null = null
  let dragMode: 'seek' | 'swipe' | null = null
  let startX = 0

  canvas.addEventListener('pointerdown', (e) => {
    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    pointerId = e.pointerId
    canvas.setPointerCapture(e.pointerId)
    startX = x
    if (ringHit(x, y)) {
      dragMode = 'seek'
      state.scrubbing = true
      const f = fractionAt(x, y)
      state.progress = f
      hooks.onSeek?.({ phase: 'start', fraction: f })
    } else {
      dragMode = 'swipe'
    }
  })

  canvas.addEventListener('pointermove', (e) => {
    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    state.hoverRing = ringHit(x, y)
    if (pointerId !== e.pointerId) return
    if (dragMode === 'seek') {
      const f = fractionAt(x, y)
      state.progress = f
      hooks.onSeek?.({ phase: 'move', fraction: f })
    }
  })

  const endPointer = (e: PointerEvent) => {
    if (pointerId !== e.pointerId) return
    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    if (dragMode === 'seek') {
      const f = fractionAt(x, y)
      state.progress = f
      hooks.onSeek?.({ phase: 'end', fraction: f })
      state.scrubbing = false
    } else if (dragMode === 'swipe') {
      const dx = x - startX
      if (Math.abs(dx) > 60) hooks.onSwipe?.(dx < 0 ? 1 : -1)
    }
    dragMode = null
    pointerId = null
  }

  canvas.addEventListener('pointerup', endPointer)
  canvas.addEventListener('pointercancel', endPointer)

  const drawFigure = (x: number, y: number, rot: number, color: string, scale: number) => {
    ctx.save()
    ctx.translate(x, y)
    ctx.rotate(rot)
    ctx.scale(scale, scale)
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.ellipse(0, 10, 7, 14, 0, 0, TAU)
    ctx.fill()
    ctx.beginPath()
    ctx.arc(0, -6, 4.2, 0, TAU)
    ctx.fill()
    ctx.strokeStyle = color
    ctx.lineWidth = 2
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(-10, 2)
    ctx.quadraticCurveTo(-14, -8, -6, -12)
    ctx.moveTo(10, 2)
    ctx.quadraticCurveTo(14, -8, 6, -12)
    ctx.stroke()
    ctx.restore()
  }

  const frame = (now: number) => {
    requestAnimationFrame(frame)
    const dt = Math.min(0.05, (now - last) / 1000)
    last = now
    const cloth = state.cloth
    if (!cloth) return

    const p = cloth.palette
    if (!reduced.matches && state.playing) {
      state.spin += dt * ((cloth.bpm / 60) * 0.55)
    }

    const g = ctx.createRadialGradient(CX, CY, R * 0.1, CX, CY, Math.max(W, H) * 0.75)
    g.addColorStop(0, p.ground)
    g.addColorStop(1, p.groundDeep)
    ctx.fillStyle = g
    ctx.fillRect(0, 0, W, H)

    // soft cloth grain
    ctx.fillStyle = p.ink
    ctx.globalAlpha = cloth.ground === 'light' ? 0.03 : 0.05
    for (let i = 0; i < 40; i++) {
      const a = (i / 40) * TAU + state.spin * 0.2
      ctx.beginPath()
      ctx.arc(CX + Math.cos(a) * R * 0.55, CY + Math.sin(a) * R * 0.55, 18, 0, TAU)
      ctx.fill()
    }
    ctx.globalAlpha = 1

    // progress ring track
    ctx.beginPath()
    ctx.arc(CX, CY, R, 0, TAU)
    ctx.strokeStyle = p.ring
    ctx.globalAlpha = 0.28
    ctx.lineWidth = state.hoverRing || state.scrubbing ? 8 : 5
    ctx.stroke()
    ctx.globalAlpha = 1

    // progress arc
    ctx.beginPath()
    ctx.arc(CX, CY, R, -Math.PI / 2, -Math.PI / 2 + state.progress * TAU)
    ctx.strokeStyle = p.progress
    ctx.lineWidth = state.hoverRing || state.scrubbing ? 8 : 5
    ctx.lineCap = 'round'
    ctx.stroke()

    // dancers
    const n = state.figures
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + state.spin
      const bob = state.playing && !reduced.matches ? Math.sin(now / 180 + i) * 3 : 0
      const x = CX + Math.cos(a) * (R * 0.72)
      const y = CY + Math.sin(a) * (R * 0.72) + bob
      const color = p.figure[i % p.figure.length]
      drawFigure(x, y, a + Math.PI / 2, color, R / 120)
    }

    // center garbo / lamp
    ctx.beginPath()
    ctx.ellipse(CX, CY + 10, 14, 18, 0, 0, TAU)
    ctx.fillStyle = p.pot
    ctx.fill()
    ctx.beginPath()
    ctx.ellipse(CX, CY - 2, 16, 5, 0, 0, TAU)
    ctx.fillStyle = p.accent
    ctx.fill()
    const flame = ctx.createRadialGradient(CX, CY - 18, 1, CX, CY - 16, 16)
    flame.addColorStop(0, p.flameHot)
    flame.addColorStop(1, p.flame)
    ctx.beginPath()
    ctx.moveTo(CX, CY - 28)
    ctx.quadraticCurveTo(CX + 8, CY - 14, CX, CY - 6)
    ctx.quadraticCurveTo(CX - 8, CY - 14, CX, CY - 28)
    ctx.fillStyle = flame
    ctx.globalAlpha = state.playing ? 0.95 : 0.55
    ctx.fill()
    ctx.globalAlpha = 1
  }

  window.addEventListener('resize', resize)
  resize()
  requestAnimationFrame(frame)

  return {
    setCloth(cloth: Cloth) {
      state.cloth = cloth
      document.documentElement.dataset.ground = cloth.ground
      document.documentElement.style.setProperty('--ground', cloth.palette.ground)
      document.documentElement.style.setProperty('--ground-deep', cloth.palette.groundDeep)
      document.documentElement.style.setProperty('--ink', cloth.palette.ink)
      document.documentElement.style.setProperty('--accent', cloth.palette.accent)
      document.documentElement.style.setProperty('--chip-bg', cloth.palette.chipBg)
      document.documentElement.style.setProperty('--chip-ink', cloth.palette.chipInk)
    },
    setProgress(fraction: number) {
      if (!state.scrubbing) state.progress = clamp(fraction, 0, 1)
    },
    setPlaying(on: boolean) {
      state.playing = on
    },
    resize,
  }
}

export type Scene = ReturnType<typeof createScene>
