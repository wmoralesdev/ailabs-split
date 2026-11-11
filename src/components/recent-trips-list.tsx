import { useCallback, useEffect, useMemo, useState } from "react"
import { useNavigate } from "@tanstack/react-router"

import { RoomExitControl } from "@/components/room-exit-control"
import { mergeHiddenRoomCodes } from "@/lib/hidden-rooms"
import { formatRecentTripOpened, listRecentTrips } from "@/lib/recent-trips"

export function RecentTripsList({
  ownedCodes,
  serverHiddenCodes,
  onChanged,
}: {
  ownedCodes: readonly string[]
  serverHiddenCodes: readonly string[]
  onChanged?: () => void
}) {
  const navigate = useNavigate()
  const [trips, setTrips] = useState<ReturnType<typeof listRecentTrips>>([])
  const owned = useMemo(() => new Set(ownedCodes), [ownedCodes])
  const ownedKey = ownedCodes.join(",")
  const hiddenKey = serverHiddenCodes.join(",")

  const refresh = useCallback(() => {
    setTrips(listRecentTrips())
  }, [])

  const refreshAndNotify = useCallback(() => {
    refresh()
    onChanged?.()
  }, [onChanged, refresh])

  useEffect(() => {
    mergeHiddenRoomCodes([...serverHiddenCodes])
    refresh()
  }, [hiddenKey, ownedKey, refresh, serverHiddenCodes])

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
          const isOwned = owned.has(trip.code)
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
              <RoomExitControl
                code={trip.code}
                name={trip.name}
                kind={trip.kind === "DINNER" ? "DINNER" : "TRIP"}
                owned={isOwned}
                placement="row"
                onDone={refreshAndNotify}
              />
            </li>
          )
        })}
      </ul>
    </section>
  )
}
