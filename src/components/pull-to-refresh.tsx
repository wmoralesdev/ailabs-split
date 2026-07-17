import { useEffect, useRef, useState } from "react"
import type { ReactNode } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { Loading03Icon } from "@hugeicons/core-free-icons"

import { cn } from "@/lib/utils"

const PULL_THRESHOLD_PX = 70
const MAX_PULL_PX = 120
const RESISTANCE = 0.45

function scrollTop(): number {
  return window.scrollY || document.documentElement.scrollTop || 0
}

type PullToRefreshProps = {
  onRefresh: () => Promise<unknown>
  disabled?: boolean
  className?: string
  children: ReactNode
}

/**
 * Touch-only pull-to-refresh for document-scrolling pages (Instagram-style).
 * Inactive while `disabled`; callers should pass offline / reorder gates.
 */
export function PullToRefresh({
  onRefresh,
  disabled = false,
  className,
  children,
}: PullToRefreshProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const [pull, setPull] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const pullRef = useRef(0)
  const startYRef = useRef<number | null>(null)
  const pullingRef = useRef(false)
  const refreshingRef = useRef(false)
  const disabledRef = useRef(disabled)
  const onRefreshRef = useRef(onRefresh)
  const reducedMotionRef = useRef(false)

  disabledRef.current = disabled
  onRefreshRef.current = onRefresh

  useEffect(() => {
    reducedMotionRef.current = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches
  }, [])

  useEffect(() => {
    const root = rootRef.current
    if (!root) return

    function setPullDistance(next: number) {
      pullRef.current = next
      setPull(next)
    }

    async function runRefresh() {
      if (refreshingRef.current || disabledRef.current) return
      refreshingRef.current = true
      setRefreshing(true)
      setPullDistance(PULL_THRESHOLD_PX)
      try {
        await onRefreshRef.current()
      } finally {
        refreshingRef.current = false
        setRefreshing(false)
        setPullDistance(0)
      }
    }

    function onTouchStart(event: TouchEvent) {
      if (disabledRef.current || refreshingRef.current) return
      if (scrollTop() > 0) {
        startYRef.current = null
        return
      }
      startYRef.current = event.touches[0].clientY
      pullingRef.current = false
    }

    function onTouchMove(event: TouchEvent) {
      if (
        disabledRef.current ||
        refreshingRef.current ||
        startYRef.current == null
      ) {
        return
      }

      const delta = event.touches[0].clientY - startYRef.current
      if (delta <= 0 || scrollTop() > 0) {
        if (pullingRef.current) {
          pullingRef.current = false
          setPullDistance(0)
        }
        return
      }

      pullingRef.current = true
      const next = Math.min(delta * RESISTANCE, MAX_PULL_PX)
      setPullDistance(next)

      if (next > 8 && event.cancelable) {
        event.preventDefault()
      }
    }

    function onTouchEnd() {
      if (disabledRef.current || refreshingRef.current) {
        startYRef.current = null
        pullingRef.current = false
        return
      }

      const shouldRefresh =
        pullingRef.current && pullRef.current >= PULL_THRESHOLD_PX
      startYRef.current = null
      pullingRef.current = false

      if (shouldRefresh) {
        void runRefresh()
        return
      }
      setPullDistance(0)
    }

    root.addEventListener("touchstart", onTouchStart, { passive: true })
    root.addEventListener("touchmove", onTouchMove, { passive: false })
    root.addEventListener("touchend", onTouchEnd)
    root.addEventListener("touchcancel", onTouchEnd)

    return () => {
      root.removeEventListener("touchstart", onTouchStart)
      root.removeEventListener("touchmove", onTouchMove)
      root.removeEventListener("touchend", onTouchEnd)
      root.removeEventListener("touchcancel", onTouchEnd)
    }
  }, [])

  const indicatorVisible = pull > 0 || refreshing
  const armed = pull >= PULL_THRESHOLD_PX || refreshing

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <div
        aria-hidden={!indicatorVisible}
        className="pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-center"
        style={{
          height: indicatorVisible ? Math.max(pull, refreshing ? 40 : 0) : 0,
          opacity: indicatorVisible ? Math.min(pull / PULL_THRESHOLD_PX, 1) : 0,
          transition: reducedMotionRef.current
            ? undefined
            : refreshing || pull === 0
              ? "height 150ms ease, opacity 150ms ease"
              : undefined,
        }}
      >
        <div
          className={cn(
            "mt-1 flex size-8 items-center justify-center rounded-full border border-border bg-background text-muted-foreground shadow-sm",
            armed && "text-foreground"
          )}
        >
          <HugeiconsIcon
            icon={Loading03Icon}
            size={16}
            strokeWidth={2}
            className={cn(
              !reducedMotionRef.current &&
                (refreshing || armed) &&
                "animate-spin"
            )}
          />
        </div>
      </div>
      <div
        style={{
          transform:
            pull > 0 || refreshing ? `translateY(${pull}px)` : undefined,
          transition:
            reducedMotionRef.current || pull > 0
              ? undefined
              : "transform 150ms ease",
        }}
      >
        {children}
      </div>
    </div>
  )
}
