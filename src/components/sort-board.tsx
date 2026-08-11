import { useState } from "react"
import { ChevronDown, ChevronUp, X } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { picksOf } from "@/lib/game-types"
import type { RoomState, SortQuestion } from "@/lib/game-types"

// a slot holds an item index, or "" while it is empty
function slotsOf(q: SortQuestion, value: string | undefined): string[] {
  const slots = picksOf(value)
  return q.items.map((_, i) => slots[i] ?? "")
}

/**
 * Pool of items above, numbered slots below.
 *
 * Three ways to move things, because the room is on phones and laptops at the
 * same time: tap an item to place or return it, the arrows to nudge it, and
 * drag on anything with a mouse. Read-only without `onChange`.
 */
export function SortBoard({
  q,
  state,
  value,
  onChange,
}: {
  q: SortQuestion
  state: RoomState
  value: string | undefined
  onChange?: (next: string) => void
}) {
  const [dragging, setDragging] = useState<number | null>(null)
  const slots = slotsOf(q, value)
  const revealed = state.revealedOrder
  // a hard anchor sits in its true slot and is not the player's to move
  const lockedSlot =
    q.anchorLocked && q.anchor !== undefined
      ? revealed.findIndex((item) => item === q.anchor)
      : -1
  const pool = q.items
    .map((_, i) => i)
    .filter((i) => !slots.includes(String(i)) && i !== (lockedSlot >= 0 ? q.anchor : -1))

  const commit = (next: string[]) => onChange?.(next.join(","))

  function place(item: number, slot: number) {
    if (!onChange || slot === lockedSlot) return
    const next = slots.map((s) => (s === String(item) ? "" : s))
    // swapping beats overwriting: the displaced item goes where this one was
    const from = slots.indexOf(String(item))
    if (next[slot] !== "" && from >= 0) next[from] = next[slot]
    next[slot] = String(item)
    commit(next)
  }

  function nudge(slot: number, by: number) {
    let target = slot + by
    while (target === lockedSlot) target += by
    if (target < 0 || target >= slots.length || !onChange) return
    const next = [...slots]
    ;[next[slot], next[target]] = [next[target], next[slot]]
    commit(next)
  }

  function toPool(slot: number) {
    if (!onChange || slot === lockedSlot) return
    const next = [...slots]
    next[slot] = ""
    commit(next)
  }

  const label = (item: number) => {
    const shown = state.shownValues[item]
    return (
      <>
        <span className="min-w-0 flex-1 wrap-anywhere">{q.items[item]}</span>
        {shown && (
          <Badge variant="secondary" className="shrink-0">
            {shown}
          </Badge>
        )}
      </>
    )
  }

  return (
    <div className="flex w-full flex-col gap-3">
      {onChange && (
        <div
          className="flex min-h-12 flex-wrap items-start gap-2 rounded-lg border border-dashed p-2"
          onDragOver={(e) => e.preventDefault()}
          onDrop={() => {
            if (dragging === null) return
            const from = slots.indexOf(String(dragging))
            if (from >= 0) toPool(from)
            setDragging(null)
          }}
        >
          {pool.length === 0 ? (
            <span className="p-1 text-sm text-muted-foreground">
              Everything is placed — drag or tap to rearrange.
            </span>
          ) : (
            pool.map((item) => (
              <button
                key={item}
                draggable
                onDragStart={() => setDragging(item)}
                onDragEnd={() => setDragging(null)}
                onClick={() => {
                  const free = slots.findIndex(
                    (s, i) => s === "" && i !== lockedSlot,
                  )
                  if (free >= 0) place(item, free)
                }}
                className="flex max-w-full cursor-grab items-center gap-2 rounded-lg border bg-background px-3 py-2 text-left transition-colors hover:bg-muted active:cursor-grabbing"
              >
                {label(item)}
              </button>
            ))
          )}
        </div>
      )}

      <ol className="flex flex-col gap-2">
        {slots.map((raw, slot) => {
          const item = raw === "" ? null : Number(raw)
          const truth = revealed[slot]
          const right = truth !== null && item === truth
          const wrong = truth !== null && item !== null && item !== truth
          return (
            <li
              key={slot}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                if (dragging !== null) place(dragging, slot)
                setDragging(null)
              }}
              className={cn(
                "flex items-center gap-2 rounded-lg border p-2",
                slot === lockedSlot && "border-primary/60 bg-primary/5",
                right &&
                  "border-2 border-green-500 bg-green-500/10 dark:border-green-400 dark:bg-green-500/15",
                wrong &&
                  "border-2 border-red-500 bg-red-500/10 dark:border-red-500/70 dark:bg-red-500/15",
              )}
            >
              <span className="w-5 shrink-0 text-center text-sm font-bold text-muted-foreground tabular-nums">
                {slot + 1}
              </span>

              {item === null ? (
                <span className="flex-1 text-sm text-muted-foreground italic">
                  {truth === null ? "empty" : ""}
                </span>
              ) : (
                <span
                  draggable={onChange != null && slot !== lockedSlot}
                  onDragStart={() => setDragging(item)}
                  onDragEnd={() => setDragging(null)}
                  className={cn(
                    "flex min-w-0 flex-1 items-center gap-2",
                    onChange && slot !== lockedSlot && "cursor-grab",
                  )}
                >
                  {label(item)}
                </span>
              )}

              {/* once a slot is face-up, say what should have been there */}
              {truth !== null && !right && (
                <span className="flex min-w-0 flex-1 items-center gap-2 border-l pl-2 text-sm">
                  {label(truth)}
                </span>
              )}

              {onChange && slot !== lockedSlot && item !== null && (
                <span className="flex shrink-0 gap-0.5">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    title="Move up"
                    disabled={slot === 0}
                    onClick={() => nudge(slot, -1)}
                  >
                    <ChevronUp />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    title="Move down"
                    disabled={slot === slots.length - 1}
                    onClick={() => nudge(slot, 1)}
                  >
                    <ChevronDown />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    title="Back to the pool"
                    onClick={() => toPool(slot)}
                  >
                    <X />
                  </Button>
                </span>
              )}
            </li>
          )
        })}
      </ol>
    </div>
  )
}
