import { useMemo } from "react"
import type { ReactNode } from "react"
import { Link } from "@tanstack/react-router"
import { HugeiconsIcon } from "@hugeicons/react"
import { ArrowRight01Icon } from "@hugeicons/core-free-icons"

import { TransferCard, transferKey } from "@/components/transfer-card"
import { houseMemberOnCharges, houseNets } from "@/lib/house-ledger"
import { parseRoomKind } from "@/lib/room-kind"
import { formatMoney } from "@/lib/settle"
import type { Transfer } from "@/lib/settle"
import { useHouseSettle } from "@/lib/use-house-settle"
import { useRoomSettle } from "@/lib/use-room-settle"
import { cn } from "@/lib/utils"
import type { RoomDto } from "@/server/rooms"

/** "You get back" over "$54.10": a small label above a display amount. */
type Copy = {
  label: string
  amount: string | null
  detail: string | null
  muted: boolean
}

function joinNames(names: string[]): string {
  if (names.length <= 2) return names.join(" and ")
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`
}

function peopleLine(prefix: string, names: string[]): string {
  return names.length <= 3
    ? `${prefix} ${joinNames(names)}`
    : `${prefix} ${names.length} people`
}

/** The viewer's side of the transfers left. */
export function balanceCopy({
  mine,
  memberId,
  currency,
  othersCount,
  paidCount,
}: {
  mine: Transfer[]
  memberId: string | null
  currency: string
  othersCount: number
  paidCount: number
}): Copy {
  const iOwe = mine.filter((transfer) => transfer.fromId === memberId)
  const owedToMe = mine.filter((transfer) => transfer.toId === memberId)
  const oweCents = iOwe.reduce((sum, t) => sum + t.amountCents, 0)
  const owedCents = owedToMe.reduce((sum, t) => sum + t.amountCents, 0)

  if (oweCents > 0) {
    return {
      label: "You owe",
      amount: formatMoney(oweCents, currency),
      detail: peopleLine("To", iOwe.map((t) => t.toName)),
      muted: false,
    }
  }
  if (owedCents > 0) {
    return {
      label: "You get back",
      amount: formatMoney(owedCents, currency),
      detail: peopleLine("From", owedToMe.map((t) => t.fromName)),
      muted: false,
    }
  }
  if (othersCount > 0) {
    return {
      label: "You're square",
      amount: null,
      detail: `${othersCount} ${othersCount === 1 ? "payment" : "payments"} left between others`,
      muted: false,
    }
  }
  if (paidCount > 0) {
    return {
      label: "All settled",
      amount: null,
      detail: "Everyone is square.",
      muted: false,
    }
  }
  return {
    label: "Nothing to settle yet",
    amount: null,
    detail: null,
    muted: true,
  }
}

/**
 * The viewer's money, top of every room home: what they owe or get back, the
 * progress, and their own transfers to mark paid right here. "All payments"
 * opens the full ledger only when there is more than this card shows.
 */
export function BalanceHero({
  code,
  copy,
  paidCount,
  stepCount,
  accountPrompt,
  rows,
  showAllPayments,
}: {
  code: string
  copy: Copy
  paidCount: number
  stepCount: number
  /** "Add your account number", shown once when others pay the viewer. */
  accountPrompt?: (() => void) | null
  rows: ReactNode[]
  showAllPayments: boolean
}) {
  const allDone = stepCount > 0 && paidCount === stepCount
  return (
    <section
      className="mt-5 overflow-hidden rounded-3xl bg-card"
      aria-labelledby="balance-heading"
    >
      <div className="px-4 pt-5 pb-4">
        <h2
          id="balance-heading"
          className={cn(
            "text-[15px] font-medium",
            copy.amount ? "text-muted-foreground" : "sr-only"
          )}
        >
          {copy.label}
        </h2>
        <p
          aria-hidden={copy.amount ? undefined : true}
          className={cn(
            "font-display leading-none font-bold tracking-tight tabular-nums",
            copy.amount ? "mt-1.5 text-[44px]" : "text-[28px]",
            copy.muted && "text-muted-foreground"
          )}
        >
          {copy.amount ?? copy.label}
        </p>
        {copy.detail ? (
          <p className="mt-2 text-[15px] text-muted-foreground">
            {copy.detail}
          </p>
        ) : null}
        {stepCount > 0 ? (
          <div className="mt-4 flex items-center gap-3">
            <div
              className="flex flex-1 gap-1"
              role="progressbar"
              aria-label="Payments done"
              aria-valuemin={0}
              aria-valuemax={stepCount}
              aria-valuenow={paidCount}
            >
              {Array.from({ length: stepCount }, (_, index) => (
                <span
                  key={index}
                  className={cn(
                    "h-1.5 flex-1 rounded-full transition-colors",
                    index < paidCount ? "bg-primary" : "bg-muted"
                  )}
                />
              ))}
            </div>
            <p
              className={cn(
                "shrink-0 text-[13px] font-medium tabular-nums",
                allDone ? "text-primary" : "text-muted-foreground"
              )}
            >
              {allDone ? "All paid" : `${paidCount} of ${stepCount} paid`}
            </p>
          </div>
        ) : null}
      </div>
      {rows.length > 0 ? (
        <ul
          className="group-list group-list-inset rounded-none border-t border-border/70"
          aria-label="Your payments"
        >
          {rows}
        </ul>
      ) : null}
      {accountPrompt || showAllPayments ? (
        <div className="flex flex-col border-t border-border/70">
          {accountPrompt ? (
            <button
              type="button"
              className="group-row-hit w-full text-left text-primary"
              onClick={accountPrompt}
            >
              <span className="min-w-0 flex-1 font-medium">
                Add your account number
                <span className="block text-[13px] font-normal text-muted-foreground">
                  So they know where to send it
                </span>
              </span>
              <HugeiconsIcon icon={ArrowRight01Icon} size={16} strokeWidth={2} />
            </button>
          ) : null}
          {showAllPayments ? (
            <Link
              to="/r/$code/settle"
              params={{ code }}
              className={cn(
                "group-row-hit w-full",
                accountPrompt && "border-t border-border/70"
              )}
            >
              <span className="min-w-0 flex-1 font-medium">All payments</span>
              <HugeiconsIcon
                icon={ArrowRight01Icon}
                size={16}
                strokeWidth={2}
                className="text-muted-foreground"
              />
            </Link>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}

/** Hero for a trip or a confirmed bill. */
export function RoomBalanceHero({
  room,
  memberId,
}: {
  room: RoomDto
  memberId: string
}) {
  const settle = useRoomSettle(room, memberId)
  const me = room.members.find((member) => member.id === memberId)
  const receiving = settle.mine.some((transfer) => transfer.toId === memberId)
  const hasForeign = room.expenses.some(
    (expense) => expense.currency !== room.currency
  )
  const showAllPayments =
    settle.others.length > 0 ||
    settle.paidCount > 0 ||
    (parseRoomKind(room.kind) === "TRIP" &&
      hasForeign &&
      settle.transfers.length > 0)

  return (
    <>
      <BalanceHero
        code={room.code}
        copy={balanceCopy({
          mine: settle.mine,
          memberId,
          currency: room.currency,
          othersCount: settle.others.length,
          paidCount: settle.paidCount,
        })}
        paidCount={settle.paidCount}
        stepCount={settle.stepCount}
        accountPrompt={
          receiving && me && !me.pay && !me.payLocked
            ? () => settle.openPayDetails(me.id)
            : null
        }
        rows={settle.mine.map((transfer) => {
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
        })}
        showAllPayments={showAllPayments}
      />
      {settle.sheets}
    </>
  )
}

/** Hero for a house, under its permission matrix. */
export function HouseBalanceHero({ room }: { room: RoomDto }) {
  const settle = useHouseSettle(room)
  const { actorId, role } = settle
  const nets = useMemo(
    () => houseNets(room.members, room.expenses, room.settlements),
    [room]
  )
  const myNet = nets.find((row) => row.memberId === actorId)?.netCents ?? 0
  const guestWithoutCharges =
    role === "GUEST" &&
    (!actorId || !houseMemberOnCharges(actorId, room.expenses))
  const base = balanceCopy({
    mine: settle.mine,
    memberId: actorId,
    currency: room.currency,
    othersCount: settle.others.length,
    paidCount: room.settlements.length,
  })
  // House nets run across months, so the headline follows the net, not
  // only the transfers left.
  const copy: Copy = guestWithoutCharges
    ? { label: "You're not on any charges", amount: null, detail: null, muted: true }
    : myNet < 0
      ? { ...base, label: "You owe", amount: formatMoney(-myNet, room.currency) }
      : myNet > 0
        ? {
            ...base,
            label: "You get back",
            amount: formatMoney(myNet, room.currency),
          }
        : { ...base, label: "You're square", amount: null }
  const me = room.members.find((member) => member.id === actorId)
  const receiving = settle.mine.some((transfer) => transfer.toId === actorId)
  const stepCount = room.settlements.length + settle.transfers.length

  return (
    <>
      <BalanceHero
        code={room.code}
        copy={copy}
        paidCount={room.settlements.length}
        stepCount={settle.transfers.length > 0 ? stepCount : 0}
        accountPrompt={
          receiving && me && !me.pay && !me.payLocked
            ? () => settle.openPayDetails(me.id)
            : null
        }
        rows={settle.mine.map((transfer) => {
          const toMe = transfer.toId === actorId
          return (
            <TransferCard
              key={transferKey(transfer)}
              transfer={transfer}
              currency={room.currency}
              memberId={actorId ?? ""}
              {...(toMe ? {} : settle.payeeProps(transfer))}
              canMark={settle.canMark(transfer)}
              pending={settle.isPending(transfer)}
              disabled={settle.recording}
              onMarkPaid={() => settle.markPaid(transfer)}
              onRemind={() => void settle.remind(transfer)}
            />
          )
        })}
        showAllPayments={
          room.expenses.length > 0 || room.settlements.length > 0
        }
      />
      {settle.sheets}
    </>
  )
}
