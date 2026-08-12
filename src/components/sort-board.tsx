import { useEffect, useRef, useState } from "react"
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core"
import type {
  DragEndEvent,
  DragOverEvent,
  DragStartEvent,
} from "@dnd-kit/core"
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { ChevronDown, ChevronUp, GripVertical, X } from "lucide-react"
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

// every row is an entry, empty ones included: they are what lets a board with
// gaps in it reorder without collapsing.
//
// the id has to travel with the *contents*, not with the slot — dnd-kit lands
// its drop animation on whichever node still carries the dragged id, so a row
// keyed by position sends the item flying back where it started. gaps can be
// numbered by their order among gaps because only items are draggable, which
// leaves that order untouched by any move.
type Row = { id: string; slot: number; item: number | null }

const itemId = (item: number) => `item-${item}`
const itemOf = (id: string) =>
  id.startsWith("item-") ? Number(id.slice(5)) : null

function rowsOf(slots: string[]): Row[] {
  let gaps = 0
  return slots.map((raw, slot) =>
    raw === ""
      ? { id: `gap-${gaps++}`, slot, item: null }
      : { id: itemId(Number(raw)), slot, item: Number(raw) },
  )
}

/**
 * Drop `item` into `slot`, shifting the rows between there and the nearest free
 * cell — the list behaviour, rather than overwriting whoever was there. The
 * scan stops at a locked anchor so the shifting can never push it off its slot.
 */
function insertAt(
  slots: string[],
  item: number,
  slot: number,
  locked: number,
): string[] {
  const next = slots.map((s) => (s === String(item) ? "" : s))
  if (next[slot] === "") {
    next[slot] = String(item)
    return next
  }
  let gap = -1
  for (let i = slot; i < next.length && i !== locked; i++)
    if (next[i] === "") { gap = i; break }
  if (gap === -1)
    for (let i = slot; i >= 0 && i !== locked; i--)
      if (next[i] === "") { gap = i; break }
  // only reachable with a locked anchor between the drop and every free cell
  if (gap === -1) gap = next.indexOf("")
  if (gap === -1) return slots
  if (gap > slot) for (let i = gap; i > slot; i--) next[i] = next[i - 1]
  else for (let i = gap; i < slot; i++) next[i] = next[i + 1]
  next[slot] = String(item)
  return next
}

function Label({
  item,
  q,
  state,
}: {
  item: number
  q: SortQuestion
  state: RoomState
}) {
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

function SortableRow({
  row,
  q,
  state,
  locked,
  onNudge,
  onRemove,
  interactive,
}: {
  row: Row
  q: SortQuestion
  state: RoomState
  locked: boolean
  onNudge: (by: number) => void
  onRemove: () => void
  interactive: boolean
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: row.id, disabled: !interactive || locked })
  const truth = state.revealedOrder[row.slot]
  const right = truth !== null && row.item === truth
  const wrong = truth !== null && row.item !== null && row.item !== truth

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(
        "flex touch-none items-center gap-2 rounded-lg border bg-card p-2",
        locked && "border-primary/60 bg-primary/5",
        isDragging && "z-10 opacity-40",
        right &&
          "border-2 border-green-500 bg-green-500/10 dark:border-green-400 dark:bg-green-500/15",
        wrong &&
          "border-2 border-red-500 bg-red-500/10 dark:border-red-500/70 dark:bg-red-500/15",
      )}
    >
      <span className="w-5 shrink-0 text-center text-sm font-bold text-muted-foreground tabular-nums">
        {row.slot + 1}
      </span>

      {row.item === null ? (
        <span className="flex-1 text-sm text-muted-foreground italic">
          {truth === null ? "empty" : ""}
        </span>
      ) : (
        <span
          {...attributes}
          {...listeners}
          className={cn(
            "flex min-w-0 flex-1 items-center gap-2",
            interactive && !locked && "cursor-grab active:cursor-grabbing",
          )}
        >
          {interactive && !locked && (
            <GripVertical className="size-4 shrink-0 text-muted-foreground" />
          )}
          <Label item={row.item} q={q} state={state} />
        </span>
      )}

      {/* once a slot is face-up, say what should have been there */}
      {truth !== null && !right && (
        <span className="flex min-w-0 flex-1 items-center gap-2 border-l pl-2 text-sm">
          <Label item={truth} q={q} state={state} />
        </span>
      )}

      {interactive && !locked && row.item !== null && (
        <span className="flex shrink-0 gap-0.5">
          <Button
            variant="ghost"
            size="icon-sm"
            title="Move up"
            disabled={row.slot === 0}
            onClick={() => onNudge(-1)}
          >
            <ChevronUp />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            title="Move down"
            disabled={row.slot === q.items.length - 1}
            onClick={() => onNudge(1)}
          >
            <ChevronDown />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            title="Back to the pool"
            onClick={onRemove}
          >
            <X />
          </Button>
        </span>
      )}
    </li>
  )
}

/**
 * Pool of items above, numbered slots below.
 *
 * Drag to reorder (mouse, touch and keyboard, via dnd-kit), or tap an item to
 * place and the arrows to nudge — the room is on phones and laptops at the same
 * time. Read-only without `onChange`.
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
  const [dragging, setDragging] = useState<string | null>(null)
  // where an item dragged out of the pool would land. holding it locally lets
  // the row join the sortable list mid-drag, so the others make room for it
  const [preview, setPreview] = useState<string[] | null>(null)
  // the board as this player last left it. the answer goes to the server and
  // comes back over the websocket, and dnd-kit measures where to land the drop
  // animation the moment the drag ends — so without a local copy it measures
  // the old order and flies the row back where it came from
  const [local, setLocal] = useState<string[] | null>(null)
  const sent = useRef<string | null>(null)
  useEffect(() => {
    // the server has caught up with us, or the round moved on
    if (value === sent.current || value === undefined) setLocal(null)
  }, [value])
  const sensors = useSensors(
    // a small distance so a tap on the arrows isn't swallowed as a drag
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  )
  const interactive = onChange != null
  const placed = local ?? slotsOf(q, value)
  const slots = preview ?? placed
  // a hard anchor sits in its true slot and is not the player's to move
  const lockedSlot =
    q.anchorLocked && q.anchor !== undefined
      ? state.revealedOrder.findIndex((item) => item === q.anchor)
      : -1
  const pool = q.items
    .map((_, i) => i)
    .filter((i) => !slots.includes(String(i)) && !(i === q.anchor && lockedSlot >= 0))

  const rows = rowsOf(slots)
  // the locked row is pinned, so it takes no part in the reordering
  const movable = rows.filter((r) => r.slot !== lockedSlot)

  // the board moves now, the server hears about it in its own time
  const commit = (next: string[]) => {
    setPreview(null)
    setLocal(next)
    sent.current = next.join(",")
    onChange?.(sent.current)
  }

  // put the moved rows back on the board, skipping the pinned slot
  function applyOrder(order: Row[]) {
    const next = [...slots]
    let at = 0
    for (const row of order) {
      while (at === lockedSlot) at++
      next[at] = row.item === null ? "" : String(row.item)
      at++
    }
    commit(next)
  }

  function place(item: number, slot: number) {
    if (!interactive || slot === lockedSlot) return
    commit(insertAt(placed, item, slot, lockedSlot))
  }

  function nudge(slot: number, by: number) {
    let target = slot + by
    while (target === lockedSlot) target += by
    if (target < 0 || target >= slots.length || !interactive) return
    const next = [...slots]
    ;[next[slot], next[target]] = [next[target], next[slot]]
    commit(next)
  }

  function toPool(slot: number) {
    if (!interactive || slot === lockedSlot) return
    const next = [...slots]
    next[slot] = ""
    commit(next)
  }

  // an item still in the pool joins the list as soon as it is dragged over one,
  // so dnd-kit shifts the rest out of the way exactly as it does for a re-order
  function onDragOver({ active, over }: DragOverEvent) {
    if (!over || !interactive) return
    const item = itemOf(String(active.id))
    if (item === null || placed.includes(String(item))) return
    const to = String(over.id)
    if (to === "pool") return setPreview(null)
    const slot = rows.find((r) => r.id === to)?.slot
    if (slot === undefined || slot === lockedSlot) return
    setPreview(insertAt(placed, item, slot, lockedSlot))
  }

  function onDragEnd({ active, over }: DragEndEvent) {
    setDragging(null)
    const from = String(active.id)
    const to = over ? String(over.id) : null
    const item = itemOf(from)
    if (!interactive || item === null) return setPreview(null)

    // straight from the pool: the preview already worked out where it lands,
    // and it is what the player has been looking at. `over` is the item's own
    // row by now — the preview put it there — so there is nothing else to read
    if (!placed.includes(String(item)))
      return to === "pool" || preview === null
        ? setPreview(null)
        : commit(preview)

    // dropped back where it came from, or nowhere
    if (to === null || to === from) return setPreview(null)
    if (to === "pool") {
      const slot = placed.indexOf(String(item))
      return slot >= 0 ? toPool(slot) : setPreview(null)
    }
    const oldIndex = movable.findIndex((r) => r.id === from)
    const newIndex = movable.findIndex((r) => r.id === to)
    if (oldIndex < 0 || newIndex < 0) return setPreview(null)
    applyOrder(arrayMove(movable, oldIndex, newIndex))
  }

  const dragged = dragging === null ? null : itemOf(dragging)

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={({ active }: DragStartEvent) => setDragging(String(active.id))}
      onDragCancel={() => {
        setDragging(null)
        setPreview(null)
      }}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
    >
      <div className="flex w-full flex-col gap-3">
        {interactive && <Pool pool={pool} q={q} state={state} onPlace={place} slots={slots} lockedSlot={lockedSlot} />}

        <SortableContext
          items={movable.map((r) => r.id)}
          strategy={verticalListSortingStrategy}
        >
          <ol className="flex flex-col gap-2">
            {rows.map((row) => (
              <SortableRow
                key={row.id}
                row={row}
                q={q}
                state={state}
                locked={row.slot === lockedSlot}
                interactive={interactive}
                onNudge={(by) => nudge(row.slot, by)}
                onRemove={() => toPool(row.slot)}
              />
            ))}
          </ol>
        </SortableContext>
      </div>

      {/* the floating copy under the cursor, so the row it came from can move */}
      <DragOverlay>
        {dragged != null && (
          <div className="flex items-center gap-2 rounded-lg border bg-card p-2 shadow-lg">
            <GripVertical className="size-4 shrink-0 text-muted-foreground" />
            <Label item={dragged} q={q} state={state} />
          </div>
        )}
      </DragOverlay>
    </DndContext>
  )
}

function PoolChip({
  item,
  q,
  state,
  onClick,
}: {
  item: number
  q: SortQuestion
  state: RoomState
  onClick: () => void
}) {
  // the same id it will carry once it is on the board, so dnd-kit keeps
  // tracking it when the drag moves it into the list
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: itemId(item),
  })
  return (
    <button
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={onClick}
      className={cn(
        "flex max-w-full touch-none cursor-grab items-center gap-2 rounded-lg border bg-background px-3 py-2 text-left transition-colors hover:bg-muted active:cursor-grabbing",
        isDragging && "opacity-40",
      )}
    >
      <Label item={item} q={q} state={state} />
    </button>
  )
}

function Pool({
  pool,
  q,
  state,
  slots,
  lockedSlot,
  onPlace,
}: {
  pool: number[]
  q: SortQuestion
  state: RoomState
  slots: string[]
  lockedSlot: number
  onPlace: (item: number, slot: number) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: "pool" })
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex min-h-12 flex-wrap items-start gap-2 rounded-lg border border-dashed p-2 transition-colors",
        isOver && "border-primary bg-primary/5",
      )}
    >
      {pool.length === 0 ? (
        <span className="p-1 text-sm text-muted-foreground">
          Everything is placed — drag a row, or use the arrows.
        </span>
      ) : (
        pool.map((item) => (
          <PoolChip
            key={item}
            item={item}
            q={q}
            state={state}
            onClick={() => {
              const free = slots.findIndex((s, i) => s === "" && i !== lockedSlot)
              if (free >= 0) onPlace(item, free)
            }}
          />
        ))
      )}
    </div>
  )
}
