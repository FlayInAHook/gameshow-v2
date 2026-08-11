export type RevealFilter = "zoom" | "blur" | "pixelate" | "scramble"

// image is a data-url, applied client-side
type QuestionBase = { id: string; text: string; image?: string }

export type Question =
  | (QuestionBase & {
      type: "mc"
      options: string[]
      correct: number
    })
  // pick every right option, not just one. scored a tick at a time: each right
  // one pays, each wrong one costs, so a scattergun answer cancels itself out
  | (QuestionBase & {
      type: "multi"
      options: string[]
      correct: number[]
    })
  // put the items in order by some criterion. `items` is deliberately not the
  // answer — the order lives in `correct`, which players never receive
  | (QuestionBase & {
      type: "sort"
      items: string[]
      // item indexes, top to bottom in the true order
      correct: number[]
      // parallel to items: the birth year, the population… shown for the
      // anchor up front and for every item as its slot is revealed
      values?: string[]
      // the item whose value is given away from the start, as a scale to
      // reason against
      anchor?: number
      // hard anchor: it also sits locked in its true slot, so the split above
      // and below is given too
      anchorLocked?: boolean
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

// the two types that put options on the board and are answered by picking them
export type OptionQuestion = Extract<Question, { type: "mc" | "multi" }>

export function hasOptions(q: Question): q is OptionQuestion {
  return q.type === "mc" || q.type === "multi"
}

// the types whose answer is a line of text the host reveals at the end
export function hasAnswerText(
  q: Question,
): q is Extract<Question, { type: "buzz" | "free" | "reveal" }> {
  return q.type === "buzz" || q.type === "free" || q.type === "reveal"
}

export function correctSet(q: OptionQuestion): number[] {
  return q.type === "mc" ? [q.correct] : q.correct
}

// an option answer travels as its indexes, comma-joined — a single-choice
// answer is just the one-element case, so both types read the same way
export function picksOf(value: string | undefined): string[] {
  return value ? value.split(",") : []
}

export type SortQuestion = Extract<Question, { type: "sort" }>

// a hard anchor is placed for the player, so it is not theirs to get right —
// it stays out of the scoring entirely
export function scoredItems(q: SortQuestion): number[] {
  const locked = q.anchorLocked && q.anchor !== undefined ? q.anchor : -1
  return q.correct.filter((item) => item !== locked)
}

// where each item sits on the player's board; missing = still in the pool
export function placedAt(value: string | undefined): Map<number, number> {
  const out = new Map<number, number>()
  picksOf(value).forEach((raw, slot) => {
    if (raw !== "") out.set(Number(raw), slot)
  })
  return out
}

/**
 * What a sorted answer is worth.
 *
 * Pairs, not positions: an item in the wrong place should not read the same as
 * a shuffle, and every positional measure (deviation and friends) scores those
 * two identically. Chance-corrected so a shuffle is worth nothing, square-rooted
 * so partial knowledge still pays, and floored at the value of the slots placed
 * exactly right so a correct placement always counts for something.
 */
export function scoreSort(
  q: SortQuestion,
  value: string | undefined,
  points: number,
): number {
  const items = scoredItems(q)
  const n = items.length
  if (n === 0) return 0
  const truePos = new Map(q.correct.map((item, slot) => [item, slot]))
  const playerPos = placedAt(value)

  let exact = 0
  for (const item of items)
    if (playerPos.get(item) === truePos.get(item)) exact++

  // pairs involving an unplaced item are neither right nor wrong, but they
  // still count against the total — placing only what you know pays less
  let net = 0
  for (let a = 0; a < n; a++)
    for (let b = a + 1; b < n; b++) {
      const pa = playerPos.get(items[a])
      const pb = playerPos.get(items[b])
      if (pa === undefined || pb === undefined) continue
      const trueWay = truePos.get(items[a])! < truePos.get(items[b])!
      net += trueWay === pa < pb ? 1 : -1
    }
  const tau = n > 1 ? net / ((n * (n - 1)) / 2) : 1

  const curve = points * Math.sqrt(Math.max(0, tau))
  const floor = (exact * points) / n
  const total = Math.max(curve, floor)
  // the whole round is tallied before anything is rounded, and then it rounds
  // down unless it is within a quarter point — a lucky slot shouldn't round
  // its way up to a point it didn't earn
  const rounded =
    total - Math.floor(total) >= 0.75 ? Math.ceil(total) : Math.floor(total)
  // the bonus keeps a flawless order strictly better than a near miss
  return rounded + (exact === n ? 1 : 0)
}

export function samePicks(value: string | undefined, correct: number[]) {
  const picks = picksOf(value)
  return (
    picks.length === correct.length &&
    correct.every((i) => picks.includes(String(i)))
  )
}

// settings ride along with the collection so a game can be set up once and
// hosted the same way every time; the host can still change them mid-game
export type Collection = {
  id: string
  name: string
  questions: Question[]
  settings?: Settings
}

export type Settings = {
  pointsCorrect: number
  pointsWrong: number
  // given to every *other* player when someone answers wrong; 0 = off
  pointsWrongOthers: number
  // select-all rounds are scored a tick at a time instead of all-or-nothing,
  // so a half-right answer is worth something and a scattergun costs
  multiPointsCorrect: number
  multiPointsWrong: number
  // what a flawless sort pays, whatever the item count; a near miss gets a
  // share of it, and a flawless one gets one more on top
  sortPoints: number
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

export const defaultSettings: Settings = {
  pointsCorrect: 3,
  pointsWrong: 0,
  pointsWrongOthers: 1,
  multiPointsCorrect: 1,
  multiPointsWrong: -1,
  sortPoints: 5,
  revealStepPercent: 5,
  // a buzzed question stays on the buzzer's screen, not everyone's — the room
  // waits for the verdict instead of reading on
  buzzHidesQuestion: true,
  mcSeconds: 30,
  friendsBuzz: true,
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
  // mc and free stage their reveal: closing the round locks the answers without
  // giving anything away, and the host then uncovers it a piece at a time.
  // mc: option indexes flipped face-up
  revealedOptions: number[]
  // free: players whose typed answer has been read out to the room
  revealedAnswers: string[]
  // the answer key, but only once it is out: players never receive it in the
  // questions payload, so these are what their screen renders the verdict from.
  // the correct options among the flipped ones, and the answer text (null until
  // the host reveals it)
  correctOptions: number[]
  answerText: string | null
  // sort rounds: which item belongs in each slot, filled in as the host flips
  // them (null = still face down), and the values that have been given away —
  // the anchor's from the start, the rest as their slot turns over
  revealedOrder: (number | null)[]
  shownValues: Record<number, string | undefined>
  // image-reveal progress 0..1
  reveal: number
  // seconds left on the round timer, counted down by the server; null = no timer
  timerLeft: number | null
  // server clock when this round started; clients restart their reaction timer
  // whenever it changes
  questionAt: number
  // effective (rtt-compensated) press times, epoch ms, sorted ascending
  buzzes: { playerId: string; time: number }[]
  // a player who hasn't answered simply has no key here. a player's own copy
  // is filtered down to their answer plus the ones already shown to the room
  answers: Record<string, string | undefined>
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
  // the full set of mc options to show face-up; host sends the whole set, so
  // one action covers flipping, unflipping and "reveal all"
  | { kind: "revealOptions"; indexes: number[] }
  // same, for the players whose free-text answer is face-up
  | { kind: "revealAnswers"; playerIds: string[] }
  // the question's own answer, on a free round the host reveals last
  | { kind: "revealSolution"; on: boolean }
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
      // only applied when the room is first created, so a host reconnecting
      // can't wipe out settings tuned during the game
      settings?: Settings
    }
  | { type: "join"; code: string; playerId: string; name: string }
  // read-only viewer; code is the room's spectate code, not its join code
  | { type: "spectate"; code: string }
  // reaction is ms from the client receiving the round to pressing; the server
  // only uses it in friends mode
  | { type: "buzz"; reaction?: number }
  | { type: "answer"; value: string }
  | { type: "pong"; t: number }
  | { type: "host"; action: HostAction }

export type ServerMsg =
  | { type: "state"; state: RoomState }
  | { type: "questions"; questions: Question[] }
  // host only, never part of RoomState — a player who could read it off the
  // broadcast could open the spectate view and see everyone else's answers
  | { type: "spectateCode"; code: string }
  | { type: "ping"; t: number }
  | { type: "sound"; name: SoundName }
  | { type: "kicked" }
  | { type: "error"; message: string }

export const WS_PORT = 3168

// keeps one pasted wall of text from blowing up the host's answer list
export const MAX_ANSWER = 200
