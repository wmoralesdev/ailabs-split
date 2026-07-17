import { useCallback, useState } from "react"
import { useNavigate } from "@tanstack/react-router"
import { HugeiconsIcon } from "@hugeicons/react"
import { Cancel01Icon } from "@hugeicons/core-free-icons"

import {
  forgetRecentTrip,
  formatRecentTripOpened,
  listRecentTrips,
} from "@/lib/recent-trips"

export function RecentTripsList() {
  const navigate = useNavigate()
  const [trips, setTrips] = useState(() => listRecentTrips())

  const refresh = useCallback(() => {
    setTrips(listRecentTrips())
  }, [])

  if (trips.length === 0) return null

  return (
    <section className="animate-rise-delay mt-8" aria-label="Recent trips">
      <h2 className="text-muted-foreground text-xs font-medium tracking-[0.14em] uppercase">
        Recent trips
      </h2>
      <ul className="mt-3 flex flex-col">
        {trips.map((trip, index) => (
          <li
            key={trip.code}
            className="border-border/70 flex items-center gap-2 border-t py-1"
          >
            <button
              type="button"
              className={
                index === 0
                  ? "hover:bg-muted/50 flex min-w-0 flex-1 flex-col rounded-md bg-muted/35 py-3.5 pr-2 pl-2.5 text-left transition-colors"
                  : "hover:bg-muted/40 flex min-w-0 flex-1 flex-col rounded-md py-3 pr-2 text-left transition-colors"
              }
              onClick={() =>
                void navigate({
                  to: "/r/$code",
                  params: { code: trip.code },
                })
              }
            >
              <span className="text-foreground truncate font-medium">
                {index === 0 ? `Continue ${trip.name}` : trip.name}
              </span>
              <span className="text-muted-foreground mt-0.5 flex items-center gap-2 text-xs">
                <span className="font-display tracking-[0.18em] uppercase">
                  {trip.code}
                </span>
                <span aria-hidden>·</span>
                <span>{formatRecentTripOpened(trip.updatedAt)}</span>
              </span>
            </button>
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground hover:bg-muted/60 inline-flex size-11 shrink-0 items-center justify-center rounded-md transition-colors"
              aria-label={`Remove ${trip.name} from recent trips`}
              onClick={() => {
                forgetRecentTrip(trip.code)
                refresh()
              }}
            >
              <HugeiconsIcon icon={Cancel01Icon} size={14} strokeWidth={2} />
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
