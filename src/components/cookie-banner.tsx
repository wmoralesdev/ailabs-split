import { useEffect, useState } from "react"

import { COOKIE_CONSENT_KEY, COOKIE_CONSENT_VALUE } from "@/lib/cookie-consent"

export function CookieBanner() {
  const [visible, setVisible] = useState(false)

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
      role="region"
      aria-label="Cookie notice"
      className="pb-safe pointer-events-none fixed inset-x-0 bottom-0 z-50"
    >
      <div className="page-gutter mx-auto max-w-content pb-3">
        <div className="pointer-events-auto flex items-center gap-3 rounded-2xl bg-card px-3.5 py-3 shadow-[0_-8px_32px_oklch(0_0_0/0.12)] ring-1 ring-foreground/10">
          <p className="min-w-0 flex-1 text-[13px] leading-snug text-muted-foreground">
            Split uses necessary cookies to keep you signed in. We do not use
            them for marketing.
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
    </div>
  )
}
