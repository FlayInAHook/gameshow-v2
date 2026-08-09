import { useEffect, useRef, useState } from "react"
import { Link, createFileRoute } from "@tanstack/react-router"
import {
  BellOff,
  Check,
  Copy,
  Pencil,
  Play,
  RotateCcw,
  Trophy,
  UserX,
  Volume2,
  X,
} from "lucide-react"
import { RevealImage } from "@/components/reveal-image"
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Kbd } from "@/components/ui/kbd"
import { Label } from "@/components/ui/label"
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable"
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
  SoundName,
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

  const { state, questions, connected, kicked, error, send } = useRoom(joinMsg)
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

function ConnectionDot({ connected }: { connected: boolean }) {
  return (
    <span
      className={cn(
        "inline-block size-2 rounded-full",
        connected ? "bg-green-500" : "animate-pulse bg-red-500",
      )}
      title={connected ? "Connected" : "Reconnecting…"}
    />
  )
}

/* ------------------------------- host view ------------------------------- */

function HostView({
  state,
  questions,
  act,
  connected,
}: {
  state: RoomState
  questions: Array<Question>
  act: (a: HostAction) => void
  connected: boolean
}) {
  return (
    <div className="h-svh">
      <ResizablePanelGroup orientation="horizontal">
        <ResizablePanel defaultSize="28%" minSize="15%">
          <ResizablePanelGroup orientation="vertical">
            <ResizablePanel defaultSize="55%">
              <PlayersPanel state={state} act={act} />
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel>
              <SettingsPanel state={state} act={act} connected={connected} />
            </ResizablePanel>
          </ResizablePanelGroup>
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel minSize="20%">
          <QuestionsPanel state={state} questions={questions} act={act} />
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel defaultSize="32%" minSize="20%">
          <ActionsPanel state={state} questions={questions} act={act} />
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  )
}

function Panel({
  title,
  footer,
  children,
}: {
  title: string
  footer?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="flex h-full flex-col p-3">
      <h2 className="mb-2 shrink-0 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        {title}
      </h2>
      {/* min-h-0 lets this shrink inside the flex column instead of pushing
          the footer off the bottom — only this middle strip scrolls */}
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-auto">
        {children}
      </div>
      {footer && <div className="mt-2 shrink-0">{footer}</div>}
    </div>
  )
}

function PlayersPanel({
  state,
  act,
}: {
  state: RoomState
  act: (a: HostAction) => void
}) {
  return (
    <Panel title="Players">
      {state.players.length === 0 && (
        <p className="text-sm text-muted-foreground">Nobody joined yet.</p>
      )}
      {state.players.map((p) => (
        <div key={p.id} className="flex items-center gap-2 rounded-lg border p-2">
          <ConnectionDot connected={p.connected} />
          <span className="min-w-0 flex-1 truncate text-sm font-medium">
            {p.name}
          </span>
          <Badge variant="outline" title="roundtrip">
            {p.rtt}ms
          </Badge>
          <span className="w-10 text-right text-sm font-bold tabular-nums">
            {p.points}
          </span>
          <Button
            variant="ghost"
            size="icon-xs"
            title="-1 point"
            onClick={() => act({ kind: "points", playerId: p.id, delta: -1 })}
          >
            −
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            title="+1 point"
            onClick={() => act({ kind: "points", playerId: p.id, delta: 1 })}
          >
            +
          </Button>
          <RenameButton
            name={p.name}
            onRename={(name) => act({ kind: "rename", playerId: p.id, name })}
          />
          <KickButton
            name={p.name}
            onKick={() => act({ kind: "kick", playerId: p.id })}
          />
        </div>
      ))}
    </Panel>
  )
}

function RenameButton({
  name,
  onRename,
}: {
  name: string
  onRename: (name: string) => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button variant="ghost" size="icon-xs" title="Rename">
            <Pencil />
          </Button>
        }
      />
      <PopoverContent className="w-64">
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            const value = new FormData(e.currentTarget).get("name")
            if (typeof value === "string" && value.trim())
              onRename(value.trim())
            setOpen(false)
          }}
        >
          <Input name="name" defaultValue={name} autoFocus />
          <Button type="submit" size="sm">
            Save
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  )
}

function KickButton({ name, onKick }: { name: string; onKick: () => void }) {
  const [open, setOpen] = useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button variant="ghost" size="icon-xs" title="Kick">
            <UserX />
          </Button>
        }
      />
      <PopoverContent className="w-auto">
        <div className="flex items-center gap-2">
          <span className="text-sm">Kick {name}?</span>
          <Button
            size="sm"
            variant="destructive"
            onClick={() => {
              onKick()
              setOpen(false)
            }}
          >
            Kick
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

function SettingsPanel({
  state,
  act,
  connected,
}: {
  state: RoomState
  act: (a: HostAction) => void
  connected: boolean
}) {
  const inviteUrl = `${location.origin}/room/${state.code}`
  const [copied, setCopied] = useState(false)

  function numSetting(key: keyof RoomState["settings"], raw: string) {
    const n = Number(raw)
    if (Number.isFinite(n)) act({ kind: "settings", settings: { [key]: n } })
  }

  return (
    <Panel title={`Room ${state.code}`}>
      <div className="flex items-center gap-2 text-sm">
        <ConnectionDot connected={connected} />
        {connected ? "Connected" : "Reconnecting…"}
      </div>
      <Label className="mt-2">Invite link</Label>
      <div className="flex gap-1">
        <Input readOnly value={inviteUrl} className="text-xs" />
        <Button
          variant="outline"
          size="icon"
          onClick={() => {
            void navigator.clipboard.writeText(inviteUrl)
            setCopied(true)
            setTimeout(() => setCopied(false), 1500)
          }}
        >
          {copied ? <Check /> : <Copy />}
        </Button>
      </div>
      <Label className="mt-2" htmlFor="ptsc">
        Points for correct
      </Label>
      <Input
        id="ptsc"
        type="number"
        defaultValue={state.settings.pointsCorrect}
        onChange={(e) => numSetting("pointsCorrect", e.target.value)}
      />
      <Label htmlFor="ptsw">Points for wrong (use a negative number)</Label>
      <Input
        id="ptsw"
        type="number"
        defaultValue={state.settings.pointsWrong}
        onChange={(e) => numSetting("pointsWrong", e.target.value)}
      />
      <Label htmlFor="ptswo">
        Points to everyone else on a wrong buzz (0 = off, buzz rounds only)
      </Label>
      <Input
        id="ptswo"
        type="number"
        defaultValue={state.settings.pointsWrongOthers}
        onChange={(e) => numSetting("pointsWrongOthers", e.target.value)}
      />
      <Label htmlFor="rstep">Reveal step size (%)</Label>
      <Input
        id="rstep"
        type="number"
        min={1}
        max={100}
        defaultValue={state.settings.revealStepPercent}
        onChange={(e) => numSetting("revealStepPercent", e.target.value)}
      />
    </Panel>
  )
}

const typeBadge: Record<Question["type"], string> = {
  mc: "MC",
  buzz: "Buzz",
  free: "Free",
  reveal: "Reveal",
}

function QuestionsPanel({
  state,
  questions,
  act,
}: {
  state: RoomState
  questions: Array<Question>
  act: (a: HostAction) => void
}) {
  return (
    <Panel
      title={`Questions — ${state.collectionName}`}
      footer={
        state.currentIndex !== null && (
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() => act({ kind: "question", index: null })}
          >
            Clear current question
          </Button>
        )
      }
    >
      {questions.map((q, i) => {
        const played = state.played.includes(i) && i !== state.currentIndex
        return (
          <button
            key={q.id}
            className={cn(
              "flex min-h-14 items-center gap-2 rounded-lg border p-3 text-left text-sm transition-colors hover:bg-muted",
              i === state.currentIndex && "border-primary bg-primary/10",
              played && "opacity-50",
            )}
            onClick={() => act({ kind: "question", index: i })}
          >
            <Badge variant="secondary">{typeBadge[q.type]}</Badge>
            <span className="min-w-0 flex-1">
              {q.text || <em className="text-muted-foreground">(no text)</em>}
            </span>
            {played && (
              <Check
                className="size-4 shrink-0 text-muted-foreground"
                aria-label="Already played"
              />
            )}
            {q.image && <QuestionThumb src={q.image} />}
          </button>
        )
      })}
    </Panel>
  )
}

function QuestionThumb({ src }: { src: string }) {
  return (
    <HoverCard>
      <HoverCardTrigger
        render={
          <img
            src={src}
            alt=""
            className="h-10 w-14 shrink-0 rounded-md object-cover"
          />
        }
      />
      <HoverCardContent side="left" className="w-auto p-1">
        <img src={src} alt="" className="max-h-80 max-w-96 rounded-md" />
      </HoverCardContent>
    </HoverCard>
  )
}

function ActionsPanel({
  state,
  questions,
  act,
}: {
  state: RoomState
  questions: Array<Question>
  act: (a: HostAction) => void
}) {
  const q =
    state.currentIndex !== null
      ? (questions[state.currentIndex] ?? null)
      : null
  const playerName = (id: string) =>
    state.players.find((p) => p.id === id)?.name ?? "?"
  // ?? keeps a room created before this setting existed from stepping to NaN
  const step = state.settings.revealStepPercent ?? 8
  const award = (playerId: string, correct: boolean) => {
    act({
      kind: "points",
      playerId,
      delta: correct ? state.settings.pointsCorrect : state.settings.pointsWrong,
      correct,
    })
    // buzz only: in mc/free everyone answers at once, so "everyone else" would
    // hand out points to people who were just as wrong
    // falsy also covers rooms created before this setting existed
    const others = state.settings.pointsWrongOthers
    if (!correct && others && q?.type === "buzz")
      for (const p of state.players)
        if (p.id !== playerId)
          act({ kind: "points", playerId: p.id, delta: others })
    act({ kind: "sound", name: correct ? "correct" : "wrong" })
  }

  return (
    <Panel title="Actions">
      {q ? (
        <>
          <p className="text-xl font-semibold">{q.text}</p>
          {q.type === "mc" && (
            <p className="text-sm text-muted-foreground">
              Correct: {q.options[q.correct]}
            </p>
          )}
          {q.type !== "mc" && q.answer && (
            <p className="text-sm text-muted-foreground">Answer: {q.answer}</p>
          )}
          {q.image && q.type !== "reveal" && (
            <img src={q.image} alt="" className="max-h-32 self-start rounded-lg" />
          )}
          {q.type === "reveal" && q.image && (
            <div className="flex flex-col gap-2">
              <RevealImage
                src={q.image}
                filters={q.filters}
                progress={state.reveal}
                zoom={q.zoom}
                className="max-h-40 self-start rounded-lg"
              />
              <div className="flex flex-wrap items-center gap-2">
                {q.revealSeconds != null && (
                  <Button onClick={() => act({ kind: "revealAuto" })}>
                    <Play /> Start reveal ({q.revealSeconds}s)
                  </Button>
                )}
                <Button
                  variant="outline"
                  onClick={() =>
                    act({ kind: "reveal", to: state.reveal + step / 100 })
                  }
                >
                  Step reveal (+{step}%)
                </Button>
                <Button
                  variant="outline"
                  onClick={() => act({ kind: "reveal", to: 1 })}
                >
                  Show full
                </Button>
                <span className="text-sm text-muted-foreground tabular-nums">
                  {Math.round(state.reveal * 100)}%
                </span>
              </div>
            </div>
          )}

          {state.buzzes.length > 0 && (
            <div className="flex flex-col gap-2">
              <Label>Buzz order (ping-adjusted)</Label>
              {state.buzzes.map((b, i) => (
                <div
                  key={b.playerId}
                  className={cn(
                    "flex items-center gap-2 rounded-lg border p-2 text-base",
                    i === 0 && "border-primary bg-primary/10",
                  )}
                >
                  <span className="text-lg font-bold">{i + 1}.</span>
                  <span className="min-w-0 flex-1 truncate font-medium">
                    {playerName(b.playerId)}
                  </span>
                  <span className="text-sm text-muted-foreground tabular-nums">
                    {i === 0 ? "first" : `+${Math.round(b.time - state.buzzes[0].time)}ms`}
                  </span>
                  <AwardButtons onAward={(ok) => award(b.playerId, ok)} />
                </div>
              ))}
            </div>
          )}

          {Object.keys(state.answers).length > 0 && (
            <div className="flex flex-col gap-2">
              <Label>Answers</Label>
              {Object.entries(state.answers).map(([pid, value]) => {
                const mcCorrect =
                  q.type === "mc" ? Number(value) === q.correct : null
                return (
                  <div
                    key={pid}
                    className="flex items-start gap-2 rounded-lg border p-2 text-base"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-semibold">
                        {playerName(pid)}
                      </div>
                      {/* quoted behind a rule so the answer can't be mistaken
                          for the name once it wraps onto its own lines */}
                      <div
                        className={cn(
                          "mt-1 border-l-2 border-muted-foreground/40 pl-2 text-muted-foreground wrap-anywhere",
                          state.revealed && mcCorrect === true && "text-green-600",
                          state.revealed && mcCorrect === false && "text-red-600",
                        )}
                      >
                        {q.type === "mc" ? q.options[Number(value)] : value}
                      </div>
                    </div>
                    <AwardButtons onAward={(ok) => award(pid, ok)} />
                  </div>
                )
              })}
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            {!state.revealed ? (
              <Button onClick={() => act({ kind: "close" })}>
                Close round
              </Button>
            ) : (
              <Button onClick={() => act({ kind: "open" })}>Open round</Button>
            )}
            {state.buzzes.length > 0 && (
              <Button
                variant="outline"
                title="Drop the buzzes and resume an auto-reveal, keeping the current progress"
                onClick={() => act({ kind: "clearBuzz" })}
              >
                <BellOff /> Clear buzzer
              </Button>
            )}
            <Button variant="outline" onClick={() => act({ kind: "reset" })}>
              <RotateCcw /> Reset round
            </Button>
            {q.type === "mc" && (
              <Button
                variant="outline"
                title="Give points to everyone whose answer is correct"
                onClick={() =>
                  Object.entries(state.answers).forEach(([pid, v]) => {
                    if (Number(v) === q.correct)
                      act({
                        kind: "points",
                        playerId: pid,
                        delta: state.settings.pointsCorrect,
                        correct: true,
                      })
                  })
                }
              >
                Award all correct
              </Button>
            )}
          </div>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          Select a question to start a round.
        </p>
      )}

      <Label className="mt-2">Sounds</Label>
      <div className="grid grid-cols-2 gap-2">
        {(["buzzer", "correct", "wrong", "tada"] as Array<SoundName>).map(
          (s) => (
            <Button
              key={s}
              variant="outline"
              onClick={() => act({ kind: "sound", name: s })}
            >
              <Volume2 /> {s}
            </Button>
          ),
        )}
      </div>

      <div className="mt-auto pt-4">
        <Button size="lg" className="w-full" onClick={() => act({ kind: "end" })}>
          <Trophy /> End game — show leaderboard
        </Button>
      </div>
    </Panel>
  )
}

function AwardButtons({ onAward }: { onAward: (correct: boolean) => void }) {
  return (
    <span className="flex gap-1">
      <Button
        variant="ghost"
        size="icon"
        className="text-green-600"
        title="Correct"
        onClick={() => onAward(true)}
      >
        <Check className="size-5" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="text-red-600"
        title="Wrong"
        onClick={() => onAward(false)}
      >
        <X className="size-5" />
      </Button>
    </span>
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

  // spacebar buzzes on buzz questions
  const canBuzz = buzzable && !state.locked && myBuzzIndex < 0
  useEffect(() => {
    if (!canBuzz) return
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Space" || e.repeat) return
      if (e.target instanceof HTMLInputElement) return
      e.preventDefault()
      send({ type: "buzz" })
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [canBuzz, send])

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

          {q.type === "mc" && (
            <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2">
              {q.options.map((opt, i) => {
                const mine = myAnswer === String(i)
                const showCorrect = state.revealed && i === q.correct
                return (
                  <Button
                    key={i}
                    variant={mine ? "default" : "outline"}
                    disabled={state.locked}
                    className={cn(
                      // the base button is nowrap/fixed-height, so a long
                      // option ran straight out the side
                      "h-auto min-h-16 min-w-0 px-3 py-2 text-lg whitespace-normal wrap-anywhere",
                      showCorrect && "border-2 border-green-500",
                      state.revealed &&
                        mine &&
                        i !== q.correct &&
                        "border-2 border-red-500",
                    )}
                    onClick={() => send({ type: "answer", value: String(i) })}
                  >
                    {opt}
                  </Button>
                )
              })}
            </div>
          )}

          {buzzable && (
            <>
              <button
                disabled={state.locked || myBuzzIndex >= 0}
                onClick={() => send({ type: "buzz" })}
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

          {state.revealed && q.type !== "mc" && q.answer && (
            <p className="text-xl">
              Answer: <strong>{q.answer}</strong>
            </p>
          )}
          {state.revealed && (
            <Badge variant="secondary">Round closed</Badge>
          )}
        </div>
      )}
    </main>
  )
}

/* ------------------------------ leaderboard ------------------------------ */

function Leaderboard({
  state,
  onReopen,
}: {
  state: RoomState
  onReopen?: () => void
}) {
  const ranked = [...state.players].sort((a, b) => b.points - a.points)
  const medals = ["text-amber-400", "text-zinc-400", "text-amber-700"]

  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-6 p-6">
      <h1 className="lb-row text-4xl font-black" style={{ animationDelay: "0s" }}>
        🏆 Leaderboard
      </h1>
      <div className="flex w-full max-w-md flex-col gap-2">
        {ranked.map((p, i) => (
          <div
            key={p.id}
            className={cn(
              "lb-row flex items-center gap-3 rounded-xl border p-4",
              i === 0 && "border-amber-400 bg-amber-400/10",
            )}
            // reveal from last place up to the winner
            style={{ animationDelay: `${0.3 + (ranked.length - 1 - i) * 0.4}s` }}
          >
            <span className={cn("w-8 text-2xl font-black", medals[i])}>
              {i + 1}
            </span>
            <span
              className={cn(
                "min-w-0 flex-1 truncate text-lg font-medium",
                i === 0 && "text-xl font-bold",
              )}
            >
              {p.name}
            </span>
            <span
              className="text-sm font-semibold text-green-600 tabular-nums"
              title="Correct answers"
            >
              {p.correct}
            </span>
            <span
              className="text-sm font-semibold text-red-600 tabular-nums"
              title="Wrong answers"
            >
              {p.wrong}
            </span>
            <span className="w-12 text-right text-2xl font-bold tabular-nums">
              {p.points}
            </span>
          </div>
        ))}
        {ranked.length === 0 && (
          <p className="text-center text-muted-foreground">No players.</p>
        )}
      </div>
      {onReopen && (
        <Button variant="outline" onClick={onReopen}>
          Reopen game
        </Button>
      )}
    </main>
  )
}
