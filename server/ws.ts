import type { ServerWebSocket } from "bun"
import type {
  ClientMsg,
  PlayerInfo,
  Question,
  RoomState,
  ServerMsg,
  Settings,
} from "../src/lib/game-types"
import { WS_PORT } from "../src/lib/game-types"

type Room = {
  code: string
  hostId: string
  hostConnected: boolean
  collectionName: string
  questions: Question[]
  phase: "playing" | "ended"
  currentIndex: number | null
  locked: boolean
  revealed: boolean
  reveal: number
  revealTimer?: ReturnType<typeof setInterval>
  buzzes: { playerId: string; time: number }[]
  answers: Record<string, string>
  settings: Settings
  players: Map<string, PlayerInfo>
}

type WsData = { playerId?: string; code?: string }
type Ws = ServerWebSocket<WsData>

// ponytail: everything in memory — rooms die on server restart, host just re-hosts
const rooms = new Map<string, Room>()
const sockets = new Map<string, Ws>()

function stateOf(room: Room): RoomState {
  return {
    code: room.code,
    phase: room.phase,
    collectionName: room.collectionName,
    hostId: room.hostId,
    hostConnected: room.hostConnected,
    players: [...room.players.values()],
    currentIndex: room.currentIndex,
    locked: room.locked,
    revealed: room.revealed,
    reveal: room.reveal,
    buzzes: room.buzzes,
    answers: room.answers,
    settings: room.settings,
  }
}

function questionsMsg(room: Room): string {
  return JSON.stringify({
    type: "questions",
    questions: room.questions,
  } satisfies ServerMsg)
}

function stopReveal(room: Room) {
  if (room.revealTimer) clearInterval(room.revealTimer)
  room.revealTimer = undefined
}

function broadcast(room: Room) {
  server.publish(
    room.code,
    JSON.stringify({ type: "state", state: stateOf(room) } satisfies ServerMsg),
  )
}

function send(ws: Ws, msg: ServerMsg) {
  ws.send(JSON.stringify(msg))
}

function handleMessage(ws: Ws, msg: ClientMsg) {
  if (msg.type === "create") {
    let room = rooms.get(msg.code)
    if (room && room.hostId !== msg.playerId) {
      return send(ws, { type: "error", message: "Room code already taken" })
    }
    if (!room) {
      room = {
        code: msg.code,
        hostId: msg.playerId,
        hostConnected: true,
        collectionName: msg.collectionName,
        questions: msg.questions,
        phase: "playing",
        currentIndex: null,
        locked: false,
        revealed: false,
        reveal: 0,
        buzzes: [],
        answers: {},
        settings: { pointsCorrect: 10, pointsWrong: 0 },
        players: new Map(),
      }
      rooms.set(msg.code, room)
    }
    room.hostConnected = true
    room.collectionName = msg.collectionName
    room.questions = msg.questions
    ws.data = { playerId: msg.playerId, code: msg.code }
    sockets.set(msg.playerId, ws)
    ws.subscribe(msg.code)
    send(ws, { type: "state", state: stateOf(room) })
    broadcast(room)
    server.publish(room.code, questionsMsg(room))
    return
  }

  if (msg.type === "join") {
    const room = rooms.get(msg.code)
    if (!room) return send(ws, { type: "error", message: "Room not found" })
    ws.data = { playerId: msg.playerId, code: msg.code }
    sockets.set(msg.playerId, ws)
    ws.subscribe(msg.code)
    if (msg.playerId === room.hostId) {
      room.hostConnected = true
    } else {
      const existing = room.players.get(msg.playerId)
      if (existing) {
        existing.connected = true
      } else {
        room.players.set(msg.playerId, {
          id: msg.playerId,
          name: msg.name,
          points: 0,
          connected: true,
          rtt: 0,
        })
      }
    }
    send(ws, { type: "state", state: stateOf(room) })
    ws.send(questionsMsg(room))
    broadcast(room)
    return
  }

  const { playerId, code } = ws.data
  const room = code ? rooms.get(code) : undefined
  if (!room || !playerId) return

  if (msg.type === "pong") {
    const rtt = Date.now() - msg.t
    const player = room.players.get(playerId)
    if (player) {
      player.rtt = player.rtt ? Math.round((player.rtt + rtt) / 2) : rtt
      broadcast(room)
    }
    return
  }

  if (msg.type === "buzz") {
    const player = room.players.get(playerId)
    if (!player || room.locked || room.phase !== "playing") return
    if (room.buzzes.some((b) => b.playerId === playerId)) return
    // ping mitigation: credit the player half their roundtrip
    room.buzzes.push({ playerId, time: Date.now() - player.rtt / 2 })
    room.buzzes.sort((a, b) => a.time - b.time)
    broadcast(room)
    return
  }

  if (msg.type === "answer") {
    if (!room.players.has(playerId) || room.locked) return
    room.answers[playerId] = msg.value
    broadcast(room)
    return
  }

  // only host messages remain
  {
    if (playerId !== room.hostId) return
    const a = msg.action
    switch (a.kind) {
      case "question":
        room.currentIndex = a.index
        room.locked = false
        room.revealed = false
        room.buzzes = []
        room.answers = {}
        room.reveal = 0
        stopReveal(room)
        break
      case "close":
        room.locked = true
        room.revealed = true
        room.reveal = 1
        stopReveal(room)
        break
      case "reset":
        room.locked = false
        room.revealed = false
        room.buzzes = []
        room.answers = {}
        room.reveal = 0
        stopReveal(room)
        break
      case "reveal":
        room.reveal = Math.min(1, Math.max(0, a.to))
        if (room.reveal >= 1) stopReveal(room)
        break
      case "revealAuto": {
        const q =
          room.currentIndex !== null
            ? room.questions[room.currentIndex]
            : undefined
        if (q?.type !== "reveal" || !q.revealSeconds) break
        stopReveal(room)
        // 20 small state broadcasts over the configured duration
        room.revealTimer = setInterval(
          () => {
            room.reveal = Math.min(1, room.reveal + 0.05)
            if (room.reveal >= 1) stopReveal(room)
            broadcast(room)
          },
          (q.revealSeconds * 1000) / 20,
        )
        break
      }
      case "points": {
        const p = room.players.get(a.playerId)
        if (p) p.points += a.delta
        break
      }
      case "rename": {
        const p = room.players.get(a.playerId)
        if (p) p.name = a.name
        break
      }
      case "kick": {
        const target = sockets.get(a.playerId)
        if (target) {
          send(target, { type: "kicked" })
          target.close()
        }
        room.players.delete(a.playerId)
        break
      }
      case "settings":
        Object.assign(room.settings, a.settings)
        break
      case "sound":
        server.publish(
          room.code,
          JSON.stringify({ type: "sound", name: a.name } satisfies ServerMsg),
        )
        return
      case "end":
        room.phase = "ended"
        stopReveal(room)
        break
      case "reopen":
        room.phase = "playing"
        break
    }
    broadcast(room)
  }
}

const server = Bun.serve<WsData>({
  port: WS_PORT,
  fetch(req, srv) {
    if (srv.upgrade(req, { data: {} })) return
    return new Response("gameshow ws server")
  },
  websocket: {
    message(ws, raw) {
      try {
        handleMessage(ws, JSON.parse(String(raw)) as ClientMsg)
      } catch (e) {
        console.error("bad message", e)
      }
    },
    close(ws) {
      const { playerId, code } = ws.data
      if (!playerId || !code) return
      if (sockets.get(playerId) !== ws) return // superseded by a newer connection
      sockets.delete(playerId)
      const room = rooms.get(code)
      if (!room) return
      if (playerId === room.hostId) room.hostConnected = false
      const player = room.players.get(playerId)
      if (player) player.connected = false
      broadcast(room)
    },
  },
})

// rtt measurement: ping every connected socket, clients echo back
setInterval(() => {
  const msg = JSON.stringify({
    type: "ping",
    t: Date.now(),
  } satisfies ServerMsg)
  for (const ws of sockets.values()) {
    if (ws.readyState === 1) ws.send(msg)
  }
}, 5000)

console.log(`gameshow ws server listening on :${WS_PORT}`)
