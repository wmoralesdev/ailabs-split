import { useLayoutEffect, useRef } from "react"
import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

/**
 * One line of chips that sidescrolls with a mask fade instead of wrapping.
 * `bleed` runs the row to the screen edge on a page or sheet; without it the
 * row keeps a card's inner padding.
 */
export function ChipRow({
  children,
  role,
  "aria-label": ariaLabel,
  bleed = false,
  followEnd = false,
  className,
}: {
  children: ReactNode
  role?: string
  "aria-label"?: string
  bleed?: boolean
  /** Lists people add to: a new chip scrolls into view at the end. */
  followEnd?: boolean
  className?: string
}) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const scrollerRef = useRef<HTMLDivElement>(null)
  const followEndRef = useRef(followEnd)
  followEndRef.current = followEnd

  useLayoutEffect(() => {
    const scroller = scrollerRef.current
    const wrap = wrapRef.current
    if (!scroller || !wrap) return

    const update = () => {
      const max = Math.max(0, scroller.scrollWidth - scroller.clientWidth)
      wrap.toggleAttribute("data-scroll-left", scroller.scrollLeft > 1)
      wrap.toggleAttribute("data-scroll-right", max - scroller.scrollLeft > 1)
    }

    let count = scroller.childElementCount
    const onMutate = () => {
      const next = scroller.childElementCount
      if (followEndRef.current && next > count) {
        const reduce = window.matchMedia(
          "(prefers-reduced-motion: reduce)"
        ).matches
        scroller.scrollTo({
          left: scroller.scrollWidth,
          behavior: reduce ? "auto" : "smooth",
        })
      }
      count = next
      update()
    }

    update()
    const ro = new ResizeObserver(update)
    ro.observe(scroller)
    const mo = new MutationObserver(onMutate)
    mo.observe(scroller, { childList: true, subtree: true })
    scroller.addEventListener("scroll", update, { passive: true })
    window.addEventListener("resize", update)
    return () => {
      ro.disconnect()
      mo.disconnect()
      scroller.removeEventListener("scroll", update)
      window.removeEventListener("resize", update)
    }
  }, [])

  return (
    <div
      ref={wrapRef}
      className={cn("item-row-assign", bleed && "chip-row-bleed", className)}
    >
      <div
        ref={scrollerRef}
        className="item-row-chips"
        role={role}
        aria-label={ariaLabel}
      >
        {children}
      </div>
    </div>
  )
}

export function EveryoneChip({
  pressed,
  onClick,
}: {
  pressed: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      className="person-chip person-chip-everyone"
      aria-pressed={pressed}
      onClick={onClick}
    >
      Everyone
    </button>
  )
}
