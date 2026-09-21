import { WebSocketServer } from 'ws'
import { createServer } from 'node:http'

const PORT = Number(process.env.PARTY_PORT || 8787)

/** @typedef {{ role: 'host' | 'remote', room: string }} ClientMeta */

/** @type {Map<string, Set<import('ws').WebSocket>>} */
const rooms = new Map()

/** @type {WeakMap<import('ws').WebSocket, ClientMeta>} */
const meta = new WeakMap()

/** @type {Map<string, object>} */
const lastState = new Map()

function peers(room) {
  return rooms.get(room)?.size || 0
}

function broadcast(room, data, except) {
  const set = rooms.get(room)
  if (!set) return
  const raw = JSON.stringify(data)
  for (const client of set) {
    if (client !== except && client.readyState === 1) client.send(raw)
  }
}

function join(ws, room, role) {
  if (!rooms.has(room)) rooms.set(room, new Set())
  rooms.get(room).add(ws)
  meta.set(ws, { room, role })
  const count = peers(room)
  broadcast(room, { type: 'peers', peers: count })
  const state = lastState.get(room)
  if (state && role === 'remote') {
    ws.send(JSON.stringify({ type: 'state', state }))
  }
}

function leave(ws) {
  const m = meta.get(ws)
  if (!m) return
  const set = rooms.get(m.room)
  set?.delete(ws)
  if (set && set.size === 0) {
    rooms.delete(m.room)
    lastState.delete(m.room)
  } else {
    broadcast(m.room, { type: 'peers', peers: peers(m.room) })
  }
  meta.delete(ws)
}

const server = createServer((_req, res) => {
  res.writeHead(200, { 'content-type': 'text/plain' })
  res.end('Garba Playlist party relay\n')
})

const wss = new WebSocketServer({ server })

wss.on('connection', (ws, req) => {
  const url = new URL(req.url || '/', 'http://localhost')
  const room = (url.searchParams.get('room') || '').toUpperCase()
  const role = url.searchParams.get('role') === 'host' ? 'host' : 'remote'

  if (!room || room.length > 8) {
    ws.send(JSON.stringify({ type: 'error', message: 'Invalid room' }))
    ws.close()
    return
  }

  join(ws, room, role)

  ws.on('message', (buf) => {
    let msg
    try {
      msg = JSON.parse(String(buf))
    } catch {
      return
    }
    const m = meta.get(ws)
    if (!m) return

    if (msg.type === 'hello') {
      // already joined via query; acknowledge
      ws.send(JSON.stringify({ type: 'peers', peers: peers(m.room) }))
      return
    }

    if (msg.type === 'state' && m.role === 'host' && msg.state) {
      lastState.set(m.room, msg.state)
      broadcast(m.room, { type: 'state', state: msg.state }, ws)
      return
    }

    if (msg.type === 'cmd' && m.role === 'remote' && msg.cmd) {
      // send only to host(s)
      const set = rooms.get(m.room)
      if (!set) return
      const raw = JSON.stringify({ type: 'cmd', cmd: msg.cmd })
      for (const client of set) {
        const cm = meta.get(client)
        if (cm?.role === 'host' && client.readyState === 1) client.send(raw)
      }
    }
  })

  ws.on('close', () => leave(ws))
})

server.listen(PORT, () => {
  console.log(`party relay on ws://localhost:${PORT}`)
})
