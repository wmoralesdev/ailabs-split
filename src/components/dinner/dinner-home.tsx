import { useMemo, useState } from "react"
import { Link } from "@tanstack/react-router"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Add01Icon,
  Camera01Icon,
  Copy01Icon,
  Link01Icon,
  ReceiptDollarIcon,
} from "@hugeicons/core-free-icons"

import { AddPeopleSheet } from "@/components/dinner/add-people-sheet"
import { PullToRefresh } from "@/components/pull-to-refresh"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { copyText } from "@/lib/invite-link"
import { initials } from "@/lib/dinner-labels"
import { computeDinnerSplit } from "@/lib/dinner-split"
import { formatRelativeTime } from "@/lib/format-relative-time"
import { memberLink } from "@/lib/member-storage"
import { useOnlineStatus } from "@/lib/online-status"
import {
  computeNetsWithSettlements,
  formatMoney,
  simplifyTransfers,
} from "@/lib/settle"
import type { CheckDto, RoomDto } from "@/server/rooms"

export function DinnerHome({
  room,
  memberId,
  switchIdentity,
  refetch,
}: {
  room: RoomDto
  memberId: string
  switchIdentity: () => void
  refetch: () => Promise<unknown>
}) {
  const online = useOnlineStatus()
  const me = room.members.find((member) => member.id === memberId)
  const [copied, setCopied] = useState<"code" | "link" | null>(null)
  const [addPeopleOpen, setAddPeopleOpen] = useState(false)

  const nets = useMemo(() => {
    return computeNetsWithSettlements(
      room.members,
      room.expenses
        .filter((expense) => !expense.isPersonal)
        .map((expense) => ({
          paidById: expense.paidById,
          shares: expense.shares.map((share) => ({
            memberId: share.memberId,
            amountCents: share.amountCents,
          })),
        })),
      room.settlements.map((settlement) => ({
        fromMemberId: settlement.fromMemberId,
        toMemberId: settlement.toMemberId,
        amountCents: settlement.amountCents,
      }))
    )
  }, [room])

  const transfers = useMemo(() => simplifyTransfers(nets), [nets])

  async function copyCode() {
    await copyText(room.code)
    setCopied("code")
    window.setTimeout(() => setCopied(null), 1500)
  }

  async function copyMyLink() {
    if (!me) return
    await copyText(memberLink(room.code, me.name))
    setCopied("link")
    window.setTimeout(() => setCopied(null), 1500)
  }

  return (
    <PullToRefresh disabled={!online} onRefresh={() => refetch()}>
      <main className="page-gutter mx-auto max-w-content pt-4">
        <header>
          <h1 className="font-display text-2xl font-semibold tracking-tight">
            {room.name}
          </h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <Badge variant="secondary">Dinner</Badge>
            <button
              type="button"
              onClick={() => void copyCode()}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background/60 px-2.5 py-0.5 text-xs text-muted-foreground"
            >
              <span className="font-display tracking-widest text-foreground">
                {room.code}
              </span>
              <HugeiconsIcon icon={Copy01Icon} size={12} strokeWidth={2} />
              {copied === "code" ? "Copied" : "Copy"}
            </button>
            <Badge variant="outline">{room.currency}</Badge>
          </div>
        </header>

        <section className="mt-4 border-y border-border/70 py-2.5">
          <div className="flex items-center gap-2.5">
            <Avatar className="size-8 shrink-0">
              <AvatarFallback className="bg-accent text-xs font-semibold text-accent-foreground">
                {me ? initials(me.name) : "?"}
              </AvatarFallback>
            </Avatar>
            <p className="min-w-0 flex-1 truncate text-sm font-medium">
              You · {me?.name ?? "Unknown"}
            </p>
            <button
              type="button"
              onClick={() => void copyMyLink()}
              className="text-muted-foreground hover:text-foreground inline-flex size-9 shrink-0 items-center justify-center rounded-md"
              aria-label={
                copied === "link"
                  ? "Personal link copied"
                  : "Copy my device link"
              }
            >
              <HugeiconsIcon icon={Link01Icon} size={16} strokeWidth={2} />
            </button>
            <button
              type="button"
              onClick={switchIdentity}
              className="shrink-0 text-sm font-medium text-primary"
            >
              Switch
            </button>
          </div>
        </section>

        <section className="mt-6">
          <div className="flex items-end justify-between gap-3">
            <h2 className="font-display text-xl font-semibold">People</h2>
            <button
              type="button"
              onClick={() => setAddPeopleOpen(true)}
              className="inline-flex items-center gap-1 text-sm font-medium text-primary"
            >
              <HugeiconsIcon icon={Add01Icon} size={14} strokeWidth={2} />
              Add people
            </button>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {room.members.length}{" "}
            {room.members.length === 1 ? "person" : "people"} · ticket headcount
            is ignored
          </p>
          <ul className="mt-1">
            {room.members.map((member) => (
              <li
                key={member.id}
                className="flex items-center gap-3 border-b border-border/70 py-2.5"
              >
                <Avatar className="size-8">
                  <AvatarFallback className="bg-muted text-xs font-semibold text-muted-foreground">
                    {initials(member.name)}
                  </AvatarFallback>
                </Avatar>
                <span className="min-w-0 flex-1 truncate text-sm font-medium">
                  {member.name}
                  {member.id === memberId ? (
                    <span className="font-normal text-muted-foreground">
                      {" "}
                      (you)
                    </span>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        </section>

        {transfers.length > 0 || room.expenses.length > 0 ? (
          <section className="mt-6">
            <div className="flex items-end justify-between gap-3">
              <h2 className="font-display text-xl font-semibold">Balances</h2>
              {transfers.length > 0 ? (
                <Link
                  to="/r/$code/settle"
                  params={{ code: room.code }}
                  className="text-sm font-medium text-primary"
                >
                  Settle
                </Link>
              ) : null}
            </div>
            <ul className="mt-1">
              {nets.map((line) => {
                const owed = line.netCents > 0
                const owes = line.netCents < 0
                return (
                  <li
                    key={line.memberId}
                    className="flex items-center gap-3 border-b border-border/70 py-3"
                  >
                    <Avatar className="size-8">
                      <AvatarFallback className="bg-muted text-xs font-semibold text-muted-foreground">
                        {initials(line.name)}
                      </AvatarFallback>
                    </Avatar>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">
                      {line.name}
                      {line.memberId === memberId ? (
                        <span className="font-normal text-muted-foreground">
                          {" "}
                          (you)
                        </span>
                      ) : null}
                    </span>
                    <span
                      className={
                        owed
                          ? "text-sm font-semibold text-primary tabular-nums"
                          : owes
                            ? "text-sm font-semibold text-destructive tabular-nums"
                            : "text-sm text-muted-foreground tabular-nums"
                      }
                    >
                      {line.netCents === 0
                        ? "settled"
                        : `${owed ? "+" : "−"}${formatMoney(Math.abs(line.netCents), room.currency)}`}
                    </span>
                  </li>
                )
              })}
            </ul>
          </section>
        ) : null}

        <section className="mt-6">
          <h2 className="font-display text-xl font-semibold">Checks</h2>
          {room.checks.length === 0 ? (
            <div className="mt-3 flex flex-col items-center gap-3 border-y border-border/70 py-10 text-center">
              <span className="flex size-12 items-center justify-center rounded-full bg-accent text-accent-foreground">
                <HugeiconsIcon
                  icon={ReceiptDollarIcon}
                  size={24}
                  strokeWidth={2}
                />
              </span>
              <div>
                <p className="text-sm font-medium text-foreground">
                  No checks yet
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Scan a ticket or enter the bill by hand.
                </p>
              </div>
              <div className="flex w-full max-w-xs flex-col gap-2">
                <Link
                  to="/r/$code/check"
                  params={{ code: room.code }}
                  search={{ scan: true }}
                  className="inline-flex h-(--control-height) items-center justify-center gap-2 rounded-md bg-primary px-5 text-base font-medium text-primary-foreground hover:bg-primary/80"
                >
                  <HugeiconsIcon icon={Camera01Icon} size={18} strokeWidth={2} />
                  Scan ticket
                </Link>
                <Link
                  to="/r/$code/check"
                  params={{ code: room.code }}
                  className="inline-flex h-(--control-height) items-center justify-center gap-2 rounded-md border border-border px-5 text-base font-medium hover:bg-muted/40"
                >
                  <HugeiconsIcon icon={Add01Icon} size={18} strokeWidth={2} />
                  Enter bill manually
                </Link>
              </div>
            </div>
          ) : (
            <ul className="mt-1">
              {room.checks.map((check) => (
                <CheckRow key={check.id} check={check} room={room} />
              ))}
            </ul>
          )}
          {room.checks.length > 0 ? (
            <div className="mt-4">
              <Link
                to="/r/$code/check"
                params={{ code: room.code }}
                className="border-border hover:bg-muted/40 inline-flex h-(--control-height) w-full items-center justify-center gap-2 rounded-md border px-5 text-base font-medium"
              >
                <HugeiconsIcon icon={Add01Icon} size={16} strokeWidth={2} />
                New check
              </Link>
            </div>
          ) : null}
        </section>
      </main>
      <AddPeopleSheet
        code={room.code}
        open={addPeopleOpen}
        onOpenChange={setAddPeopleOpen}
      />
    </PullToRefresh>
  )
}

function CheckRow({ check, room }: { check: CheckDto; room: RoomDto }) {
  const split = computeDinnerSplit({
    items: check.payload.items,
    adjustments: check.payload.adjustments,
    tip: check.payload.tip,
    notedTotalCents: check.payload.notedTotalCents,
  })
  const tipLabel =
    check.payload.tip.amountCents > 0
      ? ` · tip ${formatMoney(check.payload.tip.amountCents, check.currency)}`
      : ""

  return (
    <li className="border-b border-border/70">
      <Link
        to="/r/$code/check/$checkId"
        params={{ code: room.code, checkId: check.id }}
        className="flex w-full items-center justify-between gap-3.5 py-3.5 text-left transition-colors hover:bg-muted/30"
      >
        <Avatar className="size-9 shrink-0">
          <AvatarFallback className="bg-accent text-xs font-semibold text-accent-foreground">
            {initials(check.paidByName)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-baseline gap-2">
            <p className="truncate text-sm font-semibold">{check.merchant}</p>
            <Badge
              variant={check.status === "CONFIRMED" ? "secondary" : "outline"}
              className="shrink-0"
            >
              {check.status === "CONFIRMED" ? "Confirmed" : "Draft"}
            </Badge>
            {check.isPrecuenta ? (
              <Badge variant="outline" className="shrink-0">
                Precuenta
              </Badge>
            ) : null}
          </div>
          <p className="mt-1 truncate text-xs text-muted-foreground">
            {check.paidByName} paid{tipLabel} · {formatRelativeTime(check.createdAt)}
          </p>
        </div>
        <p className="shrink-0 text-sm font-semibold tabular-nums">
          {formatMoney(split.totalCents, check.currency)}
        </p>
      </Link>
    </li>
  )
}
