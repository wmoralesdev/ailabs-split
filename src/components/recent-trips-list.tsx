import { useCallback, useEffect, useState } from "react"
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
  const [trips, setTrips] = useState<ReturnType<typeof listRecentTrips>>([])

  useEffect(() => {
    setTrips(listRecentTrips())
  }, [])

  const refresh = useCallback(() => {
    setTrips(listRecentTrips())
  }, [])

  if (trips.length === 0) return null

  return (
    <section className="animate-rise-delay mt-8" aria-label="Recent trips">
      <h2 className="text-xs font-medium tracking-[0.14em] text-muted-foreground uppercase">
        Recent
      </h2>
      <ul className="mt-3 flex flex-col">
        {trips.map((trip, index) => (
          <li
            key={trip.code}
            className="flex items-center gap-2 border-t border-border/70 py-1"
          >
            <button
              type="button"
              className={
                index === 0
                  ? "flex min-w-0 flex-1 flex-col rounded-2xl bg-muted/50 py-3.5 pr-2 pl-2.5 text-left transition-colors hover:bg-muted/50"
                  : "flex min-w-0 flex-1 flex-col rounded-2xl py-3 pr-2 text-left transition-colors hover:bg-muted/40"
              }
              onClick={() =>
                void navigate({
                  to: "/r/$code",
                  params: { code: trip.code },
                })
              }
            >
              <span className="truncate font-medium text-foreground">
                {index === 0 ? `Continue ${trip.name}` : trip.name}
              </span>
              <span className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                <span className="font-display tracking-[0.18em] uppercase">
                  {trip.code}
                </span>
                <span aria-hidden>·</span>
                <span>{trip.kind === "DINNER" ? "Dinner" : "Trip"}</span>
                <span aria-hidden>·</span>
                <span>{formatRecentTripOpened(trip.updatedAt)}</span>
              </span>
            </button>
            <button
              type="button"
              className="inline-flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
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
