import { useCallback, useEffect, useMemo, useState } from "react"
import { useNavigate } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"

import { HouseRowBalance } from "@/components/house/house-row-balance"
import { RoomExitControl } from "@/components/room-exit-control"
import { mergeHiddenRoomCodes } from "@/lib/hidden-rooms"
import { recallMember } from "@/lib/member-storage"
import { formatRecentTripOpened, listRecentTrips } from "@/lib/recent-trips"
import { parseRoomKind, roomKindLabel } from "@/lib/room-kind"
import { getHouseRowBalances } from "@/server/houses"
import type { HouseRowBalanceDto } from "@/server/houses"
import type { OwnedRoomDto } from "@/server/rooms"

export function RecentTripsList({
  ownedCodes,
  yours = [],
  serverHiddenCodes,
  onChanged,
}: {
  ownedCodes: readonly string[]
  yours?: readonly OwnedRoomDto[]
  serverHiddenCodes: readonly string[]
  onChanged?: () => void
}) {
  const navigate = useNavigate()
  const [trips, setTrips] = useState<ReturnType<typeof listRecentTrips>>([])
  const owned = useMemo(() => new Set(ownedCodes), [ownedCodes])
  const ownedKey = ownedCodes.join(",")
  const hiddenKey = serverHiddenCodes.join(",")
  const yoursByCode = useMemo(() => {
    const map = new Map<string, OwnedRoomDto>()
    for (const room of yours) map.set(room.code, room)
    return map
  }, [yours])

  const refresh = useCallback(() => {
    setTrips(
      listRecentTrips().filter(
        (trip) =>
          parseRoomKind(trip.kind ?? "TRIP") !== "HOUSEHOLD" ||
          !yoursByCode.has(trip.code)
      )
    )
  }, [yoursByCode])

  const refreshAndNotify = useCallback(() => {
    refresh()
    onChanged?.()
  }, [onChanged, refresh])

  useEffect(() => {
    mergeHiddenRoomCodes([...serverHiddenCodes])
    refresh()
  }, [hiddenKey, ownedKey, refresh, serverHiddenCodes])

  const fetchItems = useMemo(() => {
    const items: Array<{ code: string; memberId: string }> = []
    for (const trip of trips) {
      if (parseRoomKind(trip.kind ?? "TRIP") !== "HOUSEHOLD") continue
      const ownedRoom = yoursByCode.get(trip.code)
      if (ownedRoom && ownedRoom.balanceCents !== undefined) continue
      const memberId = recallMember(trip.code)
      if (!memberId) continue
      items.push({ code: trip.code, memberId })
    }
    return items
  }, [trips, yoursByCode])

  const balancesQuery = useQuery({
    queryKey: ["house-row-balances", fetchItems],
    queryFn: () => getHouseRowBalances({ data: { items: fetchItems } }),
    enabled: fetchItems.length > 0,
  })

  const fetchedByCode = useMemo(() => {
    const map = new Map<string, HouseRowBalanceDto>()
    for (const row of balancesQuery.data?.items ?? []) {
      map.set(row.code, row)
    }
    return map
  }, [balancesQuery.data])

  if (trips.length === 0) return null

  return (
    <section className="animate-rise-delay mt-8" aria-label="Recent trips">
      <h2 className="text-xs font-medium tracking-[0.14em] text-muted-foreground uppercase">
        Recent
      </h2>
      <ul className="group-list mt-2">
        {trips.map((trip, index) => {
          const kindParsed = parseRoomKind(trip.kind ?? "TRIP")
          const kind = roomKindLabel(kindParsed)
          const isContinue = index === 0
          const ownedRoom = yoursByCode.get(trip.code)
          const isOwned = ownedRoom?.owned ?? owned.has(trip.code)
          const fetched = fetchedByCode.get(trip.code)
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
                {kindParsed === "HOUSEHOLD" ? (
                  <HouseRowBalance
                    balanceCents={
                      ownedRoom?.balanceCents ?? fetched?.balanceCents
                    }
                    currency={ownedRoom?.currency ?? fetched?.currency}
                  />
                ) : (
                  <span className="shrink-0 self-center text-[13px] text-muted-foreground tabular-nums">
                    {formatRecentTripOpened(trip.updatedAt)}
                  </span>
                )}
              </button>
              <RoomExitControl
                code={trip.code}
                name={trip.name}
                kind={kindParsed}
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
