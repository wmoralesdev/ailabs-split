import { Link, useMatchRoute } from "@tanstack/react-router"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Add01Icon,
  Home01Icon,
  Invoice03Icon,
  MoneyExchange01Icon,
} from "@hugeicons/core-free-icons"
import type { IconSvgElement } from "@hugeicons/react"

import { cn } from "@/lib/utils"

/** Fixed bottom navigation: Home · Add (a trip) or the bill (a dinner) · Settle. */
export function RoomTabBar({
  code,
  kind = "TRIP",
}: {
  code: string
  kind?: "TRIP" | "DINNER"
}) {
  const matchRoute = useMatchRoute()
  const onHome = !!matchRoute({ to: "/r/$code", params: { code } })
  const onSettle = !!matchRoute({ to: "/r/$code/settle", params: { code } })
  const onCheck = !!matchRoute({
    to: "/r/$code/check",
    params: { code },
    fuzzy: true,
  })
  const isDinner = kind === "DINNER"

  if (onCheck) return null

  return (
    <nav
      aria-label={isDinner ? "Bill navigation" : "Trip navigation"}
      className="pb-safe relative z-30 shrink-0 border-t border-border bg-background"
    >
      <div className="page-gutter mx-auto grid max-w-content grid-cols-3 items-center gap-2 pt-1">
        <TabLink
          to="/r/$code"
          code={code}
          icon={Home01Icon}
          label="Home"
          active={onHome}
        />
        <div className="flex justify-center">
          {isDinner ? (
            <Link
              to="/r/$code/check"
              params={{ code }}
              aria-label="Open the bill"
              className="fill-fab -mt-4 inline-flex size-12 items-center justify-center rounded-full"
            >
              <HugeiconsIcon icon={Invoice03Icon} size={22} strokeWidth={2} />
            </Link>
          ) : (
            <Link
              to="/r/$code/new"
              params={{ code }}
              aria-label="Add expense"
              className="fill-fab -mt-4 inline-flex size-12 items-center justify-center rounded-full"
            >
              <HugeiconsIcon icon={Add01Icon} size={22} strokeWidth={2.2} />
            </Link>
          )}
        </div>
        <TabLink
          to="/r/$code/settle"
          code={code}
          icon={MoneyExchange01Icon}
          label="Settle"
          active={onSettle}
        />
      </div>
    </nav>
  )
}

function TabLink({
  to,
  code,
  icon,
  label,
  active,
}: {
  to: "/r/$code" | "/r/$code/settle"
  code: string
  icon: IconSvgElement
  label: string
  active: boolean
}) {
  return (
    <Link
      to={to}
      params={{ code }}
      className={cn(
        "flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-lg text-[11px] font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active
          ? "text-primary"
          : "text-muted-foreground hover:bg-muted hover:text-foreground"
      )}
    >
      <HugeiconsIcon icon={icon} size={20} strokeWidth={active ? 2.2 : 2} />
      {label}
    </Link>
  )
}
