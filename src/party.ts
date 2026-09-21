import type { ClothId, PartyCommand, PartyState } from './types'
import { partyWsUrl } from './util'

type PartyHandlers = {
  onState?: (state: PartyState) => void
  onPeers?: (n: number) => void
  onStatus?: (msg: string) => void
  onCommand?: (cmd: PartyCommand) => void
}

type HelloRole = 'host' | 'remote'

export function connectParty(room: string, role: HelloRole, handlers: PartyHandlers) {
  let ws: WebSocket | null = null
  let closed = false
  let retries = 0
  let lastState: PartyState | null = null

  const connect = () => {
    if (closed) return
    const url = `${partyWsUrl()}?room=${encodeURIComponent(room)}&role=${role}`
    handlers.onStatus?.('Connecting…')
    ws = new WebSocket(url)

    ws.addEventListener('open', () => {
      retries = 0
      handlers.onStatus?.(role === 'host' ? 'Party live' : 'Connected to host')
      ws?.send(JSON.stringify({ type: 'hello', role, room }))
      if (role === 'host' && lastState) {
        ws?.send(JSON.stringify({ type: 'state', state: lastState }))
      }
    })

    ws.addEventListener('message', (ev) => {
      try {
        const msg = JSON.parse(String(ev.data)) as {
          type: string
          state?: PartyState
          peers?: number
          cmd?: PartyCommand
          message?: string
        }
        if (msg.type === 'state' && msg.state) {
          lastState = msg.state
          handlers.onState?.(msg.state)
        }
        if (msg.type === 'peers' && typeof msg.peers === 'number') handlers.onPeers?.(msg.peers)
        if (msg.type === 'cmd' && msg.cmd && role === 'host') handlers.onCommand?.(msg.cmd)
        if (msg.type === 'error') handlers.onStatus?.(msg.message || 'Party error')
      } catch {
        /* ignore */
      }
    })

    ws.addEventListener('close', () => {
      handlers.onStatus?.('Disconnected')
      if (closed) return
      const wait = Math.min(8000, 500 * 2 ** retries++)
      setTimeout(connect, wait)
    })

    ws.addEventListener('error', () => {
      handlers.onStatus?.('Party server unavailable')
    })
  }

  connect()

  return {
    publish(state: PartyState) {
      lastState = state
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'state', state }))
      }
    },
    send(cmd: PartyCommand) {
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'cmd', cmd }))
      }
    },
    close() {
      closed = true
      ws?.close()
    },
  }
}

export type PartyClient = ReturnType<typeof connectParty>

export function emptyPartyState(room: string, clothId: ClothId): PartyState {
  return {
    room,
    clothId,
    videoId: '',
    title: '',
    artist: '',
    playing: false,
    position: 0,
    updatedAt: Date.now(),
  }
}
