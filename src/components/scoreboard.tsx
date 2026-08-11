import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { picksOf } from "@/lib/game-types"
import type { RoomState } from "@/lib/game-types"

// shared by the room (host/player) and the spectate screen

// who picked this option. the caller decides when it is safe to show — player
// screens wait for the host to flip it, or everyone just copies whoever
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
  const who = state.players.filter((p) =>
    picksOf(state.answers[p.id]).includes(String(option)),
  )
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

/**
 * The ranking. `showPoints` off leaves the order standing without the numbers,
 * which is how a mid-game standing goes up: the room learns who is ahead, not
 * by how much. `animate` is the end-of-game reveal, last place up.
 */
export function StandingsList({
  state,
  showPoints = true,
  animate = false,
  meId,
}: {
  state: RoomState
  showPoints?: boolean
  animate?: boolean
  meId?: string
}) {
  const rows = ranked(state)
  if (rows.length === 0)
    return <p className="text-center text-muted-foreground">No players.</p>

  return (
    <div className="flex w-full max-w-md flex-col gap-2">
      {rows.map((p, i) => (
        <div
          key={p.id}
          className={cn(
            "flex items-center gap-3 rounded-xl border p-4",
            i === 0 && "border-amber-400 bg-amber-400/10",
            p.id === meId && "ring-2 ring-primary",
            animate && "lb-row",
          )}
          // reveal from last place up to the winner
          style={
            animate
              ? { animationDelay: `${0.3 + (rows.length - 1 - i) * 0.4}s` }
              : undefined
          }
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
          {/* the tallies count as points given away, so they travel together */}
          {showPoints && (
            <>
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
            </>
          )}
        </div>
      ))}
    </div>
  )
}

export function Leaderboard({
  state,
  onReopen,
}: {
  state: RoomState
  onReopen?: () => void
}) {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-6 p-6">
      <h1
        className="lb-row text-4xl font-black"
        style={{ animationDelay: "0s" }}
      >
        🏆 Leaderboard
      </h1>
      <StandingsList state={state} animate />
      {onReopen && (
        <Button variant="outline" onClick={onReopen}>
          Reopen game
        </Button>
      )}
    </main>
  )
}
