import { useCallback, useEffect, useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"

import { HouseRowBalance } from "@/components/house/house-row-balance"
import { RoomListRow, RoomListSection, RoomRowTime } from "@/components/room-list"
import { mergeHiddenRoomCodes } from "@/lib/hidden-rooms"
import { recallMember } from "@/lib/member-storage"
import { formatRecentTripOpened, listRecentTrips } from "@/lib/recent-trips"
import { parseRoomKind } from "@/lib/room-kind"
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
    <RoomListSection title="Recent" label="Recent bills, trips, and houses">
      {(editing) =>
        trips.map((trip, index) => {
          const kind = parseRoomKind(trip.kind ?? "TRIP")
          const ownedRoom = yoursByCode.get(trip.code)
          const fetched = fetchedByCode.get(trip.code)
          return (
            <RoomListRow
              key={trip.code}
              code={trip.code}
              name={trip.name}
              kind={kind}
              owned={ownedRoom?.owned ?? owned.has(trip.code)}
              eyebrow={index === 0 ? "Continue" : undefined}
              editing={editing}
              onChanged={refreshAndNotify}
              meta={
                kind === "HOUSEHOLD" ? (
                  <HouseRowBalance
                    balanceCents={
                      ownedRoom?.balanceCents ?? fetched?.balanceCents
                    }
                    currency={ownedRoom?.currency ?? fetched?.currency}
                  />
                ) : (
                  <RoomRowTime>
                    {formatRecentTripOpened(trip.updatedAt)}
                  </RoomRowTime>
                )
              }
            />
          )
        })
      }
    </RoomListSection>
  )
}
