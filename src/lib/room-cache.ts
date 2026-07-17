import type { RoomDto } from "@/server/rooms"

const STORAGE_PREFIX = "split:room-cache:"

function cacheKey(code: string, viewerMemberId?: string | null): string {
  return `${STORAGE_PREFIX}${code.toUpperCase()}:${viewerMemberId ?? "anon"}`
}

function isRoomDto(value: unknown): value is RoomDto {
  if (typeof value !== "object" || value === null) return false
  const room = value as Record<string, unknown>
  return (
    typeof room.id === "string" &&
    typeof room.code === "string" &&
    typeof room.name === "string" &&
    typeof room.currency === "string" &&
    Array.isArray(room.members) &&
    Array.isArray(room.expenses) &&
    Array.isArray(room.settlements)
  )
}

/** Last successful room payload for this trip + viewer, if any. */
export function readRoomCache(
  code: string,
  viewerMemberId?: string | null
): RoomDto | undefined {
  if (typeof window === "undefined") return undefined
  try {
    const raw = window.localStorage.getItem(cacheKey(code, viewerMemberId))
    if (!raw) return undefined
    const parsed: unknown = JSON.parse(raw)
    return isRoomDto(parsed) ? parsed : undefined
  } catch {
    return undefined
  }
}

/** Persist room payload so Home can paint before the next network fetch. */
export function writeRoomCache(
  code: string,
  viewerMemberId: string | null | undefined,
  room: RoomDto
): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(
      cacheKey(code, viewerMemberId),
      JSON.stringify(room)
    )
  } catch {
    // Quota / private mode — ignore
  }
}
