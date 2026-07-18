import { useEffect, useMemo, useRef, useState } from "react"
import { Link, createFileRoute, getRouteApi } from "@tanstack/react-router"
import {
  useMutation,
  useMutationState,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core"
import type { DragEndEvent } from "@dnd-kit/core"
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Add01Icon,
  ArrowRight01Icon,
  ArrowUpDownIcon,
  Copy01Icon,
  Delete02Icon,
  DragDropVerticalIcon,
  Edit02Icon,
  Link01Icon,
  ReceiptDollarIcon,
} from "@hugeicons/core-free-icons"
import { toast } from "sonner"

import { BankFxCalibrationSheet } from "@/components/bank-fx-calibration-sheet"
import { CategoryChips } from "@/components/category-chips"
import { PullToRefresh } from "@/components/pull-to-refresh"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ADD_EXPENSE_MUTATION_KEY } from "@/lib/add-expense-mutation"
import type { AddExpenseMutationVars } from "@/lib/add-expense-mutation"
import { useOnlineStatus } from "@/lib/online-status"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { redistributeAmounts } from "@/lib/amount-split"
import {
  atmDigitsFromInput,
  atmDigitsToCents,
  centsToAtmDigits,
  currencyFractionDigits,
  formatAtmAmount,
  formatAtmAmountInput,
} from "@/lib/atm-amount"
import { formatRelativeTime } from "@/lib/format-relative-time"
import { copyText } from "@/lib/invite-link"
import { memberLink } from "@/lib/member-storage"
import { roomKeys, roomQueryOptions } from "@/lib/room-query"
import { useRoomIdentity } from "@/lib/room-identity"
import {
  computeNetsWithSettlements,
  convertToBase,
  formatMoney,
  simplifyTransfers,
} from "@/lib/settle"
import { cn } from "@/lib/utils"
import type {
  DeleteExpenseInput,
  SplitMode,
  UpdateExpenseInput,
} from "@/lib/schemas"
import { deleteExpense, reorderExpenses, updateExpense } from "@/server/rooms"
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

function splitModeLabel(mode: string): string {
  if (mode === "PARTS") return "Parts"
  if (mode === "AMOUNT") return "Amounts"
  return "Equal"
}

function normalizedSplitMode(mode: string): SplitMode {
  if (mode === "PARTS" || mode === "AMOUNT") return mode
  return "EQUAL"
}

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  })
}

function splitsForEditedExpense(
  expense: RoomDto["expenses"][number]
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

  return expense.shares.map((share) => ({ memberId: share.memberId }))
}

function seedAmountSplitState(
  expense: RoomDto["expenses"][number],
  fractionDigits: number
): {
  included: Set<string>
  amounts: Record<string, string>
  manualIds: Set<string>
} {
  const included = new Set(expense.shares.map((share) => share.memberId))
  const amounts = Object.fromEntries(
    expense.shares.map((share) => [
      share.memberId,
      centsToAtmDigits(share.amountCents, fractionDigits),
    ])
  )
  const manualIds = new Set(expense.shares.map((share) => share.memberId))
  return { included, amounts, manualIds }
}

function RoomHomeSkeleton() {
  return (
    <main className="page-gutter mx-auto max-w-content pt-4">
      <Skeleton className="h-8 w-40" />
      <Skeleton className="mt-2 h-6 w-full max-w-sm rounded-full" />
      <Skeleton className="mt-4 h-14 w-full" />
      <Skeleton className="mt-6 h-5 w-24" />
      <div className="mt-2 space-y-2">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
      <Skeleton className="mt-6 h-5 w-24" />
      <div className="mt-2 space-y-2">
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
      </div>
    </main>
  )
}

function RoomHomePage() {
  const { code } = roomRoute.useParams()
  const { memberId, switchIdentity } = useRoomIdentity()
  const queryClient = useQueryClient()
  const online = useOnlineStatus()
  const {
    data: room,
    isPending,
    refetch,
  } = useQuery(roomQueryOptions(code, memberId))
  const pendingExpenseIds = useMutationState({
    filters: { mutationKey: ADD_EXPENSE_MUTATION_KEY, status: "pending" },
    select: (mutation) => {
      const vars = mutation.state.variables as
        AddExpenseMutationVars | undefined
      if (!vars || vars.code !== code) return null
      return vars.clientId
    },
  }).filter((id): id is string => Boolean(id))
  const pendingExpenseIdSet = useMemo(
    () => new Set(pendingExpenseIds),
    [pendingExpenseIds]
  )
  const [copied, setCopied] = useState<"code" | "link" | null>(null)
  const [selectedExpenseId, setSelectedExpenseId] = useState<string | null>(
    null
  )
  const [calibrationOpen, setCalibrationOpen] = useState(false)
  const [calibrationExpenseId, setCalibrationExpenseId] = useState<
    string | null
  >(null)
  const [reordering, setReordering] = useState(false)
  const [order, setOrder] = useState<string[]>([])
  const [savingOrder, setSavingOrder] = useState(false)
  const savingOrderRef = useRef(false)
  const queuedOrderRef = useRef<string[] | null>(null)
  /** Last server-confirmed order; restored if a persist fails. */
  const savedOrderRef = useRef<string[] | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  async function persistExpenseOrder(expenseIds: string[]) {
    if (savingOrderRef.current) {
      queuedOrderRef.current = expenseIds
      return
    }

    savingOrderRef.current = true
    setSavingOrder(true)
    let pending: string[] | null = expenseIds

    try {
      while (pending) {
        const ids = pending
        pending = null
        try {
          await reorderExpenses({ data: { code, expenseIds: ids } })
          savedOrderRef.current = ids
        } catch (error) {
          const rollback = savedOrderRef.current
          if (rollback) setOrder(rollback)
          queuedOrderRef.current = null
          toast.error(
            error instanceof Error ? error.message : "Could not save order"
          )
          break
        } finally {
          await queryClient.invalidateQueries({ queryKey: roomKeys.room(code) })
        }

        const queued = queuedOrderRef.current
        queuedOrderRef.current = null
        if (
          queued &&
          (queued.length !== ids.length ||
            queued.some((id, index) => id !== ids[index]))
        ) {
          pending = queued
        }
      }
    } finally {
      savingOrderRef.current = false
      setSavingOrder(false)
    }
  }

  // Home list hides others' personal expenses (still available redacted for FX calibrate).
  const listExpenses = useMemo(() => {
    if (!room) return []
    return room.expenses.filter((expense) => !expense.redacted)
  }, [room])

  useEffect(() => {
    if (!room || reordering) return
    setOrder(listExpenses.map((expense) => expense.id))
  }, [listExpenses, reordering, room])

  const orderedExpenses = useMemo(() => {
    const byId = new Map(listExpenses.map((expense) => [expense.id, expense]))
    return order
      .map((id) => byId.get(id))
      .filter((expense): expense is RoomDto["expenses"][number] => !!expense)
  }, [order, listExpenses])

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIndex = order.indexOf(String(active.id))
    const newIndex = order.indexOf(String(over.id))
    if (oldIndex === -1 || newIndex === -1) return

    const previous = order
    const next = arrayMove(order, oldIndex, newIndex)
    setOrder(next)

    if (!savingOrderRef.current) {
      savedOrderRef.current = previous
    }
    void persistExpenseOrder(next)
  }

  const me = room?.members.find((member) => member.id === memberId)

  // Sum of this member's shares (their portion), not what they paid out.
  const spentCents = useMemo(() => {
    if (!room || !memberId) return 0
    return room.expenses.reduce((sum, expense) => {
      const myShare = expense.shares.find(
        (share) => share.memberId === memberId
      )
      if (!myShare) return sum
      return (
        sum +
        convertToBase(
          myShare.amountCents,
          expense.currency,
          room.currency,
          room.fxRates,
          room.fxAdjustmentBps
        )
      )
    }, 0)
  }, [room, memberId])

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
  }, [room])

  const transfers = useMemo(() => simplifyTransfers(nets), [nets])

  if (!room) {
    return isPending ? <RoomHomeSkeleton /> : null
  }

  const selectedExpense =
    selectedExpenseId == null
      ? null
      : (listExpenses.find((expense) => expense.id === selectedExpenseId) ??
        null)

  async function copyCode() {
    await copyText(room!.code)
    setCopied("code")
    window.setTimeout(() => setCopied(null), 1500)
  }

  async function copyMyLink() {
    if (!me) return
    await copyText(memberLink(room!.code, me.name))
    setCopied("link")
    window.setTimeout(() => setCopied(null), 1500)
  }

  return (
    <PullToRefresh disabled={!online || reordering} onRefresh={() => refetch()}>
      <main className="page-gutter mx-auto max-w-content pt-4">
        <header>
          <h1 className="font-display text-2xl font-semibold tracking-tight">
            {room.name}
          </h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <p className="text-sm text-muted-foreground tabular-nums">
              You spent {formatMoney(spentCents, room.currency)}
            </p>
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
            <Badge variant="secondary">Base {room.currency}</Badge>
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
              title={
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

        <section className="mt-6">
          <div className="flex items-end justify-between gap-3">
            <h2 className="font-display text-xl font-semibold">Expenses</h2>
            {listExpenses.length > 1 ? (
              <button
                type="button"
                disabled={reordering && savingOrder}
                onClick={() => {
                  if (reordering) {
                    if (savingOrderRef.current) return
                    setReordering(false)
                    return
                  }
                  setReordering(true)
                }}
                className="inline-flex items-center gap-1 text-sm font-medium text-primary disabled:opacity-60"
              >
                {reordering ? (
                  savingOrder ? (
                    "Saving…"
                  ) : (
                    "Done"
                  )
                ) : (
                  <>
                    <HugeiconsIcon
                      icon={ArrowUpDownIcon}
                      size={14}
                      strokeWidth={2}
                    />
                    Reorder
                  </>
                )}
              </button>
            ) : null}
          </div>
          {listExpenses.length === 0 ? (
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
                  No expenses yet
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Add the first one to start splitting.
                </p>
              </div>
              <Link
                to="/r/$code/new"
                params={{ code: room.code }}
                className="inline-flex h-(--control-height) items-center justify-center gap-2 rounded-md bg-primary px-5 text-base font-medium text-primary-foreground hover:bg-primary/80"
              >
                <HugeiconsIcon icon={Add01Icon} size={18} strokeWidth={2} />
                Add expense
              </Link>
            </div>
          ) : reordering ? (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={order}
                strategy={verticalListSortingStrategy}
              >
                <ul className="mt-1">
                  {orderedExpenses.map((expense) => (
                    <SortableExpenseRow
                      key={expense.id}
                      expense={expense}
                      room={room}
                      pending={pendingExpenseIdSet.has(expense.id)}
                    />
                  ))}
                </ul>
              </SortableContext>
            </DndContext>
          ) : (
            <ul className="mt-1">
              {listExpenses.map((expense) => (
                <ExpenseRow
                  key={expense.id}
                  expense={expense}
                  room={room}
                  pending={pendingExpenseIdSet.has(expense.id)}
                  onOpen={() => {
                    if (pendingExpenseIdSet.has(expense.id)) {
                      toast.message("Still syncing this expense")
                      return
                    }
                    setSelectedExpenseId(expense.id)
                  }}
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
          onCalibrateBank={(expenseId) => {
            setSelectedExpenseId(null)
            setCalibrationExpenseId(expenseId)
            setCalibrationOpen(true)
          }}
        />
        <BankFxCalibrationSheet
          room={room}
          open={calibrationOpen}
          onOpenChange={(open) => {
            setCalibrationOpen(open)
            if (!open) setCalibrationExpenseId(null)
          }}
          initialExpenseId={calibrationExpenseId}
        />
      </main>
    </PullToRefresh>
  )
}

function ExpenseRowContent({
  expense,
  room,
  compact,
  pending,
}: {
  expense: RoomDto["expenses"][number]
  room: RoomDto
  /** Reorder mode: shorter meta line, still shares title/badges/amount. */
  compact?: boolean
  pending?: boolean
}) {
  const isForeign = expense.currency !== room.currency
  const baseCents = convertToBase(
    expense.amountCents,
    expense.currency,
    room.currency,
    room.fxRates,
    room.fxAdjustmentBps
  )

  return (
    <>
      <Avatar className={cn("size-9 shrink-0", pending && "opacity-70")}>
        <AvatarFallback className="bg-accent text-xs font-semibold text-accent-foreground">
          {initials(expense.paidByName)}
        </AvatarFallback>
      </Avatar>
      <div className={cn("min-w-0 flex-1", pending && "opacity-80")}>
        <div className="flex min-w-0 items-baseline gap-2">
          <p className="truncate text-sm font-semibold">{expense.title}</p>
          {pending ? (
            <Badge variant="secondary" className="shrink-0">
              Syncing
            </Badge>
          ) : null}
          {expense.isPersonal ? (
            <Badge variant="secondary" className="shrink-0">
              Personal
            </Badge>
          ) : null}
          {expense.category ? (
            <Badge
              variant="outline"
              className="shrink-0 border-transparent bg-muted text-muted-foreground"
            >
              {expense.category}
            </Badge>
          ) : null}
        </div>
        <p className="mt-1 truncate text-xs text-muted-foreground">
          {pending
            ? "Waiting to sync"
            : compact
              ? formatRelativeTime(expense.createdAt)
              : `${expense.paidByName} paid · ${formatRelativeTime(expense.createdAt)}`}
        </p>
      </div>
      <div className={cn("shrink-0 text-right", pending && "opacity-80")}>
        <p className="text-sm font-semibold tabular-nums">
          {formatMoney(expense.amountCents, expense.currency)}
        </p>
        {isForeign ? (
          <p className="text-xs text-muted-foreground tabular-nums">
            ≈ {formatMoney(baseCents, room.currency)}
          </p>
        ) : null}
      </div>
    </>
  )
}

function ExpenseRow({
  expense,
  room,
  pending,
  onOpen,
}: {
  expense: RoomDto["expenses"][number]
  room: RoomDto
  pending?: boolean
  onOpen: () => void
}) {
  return (
    <li className="border-b border-border/70">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3.5 py-3.5 text-left transition-colors hover:bg-muted/30"
        onClick={onOpen}
      >
        <ExpenseRowContent expense={expense} room={room} pending={pending} />
      </button>
    </li>
  )
}

function SortableExpenseRow({
  expense,
  room,
  pending,
}: {
  expense: RoomDto["expenses"][number]
  room: RoomDto
  pending?: boolean
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: expense.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex items-center gap-3.5 border-b border-border/70 bg-background py-3.5",
        isDragging && "relative z-10 opacity-90 shadow-lg",
        pending && "opacity-80"
      )}
    >
      <button
        type="button"
        className="shrink-0 cursor-grab touch-none text-muted-foreground hover:text-foreground active:cursor-grabbing"
        aria-label="Drag to reorder expense"
        {...attributes}
        {...listeners}
      >
        <HugeiconsIcon icon={DragDropVerticalIcon} size={18} strokeWidth={2} />
      </button>
      <ExpenseRowContent
        expense={expense}
        room={room}
        compact
        pending={pending}
      />
    </li>
  )
}

function ExpenseDetailSheet({
  room,
  expense,
  open,
  onOpenChange,
  onCalibrateBank,
}: {
  room: RoomDto
  expense: RoomDto["expenses"][number] | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onCalibrateBank: (expenseId: string) => void
}) {
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState("")
  const [category, setCategory] = useState("")
  const [amountDigits, setAmountDigits] = useState("")
  const [included, setIncluded] = useState<Set<string>>(() => new Set())
  const [amounts, setAmounts] = useState<Record<string, string>>({})
  const [manualIds, setManualIds] = useState<Set<string>>(() => new Set())
  const [splitError, setSplitError] = useState<string | null>(null)

  useEffect(() => {
    setEditing(false)
    setTitle(expense?.title ?? "")
    setCategory(expense?.category ?? "")
    setSplitError(null)
    if (!expense) {
      setAmountDigits("")
      setIncluded(new Set())
      setAmounts({})
      setManualIds(new Set())
      return
    }
    const fractionDigits = currencyFractionDigits(expense.currency)
    setAmountDigits(centsToAtmDigits(expense.amountCents, fractionDigits))
    const seeded = seedAmountSplitState(expense, fractionDigits)
    setIncluded(seeded.included)
    setAmounts(seeded.amounts)
    setManualIds(seeded.manualIds)
  }, [expense?.id])

  const isAmountSplit =
    expense != null &&
    !expense.isPersonal &&
    normalizedSplitMode(expense.splitMode) === "AMOUNT"

  const fractionDigits = expense
    ? currencyFractionDigits(expense.currency)
    : 0
  const amountCents = atmDigitsToCents(amountDigits, fractionDigits)

  useEffect(() => {
    if (!expense || !isAmountSplit || !editing) return

    const includedIds = room.members
      .filter((member) => included.has(member.id))
      .map((member) => member.id)

    setManualIds((prevManual) => {
      const cleaned = new Set(
        [...prevManual].filter((id) => includedIds.includes(id))
      )

      setAmounts((prevAmounts) => {
        const next = redistributeAmounts({
          totalCents: amountCents,
          includedIds,
          manualIds: cleaned,
          amounts: prevAmounts,
          fractionDigits,
        })
        const prevKeys = Object.keys(prevAmounts)
        const nextKeys = Object.keys(next)
        if (
          prevKeys.length === nextKeys.length &&
          nextKeys.every((key) => prevAmounts[key] === next[key])
        ) {
          return prevAmounts
        }
        return next
      })

      if (
        cleaned.size === prevManual.size &&
        [...cleaned].every((id) => prevManual.has(id))
      ) {
        return prevManual
      }
      return cleaned
    })
  }, [
    expense,
    isAmountSplit,
    editing,
    amountCents,
    fractionDigits,
    included,
    room.members,
  ])

  const assignedCents = useMemo(() => {
    if (!isAmountSplit) return 0
    return room.members
      .filter((member) => included.has(member.id))
      .reduce(
        (sum, member) =>
          sum + atmDigitsToCents(amounts[member.id] ?? "", fractionDigits),
        0
      )
  }, [isAmountSplit, room.members, included, amounts, fractionDigits])
  const remainingCents = amountCents - assignedCents

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

  const baseCents = convertToBase(
    expense.amountCents,
    expense.currency,
    room.currency,
    room.fxRates,
    room.fxAdjustmentBps
  )
  const isForeign = expense.currency !== room.currency

  function resetEditState() {
    if (!expense) return
    const fd = currencyFractionDigits(expense.currency)
    setTitle(expense.title)
    setCategory(expense.category ?? "")
    setAmountDigits(centsToAtmDigits(expense.amountCents, fd))
    const seeded = seedAmountSplitState(expense, fd)
    setIncluded(seeded.included)
    setAmounts(seeded.amounts)
    setManualIds(seeded.manualIds)
    setSplitError(null)
    setEditing(false)
  }

  function toggleMember(memberId: string) {
    setSplitError(null)
    setIncluded((prev) => {
      const next = new Set(prev)
      if (next.has(memberId)) {
        if (next.size === 1) return prev
        next.delete(memberId)
      } else {
        next.add(memberId)
      }
      return next
    })
    setManualIds((prev) => {
      if (!prev.has(memberId)) return prev
      const next = new Set(prev)
      next.delete(memberId)
      return next
    })
  }

  function onAmountShareChange(memberId: string, digits: string) {
    setSplitError(null)
    const nextManual = new Set(manualIds)
    nextManual.add(memberId)
    setManualIds(nextManual)

    const includedIds = room.members
      .filter((member) => included.has(member.id))
      .map((member) => member.id)

    setAmounts((prev) =>
      redistributeAmounts({
        totalCents: amountCents,
        includedIds,
        manualIds: nextManual,
        amounts: { ...prev, [memberId]: digits },
        fractionDigits,
      })
    )
  }

  function saveEdit() {
    if (!expense) return
    setSplitError(null)
    const nextAmountCents = atmDigitsToCents(amountDigits, fractionDigits)
    if (nextAmountCents <= 0) {
      toast.error("Enter a valid amount")
      return
    }
    const nextTitle = title.trim()
    if (!nextTitle) {
      toast.error("Add a short title")
      return
    }

    const splitMode = normalizedSplitMode(expense.splitMode)
    let splits: Array<{
      memberId: string
      weight?: number
      amountCents?: number
    }>

    if (expense.isPersonal) {
      splits = [{ memberId: expense.paidById }]
    } else if (splitMode === "AMOUNT") {
      const ids = room.members
        .filter((member) => included.has(member.id))
        .map((member) => member.id)
      if (ids.length === 0) {
        setSplitError("Pick at least one person")
        return
      }
      splits = ids.map((memberId) => ({
        memberId,
        amountCents: atmDigitsToCents(amounts[memberId] ?? "", fractionDigits),
      }))
      const sum = splits.reduce((total, split) => total + (split.amountCents ?? 0), 0)
      if (sum !== nextAmountCents) {
        setSplitError(
          `Amounts add up to ${formatMoney(sum, expense.currency)}, need ${formatMoney(nextAmountCents, expense.currency)}`
        )
        return
      }
    } else {
      splits = splitsForEditedExpense(expense)
    }

    updateMutation.mutate({
      code: room.code,
      expenseId: expense.id,
      title: nextTitle,
      category: category.trim() || undefined,
      amountCents: nextAmountCents,
      currency: expense.currency,
      paidById: expense.paidById,
      splitMode,
      isPersonal: expense.isPersonal,
      splits,
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
        <div className="mx-auto flex w-full max-w-content flex-col">
          <SheetHeader>
            <SheetTitle>{editing ? "Edit expense" : expense.title}</SheetTitle>
            <SheetDescription>
              {expense.isPersonal
                ? `${expense.paidByName} paid`
                : `${expense.paidByName} paid · ${splitModeLabel(expense.splitMode)}`}
              {" · "}
              {formatDateTime(expense.createdAt)}
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
                      value={formatAtmAmountInput(amountDigits, fractionDigits)}
                      onChange={(event) =>
                        setAmountDigits(atmDigitsFromInput(event.target.value))
                      }
                      onFocus={(event) => event.target.select()}
                      placeholder={formatAtmAmount("", fractionDigits)}
                      className="text-right tabular-nums"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label>Currency</Label>
                    <div className="flex h-(--control-height) min-w-16 items-center justify-center rounded-md border-border bg-muted/40 px-3 text-base font-medium">
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
                  <CategoryChips value={category} onChange={setCategory} />
                  <Input
                    id="edit-expense-category"
                    value={category}
                    onChange={(event) => setCategory(event.target.value)}
                    placeholder="Custom category…"
                  />
                </div>
                {isAmountSplit ? (
                  <div className="flex flex-col gap-3">
                    <Label>Amounts per person</Label>
                    <ul className="divide-y divide-border/60">
                      {room.members.map((member) => {
                        const active = included.has(member.id)
                        return (
                          <li
                            key={member.id}
                            className="flex items-center justify-between gap-3 py-2.5"
                          >
                            <button
                              type="button"
                              onClick={() => toggleMember(member.id)}
                              className="flex min-w-0 items-center gap-3 text-left"
                            >
                              <Avatar
                                className={
                                  active
                                    ? "size-9"
                                    : "size-9 opacity-40 grayscale"
                                }
                              >
                                <AvatarFallback className="bg-accent text-xs font-semibold text-accent-foreground">
                                  {initials(member.name)}
                                </AvatarFallback>
                              </Avatar>
                              <span
                                className={
                                  active
                                    ? "truncate font-medium"
                                    : "truncate text-muted-foreground"
                                }
                              >
                                {member.name}
                              </span>
                            </button>
                            {active ? (
                              <Input
                                inputMode="numeric"
                                autoComplete="off"
                                value={formatAtmAmountInput(
                                  amounts[member.id] ?? "",
                                  fractionDigits
                                )}
                                onChange={(event) => {
                                  onAmountShareChange(
                                    member.id,
                                    atmDigitsFromInput(event.target.value)
                                  )
                                }}
                                onFocus={(event) => event.target.select()}
                                placeholder={formatAtmAmount(
                                  "",
                                  fractionDigits
                                )}
                                className="h-9 w-28 text-right tabular-nums"
                              />
                            ) : (
                              <span className="text-sm text-muted-foreground">
                                Not included
                              </span>
                            )}
                          </li>
                        )
                      })}
                    </ul>
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>
                        {included.size} of {room.members.length} people
                      </span>
                      {amountCents > 0 ? (
                        <span
                          className={
                            remainingCents === 0
                              ? "font-medium text-primary"
                              : "font-medium text-destructive"
                          }
                        >
                          {remainingCents === 0
                            ? "Balanced"
                            : remainingCents > 0
                              ? `${formatMoney(remainingCents, expense.currency)} left`
                              : `${formatMoney(-remainingCents, expense.currency)} over`}
                        </span>
                      ) : null}
                    </div>
                    {splitError ? (
                      <p className="text-xs text-destructive" role="alert">
                        {splitError}
                      </p>
                    ) : null}
                  </div>
                ) : null}
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
                  {isForeign ? (
                    <button
                      type="button"
                      onClick={() => onCalibrateBank(expense.id)}
                      className="mt-2 text-sm font-medium text-primary"
                    >
                      Bank charged different?
                    </button>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  {expense.isPersonal ? (
                    <Badge variant="secondary">Personal</Badge>
                  ) : (
                    <Badge variant="secondary">
                      {splitModeLabel(expense.splitMode)}
                    </Badge>
                  )}
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
                  onClick={resetEditState}
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
                  <HugeiconsIcon
                    icon={Delete02Icon}
                    size={14}
                    strokeWidth={2}
                  />
                  {deleteMutation.isPending ? "Deleting…" : "Delete"}
                </Button>
              </div>
            )}
          </SheetFooter>
        </div>
      </SheetContent>
    </Sheet>
  )
}
