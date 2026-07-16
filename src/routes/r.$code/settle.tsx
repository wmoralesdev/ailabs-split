import { useMemo, useState } from "react"
import { Link, createFileRoute, getRouteApi } from "@tanstack/react-router"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  ArrowRight01Icon,
  CheckmarkCircle02Icon,
  Copy01Icon,
  Delete02Icon,
  Share01Icon,
} from "@hugeicons/core-free-icons"
import { toast } from "sonner"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { useRoomIdentity } from "@/lib/room-identity"
import { roomKeys, roomQueryOptions } from "@/lib/room-query"
import {
  buildTripSummary,
  computeNetsWithSettlements,
  convertToBase,
  formatMoney,
  formatTransferSentence,
  simplifyTransfers,
} from "@/lib/settle"
import type {
  DeleteSettlementInput,
  RecordSettlementInput,
} from "@/lib/schemas"
import { deleteSettlement, recordSettlement } from "@/server/rooms"

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
  const queryClient = useQueryClient()
  const { data: room } = useQuery(roomQueryOptions(code, memberId))
  const [copiedAll, setCopiedAll] = useState(false)
  const [summaryCopied, setSummaryCopied] = useState(false)
  const [copiedOne, setCopiedOne] = useState<number | null>(null)

  const recordMutation = useMutation({
    mutationFn: (input: RecordSettlementInput) =>
      recordSettlement({ data: input }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: roomKeys.room(code) })
      toast.success("Payment recorded")
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Could not record payment"
      )
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (input: DeleteSettlementInput) =>
      deleteSettlement({ data: input }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: roomKeys.room(code) })
      toast.success("Payment removed")
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Could not remove payment"
      )
    },
  })

  const transfers = useMemo(() => {
    if (!room) return []
    const nets = computeNetsWithSettlements(
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
        })),
      room.settlements.map((settlement) => ({
        fromMemberId: settlement.fromMemberId,
        toMemberId: settlement.toMemberId,
        amountCents: convertToBase(
          settlement.amountCents,
          settlement.currency,
          room.currency,
          room.fxRates
        ),
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

  async function copySummary() {
    if (!room) return
    await navigator.clipboard.writeText(
      buildTripSummary({
        name: room.name,
        code: room.code,
        currency: room.currency,
        expenses: room.expenses,
        settlements: room.settlements,
        transfers,
      })
    )
    setSummaryCopied(true)
    window.setTimeout(() => setSummaryCopied(false), 1500)
  }

  async function shareSummary() {
    if (!room) return
    const text = buildTripSummary({
      name: room.name,
      code: room.code,
      currency: room.currency,
      expenses: room.expenses,
      settlements: room.settlements,
      transfers,
    })
    const share = "share" in navigator ? navigator.share.bind(navigator) : null
    if (share) {
      try {
        await share({
          title: `${room.name} summary`,
          text,
        })
        return
      } catch {
        return
      }
    }
    await navigator.clipboard.writeText(text)
    toast.success("Summary copied")
  }

  function markPaid(index: number) {
    if (!room) return
    const transfer = transfers[index]
    recordMutation.mutate({
      code: room.code,
      fromMemberId: transfer.fromId,
      toMemberId: transfer.toId,
      amountCents: transfer.amountCents,
      currency: room.currency,
    })
  }

  return (
    <main className="page-gutter mx-auto max-w-content pt-6">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">
            Settle up
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Amounts in {room.currency}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void shareSummary()}
          >
            <HugeiconsIcon icon={Share01Icon} size={14} strokeWidth={2} />
            Share
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void copySummary()}
          >
            <HugeiconsIcon icon={Copy01Icon} size={14} strokeWidth={2} />
            {summaryCopied ? "Copied" : "Summary"}
          </Button>
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
      </div>

      {transfers.length === 0 ? (
        <Card className="mt-6 items-center gap-3 py-12 text-center">
          <span className="flex size-14 items-center justify-center rounded-full bg-accent text-accent-foreground">
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
            <p className="mt-1 text-sm text-muted-foreground">
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
                      <AvatarFallback className="bg-destructive/10 text-xs font-semibold text-destructive">
                        {initials(transfer.fromName)}
                      </AvatarFallback>
                    </Avatar>
                    <HugeiconsIcon
                      icon={ArrowRight01Icon}
                      size={16}
                      strokeWidth={2}
                      className="shrink-0 text-muted-foreground"
                    />
                    <Avatar className="size-9">
                      <AvatarFallback className="bg-primary/15 text-xs font-semibold text-primary">
                        {initials(transfer.toName)}
                      </AvatarFallback>
                    </Avatar>
                    <p className="min-w-0 truncate text-sm">
                      <span className="font-medium">{transfer.fromName}</span>
                      <span className="text-muted-foreground"> → </span>
                      <span className="font-medium">{transfer.toName}</span>
                    </p>
                  </div>
                  <p className="shrink-0 font-display text-lg font-semibold tabular-nums">
                    {formatMoney(transfer.amountCents, room.currency)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void copyOne(index)}
                  className="inline-flex items-center gap-1.5 px-(--card-spacing) text-xs font-medium text-muted-foreground hover:text-foreground"
                >
                  <HugeiconsIcon icon={Copy01Icon} size={13} strokeWidth={2} />
                  {copiedOne === index ? "Copied" : "Copy sentence"}
                </button>
                <button
                  type="button"
                  onClick={() => markPaid(index)}
                  disabled={recordMutation.isPending}
                  className="inline-flex items-center gap-1.5 px-(--card-spacing) pb-1 text-xs font-medium text-primary hover:text-primary/80 disabled:opacity-50"
                >
                  <HugeiconsIcon
                    icon={CheckmarkCircle02Icon}
                    size={13}
                    strokeWidth={2}
                  />
                  Mark paid
                </button>
              </Card>
            </li>
          ))}
        </ul>
      )}

      {room.settlements.length > 0 ? (
        <section className="mt-8">
          <h2 className="font-display text-xl font-semibold">
            Recorded payments
          </h2>
          <ul className="mt-3 space-y-2">
            {room.settlements.map((settlement) => (
              <li key={settlement.id}>
                <Card
                  size="sm"
                  className="flex-row items-center justify-between gap-3 px-(--card-spacing)"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm">
                      <span className="font-medium">
                        {settlement.fromMemberName}
                      </span>
                      <span className="text-muted-foreground"> paid </span>
                      <span className="font-medium">
                        {settlement.toMemberName}
                      </span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(settlement.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <p className="font-display text-base font-semibold tabular-nums">
                      {formatMoney(settlement.amountCents, settlement.currency)}
                    </p>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      onClick={() =>
                        deleteMutation.mutate({
                          code: room.code,
                          settlementId: settlement.id,
                        })
                      }
                      disabled={deleteMutation.isPending}
                      aria-label="Remove recorded payment"
                    >
                      <HugeiconsIcon
                        icon={Delete02Icon}
                        size={14}
                        strokeWidth={2}
                      />
                    </Button>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  )
}
