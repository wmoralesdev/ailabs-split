import { Outlet, createFileRoute } from "@tanstack/react-router"

import { roomQueryOptions } from "@/lib/room-query"

export const Route = createFileRoute("/r/$code/check")({
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
