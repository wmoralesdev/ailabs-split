import { useEffect, useState } from "react"
import { Link } from "@tanstack/react-router"
import type { useNavigate } from "@tanstack/react-router"

import { ChipRow } from "@/components/chip-row"
import { CreateHouseForm } from "@/components/house/create-house-form"
import { pickPreferredHouse } from "@/lib/preferred-house"
import { listRecentTrips } from "@/lib/recent-trips"
import type { OwnedRoomDto } from "@/server/rooms"

export function HouseLanding({
  navigate,
  displayName,
  houses,
}: {
  navigate: ReturnType<typeof useNavigate>
  displayName: string
  houses: OwnedRoomDto[]
}) {
  const [creating, setCreating] = useState(false)
  const [code, setCode] = useState(houses.at(0)?.code ?? "")

  useEffect(() => {
    const preferred = pickPreferredHouse(
      houses,
      listRecentTrips().map((trip) => trip.code)
    )
    if (preferred) setCode(preferred.code)
  }, [houses])

  const house = houses.find((row) => row.code === code) ?? houses.at(0)

  if (!house || creating) {
    return (
      <CreateHouseForm
        navigate={navigate}
        displayName={displayName}
        secondaryAction={
          house
            ? {
                label: `Open ${house.name}`,
                onClick: () =>
                  void navigate({
                    to: "/r/$code",
                    params: { code: house.code },
                  }),
              }
            : undefined
        }
      />
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {houses.length > 1 ? (
        <ChipRow role="group" aria-label="Your houses" bleed>
          {houses.map((row) => (
            <button
              key={row.code}
              type="button"
              className="person-chip"
              aria-pressed={row.code === house.code}
              onClick={() => setCode(row.code)}
            >
              {row.name}
            </button>
          ))}
        </ChipRow>
      ) : null}
      <Link
        to="/r/$code"
        params={{ code: house.code }}
        className="split-cta cta-lg w-full"
      >
        <span className="truncate">Open {house.name}</span>
      </Link>
      <button
        type="button"
        className="text-action self-center text-[15px]"
        onClick={() => setCreating(true)}
      >
        Start another house
      </button>
    </div>
  )
}
