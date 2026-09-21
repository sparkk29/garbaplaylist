let ctx: AudioContext | null = null

function ensure(): AudioContext | null {
  try {
    ctx = ctx || new AudioContext()
    if (ctx.state === 'suspended') void ctx.resume()
    return ctx
  } catch {
    return null
  }
}

export function primeAudio() {
  const unlock = () => ensure()
  ;['pointerdown', 'keydown'].forEach((evt) =>
    document.addEventListener(evt, unlock, { once: true, capture: true }),
  )
}

export function tap(kind: 'dhol' | 'manjira' = 'dhol', gain = 0.35) {
  const c = ensure()
  if (!c) return
  const t0 = c.currentTime
  const g = c.createGain()
  g.connect(c.destination)

  if (kind === 'manjira') {
    const o = c.createOscillator()
    o.type = 'triangle'
    o.frequency.setValueAtTime(1800, t0)
    o.frequency.exponentialRampToValueAtTime(900, t0 + 0.12)
    g.gain.setValueAtTime(gain, t0)
    g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.18)
    o.connect(g)
    o.start(t0)
    o.stop(t0 + 0.2)
    return
  }

  const o = c.createOscillator()
  const f = c.createBiquadFilter()
  o.type = 'square'
  o.frequency.setValueAtTime(90, t0)
  o.frequency.exponentialRampToValueAtTime(45, t0 + 0.15)
  f.type = 'lowpass'
  f.frequency.value = 400
  g.gain.setValueAtTime(gain, t0)
  g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.22)
  o.connect(f)
  f.connect(g)
  o.start(t0)
  o.stop(t0 + 0.25)
}
