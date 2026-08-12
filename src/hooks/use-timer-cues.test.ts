import { expect, test } from "vitest"
import { timerCue } from "./use-timer-cues"

// every second of a round, and what the room hears
const schedule = (total: number) =>
  Array.from({ length: total + 1 }, (_, i) => total - i)
    .map((left) => [left, timerCue(left, total)] as const)
    .filter(([, cue]) => cue !== null)

test("a short round only warns at the end", () => {
  expect(schedule(15)).toEqual([
    [10, "tick"],
    [5, "tick"],
    [4, "tick"],
    [3, "tick"],
    [2, "tick"],
    [1, "tick"],
    [0, "timeup"],
  ])
})

test("a minute gets a halfway chime", () => {
  expect(schedule(60).slice(0, 3)).toEqual([
    [30, "chime"],
    [10, "tick"],
    [5, "tick"],
  ])
})

test("two minutes get both milestones, in order", () => {
  expect(schedule(120).slice(0, 4)).toEqual([
    [60, "chime"],
    [30, "chime"],
    [10, "tick"],
    [5, "tick"],
  ])
})

test("no clock, no cues", () => {
  expect(timerCue(null, null)).toBe(null)
  // a paused clock sits on its number without repeating the cue
  expect(timerCue(22, 120)).toBe(null)
})
