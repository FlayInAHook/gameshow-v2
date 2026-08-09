import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { RoomState } from "@/lib/game-types"

// shared by the room (host/player) and the spectate screen

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
