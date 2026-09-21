# Garba Playlist

Eight cloths, one circle. A YouTube-powered garba floor for phone and party screen.

## Run locally

```bash
npm install
npm run dev
```

- Web: http://localhost:5173  
- Party relay: ws://localhost:8787  

### Modes

| URL | Role |
|---|---|
| `/` | Floor jukebox |
| `/party` | Party host (QR + room code) |
| `/r/ABCD` | Phone remote for room `ABCD` |
| `/?c=fusion&v=VIDEO_ID` | Deep link to cloth + track |

## Scripts

- `npm run dev` — Vite + party WebSocket server
- `npm run build` — production build to `dist/`
- `npm run preview` — preview the build
- `npm run start:party` — party relay only

Set `VITE_PARTY_URL` if the relay is not on the same host at port `8787`.

## Stack

- Vite + TypeScript
- YouTube IFrame API (hidden audio)
- Canvas floor
- `ws` party sync (host owns playback; remotes send commands)

Catalog: `public/tracks.json` (eight cloth slots).
