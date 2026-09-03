import { useLayoutEffect, type ReactNode } from "react"

import { AppHeader } from "@/components/app-header"
import { SplitAtmosphere } from "@/components/split-atmosphere"

type RoomShellProps = {
  children: ReactNode
  headerRight?: ReactNode
  footer?: ReactNode
}

/**
 * Viewport-locked trip chrome: header and tab bar stay put, only the
 * middle pane scrolls. Avoids iOS `position: fixed` jumping with the page.
 */
export function RoomShell({ children, headerRight, footer }: RoomShellProps) {
  useLayoutEffect(() => {
    document.documentElement.classList.add("room-lock-scroll")
    return () => document.documentElement.classList.remove("room-lock-scroll")
  }, [])

  return (
    <SplitAtmosphere className="flex h-dvh max-h-dvh flex-col overflow-hidden">
      <div data-app-shell className="relative flex min-h-0 flex-1 flex-col">
        <AppHeader right={headerRight} />
        <div
          data-app-scroll
          className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-y-contain pb-8"
        >
          {children}
        </div>
        {footer}
      </div>
    </SplitAtmosphere>
  )
}
