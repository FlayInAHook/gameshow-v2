# Gameshow

A tiny gameshow app for friends. Create question collections (stored in your
browser's local storage), host a room, share the invite link, play.

- **Create** — build collections of Multiple Choice / Buzz / Free Input /
  Image Reveal questions. Any question can carry an image (stored as a
  compressed data-url in local storage). Image Reveal obscures the image with
  stackable filters (zoom, blur, pixelate, scramble) that fade out on a timer
  or as the host steps the reveal — with a live preview in the editor.
- **Host** — pick a collection, get a room + invite link. Resizable panels for
  players (points, rename, kick), questions, room settings, and actions
  (award points, sounds, close round, leaderboard).
- Buzzing is ping-compensated: the server measures each player's roundtrip and
  credits half of it, so buzz order isn't decided by whoever has better wifi.
- Everyone (host included) can close their tab and rejoin — state lives on the
  websocket server. If the *server* restarts, the host just hosts again.

## Run

Two processes:

```bash
bun run dev      # web app on :3000
bun run dev:ws   # websocket server on :3001
```

Players on your LAN open the invite link (use your machine's IP instead of
localhost).

## Production (behind nginx)

```bash
bun run build       # -> dist/client (static) + dist/server/server.js (SSR only)
bun run start       # SSR server on :3167 (PORT set in the script)
bun run start:ws    # websocket server on :3168 (WS_PORT in src/lib/game-types.ts)
```

The SSR server does not serve static files — nginx serves `dist/client`
directly and proxies the rest. In production the client connects to
`wss://<host>/ws` (same origin), so proxy `/ws` to the websocket server:

```nginx
server {
    server_name gameshow.example.com;
    # ... your tls config ...
    root /path/to/gameshow-v2/dist/client;

    location /ws {
        proxy_pass http://127.0.0.1:3168;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 1h;  # idle websockets stay open
    }

    location / {
        try_files $uri @ssr;
    }

    location @ssr {
        proxy_pass http://127.0.0.1:3167;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Or use the screen-based helper scripts (after `chmod +x scripts/*.sh`):
`scripts/start.sh` builds nothing — run `bun run build` first — then starts
both processes in detached screen sessions (`gameshow-web`, `gameshow-ws`)
with rotated logs in `logs/`; `scripts/stop.sh` stops them.
Rooms live in the ws server's memory — restarting it drops them (the host just
hosts again); restarting the SSR server is invisible to running games.
