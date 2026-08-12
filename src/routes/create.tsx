import { useEffect, useRef, useState } from "react"
import { Link, createFileRoute } from "@tanstack/react-router"
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core"
import type { DragEndEvent } from "@dnd-kit/core"
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import {
  ChevronDown,
  ChevronUp,
  ClipboardPaste,
  Download,
  GripVertical,
  Plus,
  Sparkles,
  Trash2,
  Upload,
} from "lucide-react"
import { RevealImage, fileToDataUrl } from "@/components/reveal-image"
import { SettingsFields } from "@/components/room-settings"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { loadCollections, saveCollections, storageEstimate } from "@/lib/store"
import { cn } from "@/lib/utils"
import { defaultSettings, hasAnswerText, hasOptions } from "@/lib/game-types"
import type {
  Collection,
  Question,
  QuestionType,
  RevealFilter,
} from "@/lib/game-types"

export const Route = createFileRoute("/create")({
  ssr: false,
  component: CreatePage,
})

const typeLabels: Record<QuestionType, string> = {
  mc: "Multiple Choice",
  multi: "Select All",
  sort: "Sorting",
  buzz: "Buzz",
  free: "Free Input",
  reveal: "Image Reveal",
}

const allFilters: Array<RevealFilter> = ["zoom", "blur", "pixelate", "scramble"]

function swap<T>(list: Array<T>, a: number, b: number): Array<T> {
  const next = [...list]
  ;[next[a], next[b]] = [next[b], next[a]]
  return next
}

function newQuestion(type: QuestionType): Question {
  const id = crypto.randomUUID()
  if (type === "mc")
    return { id, type, text: "", options: ["", ""], correct: 0 }
  if (type === "multi")
    return { id, type, text: "", options: ["", "", ""], correct: [] }
  // rows are written in the true order; the server scrambles the item list
  // when the room starts, so what players receive is never the answer
  if (type === "sort")
    return {
      id,
      type,
      text: "",
      // seven is where skill pays most and a lucky shuffle least
      items: ["", "", "", "", "", "", ""],
      correct: [0, 1, 2, 3, 4, 5, 6],
      values: ["", "", "", "", "", "", ""],
    }
  if (type === "reveal")
    return {
      id,
      type,
      text: "",
      answer: "",
      filters: ["pixelate"],
      revealSeconds: 30,
    }
  return { id, type, text: "", answer: "" }
}

const aiPrompt = `Generate a question collection for a game show app. Reply with ONLY the JSON, no commentary, so it can be copied straight into the app's import.

{
  "name": "<collection name>",
  "questions": [ ...question objects... ]
}

Every question object has "id" (unique string), "type", "text" (the question itself), and depending on the type the fields below.

"mc" — multiple choice, players pick one option:
{ "id": "q1", "type": "mc", "text": "...", "options": ["A", "B", "C", "D"], "correct": 0 }
"correct" is the 0-based index into "options". Four options is the good number — two is a coin flip that pays full points.

"multi" — select all, players tick every option they think is right:
{ "id": "q2", "type": "multi", "text": "...", "options": ["A", "B", "C", "D", "E"], "correct": [0, 2] }
"correct" is a list of 0-based indexes. Scoring is per tick: +1 for a right one, -1 for a wrong one, so a player who ticks everything scores (right options - wrong options). That means: five or six options, and never more right ones than wrong ones — two right out of five is a good shape. Write the text so it is clear that several answers are right ("Which of these are…").

"sort" — players put the items in order by some criterion:
{ "id": "q3", "type": "sort", "text": "Oldest to newest", "items": ["A", "B", "C", "D", "E", "F"], "correct": [3, 0, 5, 1, 4, 2], "values": ["1971", "1996", "2008", "1954", "2001", "1988"], "anchor": 0 }
"items" is the list in any order, "correct" is item indexes top to bottom in the true order, and "values" is optional but include it — it is shown as each slot is revealed. "anchor" is optional: the one item whose value players are told up front, as a scale to reason against. Seven items is the good number; below six a lucky shuffle scores nearly as well as real knowledge. Say the direction in the text ("oldest first").

"buzz" — players buzz in, the host judges out loud:
{ "id": "q4", "type": "buzz", "text": "...", "answer": "..." }

"free" — players type an answer, the host judges:
{ "id": "q5", "type": "free", "text": "...", "answer": "..." }

"answer" is optional but include it — the host reveals it to the room at the end of the round.

There is a fifth type, "reveal", that slowly uncovers an uploaded image. Skip it: images are uploaded in the app, not generated here. For the same reason never emit an "image" field.

Keep question text to a single line. Mix the types rather than writing one kind all the way through, and put the harder questions later. Ask me for the topic, difficulty and number of questions if I have not given them.`

async function copyAiPrompt() {
  // ponytail: execCommand fallback because navigator.clipboard is missing on
  // plain-http LAN addresses, which is how this app usually gets hosted
  try {
    await navigator.clipboard.writeText(aiPrompt)
  } catch {
    const ta = document.createElement("textarea")
    ta.value = aiPrompt
    document.body.append(ta)
    ta.select()
    document.execCommand("copy")
    ta.remove()
  }
}

function exportCollection(c: Collection) {
  const a = document.createElement("a")
  a.href = URL.createObjectURL(
    new Blob([JSON.stringify(c, null, 2)], { type: "application/json" })
  )
  a.download = `${c.name}.json`
  a.click()
  URL.revokeObjectURL(a.href)
}

const fmtBytes = (n: number) =>
  n >= 1e9
    ? `${(n / 1e9).toFixed(1)} GB`
    : n >= 1e6
      ? `${Math.round(n / 1e6)} MB`
      : `${Math.round(n / 1e3)} kB`

/**
 * What the collections are costing, against what the browser will actually give
 * this origin. The share is usually a rounding error next to a disk-sized quota,
 * so the bar keeps a visible sliver — the numbers are the point, not the fill.
 */
function StorageBar({
  info,
  error,
}: {
  info: { usage: number; quota: number } | null
  error: string | null
}) {
  if (!info && !error) return null
  const pct = info ? (info.usage / info.quota) * 100 : 0
  return (
    <div className="mt-2 flex flex-col gap-1 border-t pt-3">
      {info && (
        <>
          <div className="h-1 overflow-hidden rounded-full bg-muted">
            <div
              className={cn(
                "h-full rounded-full",
                pct > 90 ? "bg-destructive" : "bg-primary"
              )}
              style={{ width: `${Math.min(100, Math.max(0.5, pct))}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground tabular-nums">
            {fmtBytes(info.usage)} of {fmtBytes(info.quota)} used
          </p>
        </>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}

/**
 * One question card with a grip in its gutter. The handle carries the drag
 * listeners rather than the card itself: the card is full of text inputs, and
 * a drag that starts on a click-and-select would be maddening.
 */
function SortableQuestion({
  id,
  children,
}: {
  id: string
  children: React.ReactNode
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id })
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn("flex items-start gap-1", isDragging && "z-10 opacity-40")}
    >
      <button
        {...attributes}
        {...listeners}
        type="button"
        title="Drag to reorder"
        // touch-none or the browser claims the gesture as a scroll on a phone
        className="mt-5 cursor-grab touch-none rounded-md p-1 text-muted-foreground hover:bg-muted active:cursor-grabbing"
      >
        <GripVertical className="size-4" />
      </button>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}

function CreatePage() {
  const [collections, setCollections] = useState<Array<Collection>>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  // reading IndexedDB is async, so the first render has an empty list that must
  // never be written back over the real one
  const [loaded, setLoaded] = useState(false)
  const [storage, setStorage] = useState<{
    usage: number
    quota: number
  } | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const importRef = useRef<HTMLInputElement>(null)
  const [copied, setCopied] = useState(false)

  function importJson(text: string) {
    try {
      // AIs like to wrap the answer in a ```json fence no matter what you ask
      const parsed = JSON.parse(
        text.trim().replace(/^```(?:json)?\n?|\n?```$/g, "")
      ) as Collection
      if (typeof parsed.name !== "string" || !Array.isArray(parsed.questions))
        throw new Error("bad shape")
      // fresh id so importing your own export doesn't collide; question ids are
      // filled in too because AI-written files tend to omit them
      const col = {
        ...parsed,
        id: crypto.randomUUID(),
        questions: parsed.questions.map((q) => ({
          ...q,
          id: q.id || crypto.randomUUID(),
        })),
      }
      setCollections((cs) => [...cs, col])
      setSelectedId(col.id)
    } catch {
      alert("Not a valid collection file.")
    }
  }

  async function importFromClipboard() {
    // readText needs a secure context, which a plain-http LAN address is not
    const text = await navigator.clipboard?.readText().catch(() => null)
    const json = text ?? window.prompt("Paste the collection JSON:")
    if (json) importJson(json)
  }

  const refreshStorage = () => void storageEstimate().then(setStorage)

  useEffect(() => {
    void loadCollections().then((cs) => {
      setCollections(cs)
      setSelectedId(cs[0]?.id ?? null)
      setLoaded(true)
      refreshStorage()
    })
  }, [])

  useEffect(() => {
    if (!loaded) return
    void saveCollections(collections).then(
      () => {
        setSaveError(null)
        refreshStorage()
      },
      (e: unknown) =>
        setSaveError(
          e instanceof DOMException && e.name === "QuotaExceededError"
            ? "Out of storage — delete a collection or shrink some images."
            : `Could not save: ${String(e)}`
        )
    )
  }, [collections, loaded])

  const selected = collections.find((c) => c.id === selectedId) ?? null

  function updateSelected(patch: Partial<Collection>) {
    setCollections((cs) =>
      cs.map((c) => (c.id === selectedId ? { ...c, ...patch } : c))
    )
  }

  const sensors = useSensors(
    // a small distance so a tap on the handle isn't swallowed as a drag
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  // both the grip and the chevrons land here, so the two ways of reordering
  // can't drift apart
  function moveQuestion(from: number, to: number) {
    if (!selected || to < 0 || to >= selected.questions.length) return
    updateSelected({ questions: arrayMove(selected.questions, from, to) })
  }

  function onDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id || !selected) return
    const from = selected.questions.findIndex((q) => q.id === active.id)
    const to = selected.questions.findIndex((q) => q.id === over.id)
    if (from >= 0 && to >= 0) moveQuestion(from, to)
  }

  function updateQuestion(id: string, patch: Partial<Question>) {
    if (!selected) return
    updateSelected({
      questions: selected.questions.map((q) =>
        q.id === id ? ({ ...q, ...patch } as Question) : q
      ),
    })
  }

  function addCollection() {
    const c: Collection = {
      id: crypto.randomUUID(),
      name: `Collection ${collections.length + 1}`,
      questions: [],
    }
    setCollections((cs) => [...cs, c])
    setSelectedId(c.id)
  }

  return (
    <main className="mx-auto flex min-h-svh max-w-5xl flex-col gap-4 p-6 pt-0">
      {/* sticks so Back is reachable from anywhere in a long collection. the
          negative margin lets its background cover main's padding, otherwise
          the questions show through the gap on either side as they scroll */}
      <div className="sticky top-0 z-20 -mx-6 flex items-center gap-3 border-b bg-background px-6 py-3">
        <Button variant="ghost" size="sm" render={<Link to="/" />}>
          ← Back
        </Button>
        <h1 className="text-2xl font-bold">Create questions</h1>
      </div>

      <div className="flex items-start gap-6">
        {/* collection list — sticks below the header while the question list
            scrolls past it, and scrolls on its own once there are more
            collections than fit */}
        <div className="sticky top-20 flex max-h-[calc(100svh-6rem)] w-72 shrink-0 flex-col gap-2 overflow-y-auto">
          {collections.map((c) => (
            <div key={c.id} className="flex items-center gap-1">
              {/* min-w-0: the button is whitespace-nowrap, so its automatic
                  min-width is the full name — the span never truncated and the
                  text spilled over the icon buttons instead */}
              <Button
                variant={c.id === selectedId ? "secondary" : "ghost"}
                className="min-w-0 flex-1 justify-start"
                onClick={() => setSelectedId(c.id)}
              >
                <span className="truncate">{c.name}</span>
                <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                  {c.questions.length}
                </span>
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                title="Export as JSON"
                onClick={() => exportCollection(c)}
              >
                <Download />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                title="Delete"
                onClick={() => {
                  if (!confirm(`Delete "${c.name}"?`)) return
                  setCollections((cs) => cs.filter((x) => x.id !== c.id))
                  if (selectedId === c.id) setSelectedId(null)
                }}
              >
                <Trash2 />
              </Button>
            </div>
          ))}
          <Button variant="outline" onClick={addCollection}>
            <Plus /> New collection
          </Button>
          <Button variant="outline" onClick={() => importRef.current?.click()}>
            <Upload /> Import file
          </Button>
          <Button variant="outline" onClick={() => void importFromClipboard()}>
            <ClipboardPaste /> Import from clipboard
          </Button>
          <Button
            variant="outline"
            title="Copy a prompt that makes an AI write questions in this app's format"
            onClick={() => {
              void copyAiPrompt()
              setCopied(true)
              setTimeout(() => setCopied(false), 1500)
            }}
          >
            <Sparkles /> {copied ? "Copied!" : "AI prompt"}
          </Button>
          <input
            ref={importRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void f.text().then(importJson)
              e.target.value = ""
            }}
          />

          <StorageBar info={storage} error={saveError} />
        </div>

        {/* editor */}
        {selected ? (
          <div className="flex min-w-0 flex-1 flex-col gap-4">
            <div>
              <Label htmlFor="colname">Collection name</Label>
              <Input
                id="colname"
                className="mt-1"
                value={selected.name}
                onChange={(e) => updateSelected({ name: e.target.value })}
              />
            </div>

            {/* native <details>: closed by default so it doesn't sit between
                you and the questions. keyed on the collection because the
                number fields inside are uncontrolled */}
            <details key={selected.id} className="rounded-xl border px-4 py-3">
              <summary className="cursor-pointer text-sm font-medium select-none">
                Room settings
              </summary>
              <p className="mt-2 text-sm text-muted-foreground">
                Used when you host this collection. The host can still change
                them mid-game.
              </p>
              <div className="flex flex-col gap-2">
                {/* spread over the defaults, not ?? — a collection saved
                    before a setting existed has the object but not the key */}
                <SettingsFields
                  settings={{ ...defaultSettings, ...selected.settings }}
                  onChange={(patch) =>
                    updateSelected({
                      settings: {
                        ...defaultSettings,
                        ...selected.settings,
                        ...patch,
                      },
                    })
                  }
                />
              </div>
            </details>

            {/* neither of these renders a wrapper element, so the cards stay
                direct children of the flex column and keep their gap */}
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={onDragEnd}
            >
              <SortableContext
                items={selected.questions.map((q) => q.id)}
                strategy={verticalListSortingStrategy}
              >
                {selected.questions.map((q, i) => (
                  <SortableQuestion key={q.id} id={q.id}>
                    <Card
                      // paste anywhere in the card (the event bubbles up from
                      // whichever field has focus) to drop a screenshot straight in
                      onPaste={(e) => {
                        const f = [...e.clipboardData.files].find((x) =>
                          x.type.startsWith("image/")
                        )
                        if (!f) return
                        e.preventDefault()
                        void fileToDataUrl(f).then((image) =>
                          updateQuestion(q.id, { image })
                        )
                      }}
                    >
                      <CardContent className="flex flex-col gap-3 pt-4">
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary">
                            {typeLabels[q.type]}
                          </Badge>
                          <span className="text-sm text-muted-foreground">
                            #{i + 1}
                          </span>
                          {/* the same reorder by tapping, for touch and for anyone
                        who would rather not drag a card down a long list */}
                          <div className="ml-auto flex items-center gap-0.5">
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              title="Move up"
                              disabled={i === 0}
                              onClick={() => moveQuestion(i, i - 1)}
                            >
                              <ChevronUp />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              title="Move down"
                              disabled={i === selected.questions.length - 1}
                              onClick={() => moveQuestion(i, i + 1)}
                            >
                              <ChevronDown />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              title="Delete question"
                              onClick={() =>
                                updateSelected({
                                  questions: selected.questions.filter(
                                    (x) => x.id !== q.id
                                  ),
                                })
                              }
                            >
                              <Trash2 />
                            </Button>
                          </div>
                        </div>
                        <Input
                          placeholder="Question text"
                          value={q.text}
                          onChange={(e) =>
                            updateQuestion(q.id, { text: e.target.value })
                          }
                        />
                        {q.image ? (
                          <div className="flex items-start gap-2">
                            <img
                              src={q.image}
                              alt=""
                              className="max-h-32 rounded-lg"
                            />
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              title="Remove image"
                              onClick={() =>
                                updateQuestion(q.id, { image: undefined })
                              }
                            >
                              <Trash2 />
                            </Button>
                          </div>
                        ) : (
                          <div>
                            <Label htmlFor={`img-${q.id}`}>
                              Image (optional — or paste one into this card)
                            </Label>
                            <Input
                              id={`img-${q.id}`}
                              type="file"
                              accept="image/*"
                              className="mt-1"
                              onChange={async (e) => {
                                const f = e.target.files?.[0]
                                if (f)
                                  updateQuestion(q.id, {
                                    image: await fileToDataUrl(f),
                                  })
                              }}
                            />
                          </div>
                        )}
                        {hasOptions(q) && (
                          <div className="flex flex-col gap-2">
                            {q.type === "multi" && (
                              <p className="text-sm text-muted-foreground">
                                Tick every correct option. Players have to pick
                                the exact set to score.
                              </p>
                            )}
                            {q.options.map((opt, oi) => (
                              <div key={oi} className="flex items-center gap-2">
                                {q.type === "mc" ? (
                                  <input
                                    type="radio"
                                    title="Correct answer"
                                    checked={q.correct === oi}
                                    onChange={() =>
                                      updateQuestion(q.id, { correct: oi })
                                    }
                                  />
                                ) : (
                                  <input
                                    type="checkbox"
                                    title="One of the correct answers"
                                    checked={q.correct.includes(oi)}
                                    onChange={(e) =>
                                      updateQuestion(q.id, {
                                        correct: e.target.checked
                                          ? [...q.correct, oi].sort(
                                              (a, b) => a - b
                                            )
                                          : q.correct.filter((x) => x !== oi),
                                      })
                                    }
                                  />
                                )}
                                <Input
                                  placeholder={`Option ${oi + 1}`}
                                  value={opt}
                                  onChange={(e) =>
                                    updateQuestion(q.id, {
                                      options: q.options.map((o, j) =>
                                        j === oi ? e.target.value : o
                                      ),
                                    })
                                  }
                                />
                                {q.options.length > 2 && (
                                  <Button
                                    variant="ghost"
                                    size="icon-sm"
                                    onClick={() =>
                                      updateQuestion(q.id, {
                                        options: q.options.filter(
                                          (_, j) => j !== oi
                                        ),
                                        // the key is index-based, so dropping an
                                        // option shifts everything after it down
                                        ...(q.type === "mc"
                                          ? {
                                              correct:
                                                q.correct >= oi && q.correct > 0
                                                  ? q.correct - 1
                                                  : q.correct,
                                            }
                                          : {
                                              correct: q.correct
                                                .filter((x) => x !== oi)
                                                .map((x) =>
                                                  x > oi ? x - 1 : x
                                                ),
                                            }),
                                      })
                                    }
                                  >
                                    <Trash2 />
                                  </Button>
                                )}
                              </div>
                            ))}
                            <Button
                              variant="outline"
                              size="sm"
                              className="self-start"
                              onClick={() =>
                                updateQuestion(q.id, {
                                  options: [...q.options, ""],
                                })
                              }
                            >
                              <Plus /> Option
                            </Button>
                          </div>
                        )}
                        {q.type === "sort" && (
                          <div className="flex flex-col gap-2">
                            <p className="text-sm text-muted-foreground">
                              Top to bottom in the correct order. Players get
                              them shuffled. The value is optional and shows at
                              the reveal — and up front for the anchor, as a
                              scale to reason against.
                            </p>
                            {q.correct.map((item, slot) => (
                              <div
                                key={item}
                                className="flex items-center gap-2"
                              >
                                <span className="w-5 shrink-0 text-center text-sm font-bold text-muted-foreground tabular-nums">
                                  {slot + 1}
                                </span>
                                <Input
                                  placeholder={`Item ${slot + 1}`}
                                  value={q.items[item]}
                                  onChange={(e) =>
                                    updateQuestion(q.id, {
                                      items: q.items.map((v, j) =>
                                        j === item ? e.target.value : v
                                      ),
                                    })
                                  }
                                />
                                <Input
                                  className="w-28"
                                  placeholder="value"
                                  value={q.values?.[item] ?? ""}
                                  onChange={(e) =>
                                    updateQuestion(q.id, {
                                      values: q.items.map((_, j) =>
                                        j === item
                                          ? e.target.value
                                          : (q.values?.[j] ?? "")
                                      ),
                                    })
                                  }
                                />
                                <input
                                  type="radio"
                                  title="Anchor — its value is given away up front"
                                  checked={q.anchor === item}
                                  onChange={() =>
                                    updateQuestion(q.id, { anchor: item })
                                  }
                                />
                                <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  title="Move up"
                                  disabled={slot === 0}
                                  onClick={() =>
                                    updateQuestion(q.id, {
                                      correct: swap(q.correct, slot, slot - 1),
                                    })
                                  }
                                >
                                  <ChevronUp />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  title="Move down"
                                  disabled={slot === q.correct.length - 1}
                                  onClick={() =>
                                    updateQuestion(q.id, {
                                      correct: swap(q.correct, slot, slot + 1),
                                    })
                                  }
                                >
                                  <ChevronDown />
                                </Button>
                                {q.correct.length > 2 && (
                                  <Button
                                    variant="ghost"
                                    size="icon-sm"
                                    title="Remove"
                                    onClick={() =>
                                      updateQuestion(q.id, {
                                        items: q.items.filter(
                                          (_, j) => j !== item
                                        ),
                                        values: q.values?.filter(
                                          (_, j) => j !== item
                                        ),
                                        // indexes shift down past the removed item
                                        correct: q.correct
                                          .filter((x) => x !== item)
                                          .map((x) => (x > item ? x - 1 : x)),
                                        anchor:
                                          q.anchor === item
                                            ? undefined
                                            : q.anchor !== undefined &&
                                                q.anchor > item
                                              ? q.anchor - 1
                                              : q.anchor,
                                      })
                                    }
                                  >
                                    <Trash2 />
                                  </Button>
                                )}
                              </div>
                            ))}
                            <div className="flex flex-wrap items-center gap-3">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() =>
                                  updateQuestion(q.id, {
                                    items: [...q.items, ""],
                                    values: [
                                      ...(q.values ?? q.items.map(() => "")),
                                      "",
                                    ],
                                    correct: [...q.correct, q.items.length],
                                  })
                                }
                              >
                                <Plus /> Item
                              </Button>
                              {q.anchor !== undefined && (
                                <>
                                  <label className="flex items-center gap-1.5 text-sm">
                                    <input
                                      type="checkbox"
                                      checked={q.anchorLocked ?? false}
                                      onChange={(e) =>
                                        updateQuestion(q.id, {
                                          anchorLocked: e.target.checked,
                                        })
                                      }
                                    />
                                    Hard anchor (also locked in its slot)
                                  </label>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() =>
                                      updateQuestion(q.id, {
                                        anchor: undefined,
                                        anchorLocked: undefined,
                                      })
                                    }
                                  >
                                    No anchor
                                  </Button>
                                </>
                              )}
                            </div>
                          </div>
                        )}
                        {hasAnswerText(q) && (
                          <Input
                            placeholder="Answer (shown when the round is closed, optional)"
                            value={q.answer ?? ""}
                            onChange={(e) =>
                              updateQuestion(q.id, { answer: e.target.value })
                            }
                          />
                        )}
                        {q.type === "reveal" && (
                          <>
                            <div className="flex flex-wrap gap-4">
                              {allFilters.map((f) => (
                                <label
                                  key={f}
                                  className="flex items-center gap-1.5 text-sm"
                                >
                                  <input
                                    type="checkbox"
                                    checked={q.filters.includes(f)}
                                    onChange={(e) =>
                                      updateQuestion(q.id, {
                                        filters: e.target.checked
                                          ? [...q.filters, f]
                                          : q.filters.filter((x) => x !== f),
                                      })
                                    }
                                  />
                                  {f}
                                </label>
                              ))}
                            </div>
                            <div>
                              <Label htmlFor={`timer-${q.id}`}>
                                Reveal timer in seconds (empty = step manually
                                while hosting)
                              </Label>
                              <Input
                                id={`timer-${q.id}`}
                                type="number"
                                className="mt-1 w-40"
                                value={q.revealSeconds ?? ""}
                                onChange={(e) =>
                                  updateQuestion(q.id, {
                                    revealSeconds: e.target.value
                                      ? Number(e.target.value)
                                      : undefined,
                                  })
                                }
                              />
                            </div>
                            {q.image && q.filters.length > 0 && (
                              <RevealPreview
                                image={q.image}
                                filters={q.filters}
                                zoom={q.zoom ?? { x: 0.5, y: 0.5 }}
                                onZoom={(zoom) =>
                                  updateQuestion(q.id, { zoom })
                                }
                              />
                            )}
                          </>
                        )}
                      </CardContent>
                    </Card>
                  </SortableQuestion>
                ))}
              </SortableContext>
            </DndContext>

            <div className="flex gap-2">
              {(Object.keys(typeLabels) as Array<QuestionType>).map((t) => (
                <Button
                  key={t}
                  variant="outline"
                  onClick={() =>
                    updateSelected({
                      questions: [...selected.questions, newQuestion(t)],
                    })
                  }
                >
                  <Plus /> {typeLabels[t]}
                </Button>
              ))}
            </div>
          </div>
        ) : (
          <p className="pt-8 text-muted-foreground">
            Select or create a collection on the left.
          </p>
        )}
      </div>
    </main>
  )
}

function RevealPreview({
  image,
  filters,
  zoom,
  onZoom,
}: {
  image: string
  filters: Array<RevealFilter>
  zoom: { x: number; y: number }
  onZoom: (z: { x: number; y: number }) => void
}) {
  const [p, setP] = useState(0.25)
  return (
    <div className="flex flex-col gap-2 rounded-lg border p-3">
      <Label>Preview — drag to simulate the reveal</Label>
      <RevealImage
        src={image}
        filters={filters}
        progress={p}
        zoom={zoom}
        className="max-h-64 self-start rounded-lg"
      />
      {filters.includes("zoom") && (
        <>
          <Label>Zoom start — click the image to move it</Label>
          <div className="relative self-start">
            <img
              src={image}
              alt=""
              className="max-h-40 cursor-crosshair rounded-lg"
              onClick={(e) => {
                const r = e.currentTarget.getBoundingClientRect()
                onZoom({
                  x: (e.clientX - r.left) / r.width,
                  y: (e.clientY - r.top) / r.height,
                })
              }}
            />
            <span
              className="pointer-events-none absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-red-500"
              style={{ left: `${zoom.x * 100}%`, top: `${zoom.y * 100}%` }}
            />
          </div>
        </>
      )}
      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={p}
        onChange={(e) => setP(Number(e.target.value))}
      />
    </div>
  )
}
