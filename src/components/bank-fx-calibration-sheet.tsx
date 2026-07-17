import { useEffect, useMemo, useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { HugeiconsIcon } from "@hugeicons/react"
import { Delete02Icon } from "@hugeicons/core-free-icons"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
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
  formatAtmAmountInput,
} from "@/lib/atm-amount"
import { roomKeys } from "@/lib/room-query"
import type { CalibrateRoomFxInput } from "@/lib/schemas"
import {
  computeFxAdjustmentBps,
  convertToBase,
  formatMoney,
} from "@/lib/settle"
import type { FxCalibrationSample } from "@/lib/settle"
import { calibrateRoomFx } from "@/server/rooms"
import type { RoomDto } from "@/server/rooms"

const MAX_SAMPLES = 5

type DraftRow = {
  key: string
  expenseId?: string
  appCents: number
  bankDigits: string
}

export function formatAdjustmentPercent(bps: number): string {
  if (!Number.isFinite(bps)) return "+0%"
  const pct = bps / 100
  const sign = pct > 0 ? "+" : ""
  const decimals = Number.isInteger(pct) ? 0 : Math.abs(pct) >= 1 ? 1 : 2
  return `${sign}${pct.toFixed(decimals)}%`
}

function rowFromSample(
  sample: FxCalibrationSample,
  fractionDigits: number,
  key = crypto.randomUUID()
): DraftRow {
  return {
    key,
    expenseId: sample.expenseId,
    appCents: sample.appCents,
    bankDigits: centsToAtmDigits(sample.bankCents, fractionDigits),
  }
}

function unadjustedBaseCents(
  room: RoomDto,
  expense: RoomDto["expenses"][number]
): number {
  return convertToBase(
    expense.amountCents,
    expense.currency,
    room.currency,
    room.fxRates,
    0
  )
}

function expenseLabel(
  room: RoomDto,
  expense: RoomDto["expenses"][number]
): string {
  const amount = formatMoney(unadjustedBaseCents(room, expense), room.currency)
  if (expense.redacted) {
    return `Personal · ${expense.paidByName} · ${amount}`
  }
  if (expense.isPersonal) {
    return `${expense.title} (personal) · ${amount}`
  }
  return `${expense.title} · ${amount}`
}

function rowExpenseTitle(
  expenseId: string | undefined,
  foreignExpenses: RoomDto["expenses"]
): string {
  const expense = foreignExpenses.find((item) => item.id === expenseId)
  if (!expense) return "Expense"
  if (expense.redacted) return `Personal · ${expense.paidByName}`
  return expense.title
}

function isRowFilled(row: DraftRow, fractionDigits: number): boolean {
  return (
    row.appCents > 0 && atmDigitsToCents(row.bankDigits, fractionDigits) > 0
  )
}

export function BankFxCalibrationSheet({
  room,
  open,
  onOpenChange,
  initialExpenseId,
}: {
  room: RoomDto
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Prefill first row from this foreign expense when opening. */
  initialExpenseId?: string | null
}) {
  const queryClient = useQueryClient()
  const fractionDigits = currencyFractionDigits(room.currency)
  const [rows, setRows] = useState<DraftRow[]>([])

  const foreignExpenses = useMemo(
    () =>
      room.expenses.filter((expense) => expense.currency !== room.currency),
    [room.expenses, room.currency]
  )

  useEffect(() => {
    if (!open) return

    const existing = room.fxCalibrationSamples
    if (existing.length > 0) {
      const next = existing.map((sample) =>
        rowFromSample(sample, fractionDigits)
      )
      const seedExpense =
        initialExpenseId &&
        !existing.some((sample) => sample.expenseId === initialExpenseId)
          ? foreignExpenses.find((expense) => expense.id === initialExpenseId)
          : undefined
      if (seedExpense && next.length < MAX_SAMPLES) {
        next.push({
          key: crypto.randomUUID(),
          expenseId: seedExpense.id,
          appCents: unadjustedBaseCents(room, seedExpense),
          bankDigits: "",
        })
      }
      setRows(next)
      return
    }

    const seedExpense = initialExpenseId
      ? foreignExpenses.find((expense) => expense.id === initialExpenseId)
      : undefined

    if (seedExpense) {
      setRows([
        {
          key: crypto.randomUUID(),
          expenseId: seedExpense.id,
          appCents: unadjustedBaseCents(room, seedExpense),
          bankDigits: "",
        },
      ])
      return
    }

    setRows([
      {
        key: crypto.randomUUID(),
        appCents: 0,
        bankDigits: "",
      },
    ])
  }, [open, room, foreignExpenses, fractionDigits, initialExpenseId])

  const previewBps = useMemo(() => {
    const samples = rows
      .map((row) => ({
        appCents: row.appCents,
        bankCents: atmDigitsToCents(row.bankDigits, fractionDigits),
      }))
      .filter((sample) => sample.appCents > 0 && sample.bankCents > 0)
    return computeFxAdjustmentBps(samples)
  }, [rows, fractionDigits])

  const completeCount = rows.filter((row) =>
    isRowFilled(row, fractionDigits)
  ).length

  const lastRow = rows.at(-1)
  const canAddAnother =
    rows.length < MAX_SAMPLES &&
    lastRow !== undefined &&
    isRowFilled(lastRow, fractionDigits)

  const mutation = useMutation({
    mutationFn: (input: CalibrateRoomFxInput) =>
      calibrateRoomFx({ data: input }),
    onSuccess: async (updated) => {
      await queryClient.invalidateQueries({ queryKey: roomKeys.room(room.code) })
      toast.success(
        `Using ${formatAdjustmentPercent(updated.fxAdjustmentBps)} bank match`
      )
      onOpenChange(false)
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Could not save bank match"
      )
    },
  })

  function addRow() {
    if (!canAddAnother) return
    setRows((prev) => [
      ...prev,
      { key: crypto.randomUUID(), appCents: 0, bankDigits: "" },
    ])
  }

  function removeRow(key: string) {
    setRows((prev) => {
      if (prev.length <= 1) return prev
      return prev.filter((row) => row.key !== key)
    })
  }

  function setExpenseForRow(key: string, expenseId: string) {
    const expense = foreignExpenses.find((item) => item.id === expenseId)
    if (!expense) return
    setRows((prev) =>
      prev.map((row) =>
        row.key === key
          ? {
              ...row,
              expenseId: expense.id,
              appCents: unadjustedBaseCents(room, expense),
            }
          : row
      )
    )
  }

  function apply() {
    const samples: FxCalibrationSample[] = []
    for (const row of rows) {
      const bankCents = atmDigitsToCents(row.bankDigits, fractionDigits)
      if (row.appCents <= 0 || bankCents <= 0) continue
      const sample: FxCalibrationSample = {
        appCents: row.appCents,
        bankCents,
      }
      if (row.expenseId) sample.expenseId = row.expenseId
      samples.push(sample)
    }

    if (samples.length === 0) {
      toast.error("Add at least one app amount and bank charge")
      return
    }

    mutation.mutate({ code: room.code, samples })
  }

  const unusedForeign = foreignExpenses.filter(
    (expense) => !rows.some((row) => row.expenseId === expense.id)
  )

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="max-h-[85dvh] overflow-y-auto rounded-t-2xl"
      >
        <div className="mx-auto flex w-full max-w-content flex-col">
          <SheetHeader>
            <SheetTitle>Match my bank charges</SheetTitle>
            <SheetDescription>
              Enter what your card actually charged in {room.currency}. We
              average the difference and apply it to this trip for everyone.
            </SheetDescription>
          </SheetHeader>

          <div className="flex flex-col gap-4 px-6 pb-2">
            <div className="grid grid-cols-[1fr_1fr_auto] items-end gap-2 text-xs font-medium text-muted-foreground">
              <span>App converted</span>
              <span>Bank charged</span>
              <span className="w-10" />
            </div>

            {rows.map((row) => (
              <div
                key={row.key}
                className="grid grid-cols-[1fr_1fr_auto] items-start gap-2"
              >
                <div className="grid gap-1.5">
                  {row.appCents > 0 ? (
                    <p className="flex h-(--control-height) items-center rounded-md border border-border bg-muted/40 px-3 text-sm font-medium tabular-nums">
                      {formatMoney(row.appCents, room.currency)}
                    </p>
                  ) : (
                    <select
                      className="border-input bg-background h-(--control-height) w-full rounded-md border px-2 text-sm"
                      value=""
                      onChange={(event) =>
                        setExpenseForRow(row.key, event.target.value)
                      }
                      aria-label="Pick expense for app amount"
                    >
                      <option value="" disabled>
                        Pick expense…
                      </option>
                      {unusedForeign.map((expense) => (
                        <option key={expense.id} value={expense.id}>
                          {expenseLabel(room, expense)}
                        </option>
                      ))}
                    </select>
                  )}
                  {row.expenseId ? (
                    <p className="truncate text-xs text-muted-foreground">
                      {rowExpenseTitle(row.expenseId, foreignExpenses)}
                    </p>
                  ) : null}
                </div>
                <div className="grid gap-1.5">
                  <Label className="sr-only" htmlFor={`bank-${row.key}`}>
                    Bank charged
                  </Label>
                  <Input
                    id={`bank-${row.key}`}
                    inputMode="numeric"
                    value={formatAtmAmountInput(row.bankDigits, fractionDigits)}
                    onChange={(event) => {
                      const digits = atmDigitsFromInput(event.target.value)
                      setRows((prev) =>
                        prev.map((item) =>
                          item.key === row.key
                            ? { ...item, bankDigits: digits }
                            : item
                        )
                      )
                    }}
                    onFocus={(event) => event.target.select()}
                    placeholder={formatAtmAmount("", fractionDigits)}
                    className="text-right tabular-nums"
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-10 shrink-0"
                  disabled={rows.length <= 1}
                  onClick={() => removeRow(row.key)}
                  aria-label="Remove sample"
                >
                  <HugeiconsIcon
                    icon={Delete02Icon}
                    size={18}
                    strokeWidth={2}
                  />
                </Button>
              </div>
            ))}

            {rows.length < MAX_SAMPLES ? (
              <button
                type="button"
                onClick={addRow}
                disabled={!canAddAnother}
                className="text-left text-sm font-medium text-primary disabled:cursor-not-allowed disabled:opacity-40"
              >
                + Add another
              </button>
            ) : null}

            <p className="text-sm text-muted-foreground">
              {completeCount === 0
                ? "Add a bank charge to preview the markup."
                : `From ${completeCount} charge${completeCount === 1 ? "" : "s"} → ${formatAdjustmentPercent(previewBps)} average`}
            </p>
          </div>

          <SheetFooter>
            <Button
              type="button"
              onClick={apply}
              disabled={mutation.isPending || completeCount === 0}
              className="w-full"
            >
              {mutation.isPending ? "Saving…" : "Apply"}
            </Button>
          </SheetFooter>
        </div>
      </SheetContent>
    </Sheet>
  )
}

/** Display helper for footnotes / toasts. */
export function formatFxAdjustmentLabel(
  bps: number,
  sampleCount: number
): string {
  const countLabel =
    sampleCount > 0
      ? ` (${sampleCount} charge${sampleCount === 1 ? "" : "s"})`
      : ""
  return `Bank match ${formatAdjustmentPercent(bps)}${countLabel}`
}
