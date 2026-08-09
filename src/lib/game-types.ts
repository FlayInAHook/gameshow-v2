export type RevealFilter = "zoom" | "blur" | "pixelate" | "scramble"

// image is a data-url, applied client-side
type QuestionBase = { id: string; text: string; image?: string }

export type Question =
  | (QuestionBase & {
      type: "mc"
      options: string[]
      correct: number
    })
  | (QuestionBase & { type: "buzz"; answer?: string })
  | (QuestionBase & { type: "free"; answer?: string })
  | (QuestionBase & {
      type: "reveal"
      answer?: string
      filters: Array<RevealFilter>
      // zoom focal point, 0..1 of the image; unset = centered
      zoom?: { x: number; y: number }
      // seconds for the automatic reveal; unset = host steps manually
      revealSeconds?: number
    })

export type QuestionType = Question["type"]

export type Collection = { id: string; name: string; questions: Question[] }

export type Settings = {
  pointsCorrect: number
  pointsWrong: number
  // given to every *other* player when someone answers wrong; 0 = off
  pointsWrongOthers: number
  // how far one "Step reveal" press uncovers, in percent
  revealStepPercent: number
  // once someone buzzes, players stop seeing the question and its image
  buzzHidesQuestion: boolean
  // seconds on the host-started countdown for mc rounds; 0 = no timer
  mcSeconds: number
  // order buzzes by the reaction time each player's own device reports, which
  // cancels latency in both directions but takes the client at its word
  friendsBuzz: boolean
}

export type PlayerInfo = {
  id: string
  name: string
  points: number
  connected: boolean
  rtt: number
  // host judgements, for the end-of-game leaderboard
  correct: number
  wrong: number
  // server clock at their last join; a join after the round started means their
  // reaction clock started late, so friends-mode timing can't trust it
  joinedAt: number
}

// questions travel in a separate "questions" message so images (data-urls)
// aren't re-broadcast with every state change
export type RoomState = {
  code: string
  phase: "playing" | "ended"
  collectionName: string
  hostId: string
  hostConnected: boolean
  players: PlayerInfo[]
  currentIndex: number | null
  // question indexes that have been shown at least once
  played: number[]
  locked: boolean
  revealed: boolean
  // image-reveal progress 0..1
  reveal: number
  // seconds left on the round timer, counted down by the server; null = no timer
  timerLeft: number | null
  // server clock when this round started; clients restart their reaction timer
  // whenever it changes
  questionAt: number
  // effective (rtt-compensated) press times, epoch ms, sorted ascending
  buzzes: { playerId: string; time: number }[]
  answers: Record<string, string>
  settings: Settings
}

export type SoundName =
  | "buzzer"
  | "correct"
  | "wrong"
  | "tada"
  | "tick"
  | "timeup"

export type HostAction =
  | { kind: "question"; index: number | null }
  | { kind: "close" }
  | { kind: "open" }
  | { kind: "reset" }
  // correct is set only when this came from a host judgement, so manual +/-
  // tweaks and everyone-else bonuses don't skew the tally
  | { kind: "points"; playerId: string; delta: number; correct?: boolean }
  | { kind: "rename"; playerId: string; name: string }
  | { kind: "kick"; playerId: string }
  | { kind: "settings"; settings: Partial<Settings> }
  // playerId narrows the sound to that player (and the host, who usually drives
  // the room speakers); omit it to play for everyone
  | { kind: "sound"; name: SoundName; playerId?: string }
  | { kind: "reveal"; to: number }
  | { kind: "revealAuto" }
  // drops the buzzes without touching reveal progress, unlike "reset"
  | { kind: "clearBuzz" }
  | { kind: "startTimer" }
  | { kind: "end" }
  | { kind: "reopen" }

export type ClientMsg =
  | {
      type: "create"
      code: string
      playerId: string
      collectionName: string
      questions: Question[]
    }
  | { type: "join"; code: string; playerId: string; name: string }
  // reaction is ms from the client receiving the round to pressing; the server
  // only uses it in friends mode
  | { type: "buzz"; reaction?: number }
  | { type: "answer"; value: string }
  | { type: "pong"; t: number }
  | { type: "host"; action: HostAction }

export type ServerMsg =
  | { type: "state"; state: RoomState }
  | { type: "questions"; questions: Question[] }
  | { type: "ping"; t: number }
  | { type: "sound"; name: SoundName }
  | { type: "kicked" }
  | { type: "error"; message: string }

export const WS_PORT = 3168

// keeps one pasted wall of text from blowing up the host's answer list
export const MAX_ANSWER = 200
