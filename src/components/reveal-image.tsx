import { useEffect, useRef } from "react"
import { cn } from "@/lib/utils"
import type { RevealFilter } from "@/lib/game-types"

// ponytail: images live as compressed jpeg data-urls in localStorage — the
// ~5MB quota is the ceiling; move to server-side files if collections outgrow it
export async function fileToDataUrl(file: File, maxDim = 1280): Promise<string> {
  const bmp = await createImageBitmap(file)
  const scale = Math.min(1, maxDim / Math.max(bmp.width, bmp.height))
  const canvas = document.createElement("canvas")
  canvas.width = Math.round(bmp.width * scale)
  canvas.height = Math.round(bmp.height * scale)
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL("image/jpeg", 0.8)
}

// deterministic seed from the image data so every client scrambles identically
function hashStr(s: string): number {
  let h = 9
  for (let i = 0; i < s.length; i += 101) h = (h * 31 + s.charCodeAt(i)) | 0
  return h
}

function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function drawObscured(
  canvas: HTMLCanvasElement,
  img: HTMLImageElement,
  filters: Array<RevealFilter>,
  progress: number,
  zoomAt: { x: number; y: number },
) {
  const o = 1 - Math.min(1, Math.max(0, progress)) // obscure amount
  const W = img.naturalWidth
  const H = img.naturalHeight
  canvas.width = W
  canvas.height = H

  const work = document.createElement("canvas")
  work.width = W
  work.height = H
  const wctx = work.getContext("2d")!

  // zoom: crop a shrinking window around the focal point; blur: canvas filter.
  // both ramp geometrically so the obscured end stays strong deep into the reveal
  const z = filters.includes("zoom") ? 30 ** o : 1
  const sw = W / z
  const sh = H / z
  const sx = Math.min(Math.max(zoomAt.x * W - sw / 2, 0), W - sw)
  const sy = Math.min(Math.max(zoomAt.y * H - sh / 2, 0), H - sh)
  // overdraw by the blur radius so the blur's transparent falloff lands
  // outside the canvas instead of fading the edges out
  const r = filters.includes("blur") && o > 0 ? Math.round(o * o * W * 0.12) : 0
  if (r) wctx.filter = `blur(${r}px)`
  wctx.drawImage(img, sx, sy, sw, sh, -r, -r, W + 2 * r, H + 2 * r)
  wctx.filter = "none"

  if (filters.includes("pixelate") && o > 0) {
    const small = document.createElement("canvas")
    small.width = Math.max(1, Math.round(W ** (1 - o) * 3 ** o))
    small.height = Math.max(1, Math.round(small.width * (H / W)))
    small.getContext("2d")!.drawImage(work, 0, 0, small.width, small.height)
    wctx.imageSmoothingEnabled = false
    wctx.drawImage(small, 0, 0, small.width, small.height, 0, 0, W, H)
    wctx.imageSmoothingEnabled = true
  }

  const ctx = canvas.getContext("2d")!
  if (filters.includes("scramble") && o > 0) {
    // shuffled tile list; the first k stay swapped (cyclic shift keeps it a
    // permutation for any k), the rest have snapped into place
    const N = 6
    const tw = W / N
    const th = H / N
    const rand = mulberry32(hashStr(img.src))
    const tiles = [...Array(N * N).keys()]
    for (let i = tiles.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1))
      ;[tiles[i], tiles[j]] = [tiles[j], tiles[i]]
    }
    const k = Math.round(o * tiles.length)
    const srcOf = new Map<number, number>()
    for (let i = 0; i < k; i++) srcOf.set(tiles[i], tiles[(i + 1) % k])
    for (let dest = 0; dest < tiles.length; dest++) {
      const src = srcOf.get(dest) ?? dest
      ctx.drawImage(
        work,
        (src % N) * tw,
        Math.floor(src / N) * th,
        tw,
        th,
        (dest % N) * tw,
        Math.floor(dest / N) * th,
        tw,
        th,
      )
    }
  } else {
    ctx.drawImage(work, 0, 0)
  }
}

export function RevealImage({
  src,
  filters,
  progress,
  zoom,
  className,
}: {
  src: string
  filters: Array<RevealFilter>
  progress: number
  zoom?: { x: number; y: number }
  className?: string
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imgRef = useRef<HTMLImageElement | null>(null)
  const at = zoom ?? { x: 0.5, y: 0.5 }

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    if (imgRef.current?.src === src && imgRef.current.complete) {
      drawObscured(canvas, imgRef.current, filters, progress, at)
      return
    }
    const img = new Image()
    img.onload = () => {
      imgRef.current = img
      drawObscured(canvas, img, filters, progress, at)
    }
    img.src = src
  }, [src, filters, progress, at.x, at.y])

  return <canvas ref={canvasRef} className={cn("max-w-full", className)} />
}
