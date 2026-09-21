export function $(id: string): HTMLElement {
  const el = document.getElementById(id)
  if (!el) throw new Error(`#${id} missing`)
  return el
}

export function fmt(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '-:-'
  const s = Math.floor(seconds)
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${m}:${r.toString().padStart(2, '0')}`
}

export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export function watchUrl(id: string): string {
  return `https://www.youtube.com/watch?v=${id}`
}

export function roomCode(len = 4): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let out = ''
  for (let i = 0; i < len; i++) out += alphabet[(Math.random() * alphabet.length) | 0]
  return out
}

export function partyWsUrl(): string {
  const env = import.meta.env.VITE_PARTY_URL
  if (env) return env
  const proto = location.protocol === 'https:' ? 'wss' : 'ws'
  const host = location.hostname || 'localhost'
  return `${proto}://${host}:8787`
}

export function parseRoute(): {
  mode: 'floor' | 'party' | 'remote'
  room?: string
  cloth?: string | null
  video?: string | null
} {
  const path = location.pathname.replace(/\/+$/, '') || '/'
  const q = new URLSearchParams(location.search)

  const remote = path.match(/^\/r\/([A-Za-z0-9]+)$/i)
  if (remote) return { mode: 'remote', room: remote[1].toUpperCase() }

  if (path === '/party' || q.get('mode') === 'party') {
    return {
      mode: 'party',
      room: (q.get('room') || undefined)?.toUpperCase(),
      cloth: q.get('c'),
      video: q.get('v'),
    }
  }

  return {
    mode: 'floor',
    cloth: q.get('c'),
    video: q.get('v'),
  }
}

export function shareUrl(opts: {
  cloth?: string
  video?: string
  partyRoom?: string
  remoteRoom?: string
}): string {
  if (opts.remoteRoom) return `${location.origin}/r/${opts.remoteRoom}`
  if (opts.partyRoom) {
    const u = new URL(`${location.origin}/party`)
    u.searchParams.set('room', opts.partyRoom)
    return u.toString()
  }
  const u = new URL(`${location.origin}/`)
  if (opts.cloth) u.searchParams.set('c', opts.cloth)
  if (opts.video) u.searchParams.set('v', opts.video)
  return u.toString()
}
