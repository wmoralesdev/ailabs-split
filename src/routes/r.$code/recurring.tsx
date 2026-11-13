import {
  Link,
  Navigate,
  createFileRoute,
  getRouteApi,
} from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"

import { HouseRecurring } from "@/components/house/house-recurring"
import { Skeleton } from "@/components/ui/skeleton"
import { parseRoomKind } from "@/lib/room-kind"
import { useRoomIdentity } from "@/lib/room-identity"
import { roomQueryOptions } from "@/lib/room-query"

const roomRoute = getRouteApi("/r/$code")

export const Route = createFileRoute("/r/$code/recurring")({
  loader: async ({ params, context }) => {
    const room = await context.queryClient.ensureQueryData(
      roomQueryOptions(params.code)
    )
    if (!room) throw new Error("House not found")
    return { room }
  },
  component: HouseRecurringPage,
  errorComponent: ({ error }) => (
    <main className="page-gutter mx-auto flex min-h-dvh max-w-content flex-col justify-center">
      <h1 className="font-display text-3xl font-semibold">House not found</h1>
      <p className="mt-2 text-muted-foreground">
        {error instanceof Error ? error.message : "Could not load this house"}
      </p>
      <Link
        to="/"
        search={{ stay: true }}
        className="mt-6 text-primary underline"
      >
        Back to Split
      </Link>
    </main>
  ),
})

function HouseRecurringPage() {
  const { code } = roomRoute.useParams()
  const { memberId } = useRoomIdentity()
  const { data: room, isPending } = useQuery(roomQueryOptions(code, memberId))

  if (!room) {
    return isPending ? (
      <main className="page-gutter mx-auto max-w-content pt-6">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="mt-6 h-16 w-full" />
      </main>
    ) : null
  }

  const kind = parseRoomKind(room.kind)
  switch (kind) {
    case "HOUSEHOLD":
      break
    case "DINNER":
    case "TRIP":
      return <Navigate to="/r/$code" params={{ code }} />
    default: {
      const _never: never = kind
      throw new Error(`Unknown room kind: ${String(_never)}`)
    }
  }

  return <HouseRecurring room={room} />
}
