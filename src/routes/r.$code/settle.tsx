import { useMemo, useState } from "react"
import {
  Link,
  createFileRoute,
  getRouteApi,
} from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  ArrowRight01Icon,
  CheckmarkCircle02Icon,
  Copy01Icon,
} from "@hugeicons/core-free-icons"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { useRoomIdentity } from "@/lib/room-identity"
import { roomQueryOptions } from "@/lib/room-query"
import {
  computeNets,
  convertToBase,
  formatMoney,
  formatTransferSentence,
  simplifyTransfers,
} from "@/lib/settle"

const roomRoute = getRouteApi("/r/$code")

export const Route = createFileRoute("/r/$code/settle")({
  loader: async ({ params, context }) => {
    const room = await context.queryClient.ensureQueryData(
      roomQueryOptions(params.code)
    )
    if (!room) throw new Error("Trip not found")
    return { room }
  },
  component: SettlePage,
  errorComponent: ({ error }) => (
    <main className="page-gutter mx-auto flex min-h-dvh max-w-content flex-col justify-center">
      <h1 className="font-display text-3xl font-semibold">Trip not found</h1>
      <p className="text-muted-foreground mt-2">{error.message}</p>
      <Link to="/" search={{ stay: true }} className="text-primary mt-6 underline">
        Back to Split
      </Link>
    </main>
  ),
})

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("")
}

function SettlePage() {
  const { code } = roomRoute.useParams()
  const { memberId } = useRoomIdentity()
  const { data: room } = useQuery(roomQueryOptions(code, memberId))
  const [copiedAll, setCopiedAll] = useState(false)
  const [copiedOne, setCopiedOne] = useState<number | null>(null)

  const transfers = useMemo(() => {
    if (!room) return []
    const nets = computeNets(
      room.members,
      room.expenses
        .filter((expense) => !expense.isPersonal)
        .map((expense) => ({
          paidById: expense.paidById,
          shares: expense.shares.map((share) => ({
            memberId: share.memberId,
            amountCents: convertToBase(
              share.amountCents,
              expense.currency,
              room.currency,
              room.fxRates
            ),
          })),
        }))
    )
    return simplifyTransfers(nets)
  }, [room])

  if (!room) return null

  async function copyAll() {
    if (transfers.length === 0) return
    const text = transfers
      .map((transfer) => formatTransferSentence(transfer, room!.currency))
      .join("\n")
    await navigator.clipboard.writeText(text)
    setCopiedAll(true)
    window.setTimeout(() => setCopiedAll(false), 1500)
  }

  async function copyOne(index: number) {
    const transfer = transfers[index]
    await navigator.clipboard.writeText(
      formatTransferSentence(transfer, room!.currency)
    )
    setCopiedOne(index)
    window.setTimeout(() => setCopiedOne(null), 1500)
  }

  return (
    <main className="page-gutter mx-auto max-w-content pt-6">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">
            Settle up
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Amounts in {room.currency}
          </p>
        </div>
        {transfers.length > 0 ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void copyAll()}
          >
            <HugeiconsIcon icon={Copy01Icon} size={14} strokeWidth={2} />
            {copiedAll ? "Copied" : "Copy all"}
          </Button>
        ) : null}
      </div>

      {transfers.length === 0 ? (
        <Card className="mt-6 items-center gap-3 py-12 text-center">
          <span className="bg-accent text-accent-foreground flex size-14 items-center justify-center rounded-full">
            <HugeiconsIcon
              icon={CheckmarkCircle02Icon}
              size={28}
              strokeWidth={2}
            />
          </span>
          <div>
            <p className="font-display text-lg font-semibold">
              {room.expenses.length === 0 ? "Nothing to settle" : "All settled"}
            </p>
            <p className="text-muted-foreground mt-1 text-sm">
              {room.expenses.length === 0
                ? "Add an expense to get started."
                : "Everyone is even. Nice."}
            </p>
          </div>
        </Card>
      ) : (
        <ul className="mt-6 space-y-3">
          {transfers.map((transfer, index) => (
            <li key={`${transfer.fromId}-${transfer.toId}`}>
              <Card size="sm" className="gap-3">
                <div className="flex items-center justify-between gap-3 px-(--card-spacing)">
                  <div className="flex min-w-0 items-center gap-2">
                    <Avatar className="size-9">
                      <AvatarFallback className="bg-destructive/10 text-destructive text-xs font-semibold">
                        {initials(transfer.fromName)}
                      </AvatarFallback>
                    </Avatar>
                    <HugeiconsIcon
                      icon={ArrowRight01Icon}
                      size={16}
                      strokeWidth={2}
                      className="text-muted-foreground shrink-0"
                    />
                    <Avatar className="size-9">
                      <AvatarFallback className="bg-primary/15 text-primary text-xs font-semibold">
                        {initials(transfer.toName)}
                      </AvatarFallback>
                    </Avatar>
                    <p className="min-w-0 truncate text-sm">
                      <span className="font-medium">{transfer.fromName}</span>
                      <span className="text-muted-foreground"> → </span>
                      <span className="font-medium">{transfer.toName}</span>
                    </p>
                  </div>
                  <p className="font-display shrink-0 text-lg font-semibold tabular-nums">
                    {formatMoney(transfer.amountCents, room.currency)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void copyOne(index)}
                  className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 px-(--card-spacing) text-xs font-medium"
                >
                  <HugeiconsIcon icon={Copy01Icon} size={13} strokeWidth={2} />
                  {copiedOne === index ? "Copied" : "Copy sentence"}
                </button>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
