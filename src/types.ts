export type ClothId =
  | 'prachin'
  | 'sanedo'
  | 'khelaiya'
  | 'indipop'
  | 'filmi'
  | 'fusion'
  | 'gujpop'
  | 'techno'

export type Track = {
  id: string
  title: string
  artist: string
  album?: string
  cover?: string
  duration?: number
  rawTitle?: string
  enriched?: boolean
}

export type TracksFile = {
  updated?: string
  slots: Partial<Record<ClothId, Track[]>>
}

export type ClothPalette = {
  chipBg: string
  chipInk: string
  ground: string
  groundDeep: string
  ink: string
  accent: string
  figure: string[]
  pot: string
  flame: string
  flameHot: string
  ring: string
  progress: string
}

export type Cloth = {
  id: ClothId
  name: string
  guj: string
  note: string
  material: string
  ground: 'light' | 'dark'
  bpm: number
  palette: ClothPalette
}

export type PartyState = {
  room: string
  clothId: ClothId
  videoId: string
  title: string
  artist: string
  playing: boolean
  position: number
  updatedAt: number
}

export type PartyCommand =
  | { type: 'play' }
  | { type: 'pause' }
  | { type: 'toggle' }
  | { type: 'next' }
  | { type: 'setCloth'; clothId: ClothId }
  | { type: 'setTrack'; videoId: string }
  | { type: 'seek'; fraction: number }
