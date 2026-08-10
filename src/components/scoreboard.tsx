import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { Question, RoomState } from "@/lib/game-types"

// shared by the room (host/player) and the spectate screen

// is the question's own answer out yet? mc gives it away by flipping the
// correct option, the other types by the host revealing it. both come off the
// round state, which is the only place a player's browser ever sees them
export function solutionOut(state: RoomState, q: Question) {
  return q.type === "mc" ? state.correctOption !== null : state.revealed
}

// who picked this mc option. the caller decides when it is safe to show —
// player screens wait for the round to lock, or everyone just copies whoever
// commits first
export function VoteBubbles({
  state,
  option,
  meId,
}: {
  state: RoomState
  option: number
  meId?: string
}) {
  const who = state.players.filter((p) => state.answers[p.id] === String(option))
  if (who.length === 0) return null
  return (
    <div className="flex flex-wrap gap-1">
      {who.map((p) => (
        <Badge
          key={p.id}
          variant={p.id === meId ? "default" : "secondary"}
          className="max-w-full"
        >
          {p.name}
        </Badge>
      ))}
    </div>
  )
}

// the free-text answers the host has read out to the room, in the order they
// were flipped. the ones still face-down simply aren't here
export function AnswerBubbles({
  state,
  meId,
}: {
  state: RoomState
  meId?: string
}) {
  const rows = state.revealedAnswers.flatMap((id) => {
    const player = state.players.find((p) => p.id === id)
    const value = state.answers[id]
    return player && value !== undefined ? [{ player, value }] : []
  })
  if (rows.length === 0) return null
  return (
    <div className="flex w-full flex-col gap-2">
      {rows.map(({ player, value }) => (
        <div
          key={player.id}
          className="flex items-start gap-2 rounded-lg border p-2 text-lg"
        >
          <Badge
            variant={player.id === meId ? "default" : "secondary"}
            className="mt-0.5 max-w-32"
          >
            {player.name}
          </Badge>
          <span className="min-w-0 flex-1 wrap-anywhere">{value}</span>
        </div>
      ))}
    </div>
  )
}

// one mc option in whatever state the host's reveal has left it. shared so the
// player, spectator and host screens agree on what "correct" looks like
export function McOption({
  option,
  correct,
  shown,
  mine,
  hint,
  onClick,
}: {
  option: string
  correct: boolean
  // face-up: the host has flipped this option
  shown: boolean
  mine?: boolean
  hint?: React.ReactNode
  // omit to render read-only
  onClick?: () => void
}) {
  return (
    <Button
      // ghost carries no background or border of its own, so the reveal colours
      // below don't have to out-specify the variant. the dark: duplicates are
      // load-bearing all the same: outline ships dark:border-input/bg-input
      variant={shown ? "ghost" : mine ? "default" : "outline"}
      // aria-disabled, not disabled: `disabled:opacity-50` is what turned the
      // revealed answer into a washed-out smudge in dark mode
      aria-disabled={!onClick}
      onClick={onClick}
      className={cn(
        // the base button is nowrap/fixed-height, so a long option ran straight
        // out the side
        "h-auto min-h-16 min-w-0 px-3 py-2 text-lg whitespace-normal wrap-anywhere",
        !onClick && "pointer-events-none",
        // solid fill, not a 15% tint: white on green-700 clears 4.5:1 in both
        // themes, where the old tint-plus-disabled-opacity read as a smudge
        shown &&
          correct &&
          "border-2 border-green-500 bg-green-700 font-semibold text-white dark:border-green-400 dark:bg-green-700 dark:text-white",
        shown &&
          !correct &&
          "border-2 border-red-500 bg-red-500/10 text-red-700 dark:border-red-500/70 dark:bg-red-500/15 dark:text-red-300",
      )}
    >
      <span className="min-w-0 flex-1 text-left">{option}</span>
      {hint}
    </Button>
  )
}

export function ConnectionDot({ connected }: { connected: boolean }) {
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

export const medals = ["text-amber-400", "text-zinc-400", "text-amber-700"]

export function ranked(state: RoomState) {
  return [...state.players].sort((a, b) => b.points - a.points)
}

export function Leaderboard({
  state,
  onReopen,
}: {
  state: RoomState
  onReopen?: () => void
}) {
  const rows = ranked(state)

  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-6 p-6">
      <h1
        className="lb-row text-4xl font-black"
        style={{ animationDelay: "0s" }}
      >
        🏆 Leaderboard
      </h1>
      <div className="flex w-full max-w-md flex-col gap-2">
        {rows.map((p, i) => (
          <div
            key={p.id}
            className={cn(
              "lb-row flex items-center gap-3 rounded-xl border p-4",
              i === 0 && "border-amber-400 bg-amber-400/10",
            )}
            // reveal from last place up to the winner
            style={{ animationDelay: `${0.3 + (rows.length - 1 - i) * 0.4}s` }}
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
        {rows.length === 0 && (
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
