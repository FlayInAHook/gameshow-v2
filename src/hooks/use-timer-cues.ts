import { useEffect } from "react"
import { sounds } from "@/lib/sounds"
import type { RoomState, SoundName } from "@/lib/game-types"

/**
 * Which cue, if any, marks this second.
 *
 * The milestones are spaced by how long the round is: the halfway chime and the
 * thirty-second chime only earn their keep on the longer clocks, where a single
 * ten-second warning leaves the room guessing. The last five seconds always
 * tick, and zero lands hard.
 */
export function timerCue(
  left: number | null,
  total: number | null,
): SoundName | null {
  if (left === null) return null
  if (left === 0) return "timeup"
  if (left <= 5) return "tick"
  if (left === 10) return "tick"
  if (total === null || total < 60) return null
  if (left === 30 || left === Math.round(total / 2)) return "chime"
  return null
}

// says the time out loud, so nobody has to watch the number
export function useTimerCues(state: RoomState | null) {
  const left = state?.timerLeft ?? null
  const total = state?.timerTotal ?? null

  // the dep is the value itself, so each second fires exactly once
  useEffect(() => {
    const cue = timerCue(left, total)
    if (cue) sounds[cue]()
  }, [left, total])
}
