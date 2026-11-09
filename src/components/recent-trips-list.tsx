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
      <ul className="group-list mt-2">
        {trips.map((trip, index) => {
          const kind = trip.kind === "DINNER" ? "Dinner" : "Trip"
          const isContinue = index === 0
          return (
            <li key={trip.code} className="flex items-stretch">
              <button
                type="button"
                className="group-row-hit min-w-0 flex-1 text-left"
                aria-label={
                  isContinue ? `Continue ${trip.name}` : `Open ${trip.name}`
                }
                onClick={() =>
                  void navigate({
                    to: "/r/$code",
                    params: { code: trip.code },
                  })
                }
              >
                <span className="min-w-0 flex-1">
                  {isContinue ? (
                    <span
                      className="block text-[13px] font-medium text-primary"
                      aria-hidden
                    >
                      Continue
                    </span>
                  ) : null}
                  <span className="block truncate font-medium text-foreground">
                    {trip.name}
                  </span>
                  <span className="mt-0.5 flex min-w-0 items-baseline gap-2 text-[13px] text-muted-foreground">
                    <span className="font-display tracking-[0.18em] uppercase">
                      {trip.code}
                    </span>
                    <span aria-hidden>·</span>
                    <span>{kind}</span>
                  </span>
                </span>
                <span className="shrink-0 self-center text-[13px] text-muted-foreground tabular-nums">
                  {formatRecentTripOpened(trip.updatedAt)}
                </span>
              </button>
              <button
                type="button"
                className="inline-flex size-11 shrink-0 items-center justify-center self-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                aria-label={`Remove ${trip.name} from recent trips`}
                onClick={() => {
                  forgetRecentTrip(trip.code)
                  refresh()
                }}
              >
                <HugeiconsIcon icon={Cancel01Icon} size={14} strokeWidth={2} />
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
