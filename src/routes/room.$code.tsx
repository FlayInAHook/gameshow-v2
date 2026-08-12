import { useCallback, useEffect, useRef, useState } from "react"
import { Link, createFileRoute } from "@tanstack/react-router"
import NumberFlow from "@number-flow/react"
import { HostView } from "@/components/host-view"
import { RevealImage } from "@/components/reveal-image"
import { SortBoard } from "@/components/sort-board"
import {
  AnswerBubbles,
  ConnectionDot,
  Leaderboard,
  McOption,
  StandingsList,
  VoteBubbles,
} from "@/components/scoreboard"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Kbd } from "@/components/ui/kbd"
import { useTimerCues } from "@/hooks/use-timer-cues"
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
import { MAX_ANSWER, hasOptions, picksOf, samePicks } from "@/lib/game-types"
import type {
  ClientMsg,
  Collection,
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
  // undefined while IndexedDB is still answering, null once we know this
  // browser is not the host. the difference matters: showing the join form to
  // the host would have them join their own room as a player
  const [collection, setCollection] = useState<Collection | null | undefined>(
    hostCollectionId == null ? null : undefined,
  )
  useEffect(() => {
    if (hostCollectionId == null) return
    void loadCollections().then((cs) =>
      setCollection(cs.find((c) => c.id === hostCollectionId) ?? null),
    )
  }, [hostCollectionId])
  const [name, setName] = useState(getPlayerName)
  const [joinedManually, setJoinedManually] = useState(false)
  // the host is in as soon as their collection turns up; everyone else types a name
  const joined = joinedManually || collection != null

  const joinMsg = !joined
    ? null
    : collection
      ? {
          type: "create" as const,
          code,
          playerId,
          collectionName: collection.name,
          questions: collection.questions,
          settings: collection.settings,
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

  if (collection === undefined)
    return (
      <Center>
        <p className="animate-pulse text-muted-foreground">Loading…</p>
      </Center>
    )

  if (!joined)
    return (
      <Center>
        <h1 className="text-2xl font-bold">
          Join room{" "}
          {/* the code drops in a character at a time, so the room number is the
              first thing that moves on the whole site */}
          {code.split("").map((ch, i) => (
            <span
              key={i}
              className="pop-in inline-block"
              style={{ animationDelay: `${0.1 + i * 0.08}s` }}
            >
              {ch}
            </span>
          ))}
        </h1>
        <form
          className="pop-in flex gap-2"
          style={{ animationDelay: `${0.1 + code.length * 0.08}s` }}
          onSubmit={(e) => {
            e.preventDefault()
            if (!name.trim()) return
            initAudio()
            setPlayerName(name.trim())
            setJoinedManually(true)
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

// "+1" reads as a reward where "1" reads as a label
const signed = (n: number) => (n > 0 ? `+${n}` : String(n))

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
  const myPicks = picksOf(myAnswer)
  // every card face-up, not just the key: the decoys they left alone are half
  // of what they got right. correctOptions is the whole key by then, so a
  // player can tell they nailed it without ever being sent the answer
  const wonTheSet =
    q?.type === "multi" &&
    state.revealedOptions.length === q.options.length &&
    samePicks(myAnswer, state.correctOptions)
  const myBuzzIndex = state.buzzes.findIndex((b) => b.playerId === playerId)
  const [freeText, setFreeText] = useState("")
  const buzzable = q?.type === "buzz" || q?.type === "reveal"

  // the points you just took, floating out of the score. the first state to
  // arrive is the baseline, not a gain — a reconnect mid-game would otherwise
  // read as scoring everything at once
  const [pop, setPop] = useState<{ n: number; key: number } | null>(null)
  const prevPoints = useRef<number | null>(null)
  useEffect(() => {
    const p = me?.points
    if (p === undefined) return
    if (prevPoints.current !== null && p !== prevPoints.current)
      setPop({ n: p - prevPoints.current, key: performance.now() })
    prevPoints.current = p
  }, [me?.points])

  // somebody else got there first: the edges of the screen go red
  const [beat, setBeat] = useState(0)
  const prevBuzz = useRef(0)
  useEffect(() => {
    const n = state.buzzes.length
    if (n === 1 && prevBuzz.current === 0 && state.buzzes[0].playerId !== playerId)
      setBeat((k) => k + 1)
    prevBuzz.current = n
  }, [state.buzzes, playerId])

  // a chime for each arrival, but only in the lobby — mid-round it is noise
  const inLobby = state.currentIndex === null
  const prevCount = useRef<number | null>(null)
  useEffect(() => {
    const n = state.players.length
    if (prevCount.current !== null && n > prevCount.current && inLobby)
      sounds.chime()
    prevCount.current = n
  }, [state.players.length, inLobby])
  // multiple choice replaces the pick, select-all toggles it in and out of the
  // set — either way the whole answer goes back to the server
  const pick = (i: string) =>
    send({
      type: "answer",
      value:
        q?.type !== "multi"
          ? i
          : (myPicks.includes(i)
              ? myPicks.filter((x) => x !== i)
              : [...myPicks, i]
            )
              .sort((a, b) => Number(a) - Number(b))
              .join(","),
    })
  // keeps the rest of the room from reading on while the host judges the buzz
  const hideQuestion =
    state.settings.buzzHidesQuestion && state.buzzes.length > 0

  useTimerCues(state)

  // reaction clock: restarts whenever the server starts a round, measured with
  // performance.now() so a wall-clock adjustment can't skew it
  const roundAt = state.questionAt
  const shownAt = useRef(0)
  useEffect(() => {
    shownAt.current = performance.now()
  }, [roundAt])

  // bumped here rather than on the button so the spacebar gets the shockwave too
  const [ringKey, setRingKey] = useState(0)
  const buzz = useCallback(() => {
    setRingKey((k) => k + 1)
    send({
      type: "buzz",
      reaction: Math.round(performance.now() - shownAt.current),
    })
  }, [send])

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
    // pop-in doubles as the join transition: this mounts once, when the first
    // state lands
    <main className="pop-in mx-auto flex min-h-svh max-w-xl flex-col gap-6 p-6">
      {beat > 0 && (
        <div
          key={beat}
          aria-hidden
          className="edge-flash pointer-events-none fixed inset-0 z-50"
        />
      )}

      {/* the clock as a bar as well as a number — on a phone the drain is
          readable out of the corner of your eye while you are picking */}
      {state.timerLeft !== null && state.timerTotal !== null && (
        <div className="fixed inset-x-0 top-0 z-40 h-1 bg-muted">
          <div
            className={cn(
              "h-full transition-[width] duration-1000 ease-linear",
              state.timerLeft <= 5 ? "bg-red-600" : "bg-primary",
            )}
            style={{
              width: `${(state.timerLeft / state.timerTotal) * 100}%`,
            }}
          />
        </div>
      )}

      <header className="flex items-center gap-3">
        <ConnectionDot connected={connected} />
        <span className="font-medium">{me?.name}</span>
        <Badge variant="secondary">Room {state.code}</Badge>
        <span className="relative ml-auto">
          {pop && (
            <span
              key={`glow-${pop.key}`}
              aria-hidden
              className={cn(
                "score-glow pointer-events-none absolute inset-0 rounded-full blur-md",
                pop.n > 0 ? "bg-green-500" : "bg-red-500",
              )}
            />
          )}
          <NumberFlow className="text-2xl font-bold" value={me?.points ?? 0} />
          {pop && (
            <span
              key={pop.key}
              aria-hidden
              className={cn(
                "score-float pointer-events-none absolute -top-1 left-1/2 text-lg font-black",
                pop.n > 0 ? "text-green-500" : "text-red-500",
              )}
            >
              {signed(pop.n)}
            </span>
          )}
        </span>
      </header>

      {state.standings !== "off" ? (
        <div className="flex flex-1 flex-col items-center gap-4 pt-4">
          <h1 className="text-2xl font-bold">
            {state.standings === "points" ? "🏆 Scores" : "🏆 Standings"}
          </h1>
          <StandingsList
            state={state}
            showPoints={state.standings === "points"}
            animate="quick"
            meId={playerId}
          />
        </div>
      ) : !q ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4">
          <p className="animate-pulse text-xl text-muted-foreground">
            Waiting for the host…
          </p>
          {/* joined order, not rank: a new arrival lands on the end and pops in
              on its own instead of shuffling everyone else's chip */}
          <div className="flex flex-wrap justify-center gap-2">
            {[...state.players]
              .sort((a, b) => a.joinedAt - b.joinedAt)
              .map((p) => (
                <Badge
                  key={p.id}
                  variant={p.id === playerId ? "default" : "secondary"}
                  className="pop-in max-w-full text-base"
                >
                  {p.name}
                </Badge>
              ))}
          </div>
          {!state.hostConnected && (
            <Badge variant="outline">Host disconnected</Badge>
          )}
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center gap-6 pt-8">
          {state.timerLeft !== null && (
            // keyed on the value: the remount is what restarts the beat, one
            // per tick, in step with the tick cue
            <span
              key={state.timerLeft}
              className={cn(
                "text-5xl font-black tabular-nums",
                state.timerLeft <= 5 && "tick-pop text-red-600",
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

          {hasOptions(q) && (
            <>
              {q.type === "multi" && (
                <p className="text-sm text-muted-foreground">
                  Pick every correct option — each right tick{" "}
                  {signed(state.settings.multiPointsCorrect)}, each wrong one{" "}
                  {signed(state.settings.multiPointsWrong)}.
                </p>
              )}
              {/* keyed on the question so the options land again on the next
                  one instead of the grid quietly re-using its rows */}
              <div
                key={q.id}
                className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2"
              >
                {q.options.map((opt, i) => (
                  <div
                    key={i}
                    className={cn(
                      "flex min-w-0 flex-col gap-1",
                      // the entrance, then — for a select-all answered exactly
                      // right — a lap of honour once the key is all face-up.
                      // in between, a flinch on a pick that turns out wrong
                      wonTheSet && myPicks.includes(String(i))
                        ? "win-flash"
                        : state.revealedOptions.includes(i) &&
                            myPicks.includes(String(i)) &&
                            !state.correctOptions.includes(i)
                          ? "shake"
                          : "pop-in",
                    )}
                    style={{ animationDelay: `${i * 0.09}s` }}
                  >
                    <McOption
                      option={opt}
                      // from the round, not the question: the answer key never
                      // reaches a player's browser
                      correct={state.correctOptions.includes(i)}
                      shown={state.revealedOptions.includes(i)}
                      mine={myPicks.includes(String(i))}
                      onClick={
                        state.locked ? undefined : () => pick(String(i))
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
            </>
          )}

          {q.type === "sort" && (
            <>
              <p className="text-sm text-muted-foreground">
                Put them in order — drag, or tap and use the arrows.
              </p>
              <SortBoard
                q={q}
                state={state}
                value={myAnswer}
                onChange={
                  state.locked
                    ? undefined
                    : (next) => send({ type: "answer", value: next })
                }
              />
            </>
          )}

          {buzzable && (
            <>
              <span className="relative inline-flex">
                {/* behind the button in paint order, so it reads as a
                    shockwave coming out from under it */}
                {ringKey > 0 && (
                  <span
                    key={ringKey}
                    aria-hidden
                    className="ring pointer-events-none absolute inset-0 rounded-full bg-red-500"
                  />
                )}
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
                    // armed and unpressed. a box-shadow pulse, not a transform
                    // one — transform is what hover/active are already using
                    canBuzz && "breathe",
                  )}
                >
                  BUZZ
                </button>
              </span>
              <p className="text-sm text-muted-foreground">
                or hit <Kbd>Space</Kbd>
              </p>
              {state.buzzes.length > 0 && (
                <ol className="text-center">
                  {/* no stagger: they land one at a time as they happen */}
                  {state.buzzes.map((b, i) => {
                    const who = state.players.find(
                      (p) => p.id === b.playerId,
                    )?.name
                    return (
                      <li
                        key={b.playerId}
                        className={cn(
                          "pop-in text-lg",
                          b.playerId === playerId && "font-bold",
                          i === 0 && "text-xl text-primary",
                        )}
                      >
                        {i + 1}.{" "}
                        {/* the pulse goes on the name, not the row — the row's
                            animation slot is taken by the entrance */}
                        {i === 0 ? (
                          <span className="animate-pulse">{who}</span>
                        ) : (
                          who
                        )}
                      </li>
                    )
                  })}
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
              {state.revealed
                ? "Round closed"
                : "Answers locked — waiting for the reveal"}
            </Badge>
          )}
        </div>
      )}
    </main>
  )
}

