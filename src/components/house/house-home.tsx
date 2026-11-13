import { useMemo, useState } from "react"
import { Link } from "@tanstack/react-router"
import { HugeiconsIcon } from "@hugeicons/react"
import { ArrowRight01Icon } from "@hugeicons/core-free-icons"

import { DueThisMonth } from "@/components/house/due-this-month"
import { HouseChargeSheet } from "@/components/house/house-charge-sheet"
import { PullToRefresh } from "@/components/pull-to-refresh"
import { RoomExitControl } from "@/components/room-exit-control"
import { houseCategoryDisplay } from "@/lib/house-categories"
import {
  houseMemberOnCharges,
  houseNets,
  viewerHeroCopy,
} from "@/lib/house-ledger"
import { formatDay, formatMonth } from "@/lib/house-month"
import { canAddCharge } from "@/lib/house-permissions"
import { useOnlineStatus } from "@/lib/online-status"
import { formatMoney } from "@/lib/settle"
import type { ExpenseDto, RoomDto } from "@/server/rooms"

function chargesByMonth(expenses: ExpenseDto[]) {
  const groups = new Map<string, ExpenseDto[]>()
  for (const expense of expenses) {
    const key = expense.periodMonth ?? expense.createdAt.slice(0, 7)
    const list = groups.get(key) ?? []
    list.push(expense)
    groups.set(key, list)
  }
  for (const list of groups.values()) {
    list.sort((a, b) => {
      const aPaid = a.paidOn ?? a.createdAt
      const bPaid = b.paidOn ?? b.createdAt
      if (aPaid !== bPaid) return bPaid.localeCompare(aPaid)
      return b.createdAt.localeCompare(a.createdAt)
    })
  }
  return [...groups.entries()].sort(([a], [b]) => b.localeCompare(a))
}

export function HouseHome({
  room,
  refetch,
}: {
  room: RoomDto
  refetch: () => Promise<unknown>
}) {
  const online = useOnlineStatus()
  const members = room.house?.members ?? []
  const housemates = members.filter((member) => !member.isGuest)
  const housemateLabel =
    housemates.length === 1 ? "1 housemate" : `${housemates.length} housemates`
  const role = room.house?.viewer.role ?? "VISITOR"
  const actorId = room.house?.viewer.memberId
  const canAdd = canAddCharge(role)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const nets = useMemo(
    () => houseNets(room.members, room.expenses, room.settlements),
    [room]
  )
  const myNet = nets.find((row) => row.memberId === actorId)?.netCents ?? 0
  const guestWithoutCharges =
    role === "GUEST" &&
    (!actorId || !houseMemberOnCharges(actorId, room.expenses))
  const months = chargesByMonth(room.expenses.filter((row) => !row.redacted))
  const selected =
    selectedId == null
      ? null
      : (room.expenses.find((expense) => expense.id === selectedId) ?? null)

  return (
    <PullToRefresh disabled={!online} onRefresh={() => refetch()}>
      <main className="page-gutter mx-auto w-full max-w-content pt-6 pb-8">
        <header>
          <h1 className="font-display text-[28px] leading-tight font-bold tracking-tight">
            {room.name}
          </h1>
          <p className="mt-1 text-[15px] text-muted-foreground">
            House · {housemateLabel}
          </p>
        </header>

        <div className="mt-6 flex items-end justify-between gap-3">
          <p className="font-display text-[22px] leading-tight font-semibold tracking-tight">
            {viewerHeroCopy(myNet, room.currency, { guestWithoutCharges })}
          </p>
          {myNet !== 0 ? (
            <Link
              to="/r/$code/settle"
              params={{ code: room.code }}
              className="text-action text-[15px]"
            >
              Settle up
            </Link>
          ) : null}
        </div>
        {canAdd ? (
          <p className="mt-2">
            <Link
              to="/r/$code/new"
              params={{ code: room.code }}
              search={{}}
              className="text-action text-[15px]"
            >
              Scan a receipt
            </Link>
          </p>
        ) : null}

        <DueThisMonth room={room} />

        {months.length === 0 ? (
          <div className="mt-8">
            <p className="font-medium text-foreground">No charges yet</p>
            <p className="mt-1 text-[15px] leading-snug text-muted-foreground">
              Add the rent, a grocery run, or anything you share.
            </p>
          </div>
        ) : (
          months.map(([month, expenses]) => {
            const total = expenses.reduce(
              (sum, expense) => sum + expense.amountCents,
              0
            )
            return (
              <section key={month} className="mt-8">
                <div className="flex items-baseline justify-between gap-3">
                  <h2 className="font-display text-lg font-semibold">
                    {formatMonth(month)}
                  </h2>
                  <p className="text-[13px] text-muted-foreground tabular-nums">
                    {formatMoney(total, room.currency)}
                  </p>
                </div>
                <ul className="group-list mt-1">
                  {expenses.map((expense) => {
                    const share = actorId
                      ? expense.shares.find((row) => row.memberId === actorId)
                      : undefined
                    const paidBy =
                      members.find((member) => member.id === expense.paidById)
                        ?.name ?? expense.paidByName
                    return (
                      <li key={expense.id}>
                        <button
                          type="button"
                          className="group-row-hit w-full text-left"
                          onClick={() => setSelectedId(expense.id)}
                        >
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-medium">
                              {expense.title}
                            </span>
                            <span className="mt-0.5 block truncate text-[13px] text-muted-foreground">
                              {houseCategoryDisplay(expense.category)} · Paid by{" "}
                              {paidBy}
                              {expense.paidOn
                                ? ` · ${formatDay(expense.paidOn)}`
                                : ""}
                            </span>
                          </span>
                          <span className="shrink-0 text-right">
                            <span className="block text-[15px] font-semibold tabular-nums">
                              {formatMoney(
                                expense.amountCents,
                                expense.currency
                              )}
                            </span>
                            {share ? (
                              <span className="block text-[13px] text-muted-foreground tabular-nums">
                                Your share{" "}
                                {formatMoney(share.amountCents, room.currency)}
                              </span>
                            ) : null}
                          </span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </section>
            )
          })
        )}

        <section className="mt-8">
          <ul className="group-list">
            <li>
              <Link
                to="/r/$code/people"
                params={{ code: room.code }}
                className="group-row-hit w-full"
              >
                <span className="min-w-0 flex-1 font-medium">People</span>
                <HugeiconsIcon
                  icon={ArrowRight01Icon}
                  size={16}
                  strokeWidth={2}
                />
              </Link>
            </li>
            <li>
              <Link
                to="/r/$code/recurring"
                params={{ code: room.code }}
                className="group-row-hit w-full"
              >
                <span className="min-w-0 flex-1 font-medium">Recurring</span>
                <HugeiconsIcon
                  icon={ArrowRight01Icon}
                  size={16}
                  strokeWidth={2}
                />
              </Link>
            </li>
          </ul>
        </section>

        <div className="mt-8">
          <RoomExitControl
            code={room.code}
            name={room.name}
            kind={room.kind}
            owned={room.owned}
            placement="page"
          />
        </div>
      </main>
      <HouseChargeSheet
        room={room}
        expense={selected}
        open={selected !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedId(null)
        }}
      />
    </PullToRefresh>
  )
}
