import type { SoundName } from "./game-types"

// ponytail: WebAudio oscillators instead of shipping audio files
let ctx: AudioContext | null = null

// call from a user gesture (click) so the browser allows audio
export function initAudio() {
  ctx ??= new AudioContext()
  if (ctx.state === "suspended") void ctx.resume()
}

function tone(
  freq: number,
  start: number,
  dur: number,
  type: OscillatorType = "square",
  vol = 0.12,
  freqEnd?: number,
) {
  if (!ctx) return
  const t = ctx.currentTime + start
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, t)
  if (freqEnd) osc.frequency.exponentialRampToValueAtTime(freqEnd, t + dur)
  gain.gain.setValueAtTime(vol, t)
  gain.gain.exponentialRampToValueAtTime(0.001, t + dur)
  osc.connect(gain).connect(ctx.destination)
  osc.start(t)
  osc.stop(t + dur)
}

export const sounds: Record<SoundName, () => void> = {
  buzzer: () => {
    initAudio()
    tone(233, 0, 0.5, "sawtooth", 0.15)
    tone(220, 0, 0.5, "sawtooth", 0.15)
  },
  correct: () => {
    initAudio()
    tone(523, 0, 0.15, "triangle", 0.2)
    tone(659, 0.12, 0.15, "triangle", 0.2)
    tone(784, 0.24, 0.3, "triangle", 0.2)
  },
  wrong: () => {
    initAudio()
    tone(196, 0, 0.25, "square", 0.12)
    tone(147, 0.25, 0.45, "square", 0.12)
  },
  tada: () => {
    initAudio()
    tone(523, 0, 0.12, "triangle", 0.18)
    tone(659, 0.1, 0.12, "triangle", 0.18)
    tone(784, 0.2, 0.12, "triangle", 0.18)
    tone(1047, 0.3, 0.5, "triangle", 0.2)
    tone(523, 0.3, 0.5, "sine", 0.12)
    tone(784, 0.3, 0.5, "sine", 0.12)
  },
}
