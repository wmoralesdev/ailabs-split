import { useEffect, useMemo, useState } from "react"
import { Link, createFileRoute, getRouteApi } from "@tanstack/react-router"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Add01Icon,
  ArrowRight01Icon,
  Copy01Icon,
  Delete02Icon,
  Edit02Icon,
  Link01Icon,
  ReceiptDollarIcon,
  Share01Icon,
} from "@hugeicons/core-free-icons"
import { toast } from "sonner"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import {
  atmDigitsFromInput,
  atmDigitsToCents,
  centsToAtmDigits,
  currencyFractionDigits,
  formatAtmAmount,
} from "@/lib/atm-amount"
import { copyText, shareOrCopyInvite } from "@/lib/invite-link"
import { memberLink } from "@/lib/member-storage"
import { roomKeys, roomQueryOptions } from "@/lib/room-query"
import { useRoomIdentity } from "@/lib/room-identity"
import {
  computeNetsWithSettlements,
  convertToBase,
  formatMoney,
  partsSplitCents,
  simplifyTransfers,
} from "@/lib/settle"
import type {
  DeleteExpenseInput,
  SplitMode,
  UpdateExpenseInput,
} from "@/lib/schemas"
import { deleteExpense, updateExpense } from "@/server/rooms"
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

function normalizedSplitMode(mode: string): SplitMode {
  if (mode === "PARTS" || mode === "AMOUNT") return mode
  return "EQUAL"
}

function splitsForEditedExpense(
  expense: RoomDto["expenses"][number],
  amountCents: number
): Array<{ memberId: string; weight?: number; amountCents?: number }> {
  if (expense.isPersonal) {
    return [{ memberId: expense.paidById }]
  }

  if (expense.splitMode === "PARTS") {
    return expense.shares.map((share) => ({
      memberId: share.memberId,
      weight: share.weight ?? 0,
    }))
  }

  if (expense.splitMode === "AMOUNT") {
    return partsSplitCents(
      amountCents,
      expense.shares.map((share) => ({
        memberId: share.memberId,
        weight: Math.max(0, share.amountCents),
      }))
    ).map((share) => ({
      memberId: share.memberId,
      amountCents: share.amountCents,
    }))
  }

  return expense.shares.map((share) => ({ memberId: share.memberId }))
}

function RoomHomePage() {
  const { code } = roomRoute.useParams()
  const { memberId, switchIdentity } = useRoomIdentity()
  const { data: room } = useQuery(roomQueryOptions(code, memberId))
  const [copied, setCopied] = useState<"code" | "link" | "invite" | null>(null)
  const [selectedExpenseId, setSelectedExpenseId] = useState<string | null>(
    null
  )

  const me = room?.members.find((member) => member.id === memberId)

  const nets = useMemo(() => {
    if (!room) return []
    return computeNetsWithSettlements(
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
  }, [room])

  const transfers = useMemo(() => simplifyTransfers(nets), [nets])

  if (!room) return null
  const selectedExpense =
    selectedExpenseId == null
      ? null
      : (room.expenses.find((expense) => expense.id === selectedExpenseId) ??
        null)

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
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background/60 px-3 py-1 text-sm text-muted-foreground"
          >
            <span className="font-display tracking-widest text-foreground">
              {room.code}
            </span>
            <HugeiconsIcon icon={Copy01Icon} size={14} strokeWidth={2} />
            {copied === "code" ? "Copied" : "Copy"}
          </button>
          <button
            type="button"
            onClick={() => void shareInvite()}
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background/60 px-3 py-1 text-sm text-muted-foreground"
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
                <AvatarFallback className="bg-accent text-sm font-semibold text-accent-foreground">
                  {me ? initials(me.name) : "?"}
                </AvatarFallback>
              </Avatar>
              <div>
                <p className="text-xs text-muted-foreground">You are</p>
                <p className="font-display text-lg leading-tight font-semibold">
                  {me?.name ?? "Unknown"}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={switchIdentity}
              className="text-sm font-medium text-primary"
            >
              Switch
            </button>
          </div>
          <button
            type="button"
            onClick={() => void copyMyLink()}
            className="inline-flex items-center gap-1.5 px-(--card-spacing) text-sm text-muted-foreground hover:text-foreground"
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
              className="inline-flex items-center gap-1 text-sm font-medium text-primary"
            >
              Settle
              <HugeiconsIcon
                icon={ArrowRight01Icon}
                size={14}
                strokeWidth={2}
              />
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
                className="flex items-center gap-3 border-b border-border/70 py-2"
              >
                <Avatar className="size-8">
                  <AvatarFallback className="bg-muted text-xs font-semibold text-muted-foreground">
                    {initials(line.name)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-sm font-medium">
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
                  </div>
                  <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-muted">
                    <div
                      className={
                        owed
                          ? "h-full rounded-full bg-primary"
                          : owes
                            ? "h-full rounded-full bg-destructive"
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
            <span className="flex size-12 items-center justify-center rounded-full bg-accent text-accent-foreground">
              <HugeiconsIcon
                icon={ReceiptDollarIcon}
                size={24}
                strokeWidth={2}
              />
            </span>
            <div>
              <p className="text-sm font-medium text-foreground">
                No expenses yet
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Add the first one to start splitting.
              </p>
            </div>
            <Link
              to="/r/$code/new"
              params={{ code: room.code }}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground hover:bg-primary/80"
            >
              <HugeiconsIcon icon={Add01Icon} size={18} strokeWidth={2} />
              Add expense
            </Link>
          </Card>
        ) : (
          <ul className="mt-3 space-y-2">
            {room.expenses.map((expense) => (
              <ExpenseRow
                key={expense.id}
                expense={expense}
                room={room}
                onOpen={() => setSelectedExpenseId(expense.id)}
              />
            ))}
          </ul>
        )}
      </section>
      <ExpenseDetailSheet
        room={room}
        expense={selectedExpense}
        open={selectedExpense !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedExpenseId(null)
        }}
      />
    </main>
  )
}

function ExpenseRow({
  expense,
  room,
  onOpen,
}: {
  expense: RoomDto["expenses"][number]
  room: RoomDto
  onOpen: () => void
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
      <button type="button" className="block w-full text-left" onClick={onOpen}>
        <Card
          size="sm"
          className="flex-row items-center justify-between gap-3 px-(--card-spacing) transition-colors hover:bg-muted/30"
        >
          <div className="flex min-w-0 items-center gap-3">
            <Avatar className="size-9">
              <AvatarFallback className="bg-accent text-xs font-semibold text-accent-foreground">
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
                {expense.category ? (
                  <Badge variant="outline" className="shrink-0">
                    {expense.category}
                  </Badge>
                ) : null}
              </div>
              <p className="truncate text-xs text-muted-foreground">
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
              <p className="text-xs text-muted-foreground tabular-nums">
                ≈ {formatMoney(baseCents, room.currency)}
              </p>
            ) : null}
          </div>
        </Card>
      </button>
    </li>
  )
}

function ExpenseDetailSheet({
  room,
  expense,
  open,
  onOpenChange,
}: {
  room: RoomDto
  expense: RoomDto["expenses"][number] | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState("")
  const [category, setCategory] = useState("")
  const [amountDigits, setAmountDigits] = useState("")

  useEffect(() => {
    setEditing(false)
    setTitle(expense?.title ?? "")
    setCategory(expense?.category ?? "")
    setAmountDigits(
      expense
        ? centsToAtmDigits(
            expense.amountCents,
            currencyFractionDigits(expense.currency)
          )
        : ""
    )
  }, [expense?.id])

  const updateMutation = useMutation({
    mutationFn: (input: UpdateExpenseInput) => updateExpense({ data: input }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: roomKeys.room(room.code),
      })
      toast.success("Expense updated")
      setEditing(false)
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Could not update expense"
      )
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (input: DeleteExpenseInput) => deleteExpense({ data: input }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: roomKeys.room(room.code),
      })
      toast.success("Expense deleted")
      onOpenChange(false)
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Could not delete expense"
      )
    },
  })

  if (!expense) {
    return <Sheet open={open} onOpenChange={onOpenChange} />
  }

  const fractionDigits = currencyFractionDigits(expense.currency)
  const baseCents = convertToBase(
    expense.amountCents,
    expense.currency,
    room.currency,
    room.fxRates
  )
  const isForeign = expense.currency !== room.currency

  function saveEdit() {
    if (!expense) return
    const amountCents = atmDigitsToCents(amountDigits, fractionDigits)
    if (amountCents <= 0) {
      toast.error("Enter a valid amount")
      return
    }
    const nextTitle = title.trim()
    if (!nextTitle) {
      toast.error("Add a short title")
      return
    }

    updateMutation.mutate({
      code: room.code,
      expenseId: expense.id,
      title: nextTitle,
      category: category.trim() || undefined,
      amountCents,
      currency: expense.currency,
      paidById: expense.paidById,
      splitMode: normalizedSplitMode(expense.splitMode),
      isPersonal: expense.isPersonal,
      splits: splitsForEditedExpense(expense, amountCents),
    })
  }

  function deleteCurrentExpense() {
    if (!expense) return
    if (!window.confirm("Delete this expense? This cannot be undone.")) return
    deleteMutation.mutate({ code: room.code, expenseId: expense.id })
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="max-h-[85dvh] overflow-y-auto rounded-t-2xl"
      >
        <SheetHeader>
          <SheetTitle>{editing ? "Edit expense" : expense.title}</SheetTitle>
          <SheetDescription>
            {expense.paidByName} paid ·{" "}
            {splitModeLabel(expense.splitMode, expense.isPersonal)}
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-5 px-6 pb-2">
          {editing ? (
            <>
              <div className="grid grid-cols-[1fr_auto] gap-3">
                <div className="grid gap-2">
                  <Label htmlFor="edit-expense-amount">Amount</Label>
                  <Input
                    id="edit-expense-amount"
                    inputMode="numeric"
                    value={formatAtmAmount(amountDigits, fractionDigits)}
                    onChange={(event) =>
                      setAmountDigits(atmDigitsFromInput(event.target.value))
                    }
                    className="text-right tabular-nums"
                  />
                </div>
                <div className="grid gap-2">
                  <Label>Currency</Label>
                  <div className="flex h-9 min-w-16 items-center justify-center rounded-md border border-border bg-muted/40 px-3 text-sm font-medium">
                    {expense.currency}
                  </div>
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-expense-title">Title</Label>
                <Input
                  id="edit-expense-title"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-expense-category">Category</Label>
                <Input
                  id="edit-expense-category"
                  value={category}
                  onChange={(event) => setCategory(event.target.value)}
                  placeholder="Food, lodging, taxi…"
                />
              </div>
            </>
          ) : (
            <>
              <div>
                <p className="font-display text-3xl font-semibold tabular-nums">
                  {formatMoney(expense.amountCents, expense.currency)}
                </p>
                {isForeign ? (
                  <p className="mt-1 text-sm text-muted-foreground">
                    ≈ {formatMoney(baseCents, room.currency)}
                  </p>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary">
                  {splitModeLabel(expense.splitMode, expense.isPersonal)}
                </Badge>
                {expense.category ? (
                  <Badge variant="outline">{expense.category}</Badge>
                ) : null}
              </div>
              <div>
                <h3 className="text-sm font-medium">Share breakdown</h3>
                <ul className="mt-2 divide-y divide-border/60">
                  {expense.shares.map((share) => (
                    <li
                      key={share.memberId}
                      className="flex items-center justify-between gap-3 py-2"
                    >
                      <span className="text-sm">{share.memberName}</span>
                      <span className="text-sm font-medium tabular-nums">
                        {formatMoney(share.amountCents, expense.currency)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </>
          )}
        </div>

        <SheetFooter>
          {editing ? (
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditing(false)}
                disabled={updateMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={saveEdit}
                disabled={updateMutation.isPending}
              >
                {updateMutation.isPending ? "Saving…" : "Save"}
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditing(true)}
              >
                <HugeiconsIcon icon={Edit02Icon} size={14} strokeWidth={2} />
                Edit
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={deleteCurrentExpense}
                disabled={deleteMutation.isPending}
              >
                <HugeiconsIcon icon={Delete02Icon} size={14} strokeWidth={2} />
                {deleteMutation.isPending ? "Deleting…" : "Delete"}
              </Button>
            </div>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
