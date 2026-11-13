import { PullToRefresh } from "@/components/pull-to-refresh"
import { RoomExitControl } from "@/components/room-exit-control"
import { useOnlineStatus } from "@/lib/online-status"
import type { RoomDto } from "@/server/rooms"

export function HouseHome({
  room,
  refetch,
}: {
  room: RoomDto
  refetch: () => Promise<unknown>
}) {
  const online = useOnlineStatus()
  const members = room.house?.members ?? []
  const housemates = members.filter((member) => !member.isGuest)
  const housemateLabel =
    housemates.length === 1 ? "1 housemate" : `${housemates.length} housemates`
  const role = room.house?.viewer.role ?? "VISITOR"
  const guestEmpty = role === "GUEST"

  return (
    <PullToRefresh disabled={!online} onRefresh={() => refetch()}>
      <main className="page-gutter mx-auto w-full max-w-content pt-6 pb-8">
        <header>
          <h1 className="font-display text-[28px] leading-tight font-bold tracking-tight">
            {room.name}
          </h1>
          <p className="mt-1 text-[15px] text-muted-foreground">
            House · {housemateLabel}
          </p>
        </header>

        <p className="mt-6 font-display text-[22px] leading-tight font-semibold tracking-tight">
          {guestEmpty ? "You're not on any charges" : "You're square"}
        </p>

        <div className="mt-8">
          <p className="font-medium text-foreground">No charges yet</p>
          <p className="mt-1 text-[15px] leading-snug text-muted-foreground">
            Add the rent, a grocery run, or anything you share.
          </p>
        </div>

        <div className="mt-8">
          <RoomExitControl
            code={room.code}
            name={room.name}
            kind={room.kind}
            owned={room.owned}
            placement="page"
          />
        </div>
      </main>
    </PullToRefresh>
  )
}
