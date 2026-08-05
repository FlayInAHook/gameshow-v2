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

  // zoom: crop a shrinking centered window; blur: canvas filter
  const z = filters.includes("zoom") ? 1 + o * 9 : 1
  const sw = W / z
  const sh = H / z
  if (filters.includes("blur") && o > 0)
    wctx.filter = `blur(${Math.round(o * W * 0.03)}px)`
  wctx.drawImage(img, (W - sw) / 2, (H - sh) / 2, sw, sh, 0, 0, W, H)
  wctx.filter = "none"

  if (filters.includes("pixelate") && o > 0) {
    const f = Math.max(0.015, 1 - o * 0.985)
    const small = document.createElement("canvas")
    small.width = Math.max(1, Math.round(W * f))
    small.height = Math.max(1, Math.round(H * f))
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
  className,
}: {
  src: string
  filters: Array<RevealFilter>
  progress: number
  className?: string
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imgRef = useRef<HTMLImageElement | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    if (imgRef.current?.src === src && imgRef.current.complete) {
      drawObscured(canvas, imgRef.current, filters, progress)
      return
    }
    const img = new Image()
    img.onload = () => {
      imgRef.current = img
      drawObscured(canvas, img, filters, progress)
    }
    img.src = src
  }, [src, filters, progress])

  return <canvas ref={canvasRef} className={cn("max-w-full", className)} />
}
