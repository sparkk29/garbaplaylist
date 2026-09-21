/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_PARTY_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare namespace YT {
  enum PlayerState {
    UNSTARTED = -1,
    ENDED = 0,
    PLAYING = 1,
    PAUSED = 2,
    BUFFERING = 3,
    CUED = 5,
  }

  interface PlayerVars {
    playsinline?: 0 | 1
    controls?: 0 | 1
    disablekb?: 0 | 1
    modestbranding?: 0 | 1
    rel?: 0 | 1
  }

  interface PlayerOptions {
    height?: string | number
    width?: string | number
    videoId?: string
    playerVars?: PlayerVars
    events?: {
      onReady?: (e: PlayerEvent) => void
      onStateChange?: (e: OnStateChangeEvent) => void
      onError?: (e: OnErrorEvent) => void
    }
  }

  interface PlayerEvent {
    target: Player
  }

  interface OnStateChangeEvent {
    data: PlayerState
    target: Player
  }

  interface OnErrorEvent {
    data: number
    target: Player
  }

  class Player {
    constructor(elementId: string, options: PlayerOptions)
    playVideo(): void
    pauseVideo(): void
    stopVideo(): void
    seekTo(seconds: number, allowSeekAhead: boolean): void
    loadVideoById(videoId: string): void
    cueVideoById(videoId: string): void
    getCurrentTime(): number
    getDuration(): number
    setPlaybackQuality?(suggestedQuality: string): void
  }
}

interface Window {
  YT?: typeof YT
  onYouTubeIframeAPIReady?: () => void
}
