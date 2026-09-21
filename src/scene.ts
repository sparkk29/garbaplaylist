import type { Cloth } from './types'

const TAU = Math.PI * 2
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))

type SceneHooks = {
  canvas: HTMLCanvasElement
  onSeek?: (info: { phase: 'start' | 'move' | 'end'; fraction: number }) => void
  onSwipe?: (dir: -1 | 1) => void
  onJoin?: () => void
}

type Ring = { r: number; count: number; seed: number }

export function createScene(hooks: SceneHooks) {
  const canvas = hooks.canvas
  const ctx = canvas.getContext('2d', { alpha: false })!
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)')

  const state = {
    cloth: null as Cloth | null,
    progress: 0,
    playing: false,
    spin: 0,
    beat: 0,
    scrubbing: false,
    hoverRing: false,
    crowd: 96,
    newcomer: { phase: 'waiting' as 'waiting' | 'joining' | 'in', t0: 0 },
  }

  let W = 0
  let H = 0
  let R = 0
  let CX = 0
  let CY = 0
  let dpr = 1
  let last = performance.now()
  let rings: Ring[] = []
  let weave: CanvasPattern | null = null

  const hash = (n: number) => {
    const x = Math.sin(n * 127.1 + 311.7) * 43758.5453
    return x - Math.floor(x)
  }

  const buildWeave = (cloth: Cloth) => {
    const tile = document.createElement('canvas')
    tile.width = 48
    tile.height = 48
    const g = tile.getContext('2d')!
    g.fillStyle = cloth.palette.ground
    g.fillRect(0, 0, 48, 48)
    g.strokeStyle = cloth.ground === 'light' ? 'rgba(20,16,14,0.055)' : 'rgba(255,255,255,0.05)'
    g.lineWidth = 1
    for (let x = 0; x <= 48; x += 6) {
      g.beginPath()
      g.moveTo(x + 0.5, 0)
      g.lineTo(x + 0.5, 48)
      g.stroke()
    }
    for (let y = 0; y <= 48; y += 6) {
      g.beginPath()
      g.moveTo(0, y + 0.5)
      g.lineTo(48, y + 0.5)
      g.stroke()
    }
    weave = ctx.createPattern(tile, 'repeat')
  }

  const buildRings = () => {
    const inner = R * 0.4
    const outer = R * 0.86
    const n = clamp(Math.round(state.crowd / 28), 2, 4)
    const gap = (outer - inner) / n
    const out: Ring[] = []
    let left = state.crowd
    for (let i = 0; i < n; i++) {
      const r = inner + gap * (i + 0.55)
      const cap = Math.max(6, Math.floor((TAU * r) / (R * 0.135)))
      const count = clamp(Math.round(left / (n - i)), 6, cap)
      left -= count
      out.push({ r, count, seed: i * 131 + 17 })
    }
    rings = out
  }

  const resize = () => {
    dpr = Math.min(window.devicePixelRatio || 1, 2)
    const rect = canvas.getBoundingClientRect()
    W = Math.max(1, Math.floor(rect.width))
    H = Math.max(1, Math.floor(rect.height))
    canvas.width = Math.floor(W * dpr)
    canvas.height = Math.floor(H * dpr)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    const topEl = document.querySelector('.top')
    const dockEl = document.querySelector('.bottom')
    const TOP = topEl ? topEl.getBoundingClientRect().bottom + 8 : 110
    const BOTTOM = dockEl ? H - dockEl.getBoundingClientRect().top + 8 : 140
    const usable = Math.max(220, H - TOP - BOTTOM)
    R = Math.max(48, Math.min(W * 0.42, usable / 2.2))
    CX = W / 2
    CY = TOP + usable / 2
    buildRings()
    if (state.cloth) buildWeave(state.cloth)
  }

  const ringHit = (x: number, y: number) => {
    const dist = Math.hypot(x - CX, y - CY)
    return Math.abs(dist - R) < 28
  }

  const fractionAt = (x: number, y: number) => {
    let a = Math.atan2(y - CY, x - CX) + Math.PI / 2
    if (a < 0) a += TAU
    return clamp(a / TAU, 0, 1)
  }

  const newcomerPos = () => {
    const a = -0.55
    const r = R * 1.02
    return {
      x: CX + Math.cos(a) * r,
      y: CY + Math.sin(a) * r,
      r: R * 0.07,
      a,
    }
  }

  const hitNewcomer = (x: number, y: number) => {
    if (state.newcomer.phase !== 'waiting') return false
    const n = newcomerPos()
    return Math.hypot(x - n.x, y - n.y) < n.r * 2.2
  }

  let pointerId: number | null = null
  let dragMode: 'seek' | 'swipe' | null = null
  let startX = 0

  canvas.addEventListener('pointerdown', (e) => {
    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    if (hitNewcomer(x, y)) {
      state.newcomer = { phase: 'joining', t0: performance.now() }
      hooks.onJoin?.()
      return
    }
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
    canvas.style.cursor = hitNewcomer(x, y)
      ? 'pointer'
      : state.hoverRing
        ? 'ew-resize'
        : 'grab'
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

  /** Folk-art khelaiya: white face, white choli, dyed chaniya + odhani, black arms. */
  const paintFigure = (
    h: number,
    fill: string,
    ink: string,
    bob: number,
    clap: number,
    ground: 'light' | 'dark',
  ) => {
    const flare = 1 + bob * 0.1
    const hem = h * 0.33 * flare
    const waist = h * 0.1
    const yW = -h * 0.5
    const choli = ground === 'dark' ? 'rgba(255,255,255,0.92)' : '#F7F2E8'
    const face = ground === 'dark' ? 'rgba(255,255,255,0.95)' : '#FBF7F0'

    ctx.lineJoin = 'round'
    ctx.strokeStyle = ink
    ctx.lineWidth = Math.max(0.55, h * 0.03)

    // Chaniya
    ctx.beginPath()
    ctx.moveTo(-waist, yW)
    ctx.lineTo(-hem, 0)
    ctx.quadraticCurveTo(0, h * 0.08, hem, 0)
    ctx.lineTo(waist, yW)
    ctx.closePath()
    ctx.fillStyle = fill
    ctx.fill()
    ctx.stroke()

    // White hem band
    ctx.beginPath()
    ctx.moveTo(-hem * 0.88, -h * 0.08)
    ctx.quadraticCurveTo(0, h * 0.01, hem * 0.88, -h * 0.08)
    ctx.strokeStyle = choli
    ctx.lineWidth = Math.max(1, h * 0.055)
    ctx.stroke()
    ctx.strokeStyle = ink
    ctx.lineWidth = Math.max(0.55, h * 0.03)

    // Choli (white blouse)
    ctx.beginPath()
    ctx.moveTo(-waist, yW)
    ctx.lineTo(waist, yW)
    ctx.lineTo(h * 0.09, -h * 0.72)
    ctx.lineTo(-h * 0.09, -h * 0.72)
    ctx.closePath()
    ctx.fillStyle = choli
    ctx.fill()
    ctx.stroke()

    // Arms raised in clap
    const open = 1 - clap
    const hx = h * (0.12 + open * 0.26)
    const hy = -h * (1.02 - open * 0.12)
    ctx.strokeStyle = ink
    ctx.lineCap = 'round'
    ctx.lineWidth = Math.max(1.2, h * 0.07)
    ctx.beginPath()
    ctx.moveTo(-h * 0.08, -h * 0.65)
    ctx.quadraticCurveTo(-hx * 1.25, -h * 0.82, -hx, hy)
    ctx.moveTo(h * 0.08, -h * 0.65)
    ctx.quadraticCurveTo(hx * 1.25, -h * 0.82, hx, hy)
    ctx.stroke()

    // Hands
    ctx.fillStyle = ink
    ctx.beginPath()
    ctx.arc(-hx, hy, h * 0.04, 0, TAU)
    ctx.arc(hx, hy, h * 0.04, 0, TAU)
    ctx.fill()
    ctx.lineCap = 'butt'

    // Face (white) + odhani (skirt colour)
    ctx.lineWidth = Math.max(0.55, h * 0.03)
    ctx.beginPath()
    ctx.arc(0, -h * 0.8, h * 0.095, 0, TAU)
    ctx.fillStyle = face
    ctx.fill()
    ctx.stroke()

    ctx.beginPath()
    ctx.arc(0, -h * 0.8, h * 0.11, Math.PI * 1.05, -0.05)
    ctx.lineTo(0, -h * 0.8)
    ctx.closePath()
    ctx.fillStyle = fill
    ctx.fill()
    ctx.beginPath()
    ctx.arc(0, -h * 0.8, h * 0.11, Math.PI * 1.05, -0.05)
    ctx.stroke()
  }

  const paintGarbo = (p: Cloth['palette'], pulse: number) => {
    const petals = 12
    const r0 = R * 0.08
    const r1 = R * 0.22 * (1 + pulse * 0.04)
    for (let i = 0; i < petals; i++) {
      const a = (i / petals) * TAU - Math.PI / 2 + state.spin * 0.15
      const x0 = CX + Math.cos(a) * r0
      const y0 = CY + Math.sin(a) * r0
      const x1 = CX + Math.cos(a) * r1
      const y1 = CY + Math.sin(a) * r1
      ctx.beginPath()
      ctx.moveTo(x0, y0)
      ctx.quadraticCurveTo(
        CX + Math.cos(a - 0.18) * (r0 + r1) * 0.52,
        CY + Math.sin(a - 0.18) * (r0 + r1) * 0.52,
        x1,
        y1,
      )
      ctx.quadraticCurveTo(
        CX + Math.cos(a + 0.18) * (r0 + r1) * 0.52,
        CY + Math.sin(a + 0.18) * (r0 + r1) * 0.52,
        x0,
        y0,
      )
      ctx.fillStyle = p.accent
      ctx.globalAlpha = 0.35 + (i % 2) * 0.12
      ctx.fill()
    }
    ctx.globalAlpha = 1

    // Pot
    const potR = R * 0.07
    ctx.beginPath()
    ctx.ellipse(CX, CY + potR * 0.15, potR * 1.05, potR * 1.15, 0, 0, TAU)
    ctx.fillStyle = p.pot
    ctx.fill()
    ctx.strokeStyle = p.ink
    ctx.lineWidth = Math.max(1, R * 0.006)
    ctx.stroke()

    // Polka dots on pot
    ctx.fillStyle = p.flame
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU + 0.4
      ctx.beginPath()
      ctx.arc(
        CX + Math.cos(a) * potR * 0.55,
        CY + potR * 0.15 + Math.sin(a) * potR * 0.45,
        potR * 0.12,
        0,
        TAU,
      )
      ctx.fill()
    }

    // Rim
    ctx.beginPath()
    ctx.ellipse(CX, CY - potR * 0.55, potR * 1.15, potR * 0.28, 0, 0, TAU)
    ctx.fillStyle = p.accent
    ctx.fill()

    // Flame
    const flick = state.playing && !reduced.matches ? Math.sin(performance.now() / 120) * 0.08 : 0
    ctx.beginPath()
    ctx.moveTo(CX, CY - potR * 1.9 * (1 + flick))
    ctx.quadraticCurveTo(CX + potR * 0.55, CY - potR * 0.9, CX, CY - potR * 0.35)
    ctx.quadraticCurveTo(CX - potR * 0.55, CY - potR * 0.9, CX, CY - potR * 1.9 * (1 + flick))
    const flame = ctx.createRadialGradient(CX, CY - potR, 1, CX, CY - potR, potR * 1.4)
    flame.addColorStop(0, p.flameHot)
    flame.addColorStop(1, p.flame)
    ctx.fillStyle = flame
    ctx.globalAlpha = state.playing ? 1 : 0.65
    ctx.fill()
    ctx.globalAlpha = 1
  }

  const paintBorder = (p: Cloth['palette']) => {
    // Tick ring (progress track)
    ctx.beginPath()
    ctx.arc(CX, CY, R, 0, TAU)
    ctx.strokeStyle = p.ring
    ctx.globalAlpha = 0.35
    ctx.lineWidth = state.hoverRing || state.scrubbing ? 3.5 : 2
    ctx.stroke()
    ctx.globalAlpha = 1

    // Diamond ornaments around the rim
    const n = 64
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU - Math.PI / 2
      const on = i / n <= state.progress + 0.001
      const colors = [p.progress, p.accent, p.figure[1] || p.accent]
      ctx.save()
      ctx.translate(CX + Math.cos(a) * R, CY + Math.sin(a) * R)
      ctx.rotate(a)
      ctx.beginPath()
      const s = R * 0.018
      ctx.moveTo(0, -s)
      ctx.lineTo(s * 0.7, 0)
      ctx.lineTo(0, s)
      ctx.lineTo(-s * 0.7, 0)
      ctx.closePath()
      ctx.fillStyle = on ? colors[i % colors.length] : p.ring
      ctx.globalAlpha = on ? 0.95 : 0.28
      ctx.fill()
      ctx.restore()
    }
    ctx.globalAlpha = 1
  }

  const frame = (now: number) => {
    requestAnimationFrame(frame)
    const dt = Math.min(0.05, (now - last) / 1000)
    last = now
    const c = state.cloth
    if (!c) return
    const p = c.palette

    if (!reduced.matches) {
      const pace = (c.bpm / 60) * (state.playing ? 1 : 0.12)
      state.spin += dt * pace * 0.42
      state.beat += dt * pace
    }

    // Ground
    ctx.fillStyle = p.groundDeep
    ctx.fillRect(0, 0, W, H)
    if (weave) {
      ctx.fillStyle = weave
      ctx.fillRect(0, 0, W, H)
    } else {
      ctx.fillStyle = p.ground
      ctx.fillRect(0, 0, W, H)
    }

    // Soft vignette toward edges
    const vig = ctx.createRadialGradient(CX, CY, R * 0.2, CX, CY, Math.max(W, H) * 0.7)
    vig.addColorStop(0, 'rgba(0,0,0,0)')
    vig.addColorStop(1, c.ground === 'light' ? 'rgba(40,24,10,0.08)' : 'rgba(0,0,0,0.35)')
    ctx.fillStyle = vig
    ctx.fillRect(0, 0, W, H)

    paintBorder(p)

    const clapPhase = reduced.matches ? 0.35 : (Math.sin(state.beat * Math.PI * 2) + 1) / 2
    const pulse = clapPhase

    // Dancers on rings — feet toward center, facing out
    for (let ri = 0; ri < rings.length; ri++) {
      const ring = rings[ri]
      for (let i = 0; i < ring.count; i++) {
        const a = (i / ring.count) * TAU + state.spin * (R / ring.r) + ring.seed * 0.01
        const bob =
          state.playing && !reduced.matches ? Math.sin(state.beat * TAU + i * 0.7 + ri) * 0.35 : 0
        const clap = clamp(clapPhase * 0.85 + hash(ring.seed + i) * 0.15, 0, 1)
        const x = CX + Math.cos(a) * ring.r
        const y = CY + Math.sin(a) * ring.r
        const h = R * 0.115
        const fill = p.figure[(i + ri) % p.figure.length]
        ctx.save()
        ctx.translate(x, y)
        // Face outward: rotate so local +Y points away from center
        ctx.rotate(a + Math.PI / 2)
        ctx.translate(0, -h * 0.15 + bob * 2)
        const outline = c.ground === 'light' ? p.ink : '#0A0808'
        paintFigure(h, fill, outline, bob, clap, c.ground)
        ctx.restore()
      }
    }

    paintGarbo(p, pulse)

    // Newcomer waiting outside the circle
    if (state.newcomer.phase === 'waiting' || state.newcomer.phase === 'joining') {
      const n = newcomerPos()
      let x = n.x
      let y = n.y
      if (state.newcomer.phase === 'joining') {
        const t = clamp((now - state.newcomer.t0) / 900, 0, 1)
        const ease = 1 - Math.pow(1 - t, 3)
        const targetA = -0.55
        const targetR = rings[rings.length - 1]?.r ?? R * 0.8
        x = CX + Math.cos(targetA) * (R * 1.02 + (targetR - R * 1.02) * ease)
        y = CY + Math.sin(targetA) * (R * 1.02 + (targetR - R * 1.02) * ease)
        if (t >= 1) {
          state.newcomer.phase = 'in'
          state.crowd = Math.min(240, state.crowd + 1)
          buildRings()
        }
      }

      // Gold rings around her
      if (state.newcomer.phase === 'waiting') {
        ctx.beginPath()
        ctx.arc(x, y, n.r * 1.7, 0, TAU)
        ctx.strokeStyle = p.accent
        ctx.globalAlpha = 0.55
        ctx.lineWidth = 1.5
        ctx.stroke()
        ctx.beginPath()
        ctx.arc(x, y, n.r * 2.15, 0, TAU)
        ctx.globalAlpha = 0.28
        ctx.stroke()
        ctx.globalAlpha = 1
      }

      const fill = p.accent
      const h = R * 0.12
      const a = Math.atan2(y - CY, x - CX)
      const outline = c.ground === 'light' ? p.ink : '#0A0808'
      ctx.save()
      ctx.translate(x, y)
      ctx.rotate(a + Math.PI / 2)
      paintFigure(h, fill, outline, 0.2, 0.4, c.ground)
      ctx.restore()
    }
  }

  window.addEventListener('resize', resize)
  resize()
  requestAnimationFrame(frame)

  return {
    setCloth(next: Cloth) {
      state.cloth = next
      buildWeave(next)
      document.documentElement.dataset.ground = next.ground
      document.documentElement.style.setProperty('--ground', next.palette.ground)
      document.documentElement.style.setProperty('--ground-deep', next.palette.groundDeep)
      document.documentElement.style.setProperty('--ink', next.palette.ink)
      document.documentElement.style.setProperty('--accent', next.palette.accent)
      document.documentElement.style.setProperty('--chip-bg', next.palette.chipBg)
      document.documentElement.style.setProperty('--chip-ink', next.palette.chipInk)
    },
    setProgress(fraction: number) {
      if (!state.scrubbing) state.progress = clamp(fraction, 0, 1)
    },
    setPlaying(on: boolean) {
      state.playing = on
    },
    setCrowd(n: number) {
      state.crowd = clamp(n, 24, 240)
      buildRings()
    },
    newcomerHint() {
      if (state.newcomer.phase !== 'waiting') return null
      const n = newcomerPos()
      return { x: n.x, y: n.y, r: n.r * 2.2 }
    },
    resize,
  }
}

export type Scene = ReturnType<typeof createScene>
