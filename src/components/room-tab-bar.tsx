import { Link, useMatchRoute } from "@tanstack/react-router"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Add01Icon,
  Home01Icon,
  MoneyExchange01Icon,
} from "@hugeicons/core-free-icons"
import type { IconSvgElement } from "@hugeicons/react"

import { cn } from "@/lib/utils"

/** Fixed bottom navigation for a trip: Home · Add · Settle. */
export function RoomTabBar({ code }: { code: string }) {
  const matchRoute = useMatchRoute()
  const onHome = !!matchRoute({ to: "/r/$code", params: { code } })
  const onSettle = !!matchRoute({ to: "/r/$code/settle", params: { code } })

  return (
    <nav
      aria-label="Trip navigation"
      className="border-border/60 bg-background pb-safe fixed inset-x-0 bottom-0 z-30 border-t"
    >
      <div className="page-gutter mx-auto grid max-w-content grid-cols-3 items-center gap-2 pt-2">
        <TabLink
          to="/r/$code"
          code={code}
          icon={Home01Icon}
          label="Home"
          active={onHome}
        />
        <div className="flex justify-center">
          <Link
            to="/r/$code/new"
            params={{ code }}
            aria-label="Add expense"
            className="bg-primary text-primary-foreground -mt-6 inline-flex size-14 items-center justify-center rounded-full transition-transform active:translate-y-px"
          >
            <HugeiconsIcon icon={Add01Icon} size={26} strokeWidth={2.2} />
          </Link>
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
        "flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-lg text-xs font-medium transition-colors",
        active ? "text-primary" : "text-muted-foreground hover:text-foreground"
      )}
    >
      <HugeiconsIcon icon={icon} size={22} strokeWidth={active ? 2.2 : 2} />
      {label}
    </Link>
  )
}
