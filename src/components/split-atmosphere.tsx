import { useEffect, useRef } from "react"
import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

type SplitAtmosphereProps = {
  /** Wrapper element; defaults to `div`. Use `main` for standalone pages. */
  as?: "div" | "main"
  children: ReactNode
  className?: string
}

/** Paper ground with a halftone wash that fades out over the top half. */
export function SplitAtmosphere({
  as: Comp = "div",
  children,
  className,
}: SplitAtmosphereProps) {
  return (
    <Comp className={cn("relative isolate min-h-dvh bg-background", className)}>
      <HalftoneWash />
      {children}
    </Comp>
  )
}

/** Screen pitch along the 45° axis is `CELL / √2`. */
const CELL = 13
/** Largest dot radius as a share of `CELL`; just under touching neighbours. */
const MAX_DOT = 0.34
const MIN_RADIUS = 0.3

function smoothstep(edge0: number, edge1: number, x: number) {
  const t = Math.min(Math.max((x - edge0) / (edge1 - edge0), 0), 1)
  return t * t * (3 - 2 * t)
}

/**
 * Print-style halftone: one dot per screen cell, radius set by tone. Rows step
 * by half a cell and alternate a half-cell offset, which puts the screen on the
 * top-left → bottom-right diagonal. Tone is strongest at the top-left corner
 * and reaches zero just past the bottom of the canvas (about mid-screen).
 */
function HalftoneWash() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext("2d")
    if (!canvas || !ctx) return

    function draw() {
      if (!canvas || !ctx) return
      const width = canvas.clientWidth
      const height = canvas.clientHeight
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, width, height)

      ctx.fillStyle = getComputedStyle(canvas).color
      ctx.beginPath()
      const step = CELL / 2
      const maxRadius = CELL * MAX_DOT
      for (let row = 0; row * step <= height + CELL; row++) {
        const y = row * step
        const offset = row % 2 ? step : 0
        for (let x = offset; x <= width + CELL; x += CELL) {
          const along = (y / height) * 0.72 + (x / width) * 0.28
          const tone = 1 - smoothstep(-0.35, 1, along)
          const radius = maxRadius * tone ** 1.3
          if (radius < MIN_RADIUS) continue
          ctx.moveTo(x + radius, y)
          ctx.arc(x, y, radius, 0, Math.PI * 2)
        }
      }
      ctx.fill()
    }

    draw()
    const resize = new ResizeObserver(draw)
    resize.observe(canvas)
    const theme = new MutationObserver(draw)
    theme.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "style"],
    })
    return () => {
      resize.disconnect()
      theme.disconnect()
    }
  }, [])

  return <canvas ref={canvasRef} aria-hidden className="halftone-wash" />
}
