import { keepPreviousData, queryOptions } from "@tanstack/react-query"

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
  return queryOptions({
    queryKey: roomKeys.detail(code, viewerMemberId),
    queryFn: () =>
      getRoomByCode({
        data: {
          code,
          ...(viewerMemberId ? { viewerMemberId } : {}),
        },
      }),
    staleTime: 15_000,
    // Keep trip shell visible while swapping anon → claimed viewer keys.
    placeholderData: keepPreviousData,
  })
}
