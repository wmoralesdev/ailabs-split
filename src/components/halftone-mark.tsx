import { cn } from "@/lib/utils"

/** Print-shop halftone of the Ai Labs mark. Decorative; keep out of the tab order. */
export function HalftoneMark({ className }: { className?: string }) {
  return (
    <div className={cn("halftone-mark relative", className)} aria-hidden>
      <div className="halftone-layer halftone-layer-ink" />
      <div className="halftone-layer halftone-layer-stamp" />
    </div>
  )
}
