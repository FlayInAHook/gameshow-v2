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
