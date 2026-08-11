import type { ServerWebSocket } from "bun"
import type {
  ClientMsg,
  PlayerInfo,
  Question,
  RoomState,
  ServerMsg,
  Settings,
} from "../src/lib/game-types"
import {
  MAX_ANSWER,
  WS_PORT,
  correctSet,
  defaultSettings,
  hasOptions,
  picksOf,
  scoreSort,
} from "../src/lib/game-types"

type Room = {
  code: string
  // separate secret code for the spectate link — players know the join code,
  // and the spectate view shows every answer as it is typed
  spectateCode: string
  hostId: string
  hostConnected: boolean
  collectionName: string
  questions: Question[]
  phase: "playing" | "ended"
  currentIndex: number | null
  played: number[]
  locked: boolean
  revealed: boolean
  revealedOptions: number[]
  revealedAnswers: string[]
  // mc options already paid out this round; server-only, clients never need it
  paidOptions: number[]
  reveal: number
  revealTimer?: ReturnType<typeof setInterval>
  // a buzz froze the auto-reveal; clearing the buzzer resumes it
  revealPaused?: boolean
  timerLeft: number | null
  roundTimer?: ReturnType<typeof setInterval>
  questionAt: number
  buzzes: { playerId: string; time: number }[]
  answers: Record<string, string>
  settings: Settings
  players: Map<string, PlayerInfo>
}

type WsData = { playerId?: string; code?: string }
type Ws = ServerWebSocket<WsData>

// ponytail: everything in memory — rooms die on server restart, host just re-hosts
const rooms = new Map<string, Room>()
const spectateCodes = new Map<string, string>() // spectate code -> room code
const sockets = new Map<string, Ws>()

// 26^6 ≈ 300M, and both namespaces are checked so a spectate code can never
// collide with a join code someone already has
function newSpectateCode(): string {
  let code: string
  do {
    code = Array.from({ length: 6 }, () =>
      String.fromCharCode(65 + Math.floor(Math.random() * 26)),
    ).join("")
  } while (rooms.has(code) || spectateCodes.has(code))
  return code
}

// what a player is allowed to see of everyone's answers: their own, plus the
// ones the host has already put in front of the room
function answersFor(room: Room, viewerId: string): Record<string, string> {
  const q = currentQuestion(room)
  const out: Record<string, string> = {}
  for (const [pid, value] of Object.entries(room.answers)) {
    if (pid === viewerId) {
      out[pid] = value
      continue
    }
    if (q && hasOptions(q)) {
      // trimmed to the flipped options: on a select-all question the rest of
      // someone's picks would otherwise ride along with the first flip
      const shown = picksOf(value).filter((i) =>
        room.revealedOptions.includes(Number(i)),
      )
      if (shown.length > 0) out[pid] = shown.join(",")
    } else if (q?.type === "free" && room.revealedAnswers.includes(pid)) {
      out[pid] = value
    }
  }
  return out
}

// viewerId marks a player's own view. host and spectators (no viewerId) see the
// room as it really is; a player only ever receives what has been revealed, so
// there is nothing to read ahead in devtools
// the item list is what players see, so it must not be the answer. shuffling
// once when the room is made means the creator can type them in order and the
// board still comes up scrambled — differently every game
function shuffleSort(q: Question): Question {
  if (q.type !== "sort") return q
  const order = q.items.map((_, i) => i)
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[order[i], order[j]] = [order[j], order[i]]
  }
  // order[newIndex] = oldIndex, so this inverts it for remapping references
  const moved = new Map(order.map((old, next) => [old, next]))
  return {
    ...q,
    items: order.map((old) => q.items[old]),
    values: q.values && order.map((old) => q.values?.[old] ?? ""),
    correct: q.correct.map((old) => moved.get(old) ?? 0),
    anchor: q.anchor === undefined ? undefined : moved.get(q.anchor),
  }
}

function stateOf(room: Room, viewerId?: string): RoomState {
  const q = currentQuestion(room)
  return {
    code: room.code,
    phase: room.phase,
    collectionName: room.collectionName,
    hostId: room.hostId,
    hostConnected: room.hostConnected,
    players: [...room.players.values()],
    currentIndex: room.currentIndex,
    played: room.played,
    locked: room.locked,
    revealed: room.revealed,
    revealedOptions: room.revealedOptions,
    revealedAnswers: room.revealedAnswers,
    // the verdicts travel with the round instead of the question, so the
    // answer key never sits in a player's browser before it is revealed
    correctOptions:
      q && hasOptions(q)
        ? correctSet(q).filter((i) => room.revealedOptions.includes(i))
        : [],
    answerText:
      room.revealed && q && !hasOptions(q) && q.type !== "sort"
        ? (q.answer ?? null)
        : null,
    // revealedOptions carries the flipped slot numbers on a sort round
    revealedOrder:
      q?.type === "sort"
        ? q.correct.map((item, slot) =>
            // a hard anchor is on the board from the start, so its slot counts
            // as revealed straight away
            room.revealedOptions.includes(slot) ||
            (q.anchorLocked && item === q.anchor)
              ? item
              : null,
          )
        : [],
    shownValues:
      q?.type === "sort"
        ? Object.fromEntries(
            q.correct.flatMap((item, slot) =>
              (room.revealedOptions.includes(slot) || item === q.anchor) &&
              q.values?.[item]
                ? [[item, q.values[item]]]
                : [],
            ),
          )
        : {},
    reveal: room.reveal,
    timerLeft: room.timerLeft,
    questionAt: room.questionAt,
    buzzes: room.buzzes,
    answers: viewerId === undefined ? room.answers : answersFor(room, viewerId),
    settings: room.settings,
  }
}

// players get the questions with the answer key cut out — everything else
// (text, options, image) is on their screen anyway
function questionsMsg(room: Room, full: boolean): string {
  return JSON.stringify({
    type: "questions",
    questions: full
      ? room.questions
      : room.questions.map((q) =>
          q.type === "mc"
            ? { ...q, correct: -1 }
            : q.type === "multi"
              ? { ...q, correct: [] }
              : q.type === "sort"
                ? // the order is the answer, and so are the values — both
                  // reach players through the round state instead
                  { ...q, correct: [], values: undefined }
                : { ...q, answer: undefined },
        ),
  } satisfies ServerMsg)
}

// the room code is the topic everyone shares (sounds); this one carries the
// unredacted room, so only the host and its spectators are subscribed
function fullTopic(code: string) {
  return `${code}#full`
}

function stopReveal(room: Room) {
  if (room.revealTimer) clearInterval(room.revealTimer)
  room.revealTimer = undefined
  room.revealPaused = false
}

function stopTimer(room: Room) {
  if (room.roundTimer) clearInterval(room.roundTimer)
  room.roundTimer = undefined
  room.timerLeft = null
}

function currentQuestion(room: Room): Question | undefined {
  return room.currentIndex !== null ? room.questions[room.currentIndex] : undefined
}

function closeRound(room: Room) {
  const q = currentQuestion(room)
  room.locked = true
  // option and free rounds stay face-down — the host flips options and reads
  // answers out itself, so a close (or the timer running out) is only
  // "pencils down". for them `revealed` means the answer key is fully out
  room.revealed = q !== undefined && !hasOptions(q) && q.type !== "free"
  room.reveal = 1
  stopReveal(room)
  stopTimer(room)
}

// resumes from wherever room.reveal already is — the caller zeroes it to restart
function startReveal(room: Room) {
  const q = currentQuestion(room)
  stopReveal(room)
  if (q?.type !== "reveal" || !q.revealSeconds) return
  // 20 small state broadcasts over the configured duration
  room.revealTimer = setInterval(
    () => {
      room.reveal = Math.min(1, room.reveal + 0.05)
      if (room.reveal >= 1) stopReveal(room)
      broadcast(room)
    },
    (q.revealSeconds * 1000) / 20,
  )
}

// host and spectators share one topic because they see the same full room;
// every player needs their own payload, if only for their own answer
// ponytail: a send per player per broadcast — a party-sized room, not a fanout
function broadcast(room: Room) {
  server.publish(
    fullTopic(room.code),
    JSON.stringify({ type: "state", state: stateOf(room) } satisfies ServerMsg),
  )
  for (const id of room.players.keys()) {
    const ws = sockets.get(id)
    if (ws?.readyState === 1)
      send(ws, { type: "state", state: stateOf(room, id) })
  }
}

// same split for the questions, which carry the answer key
function sendQuestions(room: Room) {
  server.publish(fullTopic(room.code), questionsMsg(room, true))
  const stripped = questionsMsg(room, false)
  for (const id of room.players.keys()) {
    const ws = sockets.get(id)
    if (ws?.readyState === 1) ws.send(stripped)
  }
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
        spectateCode: newSpectateCode(),
        hostId: msg.playerId,
        hostConnected: true,
        collectionName: msg.collectionName,
        questions: msg.questions,
        phase: "playing",
        currentIndex: null,
        played: [],
        locked: false,
        revealed: false,
        revealedOptions: [],
        revealedAnswers: [],
        paidOptions: [],
        reveal: 0,
        timerLeft: null,
        questionAt: Date.now(),
        buzzes: [],
        answers: {},
        // the host's collection can carry its own; anything it leaves out
        // falls back to the defaults
        settings: { ...defaultSettings, ...msg.settings },
        players: new Map(),
      }
      rooms.set(msg.code, room)
      spectateCodes.set(room.spectateCode, msg.code)
    }
    room.hostConnected = true
    room.collectionName = msg.collectionName
    room.questions = msg.questions.map(shuffleSort)
    ws.data = { playerId: msg.playerId, code: msg.code }
    sockets.set(msg.playerId, ws)
    ws.subscribe(msg.code)
    ws.subscribe(fullTopic(msg.code))
    send(ws, { type: "state", state: stateOf(room) })
    send(ws, { type: "spectateCode", code: room.spectateCode })
    broadcast(room)
    sendQuestions(room)
    return
  }

  if (msg.type === "spectate") {
    const roomCode = spectateCodes.get(msg.code)
    const room = roomCode ? rooms.get(roomCode) : undefined
    if (!room) return send(ws, { type: "error", message: "Room not found" })
    // no playerId in ws.data on purpose: spectators never enter room.players,
    // and the `!playerId` guard below drops every other message they could send
    ws.data = { code: room.code }
    ws.subscribe(room.code)
    ws.subscribe(fullTopic(room.code))
    send(ws, { type: "state", state: stateOf(room) })
    ws.send(questionsMsg(room, true))
    return
  }

  if (msg.type === "join") {
    const room = rooms.get(msg.code)
    if (!room) return send(ws, { type: "error", message: "Room not found" })
    ws.data = { playerId: msg.playerId, code: msg.code }
    sockets.set(msg.playerId, ws)
    ws.subscribe(msg.code)
    const isHost = msg.playerId === room.hostId
    if (isHost) {
      room.hostConnected = true
      ws.subscribe(fullTopic(msg.code))
      send(ws, { type: "spectateCode", code: room.spectateCode })
    } else {
      const existing = room.players.get(msg.playerId)
      // a rejoin remounts their page, which restarts the reaction clock — so
      // stamp it here too and let the buzz handler distrust it for this round
      if (existing) {
        existing.connected = true
        existing.joinedAt = Date.now()
      } else {
        room.players.set(msg.playerId, {
          id: msg.playerId,
          name: msg.name,
          points: 0,
          connected: true,
          rtt: 0,
          correct: 0,
          wrong: 0,
          joinedAt: Date.now(),
        })
      }
    }
    send(ws, {
      type: "state",
      state: stateOf(room, isHost ? undefined : msg.playerId),
    })
    ws.send(questionsMsg(room, isHost))
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
    // friends mode: the client times from receiving the round to pressing, so
    // both the question's trip out and the buzz's trip back cancel out. we take
    // that on trust — hence "friends" — but never a negative head start.
    // otherwise fall back to crediting the player half their roundtrip
    const reaction = msg.reaction
    const trusted =
      room.settings.friendsBuzz &&
      typeof reaction === "number" &&
      Number.isFinite(reaction) &&
      reaction >= 0 &&
      // joined mid-round: their clock started late, so it would read as fast
      player.joinedAt <= room.questionAt
    room.buzzes.push({
      playerId,
      time: trusted
        ? room.questionAt + (reaction as number)
        : Date.now() - player.rtt / 2,
    })
    room.buzzes.sort((a, b) => a.time - b.time)
    // freeze an image reveal while someone holds the buzzer, so the picture
    // doesn't keep uncovering itself while the host judges
    if (room.revealTimer) {
      stopReveal(room)
      room.revealPaused = true
    }
    broadcast(room)
    return
  }

  if (msg.type === "answer") {
    if (!room.players.has(playerId) || room.locked) return
    room.answers[playerId] = msg.value.slice(0, MAX_ANSWER)
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
        if (a.index !== null && !room.played.includes(a.index))
          room.played.push(a.index)
        room.locked = false
        room.revealed = false
        room.revealedOptions = []
        room.revealedAnswers = []
        room.paidOptions = []
        room.buzzes = []
        room.answers = {}
        room.reveal = 0
        room.questionAt = Date.now()
        stopReveal(room)
        stopTimer(room)
        break
      case "close":
        closeRound(room)
        break
      // un-close without losing the round: buzzes, answers and reveal stay put
      case "open":
        room.locked = false
        room.revealed = false
        break
      case "reset":
        room.locked = false
        room.revealed = false
        room.revealedOptions = []
        room.revealedAnswers = []
        room.paidOptions = []
        room.buzzes = []
        room.answers = {}
        room.reveal = 0
        // restarts everyone's reaction clock along with the round
        room.questionAt = Date.now()
        stopReveal(room)
        stopTimer(room)
        break
      case "reveal":
        room.reveal = Math.min(1, Math.max(0, a.to))
        if (room.reveal >= 1) stopReveal(room)
        break
      case "revealOptions": {
        const q = currentQuestion(room)
        if (q?.type === "sort") {
          // the indexes are slots here, and the whole order has to be out
          // before anything can be scored — the answer is the arrangement
          room.revealedOptions = [
            ...new Set(a.indexes.filter((i) => i >= 0 && i < q.items.length)),
          ]
          room.revealed = room.revealedOptions.length === q.items.length
          if (!room.revealed || room.paidOptions.length > 0) break
          room.paidOptions = q.items.map((_, i) => i)
          for (const [pid, value] of Object.entries(room.answers)) {
            const p = room.players.get(pid)
            if (!p) continue
            const won = scoreSort(q, value, room.settings.sortPoints)
            p.points += won
            // a sort is one answer however many slots it has, so it counts
            // once on the leaderboard tally
            if (won > 0) p.correct++
            else p.wrong++
          }
          break
        }
        if (!q || !hasOptions(q)) break
        room.revealedOptions = [
          ...new Set(a.indexes.filter((i) => i >= 0 && i < q.options.length)),
        ]
        // the round counts as revealed once nothing of the key is left hidden
        room.revealed = correctSet(q).every((i) =>
          room.revealedOptions.includes(i),
        )
        // a select-all tick is worth less than a whole answer, so the two types
        // pay from different pairs
        const [forRight, forWrong] =
          q.type === "multi"
            ? [
                room.settings.multiPointsCorrect,
                room.settings.multiPointsWrong,
              ]
            : [room.settings.pointsCorrect, room.settings.pointsWrong]
        // one option at a time: flipping it pays everyone who ticked it.
        // paidOptions is what keeps an un-flip-and-re-flip (or a host reload)
        // from paying the same option twice — it only clears with the round
        for (const i of room.revealedOptions) {
          if (room.paidOptions.includes(i)) continue
          room.paidOptions.push(i)
          const correct = correctSet(q).includes(i)
          for (const [pid, value] of Object.entries(room.answers)) {
            if (!picksOf(value).includes(String(i))) continue
            const p = room.players.get(pid)
            if (!p) continue
            p.points += correct ? forRight : forWrong
            if (correct) p.correct++
            else p.wrong++
          }
        }
        break
      }
      case "revealAnswers":
        // free answers are typed text, so the host still judges them — showing
        // one to the room pays out nothing on its own
        room.revealedAnswers = [
          ...new Set(a.playerIds.filter((id) => room.players.has(id))),
        ]
        break
      case "revealSolution":
        room.revealed = a.on
        break
      case "revealAuto":
        // start over: otherwise pressing this at a full reveal (after "Show
        // full", or a close/open round, which pin it to 1) does nothing at all
        room.reveal = 0
        startReveal(room)
        break
      case "clearBuzz":
        room.buzzes = []
        if (room.revealPaused) startReveal(room)
        break
      case "startTimer": {
        const secs = room.settings.mcSeconds
        if (!secs || secs < 1) break
        stopTimer(room)
        room.timerLeft = Math.round(secs)
        room.roundTimer = setInterval(() => {
          const left = (room.timerLeft ?? 1) - 1
          if (left > 0) room.timerLeft = left
          else {
            closeRound(room)
            // closeRound nulls timerLeft; put the 0 back so clients can land
            // their final countdown cue. the next question clears it
            room.timerLeft = 0
          }
          broadcast(room)
        }, 1000)
        break
      }
      case "points": {
        const p = room.players.get(a.playerId)
        if (p) {
          p.points += a.delta
          if (a.correct === true) p.correct++
          else if (a.correct === false) p.wrong++
        }
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
      case "sound": {
        const sound: ServerMsg = { type: "sound", name: a.name }
        if (a.playerId) {
          // the host machine usually drives the room speakers, so it hears
          // every verdict — the other players only hear their own
          for (const id of [a.playerId, room.hostId]) {
            const target = sockets.get(id)
            if (target) send(target, sound)
          }
        } else server.publish(room.code, JSON.stringify(sound))
        return
      }
      case "end":
        room.phase = "ended"
        stopReveal(room)
        stopTimer(room)
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
