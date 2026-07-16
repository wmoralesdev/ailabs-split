import { forgetRecentTrip, listRecentTrips } from "@/lib/recent-trips"
import { getRoomByCode } from "@/server/rooms"

/** Most recently opened trip code on this device, if any. */
export function getMostRecentTripCode(): string | null {
  return listRecentTrips()[0]?.code ?? null
}

/** Verify the most recent trip still exists; forget stale entries. */
export async function resolveMostRecentTripCode(): Promise<string | null> {
  const code = getMostRecentTripCode()
  if (!code) return null

  const room = await getRoomByCode({ data: { code } })
  if (!room) {
    forgetRecentTrip(code)
    return null
  }

  return code
}
