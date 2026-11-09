import { Navigate, createFileRoute } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"

import { CheckEditor } from "@/components/dinner/check-editor"
import { Skeleton } from "@/components/ui/skeleton"
import { useRoomIdentity } from "@/lib/room-identity"
import { roomQueryOptions } from "@/lib/room-query"

export const Route = createFileRoute("/r/$code/check/$checkId")({
  loader: async ({ params, context }) => {
    const room = await context.queryClient.ensureQueryData(
      roomQueryOptions(params.code)
    )
    if (!room) throw new Error("Room not found")
  },
  component: EditCheckPage,
})

function EditCheckPage() {
  const { code, checkId } = Route.useParams()
  const { memberId } = useRoomIdentity()
  const { data: room, isPending } = useQuery(roomQueryOptions(code, memberId))

  if (!room) {
    return isPending ? (
      <main className="page-gutter mx-auto max-w-content pt-6">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="mt-6 h-12 w-full" />
      </main>
    ) : null
  }

  if (room.kind !== "DINNER") {
    return <Navigate to="/r/$code/new" params={{ code }} />
  }

  const check = room.checks.find((entry) => entry.id === checkId)
  if (!check) {
    return <Navigate to="/r/$code/check" params={{ code }} />
  }

  return (
    <CheckEditor room={room} selfMemberId={memberId} check={check} />
  )
}
