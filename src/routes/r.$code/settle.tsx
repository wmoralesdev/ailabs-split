import { useMemo, useState } from "react"
import { Link, createFileRoute, getRouteApi } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import { HugeiconsIcon } from "@hugeicons/react"
import { Tick02Icon, UndoIcon } from "@hugeicons/core-free-icons"

import {
  BankFxCalibrationSheet,
  formatAdjustmentPercent,
  formatFxAdjustmentLabel,
} from "@/components/bank-fx-calibration-sheet"
import { HouseSettle } from "@/components/house/house-settle"
import { PaymentProofButton } from "@/components/payment-proof-dialog"
import {
  SettleEmptyState,
  TransferCard,
  transferKey,
} from "@/components/transfer-card"
import { Button } from "@/components/ui/button"
import { formatRelativeTime } from "@/lib/format-relative-time"
import { parseRoomKind } from "@/lib/room-kind"
import type { RoomKind } from "@/lib/room-kind"
import { useRoomIdentity } from "@/lib/room-identity"
import { roomQueryOptions } from "@/lib/room-query"
import { formatMoney } from "@/lib/settle"
import type { Transfer } from "@/lib/settle"
import { useRoomSettle } from "@/lib/use-room-settle"
import type { RoomDto } from "@/server/rooms"

const roomRoute = getRouteApi("/r/$code")

function emptySettleHint(kind: RoomKind): string {
  switch (kind) {
    case "DINNER":
      return "Finish the ticket to see who owes what."
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
  const { data: room } = useQuery(roomQueryOptions(code, memberId))

  if (!room) return null
  if (parseRoomKind(room.kind) === "HOUSEHOLD") {
    return <HouseSettle room={room} />
  }
  return <RoomSettle room={room} memberId={memberId} />
}

/** The full ledger of a trip or bill: every transfer left and every payment made. */
function RoomSettle({ room, memberId }: { room: RoomDto; memberId: string }) {
  const [calibrationOpen, setCalibrationOpen] = useState(false)
  const settle = useRoomSettle(room, memberId)
  const { transfers, mine, others, paidCount, stepCount } = settle

  const hasForeignExpenses = useMemo(
    () => room.expenses.some((expense) => expense.currency !== room.currency),
    [room]
  )
  const adjustmentBps = room.fxAdjustmentBps
  const sampleCount = room.fxCalibrationSamples.length
  const hasBankMatch = Number.isFinite(adjustmentBps) && adjustmentBps !== 0

  function renderTransfer(transfer: Transfer) {
    const toMe = transfer.toId === memberId
    return (
      <TransferCard
        key={transferKey(transfer)}
        transfer={transfer}
        currency={room.currency}
        memberId={memberId}
        {...(toMe ? {} : settle.payeeProps(transfer))}
        pending={settle.isPending(transfer)}
        disabled={settle.recording}
        onMarkPaid={() => settle.markPaid(transfer)}
        onRemind={() => void settle.remind(transfer)}
      />
    )
  }

  return (
    <main className="page-gutter mx-auto max-w-content pt-2">
      <h1 className="font-display text-[28px] leading-tight font-bold tracking-tight">
        All payments
      </h1>
      <p className="mt-0.5 text-[15px] text-muted-foreground">
        {transfers.length === 0
          ? paidCount > 0
            ? `All ${paidCount} ${paidCount === 1 ? "payment" : "payments"} done`
            : `Amounts in ${room.currency}`
          : `${formatMoney(settle.totalCents, room.currency)} left · ${paidCount} of ${stepCount} paid`}
      </p>

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
          <ul className="group-list">
            {mine.map((transfer) => renderTransfer(transfer))}
          </ul>
        </section>
      ) : null}

      {others.length > 0 ? (
        <section className="mt-6" aria-labelledby="others-heading">
          <h2 id="others-heading" className="group-label">
            {mine.length > 0 ? "Between others" : "Who pays whom"}
          </h2>
          <ul className="group-list">
            {others.map((transfer) => renderTransfer(transfer))}
          </ul>
        </section>
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
                    onClick={() => settle.viewProof(settlement)}
                  />
                ) : null}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="shrink-0 text-primary"
                  onClick={() => settle.undo(settlement.id)}
                  disabled={settle.undoing}
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

      {room.expenses.length > 0 ? (
        <button
          type="button"
          className="text-action mt-6 w-full justify-center text-[15px]"
          onClick={() => void settle.shareSummary()}
        >
          Share summary
        </button>
      ) : null}

      {parseRoomKind(room.kind) === "TRIP" ? (
        <BankFxCalibrationSheet
          room={room}
          open={calibrationOpen}
          onOpenChange={setCalibrationOpen}
        />
      ) : null}
      {settle.sheets}
    </main>
  )
}
