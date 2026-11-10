import { Navigate, createFileRoute } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"

import { CheckEditor } from "@/components/dinner/check-editor"
import { Skeleton } from "@/components/ui/skeleton"
import { dinnerBill } from "@/lib/dinner-bill"
import { useRoomIdentity } from "@/lib/room-identity"
import { roomQueryOptions } from "@/lib/room-query"

export const Route = createFileRoute("/r/$code/check/")({
  component: NewCheckPage,
})

function NewCheckPage() {
  const { code } = Route.useParams()
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

  const bill = dinnerBill(room.checks)
  if (bill) {
    return (
      <Navigate
        to="/r/$code/check/$checkId"
        params={{ code, checkId: bill.id }}
        replace
      />
    )
  }

  return <CheckEditor room={room} selfMemberId={memberId} check={null} />
}
