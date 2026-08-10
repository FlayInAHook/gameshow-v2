import { useEffect, useRef } from "react"
import { Link, createFileRoute } from "@tanstack/react-router"
import { RevealImage } from "@/components/reveal-image"
import {
  ConnectionDot,
  Leaderboard,
  McOption,
  VoteBubbles,
  medals,
  ranked,
} from "@/components/scoreboard"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { initAudio, sounds } from "@/lib/sounds"
import { useRoom } from "@/lib/use-room"
import { cn } from "@/lib/utils"
import type { Question, RoomState } from "@/lib/game-types"

export const Route = createFileRoute("/spectate/$code")({
  ssr: false,
  component: SpectatePage,
})

function SpectatePage() {
  const { code } = Route.useParams()
  const { state, questions, connected, error } = useRoom({
    type: "spectate",
    code,
  })

  // the room's own buzzer cue is client-local, so play it here too
  const prevBuzzes = useRef(0)
  useEffect(() => {
    const n = state?.buzzes.length ?? 0
    if (n > 0 && prevBuzzes.current === 0) sounds.buzzer()
    prevBuzzes.current = n
  }, [state?.buzzes.length])

  const prevPhase = useRef(state?.phase)
  useEffect(() => {
    if (state?.phase === "ended" && prevPhase.current === "playing")
      sounds.tada()
    prevPhase.current = state?.phase
  }, [state?.phase])

  if (error)
    return (
      <main className="flex min-h-svh flex-col items-center justify-center gap-4 p-6">
        <p className="text-xl">{error}</p>
        <Button render={<Link to="/" />}>Home</Button>
      </main>
    )

  if (!state)
    return (
      <main className="flex min-h-svh items-center justify-center p-6">
        <p className="animate-pulse text-muted-foreground">Connecting…</p>
      </main>
    )

  if (state.phase === "ended") return <Leaderboard state={state} />

  const q: Question | null =
    state.currentIndex !== null ? (questions[state.currentIndex] ?? null) : null

  return (
    // any click unlocks audio — browsers keep the AudioContext suspended
    // until a gesture, and this screen usually has nothing else to click
    <main className="flex h-svh flex-col" onPointerDown={initAudio}>
      <header className="flex shrink-0 items-center gap-3 border-b px-4 py-2">
        <ConnectionDot connected={connected} />
        <Badge variant="secondary">Room {state.code}</Badge>
        <span className="truncate text-sm text-muted-foreground">
          {state.collectionName}
        </span>
        <Badge variant="outline" className="ml-auto">
          Spectating
        </Badge>
        {!state.hostConnected && (
          <Badge variant="destructive">Host disconnected</Badge>
        )}
      </header>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <section className="flex min-h-0 flex-1 flex-col items-center gap-6 overflow-auto p-6">
          <Stage state={state} q={q} />
        </section>
        <aside className="flex min-h-0 shrink-0 flex-col gap-4 overflow-auto border-t p-4 lg:w-96 lg:border-t-0 lg:border-l">
          <Standings state={state} />
          <LiveAnswers state={state} q={q} />
        </aside>
      </div>
    </main>
  )
}

function Stage({ state, q }: { state: RoomState; q: Question | null }) {
  if (!q)
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="animate-pulse text-xl text-muted-foreground">
          Waiting for the host…
        </p>
      </div>
    )

  // spectators see the same picture the players do, never further ahead
  const answerCount = Object.keys(state.answers).length

  return (
    <>
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

      <h1 className="text-center text-3xl font-bold">{q.text}</h1>

      {q.image &&
        (q.type === "reveal" ? (
          <RevealImage
            src={q.image}
            filters={q.filters}
            progress={state.revealed ? 1 : state.reveal}
            zoom={q.zoom}
            className="max-h-[50svh] rounded-lg"
          />
        ) : (
          <img
            src={q.image}
            alt=""
            className="max-h-[50svh] max-w-full rounded-lg"
          />
        ))}

      {q.type === "mc" && (
        <div className="grid w-full max-w-3xl grid-cols-1 gap-3 sm:grid-cols-2">
          {q.options.map((opt, i) => (
            <div key={i} className="flex min-w-0 flex-col gap-1">
              <McOption
                option={opt}
                correct={i === q.correct}
                shown={state.revealedOptions.includes(i)}
              />
              {/* the spectate link is the host's own second screen, so the
                  votes show as they land rather than waiting for the lock */}
              <VoteBubbles state={state} option={i} />
            </div>
          ))}
        </div>
      )}

      {(q.type === "mc" || q.type === "free") && (
        <p className="text-sm text-muted-foreground tabular-nums">
          {answerCount} / {state.players.length} answered
        </p>
      )}

      {state.revealed && q.type !== "mc" && q.answer && (
        <p className="text-xl">
          Answer: <strong>{q.answer}</strong>
        </p>
      )}
      {state.locked && (
        <Badge variant="secondary">
          {q.type === "mc" && !state.revealedOptions.includes(q.correct)
            ? "Answers locked — waiting for the reveal"
            : "Round closed"}
        </Badge>
      )}
    </>
  )
}

function Standings({ state }: { state: RoomState }) {
  const rows = ranked(state)
  return (
    <div className="flex flex-col gap-2">
      <Label>Standings</Label>
      {rows.length === 0 && (
        <p className="text-sm text-muted-foreground">Nobody joined yet.</p>
      )}
      {rows.map((p, i) => (
        <div
          key={p.id}
          className={cn(
            "flex items-center gap-2 rounded-lg border p-2",
            i === 0 && "border-amber-400 bg-amber-400/10",
          )}
        >
          <span className={cn("w-5 text-sm font-black", medals[i])}>
            {i + 1}
          </span>
          <ConnectionDot connected={p.connected} />
          <span className="min-w-0 flex-1 truncate text-sm font-medium">
            {p.name}
          </span>
          <span className="text-xs font-semibold text-green-600 tabular-nums">
            {p.correct}
          </span>
          <span className="text-xs font-semibold text-red-600 tabular-nums">
            {p.wrong}
          </span>
          <span className="w-10 text-right font-bold tabular-nums">
            {p.points}
          </span>
        </div>
      ))}
    </div>
  )
}

function LiveAnswers({ state, q }: { state: RoomState; q: Question | null }) {
  if (!q) return null
  const name = (id: string) =>
    state.players.find((p) => p.id === id)?.name ?? "?"

  if (q.type === "buzz" || q.type === "reveal") {
    const quiet = state.players.filter(
      (p) => !state.buzzes.some((b) => b.playerId === p.id),
    )
    return (
      <div className="flex flex-col gap-2">
        <Label>Buzz order</Label>
        {state.buzzes.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Nobody has buzzed yet.
          </p>
        )}
        {state.buzzes.map((b, i) => (
          <div
            key={b.playerId}
            className={cn(
              "flex items-center gap-2 rounded-lg border p-2",
              i === 0 && "border-primary bg-primary/10",
            )}
          >
            <span className="font-bold">{i + 1}.</span>
            <span className="min-w-0 flex-1 truncate font-medium">
              {name(b.playerId)}
            </span>
            <span className="text-xs text-muted-foreground tabular-nums">
              {i === 0
                ? "first"
                : `+${Math.round(b.time - state.buzzes[0].time)}ms`}
            </span>
          </div>
        ))}
        {quiet.length > 0 && state.buzzes.length > 0 && (
          <p className="text-xs text-muted-foreground">
            Still holding: {quiet.map((p) => p.name).join(", ")}
          </p>
        )}
      </div>
    )
  }

  // walk the players, not the answers, so the panel shows who is still typing
  // instead of silently omitting them
  return (
    <div className="flex flex-col gap-2">
      <Label>Answers</Label>
      {state.players.length === 0 && (
        <p className="text-sm text-muted-foreground">No contestants.</p>
      )}
      {state.players.map((p) => {
        const value = state.answers[p.id]
        const mcCorrect =
          value !== undefined && q.type === "mc"
            ? Number(value) === q.correct
            : null
        return (
          <div
            key={p.id}
            className={cn(
              "rounded-lg border p-2",
              value === undefined && "border-dashed opacity-60",
            )}
          >
            <div className="truncate text-sm font-semibold">{p.name}</div>
            {value === undefined ? (
              <div className="mt-1 text-sm text-muted-foreground italic">
                {state.locked ? "no answer" : "still answering…"}
              </div>
            ) : (
              <div
                className={cn(
                  "mt-1 border-l-2 border-muted-foreground/40 pl-2 wrap-anywhere text-muted-foreground",
                  // this screen is the host's, so it doesn't wait on the reveal
                  mcCorrect === true && "text-green-600",
                  mcCorrect === false && "text-red-600",
                )}
              >
                {q.type === "mc" ? q.options[Number(value)] : value}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
