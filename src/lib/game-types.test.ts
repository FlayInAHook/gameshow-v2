import { expect, test } from "vitest"
import { scoreSort } from "./game-types"
import type { SortQuestion } from "./game-types"

const q: SortQuestion = {
  id: "q",
  type: "sort",
  text: "",
  items: ["A", "B", "C", "D", "E"],
  correct: [0, 1, 2, 3, 4],
}

// worth 5, so a flawless sort pays 5 + 1 and a slot is worth 1
const score = (answer: string, question = q) => scoreSort(question, answer, 5)

test("a flawless order pays full marks plus the bonus", () => {
  expect(score("0,1,2,3,4")).toBe(6)
})

test("partial knowledge still pays", () => {
  expect(score("0,2,1,3,4")).toBe(4) // one adjacent swap
  expect(score("0,2,4,1,3")).toBe(3) // roughly right
  expect(score("1,2,3,4,0")).toBe(2) // top item dragged to the bottom
})

test("exact placements are a floor, even when the rest is a mess", () => {
  // nothing is in the right pairwise order, but two items are in their slots
  expect(score("0,1,,,")).toBe(2)
  // a reversal leaves the middle item where it belongs, and that still counts
  expect(score("4,3,2,1,0")).toBe(1)
})

test("an empty board is worth nothing", () => {
  expect(score("")).toBe(0)
})

// seven items, so a slot is worth 5/7 = 0.71 and the rounding actually bites
const seven: SortQuestion = {
  id: "q7",
  type: "sort",
  text: "",
  items: ["A", "B", "C", "D", "E", "F", "G"],
  correct: [0, 1, 2, 3, 4, 5, 6],
}

test("the round is tallied whole, then rounded down unless it is within .75", () => {
  expect(score("0,1,2,3,4,5,6", seven)).toBe(6) // flawless: 5.00 + bonus
  expect(score("0,2,1,3,4,5,6", seven)).toBe(5) // one swap: curve 4.76
  expect(score("1,0,2,4,3,5,6", seven)).toBe(4) // two swaps: curve 4.50
  expect(score("1,2,3,4,5,6,0", seven)).toBe(3) // top item last: curve 3.27
})

test("a lucky slot alone does not round its way to a point", () => {
  // one item home, everything else backwards: 0.71 of a point, so nothing
  expect(score("0,6,5,4,3,2,1", seven)).toBe(0)
  // the same single hit, but the rest in coherent order, is carried by it
  expect(score("0,2,3,4,5,6,1", seven)).toBe(3)
})

test("a locked anchor is not the player's to get right", () => {
  const anchored: SortQuestion = { ...q, anchor: 2, anchorLocked: true }
  // the anchor sits in slot 2 either way, so it must not sway the score
  expect(score("0,1,2,3,4", anchored)).toBe(6)
  expect(score("2,2,2,2,2", anchored)).toBe(0)
})
