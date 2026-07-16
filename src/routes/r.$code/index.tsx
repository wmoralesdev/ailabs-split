import { useMemo, useState } from "react"
import {
  Link,
  createFileRoute,
  getRouteApi,
  useRouter,
} from "@tanstack/react-router"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Add01Icon,
  ArrowRight01Icon,
  Copy01Icon,
  Link01Icon,
} from "@hugeicons/core-free-icons"

import { Button } from "@/components/ui/button"
import { memberLink } from "@/lib/member-storage"
import { useRoomIdentity } from "@/lib/room-identity"
import {
  computeNets,
  formatMoney,
  simplifyTransfers,
} from "@/lib/settle"
import type { RoomDto } from "@/server/rooms"

const roomRoute = getRouteApi("/r/$code")

export const Route = createFileRoute("/r/$code/")({
  component: RoomHomePage,
})

function RoomHomePage() {
  const { room } = roomRoute.useLoaderData()
  const { memberId, switchIdentity } = useRoomIdentity()
  const router = useRouter()
  const [copied, setCopied] = useState<"code" | "link" | null>(null)

  const me = room.members.find((member) => member.id === memberId)

  const nets = useMemo(
    () =>
      computeNets(
        room.members,
        room.expenses.map((expense) => ({
          paidById: expense.paidById,
          shares: expense.shares.map((share) => ({
            memberId: share.memberId,
            amountCents: share.amountCents,
          })),
        }))
      ),
    [room]
  )

  const transfers = useMemo(() => simplifyTransfers(nets), [nets])

  async function copyCode() {
    await navigator.clipboard.writeText(room.code)
    setCopied("code")
    window.setTimeout(() => setCopied(null), 1500)
  }

  async function copyMyLink() {
    if (!me) return
    await navigator.clipboard.writeText(memberLink(room.code, me.name))
    setCopied("link")
    window.setTimeout(() => setCopied(null), 1500)
  }

  return (
    <main className="page-gutter mx-auto min-h-dvh max-w-content pb-28 pt-8">
      <header className="flex items-start justify-between gap-4">
        <div>
          <Link
            to="/"
            className="font-display text-split text-sm font-semibold tracking-wide"
          >
            Split
          </Link>
          <h1 className="font-display mt-2 text-3xl font-semibold tracking-tight">
            {room.name}
          </h1>
          <button
            type="button"
            onClick={() => void copyCode()}
            className="text-muted-foreground mt-2 inline-flex items-center gap-1.5 text-sm"
          >
            <span className="font-display tracking-widest">{room.code}</span>
            <HugeiconsIcon icon={Copy01Icon} size={14} strokeWidth={2} />
            {copied === "code" ? "Copied" : "Copy code"}
          </button>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void router.invalidate()}
        >
          Refresh
        </Button>
      </header>

      <section className="mt-8">
        <p className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
          You are
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
          <p className="font-display text-xl font-semibold">
            {me?.name ?? "Unknown"}
          </p>
          <button
            type="button"
            onClick={switchIdentity}
            className="text-primary text-sm font-medium"
          >
            Not you? Switch
          </button>
        </div>
        <button
          type="button"
          onClick={() => void copyMyLink()}
          className="text-muted-foreground mt-3 inline-flex items-center gap-1.5 text-sm"
        >
          <HugeiconsIcon icon={Link01Icon} size={14} strokeWidth={2} />
          {copied === "link"
            ? "Personal link copied"
            : "Copy my link for another device"}
        </button>
        <p className="text-muted-foreground mt-1 text-xs">
          Opens this room as you via name — handy when localStorage is empty.
        </p>
      </section>

      <section className="mt-10">
        <div className="flex items-end justify-between gap-3">
          <h2 className="font-display text-xl font-semibold">Balances</h2>
          <Link
            to="/r/$code/settle"
            params={{ code: room.code }}
            className="text-primary inline-flex items-center gap-1 text-sm font-medium"
          >
            Settle
            <HugeiconsIcon icon={ArrowRight01Icon} size={14} strokeWidth={2} />
          </Link>
        </div>
        <ul className="mt-4 space-y-3">
          {nets.map((line) => (
            <li
              key={line.memberId}
              className="flex items-baseline justify-between gap-3 border-b border-border/70 py-2"
            >
              <span className="font-medium">
                {line.name}
                {line.memberId === memberId ? (
                  <span className="text-muted-foreground font-normal"> (you)</span>
                ) : null}
              </span>
              <span
                className={
                  line.netCents > 0
                    ? "text-split font-medium"
                    : line.netCents < 0
                      ? "text-destructive font-medium"
                      : "text-muted-foreground"
                }
              >
                {line.netCents === 0
                  ? "settled"
                  : `${line.netCents > 0 ? "+" : "−"}${formatMoney(Math.abs(line.netCents), room.currency)}`}
              </span>
            </li>
          ))}
        </ul>
        {transfers.length > 0 ? (
          <p className="text-muted-foreground mt-4 text-sm">
            {transfers.length} transfer{transfers.length === 1 ? "" : "s"} to
            settle — see Settle for the sentences.
          </p>
        ) : room.expenses.length > 0 ? (
          <p className="text-muted-foreground mt-4 text-sm">All settled.</p>
        ) : null}
      </section>

      <section className="mt-10">
        <h2 className="font-display text-xl font-semibold">Expenses</h2>
        {room.expenses.length === 0 ? (
          <p className="text-muted-foreground mt-4 text-sm">
            No expenses yet. Add the first one.
          </p>
        ) : (
          <ul className="mt-4 space-y-1">
            {room.expenses.map((expense) => (
              <ExpenseRow
                key={expense.id}
                expense={expense}
                currency={room.currency}
              />
            ))}
          </ul>
        )}
      </section>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border/60 bg-background/90 p-4 backdrop-blur-md">
        <div className="mx-auto max-w-content">
          <Link
            to="/r/$code/new"
            params={{ code: room.code }}
            className="bg-primary text-primary-foreground hover:bg-primary/80 inline-flex h-12 w-full items-center justify-center gap-2 rounded-md text-base font-medium"
          >
            <HugeiconsIcon icon={Add01Icon} strokeWidth={2} />
            Add expense
          </Link>
        </div>
      </div>
    </main>
  )
}

function ExpenseRow({
  expense,
  currency,
}: {
  expense: RoomDto["expenses"][number]
  currency: string
}) {
  return (
    <li className="flex items-baseline justify-between gap-3 border-b border-border/50 py-3">
      <div className="min-w-0">
        <p className="truncate font-medium">{expense.title}</p>
        <p className="text-muted-foreground text-xs">
          Paid by {expense.paidByName}
        </p>
      </div>
      <p className="shrink-0 font-medium">
        {formatMoney(expense.amountCents, currency)}
      </p>
    </li>
  )
}
