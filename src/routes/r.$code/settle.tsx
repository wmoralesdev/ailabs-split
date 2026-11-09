import { useMemo, useState } from "react"
import { Link, createFileRoute, getRouteApi } from "@tanstack/react-router"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  CheckmarkCircle02Icon,
  Share01Icon,
  Tick02Icon,
  UndoIcon,
} from "@hugeicons/core-free-icons"
import { toast } from "sonner"

import {
  BankFxCalibrationSheet,
  formatAdjustmentPercent,
  formatFxAdjustmentLabel,
} from "@/components/bank-fx-calibration-sheet"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { formatRelativeTime } from "@/lib/format-relative-time"
import { copyText } from "@/lib/invite-link"
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
import type { Transfer } from "@/lib/settle"
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
      <p className="mt-2 text-muted-foreground">{error.message}</p>
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
  const [calibrationOpen, setCalibrationOpen] = useState(false)
  const [pendingKey, setPendingKey] = useState<string | null>(null)

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: roomKeys.room(code) })

  const deleteMutation = useMutation({
    mutationFn: (input: DeleteSettlementInput) =>
      deleteSettlement({ data: input }),
    onSuccess: async () => {
      await invalidate()
      toast.success("Payment undone")
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Could not undo payment"
      )
    },
  })

  const recordMutation = useMutation({
    mutationFn: (input: RecordSettlementInput) =>
      recordSettlement({ data: input }),
    onSuccess: async (settlement) => {
      await invalidate()
      toast.success("Payment recorded", {
        description: `${settlement.fromMemberName} paid ${settlement.toMemberName} ${formatMoney(settlement.amountCents, settlement.currency)}`,
        action: {
          label: "Undo",
          onClick: () =>
            deleteMutation.mutate({
              code,
              settlementId: settlement.id,
            }),
        },
      })
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Could not record payment"
      )
    },
    onSettled: () => setPendingKey(null),
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
              room.fxRates,
              room.fxAdjustmentBps
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
          room.fxRates,
          room.fxAdjustmentBps
        ),
      }))
    )
    return simplifyTransfers(nets)
  }, [room])

  const totalCents = transfers.reduce(
    (sum, transfer) => sum + transfer.amountCents,
    0
  )

  const hasForeignExpenses = useMemo(() => {
    if (!room) return false
    return room.expenses.some((expense) => expense.currency !== room.currency)
  }, [room])

  if (!room) return null

  const adjustmentBps = room.fxAdjustmentBps
  const sampleCount = room.fxCalibrationSamples.length
  const hasBankMatch = Number.isFinite(adjustmentBps) && adjustmentBps !== 0
  const mine = transfers.filter(
    (transfer) => transfer.fromId === memberId || transfer.toId === memberId
  )
  const others = transfers.filter(
    (transfer) => transfer.fromId !== memberId && transfer.toId !== memberId
  )
  const paidCount = room.settlements.length
  const stepCount = paidCount + transfers.length

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
        await share({ title: `${room.name} summary`, text })
      } catch {
        // Dismissed share sheet.
      }
      return
    }
    await navigator.clipboard.writeText(text)
    toast.success("Summary copied")
  }

  async function sendReminder(transfer: Transfer) {
    if (!room) return
    const text = formatTransferSentence(transfer, room.currency)
    const share = "share" in navigator ? navigator.share.bind(navigator) : null
    if (share) {
      try {
        await share({ text })
      } catch {
        // Dismissed share sheet.
      }
      return
    }
    await copyText(text)
    toast.success("Copied, paste it in the group chat")
  }

  function markPaid(transfer: Transfer) {
    if (!room) return
    setPendingKey(transferKey(transfer))
    recordMutation.mutate({
      code: room.code,
      fromMemberId: transfer.fromId,
      toMemberId: transfer.toId,
      amountCents: transfer.amountCents,
      currency: room.currency,
    })
  }

  return (
    <main className="page-gutter mx-auto max-w-content pt-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-[28px] leading-tight font-bold tracking-tight">
            Settle up
          </h1>
          <p className="mt-0.5 text-[15px] text-muted-foreground">
            {transfers.length === 0
              ? paidCount > 0
                ? `All ${paidCount} ${paidCount === 1 ? "payment" : "payments"} done`
                : `Amounts in ${room.currency}`
              : `${formatMoney(totalCents, room.currency)} left · ${paidCount} of ${stepCount} paid`}
          </p>
        </div>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="mt-1 bg-card font-semibold text-primary"
          onClick={() => void shareSummary()}
        >
          <HugeiconsIcon icon={Share01Icon} size={14} strokeWidth={2} />
          Share summary
        </Button>
      </div>

      {stepCount > 0 ? (
        <div
          className="mt-3 flex gap-1"
          role="progressbar"
          aria-label="Payments done"
          aria-valuemin={0}
          aria-valuemax={stepCount}
          aria-valuenow={paidCount}
        >
          {Array.from({ length: stepCount }, (_, index) => (
            <span
              key={index}
              className={
                index < paidCount
                  ? "h-1 flex-1 rounded-full bg-foreground"
                  : "h-1 flex-1 rounded-full bg-border"
              }
            />
          ))}
        </div>
      ) : null}

      {room.kind !== "DINNER" && hasForeignExpenses ? (
        <p className="mt-3 text-sm text-muted-foreground">
          {hasBankMatch ? (
            <>
              {formatFxAdjustmentLabel(adjustmentBps, sampleCount)}
              {" · "}
              {formatAdjustmentPercent(adjustmentBps)} bank match included
              {" · "}
              <button
                type="button"
                onClick={() => setCalibrationOpen(true)}
                className="min-h-11 font-medium text-primary"
              >
                Edit
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setCalibrationOpen(true)}
              className="min-h-11 font-medium text-primary"
            >
              Settle looks off? Match bank charges
            </button>
          )}
        </p>
      ) : null}

      {transfers.length === 0 ? (
        <div className="surface mt-5 flex flex-col items-center gap-3 px-4 py-8 text-center">
          <span className="flex size-11 items-center justify-center rounded-full bg-foreground text-background">
            <HugeiconsIcon
              icon={CheckmarkCircle02Icon}
              size={22}
              strokeWidth={2}
            />
          </span>
          <div>
            <p className="font-display text-lg font-semibold">
              {room.expenses.length === 0 ? "Nothing to settle" : "All settled"}
            </p>
            <p className="mt-0.5 text-[15px] text-muted-foreground">
              {room.expenses.length === 0
                ? room.kind === "DINNER"
                  ? "Confirm a check to see who owes what."
                  : "Add an expense to get started."
                : "Everyone is square."}
            </p>
          </div>
        </div>
      ) : null}

      {mine.length > 0 ? (
        <section className="mt-5" aria-labelledby="yours-heading">
          <h2 id="yours-heading" className="group-label">
            Yours
          </h2>
          <ul className="flex flex-col gap-2.5">
            {mine.map((transfer) => (
              <TransferCard
                key={transferKey(transfer)}
                transfer={transfer}
                currency={room.currency}
                memberId={memberId}
                emphasis
                pending={pendingKey === transferKey(transfer)}
                disabled={recordMutation.isPending}
                onMarkPaid={() => markPaid(transfer)}
                onRemind={() => void sendReminder(transfer)}
              />
            ))}
          </ul>
        </section>
      ) : null}

      {others.length > 0 ? (
        <section className="mt-6" aria-labelledby="others-heading">
          <h2 id="others-heading" className="group-label">
            {mine.length > 0 ? "Between others" : "Who pays whom"}
          </h2>
          <ul className="group-list">
            {others.map((transfer) => (
              <TransferCard
                key={transferKey(transfer)}
                transfer={transfer}
                currency={room.currency}
                memberId={memberId}
                pending={pendingKey === transferKey(transfer)}
                disabled={recordMutation.isPending}
                onMarkPaid={() => markPaid(transfer)}
                onRemind={() => void sendReminder(transfer)}
              />
            ))}
          </ul>
        </section>
      ) : null}

      {room.kind !== "DINNER" ? (
        <BankFxCalibrationSheet
          room={room}
          open={calibrationOpen}
          onOpenChange={setCalibrationOpen}
        />
      ) : null}

      {room.settlements.length > 0 ? (
        <section className="mt-6" aria-labelledby="paid-heading">
          <h2 id="paid-heading" className="group-label">
            Paid
          </h2>
          <ul className="group-list">
            {room.settlements.map((settlement) => (
              <li
                key={settlement.id}
                className="flex min-h-13 items-center gap-3 py-2 pr-1.5 pl-4"
              >
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-foreground">
                  <HugeiconsIcon
                    icon={Tick02Icon}
                    size={14}
                    strokeWidth={2.2}
                  />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px]">
                    <span className="font-medium">
                      {settlement.fromMemberId === memberId
                        ? "You"
                        : settlement.fromMemberName}
                    </span>
                    <span className="text-muted-foreground"> paid </span>
                    <span className="font-medium">
                      {settlement.toMemberId === memberId
                        ? "you"
                        : settlement.toMemberName}
                    </span>
                  </p>
                  <p className="text-[13px] text-muted-foreground">
                    {formatMoney(settlement.amountCents, settlement.currency)} ·{" "}
                    {formatRelativeTime(settlement.createdAt)}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="shrink-0 text-primary"
                  onClick={() =>
                    deleteMutation.mutate({
                      code: room.code,
                      settlementId: settlement.id,
                    })
                  }
                  disabled={deleteMutation.isPending}
                  aria-label={`Undo payment from ${settlement.fromMemberName} to ${settlement.toMemberName}`}
                >
                  <HugeiconsIcon icon={UndoIcon} size={14} strokeWidth={2} />
                  Undo
                </Button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  )
}

function transferKey(transfer: Transfer): string {
  return `${transfer.fromId}-${transfer.toId}`
}

function TransferCard({
  transfer,
  currency,
  memberId,
  emphasis = false,
  pending,
  disabled,
  onMarkPaid,
  onRemind,
}: {
  transfer: Transfer
  currency: string
  memberId: string
  emphasis?: boolean
  pending: boolean
  disabled: boolean
  onMarkPaid: () => void
  onRemind: () => void
}) {
  const iPay = transfer.fromId === memberId
  const iGet = transfer.toId === memberId
  const sentence = iPay
    ? `You pay ${transfer.toName}`
    : iGet
      ? `${transfer.fromName} pays you`
      : `${transfer.fromName} pays ${transfer.toName}`
  const markLabel = iPay
    ? `I paid ${transfer.toName}`
    : iGet
      ? `${transfer.fromName} paid me`
      : "Mark paid"

  if (!emphasis) {
    return (
      <li className="flex min-h-14 items-center gap-3 py-2 pr-2 pl-4">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px]">{sentence}</p>
          <p className="text-[15px] font-semibold tabular-nums">
            {formatMoney(transfer.amountCents, currency)}
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="text-muted-foreground"
          onClick={onRemind}
          aria-label={`Remind ${transfer.fromName}`}
        >
          <HugeiconsIcon icon={Share01Icon} size={16} strokeWidth={2} />
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="bg-muted font-semibold text-primary"
          onClick={onMarkPaid}
          disabled={disabled}
        >
          {pending ? "Saving…" : markLabel}
        </Button>
      </li>
    )
  }

  return (
    <li className="surface p-4">
      <div className="flex items-center gap-2.5">
        <div className="flex -space-x-1.5">
          <Avatar className="size-7 ring-2 ring-card">
            <AvatarFallback className="bg-muted text-[11px] font-semibold text-foreground">
              {initials(transfer.fromName)}
            </AvatarFallback>
          </Avatar>
          <Avatar className="size-7 ring-2 ring-card">
            <AvatarFallback className="bg-accent text-[11px] font-semibold text-accent-foreground">
              {initials(transfer.toName)}
            </AvatarFallback>
          </Avatar>
        </div>
        <p className="min-w-0 truncate text-[15px] font-medium">{sentence}</p>
      </div>
      <p className="mt-2 font-display text-[34px] leading-none font-bold tracking-tight tabular-nums">
        {formatMoney(transfer.amountCents, currency)}
      </p>
      <div className="mt-4 flex gap-2">
        <Button
          type="button"
          className="flex-1 font-semibold"
          onClick={onMarkPaid}
          disabled={disabled}
        >
          <HugeiconsIcon
            icon={CheckmarkCircle02Icon}
            size={18}
            strokeWidth={2}
          />
          {pending ? "Saving…" : markLabel}
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="icon-lg"
          className="bg-muted text-primary"
          onClick={onRemind}
          aria-label={
            iPay
              ? `Share payment to ${transfer.toName}`
              : `Remind ${transfer.fromName}`
          }
        >
          <HugeiconsIcon icon={Share01Icon} size={18} strokeWidth={2} />
        </Button>
      </div>
    </li>
  )
}
