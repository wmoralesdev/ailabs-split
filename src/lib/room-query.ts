import { keepPreviousData, queryOptions } from "@tanstack/react-query"

import { readRoomCache, writeRoomCache } from "@/lib/room-cache"
import { getRoomByCode } from "@/server/rooms"

export const roomKeys = {
  all: ["room"] as const,
  /** Prefix key — invalidates every viewer variant for a trip. */
  room: (code: string) => ["room", code] as const,
  detail: (code: string, viewerMemberId?: string | null) =>
    ["room", code, viewerMemberId ?? "anon"] as const,
}

export function roomQueryOptions(
  code: string,
  viewerMemberId?: string | null
) {
  const cached = readRoomCache(code, viewerMemberId)

  return queryOptions({
    queryKey: roomKeys.detail(code, viewerMemberId),
    queryFn: async () => {
      const room = await getRoomByCode({
        data: {
          code,
          ...(viewerMemberId ? { viewerMemberId } : {}),
        },
      })
      if (room) {
        writeRoomCache(code, viewerMemberId, room)
      }
      return room
    },
    staleTime: 15_000,
    // Keep trip shell visible while swapping anon → claimed viewer keys.
    placeholderData: keepPreviousData,
    ...(cached
      ? {
          initialData: cached,
          // Treat localStorage hydrate as stale so we refetch right away.
          initialDataUpdatedAt: 0,
        }
      : {}),
  })
}
