import { queryOptions } from "@tanstack/react-query"

import { getRoomByCode } from "@/server/rooms"

export const roomKeys = {
  all: ["room"] as const,
  detail: (code: string) => ["room", code] as const,
}

export function roomQueryOptions(code: string) {
  return queryOptions({
    queryKey: roomKeys.detail(code),
    queryFn: () => getRoomByCode({ data: { code } }),
    staleTime: 15_000,
  })
}
