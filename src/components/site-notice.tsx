import { useEffect, useRef, useState } from "react"

import { COOKIE_CONSENT_KEY, COOKIE_CONSENT_VALUE } from "@/lib/site-notice-ack"

/** Layouts subtract this so the notice takes its own room instead of covering. */
const HEIGHT_VAR = "--site-notice-height"

export function SiteNotice() {
  const [visible, setVisible] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    try {
      if (
        window.localStorage.getItem(COOKIE_CONSENT_KEY) !== COOKIE_CONSENT_VALUE
      ) {
        setVisible(true)
      }
    } catch {
      setVisible(true)
    }
  }, [])

  // Publish the docked height; the page shrinks by it while it shows.
  useEffect(() => {
    const node = ref.current
    if (!visible || !node) return
    const root = document.documentElement
    const sync = () =>
      root.style.setProperty(HEIGHT_VAR, `${node.offsetHeight}px`)
    sync()
    const observer = new ResizeObserver(sync)
    observer.observe(node)
    return () => {
      observer.disconnect()
      root.style.removeProperty(HEIGHT_VAR)
    }
  }, [visible])

  if (!visible) return null

  function accept() {
    try {
      window.localStorage.setItem(COOKIE_CONSENT_KEY, COOKIE_CONSENT_VALUE)
    } catch {
      // Private mode can block storage; hide for this visit anyway.
    }
    setVisible(false)
  }

  return (
    <div
      ref={ref}
      role="region"
      aria-label="Cookie notice"
      className="pb-safe animate-rise fixed inset-x-0 bottom-0 z-50 border-t border-border bg-card"
    >
      <div className="page-gutter mx-auto flex max-w-content items-center gap-3 pt-2">
        <p className="min-w-0 flex-1 text-[13px] leading-snug text-muted-foreground">
          Split only uses necessary cookies to keep you signed in.
        </p>
        <button
          type="button"
          className="split-cta h-9 shrink-0 px-4 text-[13px]"
          onClick={accept}
        >
          Accept
        </button>
      </div>
    </div>
  )
}
