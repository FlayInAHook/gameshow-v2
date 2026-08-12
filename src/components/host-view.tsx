import { useState } from "react"
import {
  BellOff,
  Check,
  Copy,
  Eye,
  EyeOff,
  Gavel,
  ListOrdered,
  Pause,
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
import { SettingsFields } from "@/components/room-settings"
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
import {
  correctSet,
  hasAnswerText,
  hasOptions,
  placedAt,
  scoreSort,
} from "@/lib/game-types"
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
            <ResizablePanel defaultSize="34%">
              <PlayersPanel state={state} act={act} />
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel defaultSize="66%">
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
          <ResizablePanelGroup orientation="vertical">
            <ResizablePanel defaultSize="75%">
              <ActionsPanel state={state} questions={questions} act={act} />
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel defaultSize="25%">
              <RoomPanel state={state} act={act} />
            </ResizablePanel>
          </ResizablePanelGroup>
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
      <SettingsFields
        settings={state.settings}
        onChange={(settings) => act({ kind: "settings", settings })}
      />
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

const timerPresets = [15, 30, 45, 60, 120]

const typeBadge: Record<Question["type"], string> = {
  mc: "MC",
  multi: "Multi",
  sort: "Sort",
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
  // who the host is still waiting on — the option board shows votes but says
  // nothing about the people who haven't voted
  const quiet = state.players.filter((p) => state.answers[p.id] === undefined)
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
          {hasOptions(q) && (
            <div className="flex flex-col gap-2">
              <Label>
                {q.type === "multi"
                  ? `Flip an option face-up — everyone who ticked it scores (${correctSet(q).length} of ${q.options.length} are right)`
                  : "Flip an option face-up — everyone who picked it scores"}
              </Label>
              {q.options.map((opt, i) => {
                const isCorrect = correctSet(q).includes(i)
                return (
                  <div key={i} className="flex flex-col gap-1">
                    <McOption
                      option={opt}
                      correct={isCorrect}
                      shown={state.revealedOptions.includes(i)}
                      hint={
                        isCorrect && (
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
                      onClick={() => flipOption(i, isCorrect)}
                    />
                    <VoteBubbles state={state} option={i} />
                  </div>
                )
              })}
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
              {quiet.length > 0 && (
                <p className="text-sm text-muted-foreground">
                  {state.locked ? "No answer from" : "Still to answer"}:{" "}
                  {quiet.map((p) => p.name).join(", ")}
                </p>
              )}
            </div>
          )}
          {q.type === "sort" && (
            <div className="flex flex-col gap-2">
              <Label>
                Flip a slot face-up — the round scores once the whole order is
                out
              </Label>
              {q.correct.map((item, slot) => {
                const shown = state.revealedOptions.includes(slot)
                return (
                  <button
                    key={slot}
                    onClick={() =>
                      act({
                        kind: "revealOptions",
                        indexes: shown
                          ? state.revealedOptions.filter((x) => x !== slot)
                          : [...state.revealedOptions, slot],
                      })
                    }
                    className={cn(
                      "flex items-center gap-2 rounded-lg border p-2 text-left transition-colors hover:bg-muted",
                      shown &&
                        "border-2 border-green-500 bg-green-500/10 dark:border-green-400 dark:bg-green-500/15",
                    )}
                  >
                    <span className="w-5 shrink-0 text-center text-sm font-bold text-muted-foreground tabular-nums">
                      {slot + 1}
                    </span>
                    <span className="min-w-0 flex-1 wrap-anywhere">
                      {q.items[item]}
                    </span>
                    {q.values?.[item] && (
                      <Badge variant="secondary">{q.values[item]}</Badge>
                    )}
                    {item === q.anchor && (
                      <Badge variant="outline">
                        {q.anchorLocked ? "anchor, locked" : "anchor"}
                      </Badge>
                    )}
                    {shown ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
                  </button>
                )
              })}
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    act({
                      kind: "revealOptions",
                      indexes: q.items.map((_, i) => i),
                    })
                  }
                >
                  <Eye /> Flip all — scores the round
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
          {hasAnswerText(q) && q.answer && (
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

          {/* every round anyone answers at their own pace — a buzz race times
              itself, and a reveal has its own clock */}
          {!buzzed && state.settings.mcSeconds > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              {state.timerLeft === null ? (
                timerPresets.map((secs) => (
                  <Button
                    key={secs}
                    // the room's configured length leads, the rest are there
                    // for the round that needs longer or shorter
                    variant={
                      secs === state.settings.mcSeconds ? "default" : "outline"
                    }
                    onClick={() => act({ kind: "timer", mode: "start", seconds: secs })}
                  >
                    <Timer /> {secs < 60 ? `${secs}s` : `${secs / 60}m`}
                  </Button>
                ))
              ) : (
                <>
                  <span
                    className={cn(
                      "text-2xl font-bold tabular-nums",
                      state.timerLeft <= 5 && "text-red-600",
                      !state.timerRunning && "text-muted-foreground",
                    )}
                  >
                    {state.timerLeft}s
                  </span>
                  {state.timerRunning ? (
                    <Button
                      variant="outline"
                      onClick={() => act({ kind: "timer", mode: "pause" })}
                    >
                      <Pause /> Pause
                    </Button>
                  ) : (
                    <Button
                      disabled={state.timerLeft === 0}
                      onClick={() => act({ kind: "timer", mode: "resume" })}
                    >
                      <Play /> Continue
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    title="Back to the full duration, stopped"
                    onClick={() => act({ kind: "timer", mode: "reset" })}
                  >
                    <RotateCcw /> Reset timer
                  </Button>
                </>
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

          {/* walk the players, not the answers, so the ones who haven't
              touched it are on the list rather than missing from it */}
          {q.type === "sort" && state.players.length > 0 && (
            <div className="flex flex-col gap-2">
              <Label>Arrangements — points are what the flip will pay</Label>
              {state.players.map((p) => {
                const pid = p.id
                const value = state.answers[pid]
                const pos = placedAt(value)
                const missing = q.items.length - pos.size
                return (
                  <div
                    key={pid}
                    className={cn(
                      "rounded-lg border p-2",
                      value === undefined && "border-dashed opacity-60",
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate font-semibold">
                        {playerName(pid)}
                      </span>
                      {value === undefined ? (
                        <Badge variant="outline">
                          {state.locked ? "no answer" : "nothing placed yet"}
                        </Badge>
                      ) : (
                        <>
                          {missing > 0 && (
                            <Badge
                              variant="destructive"
                              title="Unplaced items score nothing"
                            >
                              {missing} still in the pool
                            </Badge>
                          )}
                          <Badge variant="secondary">
                            {scoreSort(q, value, state.settings.sortPoints)} pts
                          </Badge>
                        </>
                      )}
                    </div>
                    <ol className="mt-1 flex flex-wrap gap-x-2 text-sm text-muted-foreground">
                      {q.correct.map((_, slot) => {
                        const item = [...pos].find(([, s]) => s === slot)?.[0]
                        if (item === undefined) return null
                        return (
                          <li
                            key={slot}
                            className={cn(
                              q.correct[slot] === item && "text-green-600",
                            )}
                          >
                            {slot + 1}. {q.items[item]}
                          </li>
                        )
                      })}
                    </ol>
                  </div>
                )
              })}
            </div>
          )}

          {/* option rounds have no answer list: the vote bubbles under each
              option are the same information, and flipping scores it */}
          {q.type === "free" && state.players.length > 0 && (
            <div className="flex flex-col gap-2">
              <Label>Answers — the eye reads one out to the room</Label>
              {state.players.map((p) => {
                const pid = p.id
                const value = state.answers[pid]
                const shown = state.revealedAnswers.includes(pid)
                return (
                  <div
                    key={pid}
                    className={cn(
                      "flex items-start gap-2 rounded-lg border p-2 text-base",
                      shown && "border-primary bg-primary/10",
                      value === undefined && "border-dashed opacity-60",
                    )}
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
                          value === undefined && "italic",
                        )}
                      >
                        {value ??
                          (state.locked ? "no answer" : "still answering…")}
                      </div>
                    </div>
                    {value !== undefined && (
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
            </div>
          )}

          {/* buzz and reveal rounds: the typed-answer list never applies, but
              the host still judges whoever buzzed */}
          {q.type === "buzz" && Object.keys(state.answers).length > 0 && (
            <div className="flex flex-col gap-2">
              <Label>Answers</Label>
              {Object.entries(state.answers).map(([pid, value]) => (
                <div
                  key={pid}
                  className="flex items-start gap-2 rounded-lg border p-2 text-base"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold">
                      {playerName(pid)}
                    </div>
                    <div className="mt-1 border-l-2 border-muted-foreground/40 pl-2 text-muted-foreground wrap-anywhere">
                      {value}
                    </div>
                  </div>
                  <AwardButtons onAward={(ok) => award(pid, ok)} />
                </div>
              ))}
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
            {hasOptions(q) && (
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

    </Panel>
  )
}

// the controls that talk to the whole room rather than to the round
function RoomPanel({
  state,
  act,
}: {
  state: RoomState
  act: (a: HostAction) => void
}) {
  // pressing the one that is already up takes the room back to the question
  const show = (mode: RoomState["standings"]) =>
    act({ kind: "standings", mode: state.standings === mode ? "off" : mode })

  return (
    <Panel title="The room">
      <Label>Standings — put the scoreboard on everyone's screen</Label>
      <div className="grid grid-cols-2 gap-2">
        <Button
          variant={state.standings === "ranks" ? "default" : "outline"}
          title="The order only — who is ahead, but not by how much"
          onClick={() => show("ranks")}
        >
          <ListOrdered /> Positions
        </Button>
        <Button
          variant={state.standings === "points" ? "default" : "outline"}
          title="The order with everyone's points"
          onClick={() => show("points")}
        >
          <Trophy /> With points
        </Button>
      </div>

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
