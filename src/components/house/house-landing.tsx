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

  if (houses.length === 0 || creating) {
    return (
      <CreateHouseForm
        navigate={navigate}
        displayName={displayName}
        secondaryAction={
          houses.length > 0
            ? {
                label: "Open house",
                onClick: () => setCreating(false),
              }
            : undefined
        }
      />
    )
  }

  return (
    <HouseOpenCta houses={houses} onCreateAnother={() => setCreating(true)} />
  )
}

function HouseOpenCta({
  houses,
  onCreateAnother,
}: {
  houses: OwnedRoomDto[]
  onCreateAnother: () => void
}) {
  const [code, setCode] = useState(houses[0]?.code ?? "")

  useEffect(() => {
    const preferred = pickPreferredHouse(
      houses,
      listRecentTrips().map((trip) => trip.code)
    )
    if (preferred) setCode(preferred.code)
  }, [houses])

  const house = houses.find((row) => row.code === code) ?? houses[0]
  if (!house) return null

  return (
    <div className="flex flex-col gap-4">
      {houses.length > 1 ? (
        <ChipRow role="group" aria-label="Your houses">
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
        className="cta-lg split-cta w-full"
      >
        Open house
      </Link>
      <button
        type="button"
        className="text-action gap-1.5 self-center text-[15px]"
        onClick={onCreateAnother}
      >
        Start another house
      </button>
    </div>
  )
}
