import { useState } from "react"
import {
  BellOff,
  Check,
  Copy,
  Eye,
  EyeOff,
  Gavel,
  Pencil,
  Play,
  RotateCcw,
  Timer,
  Trophy,
  UserX,
  Volume2,
  X,
} from "lucide-react"
import { RevealImage } from "@/components/reveal-image"
import { ConnectionDot, McOption, VoteBubbles } from "@/components/scoreboard"
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
import { Label } from "@/components/ui/label"
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable"
import { cn } from "@/lib/utils"
import type {
  HostAction,
  Question,
  RoomState,
  SoundName,
} from "@/lib/game-types"

export function HostView({
  state,
  questions,
  act,
  connected,
  spectateCode,
}: {
  state: RoomState
  questions: Array<Question>
  act: (a: HostAction) => void
  connected: boolean
  spectateCode: string | null
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
              <SettingsPanel
                state={state}
                act={act}
                connected={connected}
                spectateCode={spectateCode}
              />
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
  spectateCode,
}: {
  state: RoomState
  act: (a: HostAction) => void
  connected: boolean
  spectateCode: string | null
}) {
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
      <CopyRow label="Invite link" url={`${location.origin}/room/${state.code}`} />
      {spectateCode && (
        <CopyRow
          label="Spectate link — shows every answer live, keep it off the players"
          url={`${location.origin}/spectate/${spectateCode}`}
        />
      )}
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
        Points to everyone else on a wrong buzz (0 = off, buzz and reveal rounds)
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
      <Label htmlFor="mcsec">
        Multiple choice time limit in seconds (0 = off)
      </Label>
      <Input
        id="mcsec"
        type="number"
        min={0}
        defaultValue={state.settings.mcSeconds}
        onChange={(e) => numSetting("mcSeconds", e.target.value)}
      />
      <label className="mt-2 flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={state.settings.buzzHidesQuestion ?? false}
          onChange={(e) =>
            act({
              kind: "settings",
              settings: { buzzHidesQuestion: e.target.checked },
            })
          }
        />
        Buzzing hides the question from players
      </label>
      <label
        className="flex items-center gap-2 text-sm"
        title="Orders buzzes by each player's own reaction time, cancelling latency both ways. Trusts the player's device, so only for friendly games"
      >
        <input
          type="checkbox"
          checked={state.settings.friendsBuzz ?? false}
          onChange={(e) =>
            act({
              kind: "settings",
              settings: { friendsBuzz: e.target.checked },
            })
          }
        />
        Buzzing calculations: friends mode
      </label>
    </Panel>
  )
}

function CopyRow({ label, url }: { label: string; url: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <>
      <Label className="mt-2">{label}</Label>
      <div className="flex gap-1">
        <Input readOnly value={url} className="text-xs" />
        <Button
          variant="outline"
          size="icon"
          onClick={() => {
            void navigator.clipboard.writeText(url)
            setCopied(true)
            setTimeout(() => setCopied(false), 1500)
          }}
        >
          {copied ? <Check /> : <Copy />}
        </Button>
      </div>
    </>
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
  // the action carries the whole face-up set, so toggling is a client-side diff
  const flipOption = (i: number, correct: boolean) => {
    const shown = state.revealedOptions.includes(i)
    act({
      kind: "revealOptions",
      indexes: shown
        ? state.revealedOptions.filter((x) => x !== i)
        : [...state.revealedOptions, i],
    })
    // the flip is the payoff, so the whole room hears the verdict
    if (!shown) act({ kind: "sound", name: correct ? "correct" : "wrong" })
  }
  // same toggle for a free round, except a typed answer carries no verdict —
  // the host still judges it with the award buttons
  const flipAnswer = (pid: string) =>
    act({
      kind: "revealAnswers",
      playerIds: state.revealedAnswers.includes(pid)
        ? state.revealedAnswers.filter((x) => x !== pid)
        : [...state.revealedAnswers, pid],
    })
  // reveal rounds are buzzed the same way buzz rounds are, so they score the
  // same way: in mc/free everyone answers at once, where a verdict is private
  // and "everyone else" would pay people who were just as wrong
  const buzzed = q?.type === "buzz" || q?.type === "reveal"
  const award = (playerId: string, correct: boolean) => {
    act({
      kind: "points",
      playerId,
      delta: correct ? state.settings.pointsCorrect : state.settings.pointsWrong,
      correct,
    })
    // falsy also covers rooms created before this setting existed
    const others = state.settings.pointsWrongOthers
    if (!correct && others && buzzed)
      for (const p of state.players)
        if (p.id !== playerId)
          act({ kind: "points", playerId: p.id, delta: others })
    // a buzzed verdict is a shared moment, so the whole room hears it
    act({
      kind: "sound",
      name: correct ? "correct" : "wrong",
      playerId: buzzed ? undefined : playerId,
    })
  }

  return (
    <Panel title="Actions">
      {q ? (
        <>
          <p className="text-xl font-semibold">{q.text}</p>
          {q.type === "mc" && (
            <div className="flex flex-col gap-2">
              <Label>
                Flip an option face-up — everyone who picked it scores
              </Label>
              {q.options.map((opt, i) => (
                <div key={i} className="flex flex-col gap-1">
                  <McOption
                    option={opt}
                    correct={i === q.correct}
                    shown={state.revealedOptions.includes(i)}
                    hint={
                      i === q.correct && (
                        <Check
                          className={cn(
                            "size-5",
                            state.revealedOptions.includes(i)
                              ? "text-white"
                              : "text-green-600",
                          )}
                          aria-label="Correct option"
                        />
                      )
                    }
                    onClick={() => flipOption(i, i === q.correct)}
                  />
                  <VoteBubbles state={state} option={i} />
                </div>
              ))}
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    act({
                      kind: "revealOptions",
                      indexes: q.options.map((_, i) => i),
                    })
                  }
                >
                  <Eye /> Flip all
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => act({ kind: "revealOptions", indexes: [] })}
                >
                  <EyeOff /> Face down
                </Button>
              </div>
            </div>
          )}
          {q.type !== "mc" && q.answer && (
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm text-muted-foreground">Answer: {q.answer}</p>
              {/* buzz and reveal rounds put the answer up when they close;
                  free waits for the host, after the players' own answers */}
              {q.type === "free" && (
                <Button
                  size="sm"
                  variant={state.revealed ? "outline" : "default"}
                  onClick={() =>
                    act({ kind: "revealSolution", on: !state.revealed })
                  }
                >
                  {state.revealed ? (
                    <>
                      <EyeOff /> Hide answer
                    </>
                  ) : (
                    <>
                      <Eye /> Reveal answer
                    </>
                  )}
                </Button>
              )}
            </div>
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

          {q.type === "mc" && state.settings.mcSeconds > 0 && (
            <div className="flex items-center gap-3">
              <Button
                disabled={state.timerLeft !== null}
                onClick={() => act({ kind: "startTimer" })}
              >
                <Timer /> Start timer ({state.settings.mcSeconds}s)
              </Button>
              {state.timerLeft !== null && (
                <span className="text-2xl font-bold tabular-nums">
                  {state.timerLeft}s
                </span>
              )}
            </div>
          )}

          {state.buzzes.length > 0 && (
            <div className="flex flex-col gap-2">
              <Label>
                Buzz order (
                {state.settings.friendsBuzz ? "reaction time" : "ping-adjusted"}
                )
              </Label>
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

          {/* mc has no answer list: the vote bubbles under each option are the
              same information, and flipping an option scores it */}
          {q.type !== "mc" && Object.keys(state.answers).length > 0 && (
            <div className="flex flex-col gap-2">
              <Label>
                {q.type === "free"
                  ? "Answers — the eye reads one out to the room"
                  : "Answers"}
              </Label>
              {Object.entries(state.answers).map(([pid, value]) => {
                const shown = state.revealedAnswers.includes(pid)
                return (
                  <div
                    key={pid}
                    className={cn(
                      "flex items-start gap-2 rounded-lg border p-2 text-base",
                      shown && "border-primary bg-primary/10",
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-semibold">
                        {playerName(pid)}
                      </div>
                      {/* quoted behind a rule so the answer can't be mistaken
                          for the name once it wraps onto its own lines */}
                      <div className="mt-1 border-l-2 border-muted-foreground/40 pl-2 text-muted-foreground wrap-anywhere">
                        {value}
                      </div>
                    </div>
                    {q.type === "free" && (
                      <Button
                        variant="ghost"
                        size="icon"
                        title={shown ? "Hide from the room" : "Read out to the room"}
                        onClick={() => flipAnswer(pid)}
                      >
                        {shown ? <EyeOff /> : <Eye />}
                      </Button>
                    )}
                    <AwardButtons onAward={(ok) => award(pid, ok)} />
                  </div>
                )
              })}
              {q.type === "free" && (
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      act({
                        kind: "revealAnswers",
                        playerIds: Object.keys(state.answers),
                      })
                    }
                  >
                    <Eye /> Read all out
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => act({ kind: "revealAnswers", playerIds: [] })}
                  >
                    <EyeOff /> Hide all
                  </Button>
                </div>
              )}
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            {/* locked, not revealed: closing an mc round no longer reveals it */}
            {!state.locked ? (
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
                title="Close the round and flip every option at once — scores everyone, no suspense"
                onClick={() => {
                  act({ kind: "close" })
                  act({
                    kind: "revealOptions",
                    indexes: q.options.map((_, i) => i),
                  })
                }}
              >
                <Gavel /> Auto award
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
