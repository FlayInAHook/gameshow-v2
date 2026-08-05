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
      // seconds for the automatic reveal; unset = host steps manually
      revealSeconds?: number
    })

export type QuestionType = Question["type"]

export type Collection = { id: string; name: string; questions: Question[] }

export type Settings = { pointsCorrect: number; pointsWrong: number }

export type PlayerInfo = {
  id: string
  name: string
  points: number
  connected: boolean
  rtt: number
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
  // effective (rtt-compensated) press times, epoch ms, sorted ascending
  buzzes: { playerId: string; time: number }[]
  answers: Record<string, string>
  settings: Settings
}

export type SoundName = "buzzer" | "correct" | "wrong" | "tada"

export type HostAction =
  | { kind: "question"; index: number | null }
  | { kind: "close" }
  | { kind: "reset" }
  | { kind: "points"; playerId: string; delta: number }
  | { kind: "rename"; playerId: string; name: string }
  | { kind: "kick"; playerId: string }
  | { kind: "settings"; settings: Partial<Settings> }
  | { kind: "sound"; name: SoundName }
  | { kind: "reveal"; to: number }
  | { kind: "revealAuto" }
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
  | { type: "buzz" }
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
