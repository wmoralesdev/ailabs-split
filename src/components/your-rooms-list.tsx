import { useNavigate } from "@tanstack/react-router"

import { RoomExitControl } from "@/components/room-exit-control"
import { formatRecentTripOpened } from "@/lib/recent-trips"
import type { OwnedRoomDto } from "@/server/rooms"

export function YourRoomsList({
  rooms,
  onChanged,
}: {
  rooms: OwnedRoomDto[]
  onChanged?: () => void
}) {
  const navigate = useNavigate()

  if (rooms.length === 0) return null

  return (
    <section
      className="animate-rise-delay mt-8"
      aria-label="Your dinners and trips"
    >
      <h2 className="text-xs font-medium tracking-[0.14em] text-muted-foreground uppercase">
        Yours
      </h2>
      <ul className="group-list mt-2">
        {rooms.map((room) => {
          const kind = room.kind === "DINNER" ? "Dinner" : "Trip"
          return (
            <li key={room.code} className="flex items-stretch">
              <button
                type="button"
                className="group-row-hit min-w-0 flex-1 text-left"
                aria-label={`Open ${room.name}`}
                onClick={() =>
                  void navigate({
                    to: "/r/$code",
                    params: { code: room.code },
                  })
                }
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-foreground">
                    {room.name}
                  </span>
                  <span className="mt-0.5 flex min-w-0 items-baseline gap-2 text-[13px] text-muted-foreground">
                    <span className="font-display tracking-[0.18em] uppercase">
                      {room.code}
                    </span>
                    <span aria-hidden>·</span>
                    <span>{kind}</span>
                  </span>
                </span>
                <span className="shrink-0 self-center text-[13px] text-muted-foreground tabular-nums">
                  {formatRecentTripOpened(new Date(room.createdAt).getTime())}
                </span>
              </button>
              <RoomExitControl
                code={room.code}
                name={room.name}
                kind={room.kind}
                owned
                placement="row"
                onDone={onChanged}
              />
            </li>
          )
        })}
      </ul>
    </section>
  )
}
