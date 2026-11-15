import { useLayoutEffect } from "react"
import type { ReactNode } from "react"

import { AppHeader } from "@/components/app-header"
import { SplitAtmosphere } from "@/components/split-atmosphere"

type RoomShellProps = {
  children: ReactNode
  headerRight?: ReactNode
  /** Sticky add action at the end of the scroll pane (see RoomFab). */
  fab?: ReactNode
}

/**
 * Viewport-locked room chrome: the header stays put, only the pane below it
 * scrolls. Avoids iOS `position: fixed` jumping with the page. No bottom bar:
 * the header's back and the room home's own actions carry navigation.
 */
export function RoomShell({ children, headerRight, fab }: RoomShellProps) {
  useLayoutEffect(() => {
    document.documentElement.classList.add("room-lock-scroll")
    return () => document.documentElement.classList.remove("room-lock-scroll")
  }, [])

  return (
    <SplitAtmosphere className="flex h-[calc(100dvh-var(--site-notice-height,0px))] max-h-[calc(100dvh-var(--site-notice-height,0px))] flex-col overflow-hidden">
      <div data-app-shell className="relative flex min-h-0 flex-1 flex-col">
        <AppHeader right={headerRight} />
        <div
          data-app-scroll
          className="flex min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-auto overscroll-y-contain pb-8"
        >
          <div className="flex-1">{children}</div>
          {fab}
        </div>
      </div>
    </SplitAtmosphere>
  )
}
