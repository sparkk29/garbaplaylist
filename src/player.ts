type ProgressInfo = {
  current: number
  duration: number
  fraction: number
  secondChanged: boolean
  durationChanged: boolean
}

type PlayerHooks = {
  mountId: string
  onReady?: () => void
  onEnded?: () => void
  onPlayState?: (playing: boolean) => void
  onProgress?: (info: ProgressInfo) => void
}

function loadApi(): Promise<void> {
  if (window.YT?.Player) return Promise.resolve()
  return new Promise((resolve) => {
    const prev = window.onYouTubeIframeAPIReady
    window.onYouTubeIframeAPIReady = () => {
      prev?.()
      resolve()
    }
    if (!document.querySelector('script[data-yt-api]')) {
      const s = document.createElement('script')
      s.src = 'https://www.youtube.com/iframe_api'
      s.dataset.ytApi = '1'
      document.head.append(s)
    }
  })
}

export function createPlayer(hooks: PlayerHooks) {
  let yt: YT.Player | null = null
  const state = { ready: false, playing: false, scrubbing: false, started: false }
  const poll = { at: 0, time: 0, duration: 0 }
  let lastSecond = -1
  let lastDuration = -1

  const preferAudio = () => {
    try {
      yt?.setPlaybackQuality?.('tiny')
    } catch {
      /* ignore */
    }
  }

  const resetPoll = () => {
    lastSecond = -1
    lastDuration = -1
    poll.time = 0
    poll.duration = 0
  }

  const clamp01 = (n: number) => Math.min(1, Math.max(0, n))

  const emit = () => {
    if (!yt || state.scrubbing || !poll.duration) return
    const drift = state.playing ? (performance.now() - poll.at) / 1000 : 0
    const current = Math.min(poll.duration, poll.time + drift)
    const fraction = clamp01(current / poll.duration)
    const second = Math.floor(current)
    const secondChanged = second !== lastSecond
    const durationChanged = poll.duration !== lastDuration
    if (secondChanged) lastSecond = second
    if (durationChanged) lastDuration = poll.duration
    hooks.onProgress?.({ current, duration: poll.duration, fraction, secondChanged, durationChanged })
  }

  const sample = () => {
    if (!yt || typeof yt.getCurrentTime !== 'function') return
    poll.time = yt.getCurrentTime() || 0
    poll.duration = yt.getDuration() || 0
    poll.at = performance.now()
    emit()
  }

  const paint = () => {
    requestAnimationFrame(paint)
    emit()
  }

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) sample()
  })

  const api = {
    get ready() {
      return state.ready
    },
    get playing() {
      return state.playing
    },
    get started() {
      return state.started
    },

    async boot(firstVideoId: string) {
      await loadApi()
      yt = new YT.Player(hooks.mountId, {
        height: '1',
        width: '1',
        videoId: firstVideoId,
        playerVars: { playsinline: 1, controls: 0, disablekb: 1, modestbranding: 1, rel: 0 },
        events: {
          onReady: () => {
            state.ready = true
            preferAudio()
            hooks.onReady?.()
          },
          onStateChange: (e) => {
            const S = YT.PlayerState
            if (e.data === S.PLAYING) {
              state.playing = true
              preferAudio()
              hooks.onPlayState?.(true)
            } else if (e.data === S.PAUSED) {
              state.playing = false
              hooks.onPlayState?.(false)
            } else if (e.data === S.ENDED) {
              hooks.onEnded?.()
            }
          },
          onError: () => {
            if (state.started) hooks.onEnded?.()
          },
        },
      })
      setInterval(sample, 250)
      requestAnimationFrame(paint)
    },

    load(videoId: string) {
      if (!yt) return
      state.started = true
      resetPoll()
      yt.loadVideoById(videoId)
    },

    cue(videoId: string) {
      if (!yt || typeof yt.cueVideoById !== 'function') return
      resetPoll()
      yt.cueVideoById(videoId)
    },

    play() {
      if (!yt || !state.ready) return
      state.started = true
      yt.playVideo()
    },

    pause() {
      yt?.pauseVideo()
    },

    toggle() {
      if (!yt || !state.ready) return
      state.playing ? api.pause() : api.play()
    },

    duration: () => yt?.getDuration?.() || 0,
    currentTime: () => yt?.getCurrentTime?.() || 0,

    setScrubbing(on: boolean) {
      state.scrubbing = on
    },

    seekToFraction(f: number) {
      const d = api.duration()
      if (!d || !yt) return
      yt.seekTo(d * clamp01(f), true)
      sample()
    },

    nudge(seconds: number) {
      if (!yt) return
      yt.seekTo(Math.max(0, api.currentTime() + seconds), true)
      sample()
    },
  }

  return api
}

export type Player = ReturnType<typeof createPlayer>
