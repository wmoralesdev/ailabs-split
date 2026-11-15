import { useEffect, useRef, useState } from "react"
import { Link, useMatchRoute } from "@tanstack/react-router"
import { HugeiconsIcon } from "@hugeicons/react"
import { Add01Icon } from "@hugeicons/core-free-icons"

import {
  findScrollParent,
  readScrollTop,
  subscribeScroll,
} from "@/lib/scroll-parent"
import { cn } from "@/lib/utils"

/** Scroll distance before the label folds away or comes back. */
const FOLD_DELTA = 6
/** Near the top the label always shows. */
const TOP_ZONE = 48

/**
 * The room's add action, on the room home only. It sits sticky at the end of
 * the scroll pane, so the page reserves its height and the last row always
 * scrolls clear of it; the label folds to a round + while scrolling down.
 */
export function RoomFab({ code, label }: { code: string; label: string }) {
  const matchRoute = useMatchRoute()
  const onHome = !!matchRoute({ to: "/r/$code", params: { code } })
  const hostRef = useRef<HTMLDivElement>(null)
  const [folded, setFolded] = useState(false)

  useEffect(() => {
    if (!onHome) return
    const scroller = findScrollParent(hostRef.current)
    let last = readScrollTop(scroller)
    function onScroll() {
      const top = readScrollTop(scroller)
      if (top < TOP_ZONE) {
        setFolded(false)
      } else if (top > last + FOLD_DELTA) {
        setFolded(true)
      } else if (top < last - FOLD_DELTA) {
        setFolded(false)
      } else {
        return
      }
      last = top
    }
    return subscribeScroll(scroller, onScroll)
  }, [onHome])

  if (!onHome) return null

  return (
    <div
      ref={hostRef}
      className="page-gutter pointer-events-none sticky bottom-0 z-20 mx-auto flex w-full max-w-content justify-end pt-3 pb-[calc(env(safe-area-inset-bottom,0px)+0.75rem)]"
    >
      <Link
        to="/r/$code/new"
        params={{ code }}
        search={{}}
        aria-label={label}
        className={cn(
          "fill-fab pointer-events-auto inline-flex h-14 items-center justify-center rounded-full shadow-lg shadow-primary/30 transition-[padding,transform,background-color] duration-200 motion-safe:hover:-translate-y-0.5 motion-reduce:transition-none",
          folded ? "w-14 px-0" : "gap-2 pr-6 pl-5"
        )}
      >
        <HugeiconsIcon icon={Add01Icon} size={22} strokeWidth={2.2} />
        <span
          className={cn(
            "overflow-hidden text-[15px] font-semibold whitespace-nowrap transition-[max-width,opacity] duration-200 motion-reduce:transition-none",
            folded ? "max-w-0 opacity-0" : "max-w-40 opacity-100"
          )}
          aria-hidden
        >
          {label}
        </span>
      </Link>
    </div>
  )
}
