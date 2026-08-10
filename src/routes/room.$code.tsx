import { useCallback, useEffect, useRef, useState } from "react"
import { Link, createFileRoute } from "@tanstack/react-router"
import { HostView } from "@/components/host-view"
import { RevealImage } from "@/components/reveal-image"
import {
  AnswerBubbles,
  ConnectionDot,
  Leaderboard,
  McOption,
  VoteBubbles,
  solutionOut,
} from "@/components/scoreboard"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Kbd } from "@/components/ui/kbd"
import { initAudio, sounds } from "@/lib/sounds"
import {
  getHostRooms,
  getPlayerId,
  getPlayerName,
  loadCollections,
  setPlayerName,
} from "@/lib/store"
import { useRoom } from "@/lib/use-room"
import { cn } from "@/lib/utils"
import { MAX_ANSWER } from "@/lib/game-types"
import type {
  ClientMsg,
  HostAction,
  Question,
  RoomState,
} from "@/lib/game-types"

export const Route = createFileRoute("/room/$code")({
  ssr: false,
  component: RoomPage,
})

function RoomPage() {
  const { code } = Route.useParams()
  const [playerId] = useState(getPlayerId)
  // snapshot once at mount — used only to decide whether to (re)create the room;
  // after that the server's state.hostId is authoritative
  const [hostCollectionId] = useState(() => getHostRooms()[code])
  const [collection] = useState(() =>
    hostCollectionId != null
      ? loadCollections().find((c) => c.id === hostCollectionId)
      : undefined,
  )
  const [name, setName] = useState(getPlayerName)
  const [joined, setJoined] = useState(collection != null)

  const joinMsg = !joined
    ? null
    : collection
      ? {
          type: "create" as const,
          code,
          playerId,
          collectionName: collection.name,
          questions: collection.questions,
        }
      : { type: "join" as const, code, playerId, name }

  const { state, questions, spectateCode, connected, kicked, error, send } =
    useRoom(joinMsg)
  const isHost = state ? state.hostId === playerId : collection != null

  // play the buzzer locally for everyone when the first buzz of a round lands
  const prevBuzzes = useRef(0)
  useEffect(() => {
    const n = state?.buzzes.length ?? 0
    if (n > 0 && prevBuzzes.current === 0) sounds.buzzer()
    prevBuzzes.current = n
  }, [state?.buzzes.length])

  // fanfare when the leaderboard comes up
  const prevPhase = useRef(state?.phase)
  useEffect(() => {
    if (state?.phase === "ended" && prevPhase.current === "playing")
      sounds.tada()
    prevPhase.current = state?.phase
  }, [state?.phase])

  const hostAct = (action: HostAction) => send({ type: "host", action })

  if (kicked)
    return (
      <Center>
        <p className="text-xl">You were kicked from the room.</p>
        <Button onClick={() => location.reload()}>Rejoin</Button>
      </Center>
    )

  if (error)
    return (
      <Center>
        <p className="text-xl">{error}</p>
        <Button render={<Link to="/" />}>Home</Button>
      </Center>
    )

  if (!joined)
    return (
      <Center>
        <h1 className="text-2xl font-bold">Join room {code}</h1>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (!name.trim()) return
            initAudio()
            setPlayerName(name.trim())
            setJoined(true)
          }}
        >
          <Input
            autoFocus
            placeholder="Your name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Button type="submit">Join</Button>
        </form>
      </Center>
    )

  if (!state)
    return (
      <Center>
        <p className="animate-pulse text-muted-foreground">Connecting…</p>
      </Center>
    )

  if (state.phase === "ended")
    return (
      <Leaderboard
        state={state}
        onReopen={isHost ? () => hostAct({ kind: "reopen" }) : undefined}
      />
    )

  return isHost ? (
    <HostView
      state={state}
      questions={questions}
      act={hostAct}
      connected={connected}
      spectateCode={spectateCode}
    />
  ) : (
    <PlayerView
      state={state}
      questions={questions}
      send={send}
      playerId={playerId}
      connected={connected}
    />
  )
}

function Center({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-4 p-6">
      {children}
    </main>
  )
}


/* ------------------------------ player view ------------------------------ */

function PlayerView({
  state,
  questions,
  send,
  playerId,
  connected,
}: {
  state: RoomState
  questions: Array<Question>
  send: (m: ClientMsg) => void
  playerId: string
  connected: boolean
}) {
  const me = state.players.find((p) => p.id === playerId)
  const q: Question | null =
    state.currentIndex !== null
      ? (questions[state.currentIndex] ?? null)
      : null
  const myAnswer = state.answers[playerId]
  const myBuzzIndex = state.buzzes.findIndex((b) => b.playerId === playerId)
  const [freeText, setFreeText] = useState("")
  const buzzable = q?.type === "buzz" || q?.type === "reveal"
  // keeps the rest of the room from reading on while the host judges the buzz
  const hideQuestion =
    state.settings.buzzHidesQuestion && state.buzzes.length > 0

  // countdown cues: a heads-up at 10s, then every second from 5 down to 0.
  // the dep is the value itself, so each second fires exactly once
  const timerLeft = state.timerLeft
  useEffect(() => {
    if (timerLeft === null) return
    if (timerLeft === 0) sounds.timeup()
    else if (timerLeft === 10 || timerLeft <= 5) sounds.tick()
  }, [timerLeft])

  // reaction clock: restarts whenever the server starts a round, measured with
  // performance.now() so a wall-clock adjustment can't skew it
  const roundAt = state.questionAt
  const shownAt = useRef(0)
  useEffect(() => {
    shownAt.current = performance.now()
  }, [roundAt])

  const buzz = useCallback(
    () =>
      send({
        type: "buzz",
        reaction: Math.round(performance.now() - shownAt.current),
      }),
    [send],
  )

  // spacebar buzzes on buzz questions
  const canBuzz = buzzable && !state.locked && myBuzzIndex < 0
  useEffect(() => {
    if (!canBuzz) return
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Space" || e.repeat) return
      if (e.target instanceof HTMLInputElement) return
      e.preventDefault()
      buzz()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [canBuzz, buzz])

  return (
    <main className="mx-auto flex min-h-svh max-w-xl flex-col gap-6 p-6">
      <header className="flex items-center gap-3">
        <ConnectionDot connected={connected} />
        <span className="font-medium">{me?.name}</span>
        <Badge variant="secondary">Room {state.code}</Badge>
        <span className="ml-auto text-2xl font-bold tabular-nums">
          {me?.points ?? 0}
        </span>
      </header>

      {!q ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2">
          <p className="animate-pulse text-xl text-muted-foreground">
            Waiting for the host…
          </p>
          {!state.hostConnected && (
            <Badge variant="outline">Host disconnected</Badge>
          )}
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center gap-6 pt-8">
          {state.timerLeft !== null && (
            <span
              className={cn(
                "text-5xl font-black tabular-nums",
                state.timerLeft <= 5 && "text-red-600",
              )}
            >
              {state.timerLeft}
            </span>
          )}

          {hideQuestion ? (
            <p className="animate-pulse text-center text-xl text-muted-foreground">
              Buzzed — question hidden
            </p>
          ) : (
            <>
              <h1 className="text-center text-3xl font-bold">{q.text}</h1>

              {q.image &&
                (q.type === "reveal" ? (
                  <RevealImage
                    src={q.image}
                    filters={q.filters}
                    progress={state.revealed ? 1 : state.reveal}
                    zoom={q.zoom}
                    className="max-h-[45svh] rounded-lg"
                  />
                ) : (
                  <img
                    src={q.image}
                    alt=""
                    className="max-h-[45svh] max-w-full rounded-lg"
                  />
                ))}
            </>
          )}

          {q.type === "mc" && (
            <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2">
              {q.options.map((opt, i) => (
                <div key={i} className="flex min-w-0 flex-col gap-1">
                  <McOption
                    option={opt}
                    // from the round, not the question: q.correct never
                    // reaches a player's browser
                    correct={i === state.correctOption}
                    shown={state.revealedOptions.includes(i)}
                    mine={myAnswer === String(i)}
                    onClick={
                      state.locked
                        ? undefined
                        : () => send({ type: "answer", value: String(i) })
                    }
                  />
                  {/* only under options the host has flipped, so the reveal
                      hands out the votes one option at a time */}
                  {state.revealedOptions.includes(i) && (
                    <VoteBubbles state={state} option={i} meId={playerId} />
                  )}
                </div>
              ))}
            </div>
          )}

          {buzzable && (
            <>
              <button
                disabled={state.locked || myBuzzIndex >= 0}
                onClick={buzz}
                className={cn(
                  "rounded-full bg-red-600 font-black text-white shadow-lg transition-transform select-none",
                  q.type === "reveal"
                    ? "px-10 py-4 text-2xl"
                    : "size-52 text-3xl",
                  state.locked || myBuzzIndex >= 0
                    ? "opacity-50"
                    : "hover:scale-105 active:scale-95",
                )}
              >
                BUZZ
              </button>
              <p className="text-sm text-muted-foreground">
                or hit <Kbd>Space</Kbd>
              </p>
              {state.buzzes.length > 0 && (
                <ol className="text-center">
                  {state.buzzes.map((b, i) => (
                    <li
                      key={b.playerId}
                      className={cn(
                        "text-lg",
                        b.playerId === playerId && "font-bold",
                        i === 0 && "text-xl text-primary",
                      )}
                    >
                      {i + 1}.{" "}
                      {state.players.find((p) => p.id === b.playerId)?.name}
                    </li>
                  ))}
                </ol>
              )}
            </>
          )}

          {q.type === "free" && (
            <form
              className="flex w-full max-w-sm gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                if (freeText.trim())
                  send({ type: "answer", value: freeText.trim() })
              }}
            >
              <Input
                placeholder="Your answer"
                value={freeText}
                maxLength={MAX_ANSWER}
                disabled={state.locked}
                onChange={(e) => setFreeText(e.target.value)}
              />
              <Button type="submit" disabled={state.locked}>
                {myAnswer ? "Update" : "Send"}
              </Button>
            </form>
          )}
          {q.type === "free" && myAnswer && (
            <p className="text-sm text-muted-foreground">
              Submitted: {myAnswer}
            </p>
          )}
          {q.type === "free" && (
            <AnswerBubbles state={state} meId={playerId} />
          )}

          {state.answerText && (
            <p className="text-xl">
              Answer: <strong>{state.answerText}</strong>
            </p>
          )}
          {state.locked && (
            <Badge variant="secondary">
              {solutionOut(state, q)
                ? "Round closed"
                : "Answers locked — waiting for the reveal"}
            </Badge>
          )}
        </div>
      )}
    </main>
  )
}

