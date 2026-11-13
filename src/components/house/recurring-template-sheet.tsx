import { useEffect, useMemo, useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

import { DueDayPicker } from "@/components/house/due-day-picker"
import { HouseCategoryChips } from "@/components/house/house-category-chips"
import { HouseSplitEditor } from "@/components/house/house-split-editor"
import type { HouseSplitMember } from "@/components/house/house-split-editor"
import { MonthStepper } from "@/components/house/month-stepper"
import { MemberPicker } from "@/components/member-picker"
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { redistributeAmounts } from "@/lib/amount-split"
import {
  atmDigitsFromInput,
  atmDigitsToCents,
  centsToAtmDigits,
  currencyFractionDigits,
  formatAtmAmountInput,
} from "@/lib/atm-amount"
import { isHouseCategory } from "@/lib/house-categories"
import type { HouseCategory } from "@/lib/house-categories"
import { defaultParticipants } from "@/lib/house-ledger"
import { isMovedOutOn, localIsoDate, monthKey } from "@/lib/house-month"
import { roomKeys } from "@/lib/room-query"
import type { SplitMode } from "@/lib/schemas"
import { equalSplitCents, partsSplitCents } from "@/lib/settle"
import {
  archiveRecurringTemplate,
  saveRecurringTemplate,
} from "@/server/houses"
import type { RecurringTemplateDto } from "@/lib/house-types"
import type { RoomDto } from "@/server/rooms"

export function RecurringTemplateSheet({
  room,
  template,
  open,
  onOpenChange,
}: {
  room: RoomDto
  template: RecurringTemplateDto | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const queryClient = useQueryClient()
  const actorId = room.house?.viewer.memberId ?? null
  const houseMembers = room.house?.members ?? []
  const today = localIsoDate()
  const fractionDigits = currencyFractionDigits(room.currency)
  const editing = template

  const [kind, setKind] = useState<"FIXED" | "VARIABLE">(
    editing?.kind ?? "FIXED"
  )
  const [title, setTitle] = useState(editing?.title ?? "")
  const [amountDigits, setAmountDigits] = useState(
    editing?.amountCents
      ? centsToAtmDigits(editing.amountCents, fractionDigits)
      : ""
  )
  const [category, setCategory] = useState<HouseCategory>(
    editing?.category && isHouseCategory(editing.category)
      ? editing.category
      : "RENT"
  )
  const fallbackPaidBy = actorId || houseMembers.at(0)?.id || ""
  const [paidById, setPaidById] = useState(
    editing ? editing.paidById : fallbackPaidBy
  )
  const [dueDay, setDueDay] = useState(editing?.dueDay ?? 1)
  const [startMonth, setStartMonth] = useState(
    editing?.startMonth ?? monthKey()
  )
  const [splitMode, setSplitMode] = useState<SplitMode>(
    editing?.splitMode === "PARTS" || editing?.splitMode === "AMOUNT"
      ? editing.splitMode
      : "EQUAL"
  )
  const [included, setIncluded] = useState<Set<string>>(() => {
    if (editing) return new Set(editing.shares.map((share) => share.memberId))
    return new Set(
      defaultParticipants(houseMembers, startMonth).map((member) => member.id)
    )
  })
  const [weights, setWeights] = useState<Record<string, number>>(() =>
    Object.fromEntries(
      houseMembers.map((member) => [
        member.id,
        editing?.shares.find((share) => share.memberId === member.id)?.weight ??
          (included.has(member.id) ? 1 : 0),
      ])
    )
  )
  const [amounts, setAmounts] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      (editing?.shares ?? []).map((share) => [
        share.memberId,
        share.amountCents != null
          ? centsToAtmDigits(share.amountCents, fractionDigits)
          : "",
      ])
    )
  )
  const [manualIds, setManualIds] = useState<Set<string>>(new Set())
  const [splitError, setSplitError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setKind(editing?.kind ?? "FIXED")
    setTitle(editing?.title ?? "")
    setAmountDigits(
      editing?.amountCents
        ? centsToAtmDigits(editing.amountCents, fractionDigits)
        : ""
    )
    setCategory(
      editing?.category && isHouseCategory(editing.category)
        ? editing.category
        : "RENT"
    )
    setPaidById(editing ? editing.paidById : fallbackPaidBy)
    setDueDay(editing?.dueDay ?? 1)
    setStartMonth(editing?.startMonth ?? monthKey())
    setSplitMode(
      editing?.splitMode === "PARTS" || editing?.splitMode === "AMOUNT"
        ? editing.splitMode
        : "EQUAL"
    )
    const nextIncluded = editing
      ? new Set(editing.shares.map((share) => share.memberId))
      : new Set(
          defaultParticipants(houseMembers, monthKey()).map(
            (member) => member.id
          )
        )
    setIncluded(nextIncluded)
    setWeights(
      Object.fromEntries(
        houseMembers.map((member) => [
          member.id,
          editing?.shares.find((share) => share.memberId === member.id)
            ?.weight ?? (nextIncluded.has(member.id) ? 1 : 0),
        ])
      )
    )
    setAmounts(
      Object.fromEntries(
        (editing?.shares ?? []).map((share) => [
          share.memberId,
          share.amountCents != null
            ? centsToAtmDigits(share.amountCents, fractionDigits)
            : "",
        ])
      )
    )
    setManualIds(new Set())
    setSplitError(null)
  }, [open, editing?.id, actorId, fractionDigits, houseMembers])

  const amountCents =
    kind === "VARIABLE" ? null : atmDigitsToCents(amountDigits, fractionDigits)
  const splitMembers: HouseSplitMember[] = houseMembers.map((member) => ({
    id: member.id,
    name: member.name,
    group:
      member.isGuest || isMovedOutOn(member.leftOn, today) ? "others" : "main",
  }))

  const preview = useMemo<Record<string, number>>(() => {
    if (!amountCents || amountCents <= 0) return {}
    if (splitMode === "EQUAL") {
      const ids = [...included]
      if (ids.length === 0) return {}
      return Object.fromEntries(
        equalSplitCents(amountCents, ids).map((share) => [
          share.memberId,
          share.amountCents,
        ])
      )
    }
    if (splitMode === "PARTS") {
      const positive = houseMembers
        .filter((member) => (weights[member.id] ?? 0) > 0)
        .map((member) => ({
          memberId: member.id,
          weight: weights[member.id] ?? 0,
        }))
      if (positive.length === 0) return {}
      return Object.fromEntries(
        partsSplitCents(amountCents, positive).map((share) => [
          share.memberId,
          share.amountCents,
        ])
      )
    }
    return Object.fromEntries(
      [...included].map((id) => [
        id,
        atmDigitsToCents(amounts[id] ?? "", fractionDigits),
      ])
    )
  }, [
    amountCents,
    splitMode,
    included,
    weights,
    amounts,
    houseMembers,
    fractionDigits,
  ])

  const saveMutation = useMutation({
    mutationFn: () => {
      const splits = splitsFromState()
      return saveRecurringTemplate({
        data: {
          code: room.code,
          viewerMemberId: actorId ?? undefined,
          templateId: editing?.id,
          title: title.trim(),
          category,
          kind,
          amountCents: kind === "VARIABLE" ? null : amountCents,
          dueDay,
          paidById,
          splitMode:
            kind === "VARIABLE" && splitMode === "AMOUNT" ? "EQUAL" : splitMode,
          startMonth,
          splits,
        },
      })
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: roomKeys.room(room.code),
      })
      onOpenChange(false)
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Could not save recurring"
      )
    },
  })

  const archiveMutation = useMutation({
    mutationFn: () => {
      if (!editing) throw new Error("Template not found")
      return archiveRecurringTemplate({
        data: {
          code: room.code,
          viewerMemberId: actorId ?? undefined,
          templateId: editing.id,
        },
      })
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: roomKeys.room(room.code),
      })
      onOpenChange(false)
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Could not archive")
    },
  })

  function splitsFromState(): Array<{
    memberId: string
    weight?: number
    amountCents?: number
  }> {
    const mode =
      kind === "VARIABLE" && splitMode === "AMOUNT" ? "EQUAL" : splitMode
    if (mode === "PARTS") {
      return houseMembers
        .filter((member) => (weights[member.id] ?? 0) > 0)
        .map((member) => ({
          memberId: member.id,
          weight: weights[member.id] ?? 0,
        }))
    }
    if (mode === "AMOUNT") {
      return [...included].map((memberId) => ({
        memberId,
        amountCents: atmDigitsToCents(amounts[memberId] ?? "", fractionDigits),
      }))
    }
    return [...included].map((memberId) => ({ memberId }))
  }

  function submit() {
    if (!title.trim()) {
      toast.error("What was it?")
      return
    }
    if (kind === "FIXED" && (!amountCents || amountCents <= 0)) {
      toast.error("Enter a valid amount")
      return
    }
    const splits = splitsFromState()
    if (splits.length === 0) {
      setSplitError("Pick at least one person")
      return
    }
    saveMutation.mutate()
  }

  const amountInputMode =
    kind === "FIXED" ? splitMode : splitMode === "AMOUNT" ? "EQUAL" : splitMode

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="max-h-[92dvh] overflow-y-auto rounded-t-2xl"
      >
        <div className="mx-auto flex w-full max-w-content flex-col">
          <SheetHeader>
            <SheetTitle>
              {editing ? "Edit recurring" : "Add recurring"}
            </SheetTitle>
            <SheetDescription>
              Templates never post on their own. Confirm each month from Due.
            </SheetDescription>
          </SheetHeader>

          <form
            className="flex flex-col gap-4 px-4 pb-2"
            onSubmit={(event) => {
              event.preventDefault()
              submit()
            }}
          >
            <Tabs
              value={kind}
              onValueChange={(value) =>
                setKind(value === "VARIABLE" ? "VARIABLE" : "FIXED")
              }
            >
              <TabsList className="segmented w-full grid-cols-2">
                <TabsTrigger value="FIXED" className="segmented-item">
                  Fixed
                </TabsTrigger>
                <TabsTrigger value="VARIABLE" className="segmented-item">
                  Variable
                </TabsTrigger>
              </TabsList>
            </Tabs>
            {kind === "VARIABLE" ? (
              <p className="text-[13px] text-muted-foreground">
                Amount changes every month
              </p>
            ) : null}

            <div className="grid gap-2">
              <Label htmlFor="house-recurring-title">What was it?</Label>
              <Input
                id="house-recurring-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Rent, CAESS…"
                autoComplete="off"
              />
            </div>

            {kind === "FIXED" ? (
              <div className="grid gap-2">
                <Label htmlFor="house-recurring-amount">Amount</Label>
                <Input
                  id="house-recurring-amount"
                  inputMode="numeric"
                  autoComplete="off"
                  value={formatAtmAmountInput(amountDigits, fractionDigits)}
                  onChange={(event) =>
                    setAmountDigits(atmDigitsFromInput(event.target.value))
                  }
                  onFocus={(event) => event.target.select()}
                  className="text-right font-display text-xl tabular-nums"
                />
              </div>
            ) : null}

            <div className="grid gap-2">
              <Label>Category</Label>
              <HouseCategoryChips value={category} onChange={setCategory} />
            </div>

            <div className="grid gap-2">
              <Label>Paid by</Label>
              <MemberPicker
                members={houseMembers}
                value={paidById}
                onChange={setPaidById}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="house-recurring-due-day">Due day</Label>
              <DueDayPicker
                value={dueDay}
                onChange={setDueDay}
                inputId="house-recurring-due-day"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="house-recurring-starts">Starts</Label>
              <MonthStepper
                value={startMonth}
                onChange={setStartMonth}
                label="Starts"
                inputId="house-recurring-starts"
              />
            </div>

            <HouseSplitEditor
              members={splitMembers}
              splitMode={amountInputMode}
              onSplitModeChange={(mode) => {
                setSplitMode(mode)
                setSplitError(null)
              }}
              included={included}
              onToggle={(memberId) => {
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
              }}
              onEveryone={() => {
                const mainIds = splitMembers
                  .filter((member) => member.group === "main")
                  .map((member) => member.id)
                const allOn = mainIds.every((id) => included.has(id))
                setIncluded((prev) => {
                  const next = new Set(prev)
                  if (allOn) {
                    for (const id of mainIds) next.delete(id)
                    if (next.size === 0 && mainIds[0]) next.add(mainIds[0])
                  } else {
                    for (const id of mainIds) next.add(id)
                  }
                  return next
                })
              }}
              weights={weights}
              onWeight={(memberId, weight) => {
                setSplitError(null)
                setWeights((prev) => ({
                  ...prev,
                  [memberId]: Math.max(0, weight),
                }))
              }}
              amounts={amounts}
              onAmount={(memberId, digits) => {
                setSplitError(null)
                const nextManual = new Set(manualIds)
                nextManual.add(memberId)
                setManualIds(nextManual)
                setAmounts((prev) =>
                  redistributeAmounts({
                    totalCents: amountCents ?? 0,
                    includedIds: [...included],
                    manualIds: nextManual,
                    amounts: { ...prev, [memberId]: digits },
                    fractionDigits,
                  })
                )
              }}
              preview={preview}
              fractionDigits={fractionDigits}
              currency={room.currency}
              amountCents={amountCents ?? 0}
              error={splitError}
            />

            <SheetFooter>
              <Button
                type="submit"
                className="cta-lg"
                disabled={saveMutation.isPending}
              >
                {saveMutation.isPending ? "Saving…" : "Save"}
              </Button>
              {editing && !editing.archivedAt ? (
                <button
                  type="button"
                  className="text-[15px] font-medium text-destructive"
                  disabled={archiveMutation.isPending}
                  onClick={() => archiveMutation.mutate()}
                >
                  Archive
                </button>
              ) : null}
            </SheetFooter>
          </form>
        </div>
      </SheetContent>
    </Sheet>
  )
}
