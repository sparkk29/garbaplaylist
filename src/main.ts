import './style.css'
import QRCode from 'qrcode'
import { CLOTHS, clothById, isClothId } from './cloths'
import { createPlayer } from './player'
import { createScene } from './scene'
import { tap, primeAudio } from './audio'
import { connectParty } from './party'
import { $, fmt, shuffle, watchUrl, roomCode, parseRoute, shareUrl } from './util'
import { isFavorite, toggleFavorite, pushRecent, setResume } from './storage'
import type { Cloth, ClothId, PartyCommand, Track, TracksFile } from './types'

primeAudio()

const route = parseRoute()

function shell(mode: 'floor' | 'party' | 'remote') {
  const partyBits =
    mode === 'party'
      ? `<aside class="party-panel" id="party-panel">
          <p class="party-label">Party screen</p>
          <p class="party-code" id="party-code">----</p>
          <canvas id="party-qr" width="160" height="160" aria-label="QR to join as remote"></canvas>
          <p class="party-hint">Scan to control from your phone</p>
          <p class="party-status" id="party-status">Starting…</p>
          <p class="party-peers"><span id="party-peers">0</span> remotes</p>
        </aside>`
      : ''

  const remoteBits =
    mode === 'remote'
      ? `<p class="remote-banner">Remote · room <strong id="remote-room"></strong></p>
         <p class="party-status" id="party-status">Connecting…</p>`
      : ''

  return `
    <div id="yt" aria-hidden="true"></div>
    <canvas id="floor" aria-label="Garba circle. Drag the outer ring to seek. Swipe to change cloth."></canvas>

    <header class="top">
      <div class="brand">
        <a class="logo" href="/" aria-label="Garba Playlist home">
          <span class="logo-mark">Garba Playlist</span>
          <span class="logo-tag">eight cloths, one circle</span>
        </a>
      </div>
      ${remoteBits}
      <nav class="genres" aria-label="Cloth">
        <ol id="theme-list"></ol>
      </nav>
    </header>

    ${partyBits}

    <div class="bottom ${mode === 'remote' ? 'remote-bottom' : ''}">
      <button class="cta soon" id="soon" type="button">Coming soon</button>
      <a class="yt-credit" id="yt-credit" href="https://www.youtube.com" target="_blank" rel="noopener">
        <span class="yt-by">Streaming via</span>
        <span class="yt-mark">YouTube</span>
      </a>

      <div class="dock">
        <div class="now">
          <div class="cover-wrap"><img id="cover" class="cover" alt="" width="52" height="52" /></div>
          <div class="now-text">
            <p class="track"><a id="track" class="track-link" target="_blank" rel="noopener">-</a></p>
            <p class="artist" id="artist">-</p>
          </div>
          <p class="time"><span id="elapsed">0:00</span><span class="slash">/</span><span id="total">-:-</span></p>
        </div>
        <div class="controls">
          <button id="fav" class="btn btn-ghost" type="button" aria-label="Favorite">♥</button>
          <button id="play" class="btn btn-play" type="button" aria-label="Play">
            <svg class="i-play" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.2v13.6L19 12z" /></svg>
            <svg class="i-pause" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h3.4v14H7zM13.6 5H17v14h-3.4z" /></svg>
          </button>
          <button id="next" class="btn btn-stamp" type="button">
            <span lang="gu">આગળ</span><span class="gloss">next</span>
          </button>
          <button id="songs" class="btn btn-stamp" type="button" aria-haspopup="dialog" aria-expanded="false">
            <span lang="gu">ગરબા</span><span class="gloss">songs</span>
          </button>
          <button id="share" class="btn btn-stamp" type="button">Share</button>
          ${mode === 'floor' ? `<a class="btn btn-stamp" id="party-link" href="/party">Party</a>` : ''}
        </div>
      </div>
    </div>

    <div class="sheet" id="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title" hidden>
      <div class="sheet-inner">
        <div class="sheet-head">
          <h2 id="sheet-title"><span lang="gu">ગરબા</span> <span class="gloss">pick one</span></h2>
          <button id="sheet-close" class="btn btn-ghost" type="button" aria-label="Close">✕</button>
        </div>
        <p class="sheet-note">Pick one and it plays. The arrow opens the YouTube source.</p>
        <ul id="sheet-list" class="sheet-list"></ul>
      </div>
    </div>

    <p class="toast" id="toast" role="status" aria-live="polite"></p>
  `
}

document.querySelector('#app')!.innerHTML = shell(route.mode)
document.body.dataset.mode = route.mode

const cover = document.getElementById('cover') as HTMLImageElement
const trackEl = document.getElementById('track') as HTMLAnchorElement
const artist = $('artist')
const elapsed = $('elapsed')
const total = $('total')
const playBtn = $('play')
const nextBtn = $('next')
const songsBtn = $('songs')
const shareBtn = $('share')
const favBtn = $('fav')
const soonBtn = $('soon')
const sheet = $('sheet')
const sheetList = $('sheet-list')
const sheetClose = $('sheet-close')
const toastEl = $('toast')
const themes = $('theme-list')
const ytCredit = document.getElementById('yt-credit') as HTMLAnchorElement
const floor = document.getElementById('floor') as HTMLCanvasElement
const partyCode = document.getElementById('party-code')
const partyStatus = document.getElementById('party-status')
const partyPeers = document.getElementById('party-peers')
const partyQr = document.getElementById('party-qr') as HTMLCanvasElement | null
const remoteRoom = document.getElementById('remote-room')

const state = {
  data: {} as Partial<Record<ClothId, Track[]>>,
  cloth: CLOTHS[0],
  order: [] as number[],
  pos: 0,
  track: null as Track | null,
  room: (route.room || roomCode()).toUpperCase(),
  isHost: route.mode === 'floor' || route.mode === 'party',
}

let toastTimer = 0
function toast(html: string) {
  toastEl.innerHTML = html
  toastEl.classList.add('show')
  window.clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => toastEl.classList.remove('show'), 2600)
}

const scene = createScene({
  canvas: floor,
  onSeek({ phase, fraction }) {
    if (route.mode === 'remote') {
      if (phase === 'end') party?.send({ type: 'seek', fraction })
      return
    }
    if (phase === 'start') player.setScrubbing(true)
    else if (phase === 'end') {
      player.setScrubbing(false)
      player.seekToFraction(fraction)
      tap('manjira', 0.45)
      publish()
    }
  },
  onSwipe(dir) {
    const at = CLOTHS.indexOf(state.cloth)
    const next = CLOTHS[(at + dir + CLOTHS.length) % CLOTHS.length]
    if (route.mode === 'remote') {
      party?.send({ type: 'setCloth', clothId: next.id })
      return
    }
    setCloth(next, { play: true, announce: true })
  },
})

const player = createPlayer({
  mountId: 'yt',
  onEnded() {
    if (state.isHost) advance()
  },
  onPlayState(on) {
    document.body.classList.toggle('playing', on)
    playBtn.setAttribute('aria-label', on ? 'Pause' : 'Play')
    scene.setPlaying(on)
    publish()
  },
  onProgress({ current, duration, fraction, secondChanged, durationChanged }) {
    scene.setProgress(fraction)
    if (secondChanged) elapsed.textContent = fmt(current)
    if (durationChanged) total.textContent = fmt(duration)
    if (secondChanged && state.track && state.isHost) {
      setResume({ clothId: state.cloth.id, videoId: state.track.id, t: current })
      if (Math.floor(current) % 5 === 0) publish(current)
    }
  },
})

let party: ReturnType<typeof connectParty> | null = null

function publish(position?: number) {
  if (!party || !state.isHost || route.mode === 'remote') return
  party.publish({
    room: state.room,
    clothId: state.cloth.id,
    videoId: state.track?.id || '',
    title: state.track?.title || '',
    artist: state.track?.artist || '',
    playing: player.playing,
    position: position ?? player.currentTime(),
    updatedAt: Date.now(),
  })
}

function currentList(): Track[] {
  return state.data[state.cloth.id] || []
}

function paintTrack(t: Track) {
  state.track = t
  trackEl.textContent = t.title
  trackEl.href = watchUrl(t.id)
  ytCredit.href = watchUrl(t.id)
  artist.textContent = t.artist || '—'
  total.textContent = t.duration ? fmt(t.duration) : '-:-'
  elapsed.textContent = '0:00'
  if (t.cover) {
    cover.src = t.cover
    cover.alt = `${t.title} cover`
  } else {
    cover.removeAttribute('src')
    cover.alt = ''
  }
  favBtn.classList.toggle('on', isFavorite(t.id))
  if ('mediaSession' in navigator) {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: t.title,
      artist: t.artist || '',
      album: state.cloth.name,
      artwork: t.cover ? [{ src: t.cover, sizes: '600x600', type: 'image/jpeg' }] : [],
    })
  }
  pushRecent({ id: t.id, clothId: state.cloth.id, title: t.title })
}

function playAt(pos: number, { cue = false } = {}) {
  const list = currentList()
  if (!list.length) return
  state.pos = ((pos % list.length) + list.length) % list.length
  const t = list[state.order[state.pos]]
  paintTrack(t)
  if (route.mode === 'remote') return
  cue ? player.cue(t.id) : player.load(t.id)
  publish()
}

function advance() {
  playAt(state.pos + 1)
}

function rebuildOrder() {
  const list = currentList()
  state.order = shuffle(list.map((_, i) => i))
  state.pos = 0
}

function setCloth(
  cloth: Cloth,
  opts: { play?: boolean; announce?: boolean; videoId?: string } = {},
) {
  state.cloth = cloth
  scene.setCloth(cloth)
  markActive()
  rebuildOrder()
  if (opts.announce) toast(`<span lang="gu">${cloth.guj}</span> — ${cloth.note}`)

  const list = currentList()
  if (!list.length) {
    trackEl.textContent = 'No tracks in this cloth'
    trackEl.removeAttribute('href')
    return
  }

  if (opts.videoId) {
    const idx = list.findIndex((t) => t.id === opts.videoId)
    if (idx >= 0) {
      const at = state.order.indexOf(idx)
      playAt(at >= 0 ? at : 0, { cue: !opts.play })
      if (opts.play && route.mode !== 'remote') player.play()
      return
    }
  }

  playAt(0, { cue: !opts.play })
  if (opts.play && route.mode !== 'remote') player.play()
  publish()
}

function buildThemes() {
  themes.innerHTML = ''
  CLOTHS.forEach((c) => {
    const li = document.createElement('li')
    const b = document.createElement('button')
    b.type = 'button'
    b.className = 'swatch'
    b.dataset.cloth = c.id
    b.title = `${c.name} — ${c.material}. ${c.note}`
    b.style.background = c.palette.chipBg
    b.style.color = c.palette.chipInk
    b.innerHTML = `<span class="sw-gu" lang="gu">${c.guj}</span><span class="sw-en">${c.name}</span>`
    b.addEventListener('click', () => {
      if (route.mode === 'remote') {
        party?.send({ type: 'setCloth', clothId: c.id })
        return
      }
      tap('dhol', 0.4)
      setCloth(c, { play: true, announce: true })
    })
    li.append(b)
    themes.append(li)
  })
}

function markActive() {
  themes.querySelectorAll('.swatch').forEach((b) => {
    const on = (b as HTMLElement).dataset.cloth === state.cloth.id
    b.classList.toggle('on', on)
  })
  themes.querySelector('.swatch.on')?.scrollIntoView({ inline: 'nearest', block: 'nearest' })
}

function openSheet() {
  sheetList.innerHTML = ''
  currentList().forEach((t, i) => {
    const li = document.createElement('li')
    const b = document.createElement('button')
    b.type = 'button'
    b.innerHTML = `<span class="s-title"></span><span class="s-artist"></span>`
    ;(b.querySelector('.s-title') as HTMLElement).textContent = t.title
    ;(b.querySelector('.s-artist') as HTMLElement).textContent =
      state.track?.id === t.id ? 'playing' : t.artist || ''
    if (state.track?.id === t.id) b.disabled = true
    b.addEventListener('click', () => {
      closeSheet()
      tap('manjira', 0.5)
      if (route.mode === 'remote') {
        party?.send({ type: 'setTrack', videoId: t.id })
        return
      }
      const at = state.order.indexOf(i)
      playAt(at >= 0 ? at : 0)
    })
    const src = document.createElement('a')
    src.className = 's-src'
    src.href = watchUrl(t.id)
    src.target = '_blank'
    src.rel = 'noopener'
    src.setAttribute('aria-label', `Open ${t.title} on YouTube`)
    src.textContent = '↗'
    li.append(b, src)
    sheetList.append(li)
  })
  sheet.hidden = false
  songsBtn.setAttribute('aria-expanded', 'true')
}

function closeSheet() {
  sheet.hidden = true
  songsBtn.setAttribute('aria-expanded', 'false')
}

function handleCommand(cmd: PartyCommand) {
  if (cmd.type === 'play') player.play()
  else if (cmd.type === 'pause') player.pause()
  else if (cmd.type === 'toggle') player.toggle()
  else if (cmd.type === 'next') advance()
  else if (cmd.type === 'setCloth') {
    const c = clothById(cmd.clothId)
    if (c) setCloth(c, { play: true, announce: true })
  } else if (cmd.type === 'setTrack') {
    const list = currentList()
    const idx = list.findIndex((t) => t.id === cmd.videoId)
    if (idx >= 0) {
      const at = state.order.indexOf(idx)
      playAt(at >= 0 ? at : 0)
    }
  } else if (cmd.type === 'seek') {
    player.seekToFraction(cmd.fraction)
  }
}

async function setupParty() {
  if (route.mode === 'floor') return

  if (remoteRoom) remoteRoom.textContent = state.room
  if (partyCode) partyCode.textContent = state.room

  if (route.mode === 'party' && partyQr) {
    const url = shareUrl({ remoteRoom: state.room })
    await QRCode.toCanvas(partyQr, url, {
      width: 160,
      margin: 1,
      color: { dark: '#14100E', light: '#F2E8D5' },
    })
    const u = new URL(location.href)
    u.searchParams.set('room', state.room)
    history.replaceState(null, '', u)
  }

  party = connectParty(state.room, route.mode === 'remote' ? 'remote' : 'host', {
    onStatus(msg) {
      if (partyStatus) partyStatus.textContent = msg
    },
    onPeers(n) {
      if (partyPeers) partyPeers.textContent = String(Math.max(0, n - 1))
    },
    onCommand(cmd) {
      handleCommand(cmd)
    },
    onState(s) {
      if (route.mode !== 'remote') return
      const cloth = clothById(s.clothId)
      if (cloth && cloth.id !== state.cloth.id) {
        state.cloth = cloth
        scene.setCloth(cloth)
        markActive()
        rebuildOrder()
      }
      if (s.videoId && s.videoId !== state.track?.id) {
        const list = currentList()
        const t = list.find((x) => x.id === s.videoId)
        if (t) paintTrack(t)
        else {
          paintTrack({
            id: s.videoId,
            title: s.title || 'Playing on party screen',
            artist: s.artist || '',
          })
        }
      } else if (s.title) {
        trackEl.textContent = s.title
        artist.textContent = s.artist || '—'
      }
      scene.setPlaying(s.playing)
      document.body.classList.toggle('playing', s.playing)
      playBtn.setAttribute('aria-label', s.playing ? 'Pause' : 'Play')
    },
  })

  if (route.mode === 'party') setTimeout(() => publish(), 400)
}

playBtn.addEventListener('click', () => {
  tap('dhol', 0.3)
  if (route.mode === 'remote') {
    party?.send({ type: 'toggle' })
    return
  }
  player.toggle()
})

nextBtn.addEventListener('click', () => {
  tap('dhol', 0.35)
  if (route.mode === 'remote') {
    party?.send({ type: 'next' })
    return
  }
  advance()
})

songsBtn.addEventListener('click', () => {
  sheet.hidden ? openSheet() : closeSheet()
})
sheetClose.addEventListener('click', closeSheet)
sheet.addEventListener('click', (e) => {
  if (e.target === sheet) closeSheet()
})
sheet.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeSheet()
})

favBtn.addEventListener('click', () => {
  if (!state.track) return
  const on = toggleFavorite(state.track.id)
  favBtn.classList.toggle('on', on)
  toast(on ? 'Saved to favorites' : 'Removed from favorites')
})

shareBtn.addEventListener('click', async () => {
  const url =
    route.mode === 'party' || route.mode === 'remote'
      ? shareUrl({ partyRoom: state.room })
      : shareUrl({ cloth: state.cloth.id, video: state.track?.id })
  try {
    await navigator.clipboard.writeText(url)
    toast('Link copied')
  } catch {
    toast(url)
  }
})

soonBtn.addEventListener('click', () => {
  toast('Festival asks — coming soon')
})

document.addEventListener('keydown', (e) => {
  const tag = (e.target as HTMLElement)?.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA') return
  if (e.key === ' ') {
    e.preventDefault()
    playBtn.click()
  } else if (e.key === 'n') nextBtn.click()
  else if (e.key === 'f') songsBtn.click()
  else if (e.key === 'Escape' && !sheet.hidden) closeSheet()
  else if (e.key === 'ArrowRight' && route.mode !== 'remote') player.nudge(10)
  else if (e.key === 'ArrowLeft' && route.mode !== 'remote') player.nudge(-10)
})

if ('mediaSession' in navigator && route.mode !== 'remote') {
  navigator.mediaSession.setActionHandler('play', () => player.play())
  navigator.mediaSession.setActionHandler('pause', () => player.pause())
  navigator.mediaSession.setActionHandler('nexttrack', () => advance())
}

async function boot() {
  const file = (await fetch('/tracks.json').then((r) => r.json())) as TracksFile
  state.data = file.slots || {}

  buildThemes()

  const wanted = route.cloth && isClothId(route.cloth) ? clothById(route.cloth) : undefined
  const start = wanted || CLOTHS[0]
  const video = route.video || undefined

  setCloth(start, { videoId: video, announce: true, play: false })

  if (route.mode !== 'remote') {
    const first = state.track
    if (first) await player.boot(first.id)
  }

  await setupParty()
}

boot().catch((err) => {
  console.error(err)
  trackEl.textContent = 'Playlist failed to load'
  trackEl.removeAttribute('href')
  artist.textContent = 'Reload and try again'
})
