import { useMemo, useState } from "react"
import { Link, createFileRoute, getRouteApi } from "@tanstack/react-router"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { HugeiconsIcon } from "@hugeicons/react"
import { Share01Icon, Tick02Icon, UndoIcon } from "@hugeicons/core-free-icons"
import { toast } from "sonner"

import {
  BankFxCalibrationSheet,
  formatAdjustmentPercent,
  formatFxAdjustmentLabel,
} from "@/components/bank-fx-calibration-sheet"
import { HouseSettle } from "@/components/house/house-settle"
import {
  PaymentProofButton,
  PaymentProofDialog,
} from "@/components/payment-proof-dialog"
import { PaymentProofSheet } from "@/components/payment-proof-sheet"
import {
  SettleEmptyState,
  TransferCard,
  transferKey,
} from "@/components/transfer-card"
import { Button } from "@/components/ui/button"
import { formatRelativeTime } from "@/lib/format-relative-time"
import { parseRoomKind } from "@/lib/room-kind"
import type { RoomKind } from "@/lib/room-kind"
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
import type { SettlementDto } from "@/server/rooms"

const roomRoute = getRouteApi("/r/$code")

function emptySettleHint(kind: RoomKind): string {
  switch (kind) {
    case "DINNER":
      return "Confirm the bill to see who owes what."
    case "HOUSEHOLD":
      return "Add a charge to get started."
    case "TRIP":
      return "Add an expense to get started."
    default: {
      const _never: never = kind
      throw new Error(`Unknown room kind: ${String(_never)}`)
    }
  }
}

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
      <p className="mt-2 text-muted-foreground">
        {error instanceof Error ? error.message : "Could not load this trip"}
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

function SettlePage() {
  const { code } = roomRoute.useParams()
  const { memberId } = useRoomIdentity()
  const queryClient = useQueryClient()
  const { data: room } = useQuery(roomQueryOptions(code, memberId))
  const [calibrationOpen, setCalibrationOpen] = useState(false)
  const [pendingKey, setPendingKey] = useState<string | null>(null)
  const [pendingTransfer, setPendingTransfer] = useState<Transfer | null>(null)
  const [viewing, setViewing] = useState<SettlementDto | null>(null)

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
      setPendingTransfer(null)
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
  if (parseRoomKind(room.kind) === "HOUSEHOLD") {
    return <HouseSettle room={room} />
  }

  const adjustmentBps = room.fxAdjustmentBps
  const sampleCount = room.fxCalibrationSamples.length
  const hasBankMatch = Number.isFinite(adjustmentBps) && adjustmentBps !== 0
  const household = parseRoomKind(room.kind) === "HOUSEHOLD"
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
    setPendingTransfer(transfer)
  }

  function confirmPaid(proof?: { base64: string; mimeType: "image/jpeg" }) {
    if (!room || !pendingTransfer) return
    setPendingKey(transferKey(pendingTransfer))
    recordMutation.mutate({
      code: room.code,
      fromMemberId: pendingTransfer.fromId,
      toMemberId: pendingTransfer.toId,
      amountCents: pendingTransfer.amountCents,
      currency: room.currency,
      ...(proof ? { proof } : {}),
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

      {parseRoomKind(room.kind) === "TRIP" && hasForeignExpenses ? (
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
                className="text-action min-h-11 font-medium"
              >
                Edit
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setCalibrationOpen(true)}
              className="text-action min-h-11 font-medium"
            >
              Settle looks off? Match bank charges
            </button>
          )}
        </p>
      ) : null}

      {transfers.length === 0 ? (
        <SettleEmptyState
          title={
            room.expenses.length === 0 ? "Nothing to settle" : "All settled"
          }
          hint={
            room.expenses.length === 0
              ? emptySettleHint(parseRoomKind(room.kind))
              : "Everyone is square."
          }
        />
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
                disabled={recordMutation.isPending || household}
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
                disabled={recordMutation.isPending || household}
                onMarkPaid={() => markPaid(transfer)}
                onRemind={() => void sendReminder(transfer)}
              />
            ))}
          </ul>
        </section>
      ) : null}

      {parseRoomKind(room.kind) === "TRIP" ? (
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
              <li key={settlement.id} className="group-row">
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
                {settlement.hasProof ? (
                  <PaymentProofButton
                    fromName={settlement.fromMemberName}
                    onClick={() => setViewing(settlement)}
                  />
                ) : null}
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
                  disabled={deleteMutation.isPending || household}
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

      <PaymentProofSheet
        transfer={pendingTransfer}
        currency={room.currency}
        memberId={memberId}
        open={pendingTransfer !== null}
        saving={recordMutation.isPending}
        onOpenChange={(next) => {
          if (recordMutation.isPending) return
          if (!next) setPendingTransfer(null)
        }}
        onConfirm={confirmPaid}
      />
      <PaymentProofDialog
        open={viewing !== null}
        onOpenChange={(next) => {
          if (!next) setViewing(null)
        }}
        code={room.code}
        settlementId={viewing?.id ?? null}
        label={
          viewing
            ? `${viewing.fromMemberName} paid ${viewing.toMemberName} ${formatMoney(viewing.amountCents, viewing.currency)}`
            : ""
        }
      />
    </main>
  )
}
