import { Outlet, createFileRoute } from "@tanstack/react-router"

import { roomQueryOptions } from "@/lib/room-query"

type CheckSearch = {
  scan?: boolean
  source?: "menu" | "ticket"
}

export const Route = createFileRoute("/r/$code/check")({
  validateSearch: (search: Record<string, unknown>): CheckSearch => ({
    scan: search.scan === true || search.scan === "1" || search.scan === "true",
    source:
      search.source === "menu"
        ? "menu"
        : search.source === "ticket"
          ? "ticket"
          : undefined,
  }),
  loader: async ({ params, context }) => {
    const room = await context.queryClient.ensureQueryData(
      roomQueryOptions(params.code)
    )
    if (!room) throw new Error("Room not found")
  },
  component: CheckLayout,
})

function CheckLayout() {
  return <Outlet />
}
