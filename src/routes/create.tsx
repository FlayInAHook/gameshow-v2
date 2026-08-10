import { useEffect, useRef, useState } from "react"
import { Link, createFileRoute } from "@tanstack/react-router"
import {
  ClipboardPaste,
  Download,
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
import { loadCollections, saveCollections } from "@/lib/store"
import { defaultSettings, hasOptions } from "@/lib/game-types"
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
  buzz: "Buzz",
  free: "Free Input",
  reveal: "Image Reveal",
}

const allFilters: Array<RevealFilter> = ["zoom", "blur", "pixelate", "scramble"]

function newQuestion(type: QuestionType): Question {
  const id = crypto.randomUUID()
  if (type === "mc") return { id, type, text: "", options: ["", ""], correct: 0 }
  if (type === "multi")
    return { id, type, text: "", options: ["", "", ""], correct: [] }
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

"mc" — multiple choice, players pick an option:
{ "id": "q1", "type": "mc", "text": "...", "options": ["A", "B", "C", "D"], "correct": 0 }
"correct" is the 0-based index into "options". At least 2 options.

"multi" — select all, players pick every correct option and only score on the exact set:
{ "id": "q2", "type": "multi", "text": "...", "options": ["A", "B", "C", "D", "E"], "correct": [0, 2] }
"correct" is a list of 0-based indexes, at least 2 of them, and never all of the options. Write the text so it is clear that several answers are right.

"buzz" — players buzz in, the host judges out loud:
{ "id": "q3", "type": "buzz", "text": "...", "answer": "..." }

"free" — players type an answer, the host judges:
{ "id": "q4", "type": "free", "text": "...", "answer": "..." }

"answer" is optional but include it — it is shown to the host when the round closes.

There is a fourth type, "reveal", that slowly uncovers an uploaded image. Skip it: images are uploaded in the app, not generated here. For the same reason never emit an "image" field.

Keep question text to a single line. Ask me for the topic, difficulty and number of questions if I have not given them.`

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
    new Blob([JSON.stringify(c, null, 2)], { type: "application/json" }),
  )
  a.download = `${c.name}.json`
  a.click()
  URL.revokeObjectURL(a.href)
}

function CreatePage() {
  const [collections, setCollections] = useState<Array<Collection>>(loadCollections)
  const [selectedId, setSelectedId] = useState<string | null>(
    collections[0]?.id ?? null,
  )
  const importRef = useRef<HTMLInputElement>(null)
  const [copied, setCopied] = useState(false)

  function importJson(text: string) {
    try {
      // AIs like to wrap the answer in a ```json fence no matter what you ask
      const parsed = JSON.parse(
        text.trim().replace(/^```(?:json)?\n?|\n?```$/g, ""),
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

  useEffect(() => saveCollections(collections), [collections])

  const selected = collections.find((c) => c.id === selectedId) ?? null

  function updateSelected(patch: Partial<Collection>) {
    setCollections((cs) =>
      cs.map((c) => (c.id === selectedId ? { ...c, ...patch } : c)),
    )
  }

  function updateQuestion(id: string, patch: Partial<Question>) {
    if (!selected) return
    updateSelected({
      questions: selected.questions.map((q) =>
        q.id === id ? ({ ...q, ...patch } as Question) : q,
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
    <main className="mx-auto flex min-h-svh max-w-5xl flex-col gap-4 p-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" render={<Link to="/" />}>
          ← Back
        </Button>
        <h1 className="text-2xl font-bold">Create questions</h1>
      </div>

      <div className="flex items-start gap-6">
        {/* collection list — sticks while the question list scrolls past it,
            and scrolls on its own once there are more collections than fit */}
        <div className="sticky top-6 flex max-h-[calc(100svh-3rem)] w-72 shrink-0 flex-col gap-2 overflow-y-auto">
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

            {selected.questions.map((q, i) => (
              <Card
                key={q.id}
                // paste anywhere in the card (the event bubbles up from
                // whichever field has focus) to drop a screenshot straight in
                onPaste={(e) => {
                  const f = [...e.clipboardData.files].find((x) =>
                    x.type.startsWith("image/"),
                  )
                  if (!f) return
                  e.preventDefault()
                  void fileToDataUrl(f).then((image) =>
                    updateQuestion(q.id, { image }),
                  )
                }}
              >
                <CardContent className="flex flex-col gap-3 pt-4">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">{typeLabels[q.type]}</Badge>
                    <span className="text-sm text-muted-foreground">
                      #{i + 1}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="ml-auto"
                      onClick={() =>
                        updateSelected({
                          questions: selected.questions.filter(
                            (x) => x.id !== q.id,
                          ),
                        })
                      }
                    >
                      <Trash2 />
                    </Button>
                  </div>
                  <Input
                    placeholder="Question text"
                    value={q.text}
                    onChange={(e) => updateQuestion(q.id, { text: e.target.value })}
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
                          Tick every correct option. Players have to pick the
                          exact set to score.
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
                                    ? [...q.correct, oi].sort((a, b) => a - b)
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
                                  j === oi ? e.target.value : o,
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
                                  options: q.options.filter((_, j) => j !== oi),
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
                                          .map((x) => (x > oi ? x - 1 : x)),
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
                          updateQuestion(q.id, { options: [...q.options, ""] })
                        }
                      >
                        <Plus /> Option
                      </Button>
                    </div>
                  )}
                  {!hasOptions(q) && (
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
                          Reveal timer in seconds (empty = step manually while
                          hosting)
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
                          onZoom={(zoom) => updateQuestion(q.id, { zoom })}
                        />
                      )}
                    </>
                  )}
                </CardContent>
              </Card>
            ))}

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
