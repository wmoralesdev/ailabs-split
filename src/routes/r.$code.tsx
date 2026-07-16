import { Outlet, createFileRoute, Link } from "@tanstack/react-router"

import { getRoomByCode } from "@/server/rooms"

export const Route = createFileRoute("/r/$code")({
  loader: async ({ params }) => {
    const room = await getRoomByCode({ data: { code: params.code } })
    if (!room) {
      throw new Error("Room not found")
    }
    return { room }
  },
  component: RoomLayout,
  errorComponent: ({ error }) => (
    <main className="page-gutter mx-auto flex min-h-dvh max-w-content flex-col justify-center">
      <h1 className="font-display text-3xl font-semibold">Room not found</h1>
      <p className="text-muted-foreground mt-2">{error.message}</p>
      <Link to="/" className="text-primary mt-6 underline">
        Back to Split
      </Link>
    </main>
  ),
})

function RoomLayout() {
  return <Outlet />
}
