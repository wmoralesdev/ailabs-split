import { useMemo, useState } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { Tick02Icon, UndoIcon } from "@hugeicons/core-free-icons"

import { PaymentProofButton } from "@/components/payment-proof-dialog"
import {
  SettleEmptyState,
  TransferCard,
  transferKey,
} from "@/components/transfer-card"
import { Button } from "@/components/ui/button"
import { formatRelativeTime } from "@/lib/format-relative-time"
import {
  houseBalanceCopy,
  houseNets,
  monthBreakdown,
  movedOutSubtitle,
} from "@/lib/house-ledger"
import { formatMonth, isMovedOutOn, localIsoDate } from "@/lib/house-month"
import { canDeletePayment } from "@/lib/house-permissions"
import { cn } from "@/lib/utils"
import { formatMoney } from "@/lib/settle"
import type { Transfer } from "@/lib/settle"
import { useHouseSettle } from "@/lib/use-house-settle"
import type { RoomDto } from "@/server/rooms"

export function HouseSettle({ room }: { room: RoomDto }) {
  const settle = useHouseSettle(room)
  const { role, actorId, members, transfers, mine, others } = settle
  const today = localIsoDate()
  const [selectedId, setSelectedId] = useState<string | null>(actorId)
  const [openMonth, setOpenMonth] = useState<string | null>(null)

  const nets = useMemo(
    () => houseNets(room.members, room.expenses, room.settlements),
    [room]
  )
  const selected = selectedId ?? actorId
  const breakdown = useMemo(
    () =>
      selected ? monthBreakdown(selected, room.expenses, room.settlements) : [],
    [selected, room]
  )

  function renderTransfer(transfer: Transfer) {
    const toMe = transfer.toId === actorId
    return (
      <TransferCard
        key={transferKey(transfer)}
        transfer={transfer}
        currency={room.currency}
        memberId={actorId ?? ""}
        pending={settle.isPending(transfer)}
        disabled={settle.recording}
        {...(toMe ? {} : settle.payeeProps(transfer))}
        canMark={settle.canMark(transfer)}
        onMarkPaid={() => settle.markPaid(transfer)}
        onRemind={() => void settle.remind(transfer)}
      />
    )
  }

  return (
    <main className="page-gutter mx-auto max-w-content pt-2 pb-8">
      <h1 className="font-display text-[28px] leading-tight font-bold tracking-tight">
        All payments
      </h1>
      <p className="mt-0.5 text-[15px] text-muted-foreground">
        Amounts in {room.currency}
      </p>

      {transfers.length === 0 ? (
        <SettleEmptyState
          title={
            room.expenses.length === 0 ? "Nothing to settle" : "All settled"
          }
          hint={
            room.expenses.length === 0
              ? "Add a charge to get started."
              : "Everyone is square."
          }
        />
      ) : null}

      {mine.length > 0 ? (
        <section className="mt-5" aria-labelledby="house-yours-heading">
          <h2 id="house-yours-heading" className="group-label">
            Yours
          </h2>
          <ul className="group-list">
            {mine.map((transfer) => renderTransfer(transfer))}
          </ul>
        </section>
      ) : null}

      {others.length > 0 ? (
        <section className="mt-6" aria-labelledby="house-others-heading">
          <h2 id="house-others-heading" className="group-label">
            {mine.length > 0 ? "Between others" : "Who pays whom"}
          </h2>
          <ul className="group-list">
            {others.map((transfer) => renderTransfer(transfer))}
          </ul>
        </section>
      ) : null}

      <section className="mt-8">
        <h2 className="group-label">Balances</h2>
        <ul className="group-list mt-1">
          {members.map((member) => {
            const net =
              nets.find((row) => row.memberId === member.id)?.netCents ?? 0
            const left = isMovedOutOn(member.leftOn, today)
              ? movedOutSubtitle(member.leftOn)
              : null
            const selectedRow = member.id === selected
            return (
              <li key={member.id}>
                <button
                  type="button"
                  aria-pressed={selectedRow}
                  className="group-row-hit w-full text-left"
                  onClick={() => setSelectedId(member.id)}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">
                      {member.name}
                    </span>
                    {left ? (
                      <span className="mt-0.5 block text-[13px] text-muted-foreground">
                        {left}
                      </span>
                    ) : null}
                  </span>
                  <span
                    className={cn(
                      "max-w-[9.75rem] shrink-0 text-right text-[13px] leading-snug tabular-nums",
                      net === 0
                        ? "text-muted-foreground"
                        : "font-medium text-foreground"
                    )}
                  >
                    {houseBalanceCopy(member.name, net, room.currency)}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      </section>

      {breakdown.length > 0 ? (
        <section className="mt-8">
          <h2 className="group-label">By month</h2>
          <ul className="group-list mt-1">
            {breakdown.map((row) => {
              const expanded =
                (openMonth ?? breakdown[0]?.periodMonth) === row.periodMonth
              return (
                <li key={row.periodMonth}>
                  <button
                    type="button"
                    className="group-row-hit w-full text-left"
                    aria-expanded={expanded}
                    onClick={() =>
                      setOpenMonth(expanded ? "" : row.periodMonth)
                    }
                  >
                    <span className="flex-1 font-medium">
                      {formatMonth(row.periodMonth)}
                    </span>
                    <span className="text-[13px] text-muted-foreground tabular-nums">
                      {formatMoney(row.runningCents, room.currency)}
                    </span>
                  </button>
                  {expanded ? (
                    <dl className="grid grid-cols-2 gap-x-3 gap-y-1 px-3 pb-3 text-[13px] text-muted-foreground">
                      <dt>Your share</dt>
                      <dd className="text-right tabular-nums">
                        {formatMoney(row.yourShareCents, room.currency)}
                      </dd>
                      <dt>You paid</dt>
                      <dd className="text-right tabular-nums">
                        {formatMoney(row.youPaidCents, room.currency)}
                      </dd>
                      <dt>Payments</dt>
                      <dd className="text-right tabular-nums">
                        {formatMoney(row.paymentsCents, room.currency)}
                      </dd>
                    </dl>
                  ) : null}
                </li>
              )
            })}
          </ul>
        </section>
      ) : null}

      {room.settlements.length > 0 ? (
        <section className="mt-8">
          <h2 className="group-label">Payments</h2>
          <ul className="group-list mt-1">
            {room.settlements.map((settlement) => {
              const canUndo = canDeletePayment(
                role,
                actorId,
                settlement.createdByMemberId,
                settlement.toMemberId
              )
              return (
                <li key={settlement.id} className="group-row">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted">
                    <HugeiconsIcon
                      icon={Tick02Icon}
                      size={14}
                      strokeWidth={2.2}
                    />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px]">
                      {settlement.fromMemberName} paid {settlement.toMemberName}
                    </span>
                    <span className="block text-[13px] text-muted-foreground">
                      {formatMoney(settlement.amountCents, settlement.currency)}{" "}
                      · {formatRelativeTime(settlement.createdAt)}
                    </span>
                  </span>
                  {settlement.hasProof ? (
                    <PaymentProofButton
                      fromName={settlement.fromMemberName}
                      onClick={() => settle.viewProof(settlement)}
                    />
                  ) : null}
                  {canUndo ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="shrink-0 text-primary"
                      disabled={settle.undoing}
                      onClick={() => settle.undo(settlement.id)}
                      aria-label={`Undo payment from ${settlement.fromMemberName} to ${settlement.toMemberName}`}
                    >
                      <HugeiconsIcon
                        icon={UndoIcon}
                        size={14}
                        strokeWidth={2}
                      />
                      Undo
                    </Button>
                  ) : null}
                </li>
              )
            })}
          </ul>
        </section>
      ) : null}

      {settle.canRecordCustom ? (
        <button
          type="button"
          className="text-action mt-6 text-[15px]"
          onClick={settle.recordCustom}
        >
          Record a payment
        </button>
      ) : null}

      {settle.sheets}
    </main>
  )
}
