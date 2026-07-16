import { useMemo, useState } from "react"
import { Link, createFileRoute, getRouteApi } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Add01Icon,
  ArrowRight01Icon,
  Copy01Icon,
  Link01Icon,
  ReceiptDollarIcon,
  Share01Icon,
} from "@hugeicons/core-free-icons"
import { toast } from "sonner"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { copyText, shareOrCopyInvite } from "@/lib/invite-link"
import { memberLink } from "@/lib/member-storage"
import { roomQueryOptions } from "@/lib/room-query"
import { useRoomIdentity } from "@/lib/room-identity"
import {
  computeNets,
  convertToBase,
  formatMoney,
  simplifyTransfers,
} from "@/lib/settle"
import type { RoomDto } from "@/server/rooms"

const roomRoute = getRouteApi("/r/$code")

export const Route = createFileRoute("/r/$code/")({
  component: RoomHomePage,
})

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("")
}

function splitModeLabel(mode: string, isPersonal: boolean): string {
  if (isPersonal) return "Personal"
  if (mode === "PARTS") return "Parts"
  if (mode === "AMOUNT") return "Amounts"
  return "Equal"
}

function RoomHomePage() {
  const { code } = roomRoute.useParams()
  const { memberId, switchIdentity } = useRoomIdentity()
  const { data: room } = useQuery(roomQueryOptions(code, memberId))
  const [copied, setCopied] = useState<"code" | "link" | "invite" | null>(null)

  const me = room?.members.find((member) => member.id === memberId)

  const nets = useMemo(() => {
    if (!room) return []
    return computeNets(
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
  }, [room])

  const transfers = useMemo(() => simplifyTransfers(nets), [nets])

  if (!room) return null

  const maxAbs = Math.max(1, ...nets.map((line) => Math.abs(line.netCents)))

  async function copyCode() {
    await copyText(room!.code)
    setCopied("code")
    window.setTimeout(() => setCopied(null), 1500)
  }

  async function shareInvite() {
    try {
      const result = await shareOrCopyInvite({
        code: room!.code,
        name: room!.name,
      })
      if (result === "cancelled") return
      if (result === "copied") {
        setCopied("invite")
        toast.success("Invite link copied")
        window.setTimeout(() => setCopied(null), 1500)
      }
    } catch {
      toast.error("Could not share trip")
    }
  }

  async function copyMyLink() {
    if (!me) return
    await copyText(memberLink(room!.code, me.name))
    setCopied("link")
    window.setTimeout(() => setCopied(null), 1500)
  }

  return (
    <main className="page-gutter mx-auto max-w-content pt-6">
      <header>
        <h1 className="font-display text-3xl font-semibold tracking-tight">
          {room.name}
        </h1>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void copyCode()}
            className="border-border bg-background/60 text-muted-foreground inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm"
          >
            <span className="font-display text-foreground tracking-widest">
              {room.code}
            </span>
            <HugeiconsIcon icon={Copy01Icon} size={14} strokeWidth={2} />
            {copied === "code" ? "Copied" : "Copy"}
          </button>
          <button
            type="button"
            onClick={() => void shareInvite()}
            className="border-border bg-background/60 text-muted-foreground inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm"
          >
            <HugeiconsIcon icon={Share01Icon} size={14} strokeWidth={2} />
            {copied === "invite" ? "Link copied" : "Share link"}
          </button>
          <Badge variant="secondary">Base {room.currency}</Badge>
        </div>
      </header>

      <section className="mt-6">
        <Card size="sm" className="gap-3">
          <div className="flex items-center justify-between gap-3 px-(--card-spacing)">
            <div className="flex items-center gap-3">
              <Avatar className="size-10">
                <AvatarFallback className="bg-accent text-accent-foreground text-sm font-semibold">
                  {me ? initials(me.name) : "?"}
                </AvatarFallback>
              </Avatar>
              <div>
                <p className="text-muted-foreground text-xs">You are</p>
                <p className="font-display text-lg font-semibold leading-tight">
                  {me?.name ?? "Unknown"}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={switchIdentity}
              className="text-primary text-sm font-medium"
            >
              Switch
            </button>
          </div>
          <button
            type="button"
            onClick={() => void copyMyLink()}
            className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 px-(--card-spacing) text-sm"
          >
            <HugeiconsIcon icon={Link01Icon} size={14} strokeWidth={2} />
            {copied === "link" ? "Personal link copied" : "Copy my device link"}
          </button>
        </Card>
      </section>

      <section className="mt-8">
        <div className="flex items-end justify-between gap-3">
          <h2 className="font-display text-xl font-semibold">Balances</h2>
          {transfers.length > 0 ? (
            <Link
              to="/r/$code/settle"
              params={{ code: room.code }}
              className="text-primary inline-flex items-center gap-1 text-sm font-medium"
            >
              Settle
              <HugeiconsIcon icon={ArrowRight01Icon} size={14} strokeWidth={2} />
            </Link>
          ) : null}
        </div>
        <ul className="mt-3 space-y-2">
          {nets.map((line) => {
            const owed = line.netCents > 0
            const owes = line.netCents < 0
            const width = `${Math.round((Math.abs(line.netCents) / maxAbs) * 100)}%`
            return (
              <li
                key={line.memberId}
                className="border-border/70 flex items-center gap-3 border-b py-2"
              >
                <Avatar className="size-8">
                  <AvatarFallback className="bg-muted text-muted-foreground text-xs font-semibold">
                    {initials(line.name)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-sm font-medium">
                      {line.name}
                      {line.memberId === memberId ? (
                        <span className="text-muted-foreground font-normal">
                          {" "}
                          (you)
                        </span>
                      ) : null}
                    </span>
                    <span
                      className={
                        owed
                          ? "text-primary text-sm font-semibold tabular-nums"
                          : owes
                            ? "text-destructive text-sm font-semibold tabular-nums"
                            : "text-muted-foreground text-sm tabular-nums"
                      }
                    >
                      {line.netCents === 0
                        ? "settled"
                        : `${owed ? "+" : "−"}${formatMoney(Math.abs(line.netCents), room.currency)}`}
                    </span>
                  </div>
                  <div className="bg-muted mt-1.5 h-1 overflow-hidden rounded-full">
                    <div
                      className={
                        owed
                          ? "bg-primary h-full rounded-full"
                          : owes
                            ? "bg-destructive h-full rounded-full"
                            : "h-full rounded-full"
                      }
                      style={{ width }}
                    />
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      </section>

      <section className="mt-8">
        <h2 className="font-display text-xl font-semibold">Expenses</h2>
        {room.expenses.length === 0 ? (
          <Card className="mt-3 items-center gap-3 py-10 text-center">
            <span className="bg-accent text-accent-foreground flex size-12 items-center justify-center rounded-full">
              <HugeiconsIcon icon={ReceiptDollarIcon} size={24} strokeWidth={2} />
            </span>
            <div>
              <p className="text-foreground text-sm font-medium">
                No expenses yet
              </p>
              <p className="text-muted-foreground mt-1 text-xs">
                Add the first one to start splitting.
              </p>
            </div>
            <Link
              to="/r/$code/new"
              params={{ code: room.code }}
              className="bg-primary text-primary-foreground hover:bg-primary/80 inline-flex h-11 items-center justify-center gap-2 rounded-md px-5 text-sm font-medium"
            >
              <HugeiconsIcon icon={Add01Icon} size={18} strokeWidth={2} />
              Add expense
            </Link>
          </Card>
        ) : (
          <ul className="mt-3 space-y-2">
            {room.expenses.map((expense) => (
              <ExpenseRow key={expense.id} expense={expense} room={room} />
            ))}
          </ul>
        )}
      </section>
    </main>
  )
}

function ExpenseRow({
  expense,
  room,
}: {
  expense: RoomDto["expenses"][number]
  room: RoomDto
}) {
  const isForeign = expense.currency !== room.currency
  const baseCents = convertToBase(
    expense.amountCents,
    expense.currency,
    room.currency,
    room.fxRates
  )
  return (
    <li>
      <Card size="sm" className="flex-row items-center justify-between gap-3 px-(--card-spacing)">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar className="size-9">
            <AvatarFallback className="bg-accent text-accent-foreground text-xs font-semibold">
              {initials(expense.paidByName)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-2">
              <p className="truncate text-sm font-medium">{expense.title}</p>
              {expense.isPersonal ? (
                <Badge variant="secondary" className="shrink-0">
                  Personal
                </Badge>
              ) : null}
            </div>
            <p className="text-muted-foreground truncate text-xs">
              {expense.paidByName} paid ·{" "}
              {splitModeLabel(expense.splitMode, expense.isPersonal)}
            </p>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-sm font-semibold tabular-nums">
            {formatMoney(expense.amountCents, expense.currency)}
          </p>
          {isForeign ? (
            <p className="text-muted-foreground text-xs tabular-nums">
              ≈ {formatMoney(baseCents, room.currency)}
            </p>
          ) : null}
        </div>
      </Card>
    </li>
  )
}
