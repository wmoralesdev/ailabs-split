import { HouseRowBalance } from "@/components/house/house-row-balance"
import { RoomListRow, RoomListSection, RoomRowTime } from "@/components/room-list"
import { formatRecentTripOpened } from "@/lib/recent-trips"
import { parseRoomKind } from "@/lib/room-kind"
import type { OwnedRoomDto } from "@/server/rooms"

export function YourRoomsList({
  rooms,
  onChanged,
}: {
  rooms: OwnedRoomDto[]
  onChanged?: () => void
}) {
  if (rooms.length === 0) return null

  return (
    <RoomListSection title="Yours" label="Your bills, trips, and houses">
      {(editing) =>
        rooms.map((room) => {
          const kind = parseRoomKind(room.kind)
          return (
            <RoomListRow
              key={room.code}
              code={room.code}
              name={room.name}
              kind={kind}
              owned={room.owned}
              editing={editing}
              onChanged={onChanged}
              meta={
                kind === "HOUSEHOLD" ? (
                  <HouseRowBalance
                    balanceCents={room.balanceCents}
                    currency={room.currency}
                  />
                ) : (
                  <RoomRowTime>
                    {formatRecentTripOpened(new Date(room.createdAt).getTime())}
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
