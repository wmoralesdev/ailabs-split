import { useEffect, useMemo, useState } from "react"
import { useNavigate } from "@tanstack/react-router"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { HugeiconsIcon } from "@hugeicons/react"
import { ArrowLeft01Icon } from "@hugeicons/core-free-icons"
import { toast } from "sonner"

import { HouseCategoryChips } from "@/components/house/house-category-chips"
import { HouseDateChips } from "@/components/house/house-date-chips"
import { HouseSplitEditor } from "@/components/house/house-split-editor"
import type { HouseSplitMember } from "@/components/house/house-split-editor"
import { MonthStepper } from "@/components/house/month-stepper"
import { MemberPicker } from "@/components/member-picker"
import { TicketPhotoPicker } from "@/components/ticket-photo-picker"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { redistributeAmounts } from "@/lib/amount-split"
import {
  atmDigitsFromInput,
  atmDigitsToCents,
  centsToAtmDigits,
  currencyFractionDigits,
  formatAtmAmount,
  formatAtmAmountInput,
} from "@/lib/atm-amount"
import { compressImageForOcr } from "@/lib/compress-image"
import type { CompressedImage } from "@/lib/compress-image"
import { isHouseCategory, suggestHouseCategory } from "@/lib/house-categories"
import type { HouseCategory } from "@/lib/house-categories"
import { defaultParticipants, dueThisMonth } from "@/lib/house-ledger"
import {
  formatMonth,
  isMovedOutOn,
  localIsoDate,
  monthKey,
} from "@/lib/house-month"
import {
  canAddCharge,
  canEditCharge,
  guestsCantAddChargesMessage,
  onlyAuthorOrOwnerCanEditMessage,
} from "@/lib/house-permissions"
import { extraChargeNote, matchVariableDue } from "@/lib/house-receipt-ocr"
import type { HouseScanDraft, HouseScanKind } from "@/lib/house-receipt-ocr"
import { useOnlineStatus } from "@/lib/online-status"
import { roomKeys } from "@/lib/room-query"
import type { SplitMode } from "@/lib/schemas"
import { equalSplitCents, formatMoney, partsSplitCents } from "@/lib/settle"
import { useRequireSignIn } from "@/lib/use-auth-user"
import {
  addHouseCharge,
  confirmDueCharge,
  updateHouseCharge,
} from "@/server/houses"
import { scanHouseReceipt } from "@/server/ocr"
import type { ExpenseDto, RoomDto } from "@/server/rooms"

function monthFromPaidOn(paidOn: string): string {
  return paidOn.slice(0, 7)
}

export function HouseChargeForm({
  room,
  expense,
  due,
}: {
  room: RoomDto
  expense?: ExpenseDto | null
  due?: { templateId: string; periodMonth: string } | null
}) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const online = useOnlineStatus()
  const requireSignIn = useRequireSignIn()
  const role = room.house?.viewer.role ?? "VISITOR"
  const actorId = room.house?.viewer.memberId ?? null
  const houseMembers = room.house?.members ?? []
  const today = localIsoDate()
  const editing = expense ?? null
  const dueTemplate = due
    ? (room.house?.templates.find((row) => row.id === due.templateId) ?? null)
    : null
  const isAuthor = Boolean(
    editing && actorId && editing.createdByMemberId === actorId
  )
  const allowed = editing ? canEditCharge(role, isAuthor) : canAddCharge(role)

  const defaultPaidBy =
    actorId && houseMembers.some((member) => member.id === actorId)
      ? actorId
      : (houseMembers[0]?.id ?? "")
  const initialPaidOn = editing?.paidOn ?? today
  const initialPeriod =
    editing?.periodMonth ?? due?.periodMonth ?? monthFromPaidOn(initialPaidOn)
  const initialCategory: HouseCategory =
    editing?.category && isHouseCategory(editing.category)
      ? editing.category
      : dueTemplate?.category && isHouseCategory(dueTemplate.category)
        ? dueTemplate.category
        : "GROCERIES"
  const fractionDigits = currencyFractionDigits(room.currency)
  const sourceSplit = editing ?? dueTemplate

  const [title, setTitle] = useState(editing?.title ?? dueTemplate?.title ?? "")
  const [amountDigits, setAmountDigits] = useState(
    editing
      ? centsToAtmDigits(editing.amountCents, fractionDigits)
      : dueTemplate?.amountCents
        ? centsToAtmDigits(dueTemplate.amountCents, fractionDigits)
        : ""
  )
  const [category, setCategory] = useState<HouseCategory>(initialCategory)
  const [categoryTouched, setCategoryTouched] = useState(
    Boolean(editing || dueTemplate)
  )
  const [paidById, setPaidById] = useState(
    editing?.paidById ?? dueTemplate?.paidById ?? defaultPaidBy
  )
  const [paidOn, setPaidOn] = useState(initialPaidOn)
  const [periodMonth, setPeriodMonth] = useState(initialPeriod)
  const [periodTouched, setPeriodTouched] = useState(
    Boolean(editing || dueTemplate)
  )
  const [splitMode, setSplitMode] = useState<SplitMode>(
    sourceSplit?.splitMode === "PARTS" || sourceSplit?.splitMode === "AMOUNT"
      ? sourceSplit.splitMode
      : "EQUAL"
  )
  const [included, setIncluded] = useState<Set<string>>(() => {
    if (editing) return new Set(editing.shares.map((share) => share.memberId))
    if (dueTemplate) {
      return new Set(dueTemplate.shares.map((share) => share.memberId))
    }
    return new Set(
      defaultParticipants(houseMembers, initialPeriod).map(
        (member) => member.id
      )
    )
  })
  const [weights, setWeights] = useState<Record<string, number>>(() => {
    if (sourceSplit?.splitMode === "PARTS") {
      const shares = editing?.shares ?? dueTemplate?.shares ?? []
      return Object.fromEntries(
        houseMembers.map((member) => [
          member.id,
          shares.find((share) => share.memberId === member.id)?.weight ?? 0,
        ])
      )
    }
    return Object.fromEntries(
      houseMembers.map((member) => [member.id, included.has(member.id) ? 1 : 0])
    )
  })
  const [amounts, setAmounts] = useState<Record<string, string>>(() => {
    if (sourceSplit?.splitMode === "AMOUNT") {
      const shares = editing?.shares ?? dueTemplate?.shares ?? []
      return Object.fromEntries(
        shares.map((share) => [
          share.memberId,
          share.amountCents != null
            ? centsToAtmDigits(share.amountCents, fractionDigits)
            : "",
        ])
      )
    }
    return {}
  })
  const [manualIds, setManualIds] = useState<Set<string>>(
    () =>
      new Set(
        editing?.splitMode === "AMOUNT"
          ? editing.shares.map((share) => share.memberId)
          : []
      )
  )
  const [splitError, setSplitError] = useState<string | null>(null)
  const [scanPending, setScanPending] = useState(false)
  const [scanKind, setScanKind] = useState<HouseScanKind | null>(null)
  const [scanNote, setScanNote] = useState<string | null>(null)
  const [pendingReceipt, setPendingReceipt] = useState<{
    base64: string
    mimeType: CompressedImage["mimeType"]
  } | null>(null)
  const [scanDue, setScanDue] = useState<
    { templateId: string; periodMonth: string } | null | undefined
  >(undefined)

  const amountCents = atmDigitsToCents(amountDigits, fractionDigits)
  const activeDue = scanDue === undefined ? due : scanDue
  const activeDueTemplate = activeDue
    ? (room.house?.templates.find((row) => row.id === activeDue.templateId) ??
      null)
    : null

  const splitMembers: HouseSplitMember[] = houseMembers.map((member) => ({
    id: member.id,
    name: member.name,
    group:
      member.isGuest || isMovedOutOn(member.leftOn, today) ? "others" : "main",
  }))

  useEffect(() => {
    if (periodTouched) return
    const next = monthFromPaidOn(paidOn)
    if (next !== periodMonth) setPeriodMonth(next)
  }, [paidOn, periodMonth, periodTouched])

  useEffect(() => {
    if (splitMode !== "AMOUNT") return
    const includedIds = [...included]
    setManualIds((prevManual) => {
      const cleaned = new Set(
        [...prevManual].filter((id) => includedIds.includes(id))
      )
      setAmounts((prevAmounts) =>
        redistributeAmounts({
          totalCents: amountCents,
          includedIds,
          manualIds: cleaned,
          amounts: prevAmounts,
          fractionDigits,
        })
      )
      return cleaned
    })
  }, [splitMode, amountCents, fractionDigits, included])

  const preview = useMemo<Record<string, number>>(() => {
    if (amountCents <= 0) return {}
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

  const mutation = useMutation({
    mutationFn: () => {
      const splits = splitsFromState()
      const payload = {
        code: room.code,
        viewerMemberId: actorId ?? undefined,
        title: title.trim(),
        amountCents,
        category,
        paidById,
        periodMonth,
        paidOn,
        splitMode,
        splits,
      }
      const receipt = pendingReceipt
        ? {
            base64: pendingReceipt.base64,
            mimeType: pendingReceipt.mimeType,
          }
        : undefined
      if (editing) {
        return updateHouseCharge({
          data: { ...payload, expenseId: editing.id, receipt },
        })
      }
      if (activeDue) {
        return confirmDueCharge({
          data: {
            ...payload,
            templateId: activeDue.templateId,
            receipt,
          },
        })
      }
      return addHouseCharge({ data: { ...payload, receipt } })
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: roomKeys.room(room.code),
      })
      await navigate({ to: "/r/$code", params: { code: room.code } })
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Could not save the charge"
      )
    },
  })

  function splitsFromState(): Array<{
    memberId: string
    weight?: number
    amountCents?: number
  }> {
    if (splitMode === "PARTS") {
      return houseMembers
        .filter((member) => (weights[member.id] ?? 0) > 0)
        .map((member) => ({
          memberId: member.id,
          weight: weights[member.id] ?? 0,
        }))
    }
    if (splitMode === "AMOUNT") {
      return [...included].map((memberId) => ({
        memberId,
        amountCents: atmDigitsToCents(amounts[memberId] ?? "", fractionDigits),
      }))
    }
    return [...included].map((memberId) => ({ memberId }))
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
  }

  function onEveryone() {
    setSplitError(null)
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
  }

  function onAmountShare(memberId: string, digits: string) {
    setSplitError(null)
    const nextManual = new Set(manualIds)
    nextManual.add(memberId)
    setManualIds(nextManual)
    setAmounts((prev) =>
      redistributeAmounts({
        totalCents: amountCents,
        includedIds: [...included],
        manualIds: nextManual,
        amounts: { ...prev, [memberId]: digits },
        fractionDigits,
      })
    )
  }

  function applyDraft(draft: HouseScanDraft, photo: CompressedImage | null) {
    setTitle(draft.title)
    if (draft.amountCents) {
      setAmountDigits(centsToAtmDigits(draft.amountCents, fractionDigits))
    }
    setCategory(draft.category)
    setCategoryTouched(true)
    setScanKind(draft.kind)
    setScanNote(extraChargeNote(draft, room.currency))
    setPendingReceipt(
      draft.savePhoto && photo
        ? { base64: photo.base64, mimeType: photo.mimeType }
        : null
    )
    if (draft.periodMonth) {
      setPeriodTouched(true)
      setPeriodMonth(draft.periodMonth)
      setIncluded(
        new Set(
          defaultParticipants(houseMembers, draft.periodMonth).map(
            (member) => member.id
          )
        )
      )
    }
    if (editing) return
    const match = matchVariableDue(
      draft.category,
      draft.periodMonth,
      dueThisMonth(
        room.house?.templates ?? [],
        room.house?.occurrences ?? [],
        monthKey()
      )
    )
    setScanDue(
      match
        ? { templateId: match.templateId, periodMonth: match.periodMonth }
        : null
    )
  }

  async function onScan(file: File | null) {
    if (!file) return
    if (!online) {
      toast.error("Scanning needs a connection")
      return
    }
    setScanPending(true)
    try {
      const compressed = await compressImageForOcr(file)
      const draft = await scanHouseReceipt({
        data: {
          code: room.code,
          imageBase64: compressed.base64,
          mimeType: compressed.mimeType,
        },
      })
      if (!draft.title && !draft.amountCents) {
        toast.error("Could not read that photo. Try a clearer crop.")
        return
      }
      applyDraft(draft, compressed)
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not read receipt"
      )
    } finally {
      setScanPending(false)
    }
  }

  function submit() {
    if (!allowed) {
      toast.error(
        editing
          ? onlyAuthorOrOwnerCanEditMessage(editing.paidByName)
          : guestsCantAddChargesMessage()
      )
      return
    }
    if (amountCents <= 0) {
      toast.error("Enter a valid amount")
      return
    }
    if (!title.trim()) {
      toast.error("What was it?")
      return
    }
    const splits = splitsFromState()
    if (splits.length === 0) {
      setSplitError("Pick at least one person")
      return
    }
    if (splitMode === "AMOUNT") {
      const sum = splits.reduce(
        (total, split) => total + (split.amountCents ?? 0),
        0
      )
      if (sum !== amountCents) {
        setSplitError(
          `Amounts add up to ${formatMoney(sum, room.currency)}, need ${formatMoney(amountCents, room.currency)}`
        )
        return
      }
    }
    mutation.mutate()
  }

  if (!allowed && !editing) {
    return (
      <main className="page-gutter mx-auto max-w-content pt-6">
        <p className="text-[15px] text-muted-foreground">
          {guestsCantAddChargesMessage()}
        </p>
      </main>
    )
  }

  return (
    <main className="page-gutter mx-auto max-w-content pt-2 pb-8">
      <div className="flex items-center gap-1">
        <button
          type="button"
          className="icon-hit -ml-3 size-11"
          onClick={() =>
            void navigate({ to: "/r/$code", params: { code: room.code } })
          }
          aria-label="Back to house"
        >
          <HugeiconsIcon icon={ArrowLeft01Icon} size={20} strokeWidth={2} />
        </button>
        <h1 className="font-display text-[22px] font-bold tracking-tight">
          {editing ? "Edit charge" : "Add charge"}
        </h1>
      </div>

      <form
        className="mt-4 flex flex-col gap-5"
        onSubmit={(event) => {
          event.preventDefault()
          submit()
        }}
      >
        {allowed ? (
          <TicketPhotoPicker
            pending={scanPending}
            onFile={(file) => void onScan(file)}
            beforePick={requireSignIn}
            pendingLabel="Reading receipt…"
            actionLabel="Scan receipt"
            title="Receipt (optional)"
            hint="A utility bill or a grocery ticket."
            dropHint="Or drop or paste a receipt photo"
            dropOverlay="Drop receipt photo"
          />
        ) : null}

        {activeDue && activeDueTemplate ? (
          <p
            className="text-[13px] text-muted-foreground"
            data-testid="house-scan-due-note"
          >
            This fills {activeDueTemplate.title} for{" "}
            {formatMonth(activeDue.periodMonth)}.
          </p>
        ) : null}

        {scanNote ? (
          <p
            className="text-[13px] text-muted-foreground"
            data-testid="house-scan-extra-note"
          >
            {scanNote}
          </p>
        ) : null}

        {scanKind === "GROCERY" ? (
          <p className="text-[13px] text-muted-foreground">
            Grocery tickets keep the title and total. The photo is not saved.
          </p>
        ) : pendingReceipt ? (
          <p className="text-[13px] text-muted-foreground">
            Receipt photo will be saved with this charge.
          </p>
        ) : editing?.hasReceipt ? (
          <p className="text-[13px] text-muted-foreground">
            This charge already has a receipt photo.
          </p>
        ) : null}

        <div className="grid gap-2">
          <Label htmlFor="house-charge-amount">Amount</Label>
          <Input
            id="house-charge-amount"
            inputMode="numeric"
            autoComplete="off"
            value={formatAtmAmountInput(amountDigits, fractionDigits)}
            onChange={(event) =>
              setAmountDigits(atmDigitsFromInput(event.target.value))
            }
            onFocus={(event) => event.target.select()}
            placeholder={formatAtmAmount("", fractionDigits)}
            className="text-right font-display text-xl tracking-tight tabular-nums"
          />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="house-charge-title">What was it?</Label>
          <Input
            id="house-charge-title"
            value={title}
            onChange={(event) => {
              const next = event.target.value
              setTitle(next)
              if (categoryTouched) return
              setCategory(suggestHouseCategory(next) ?? initialCategory)
            }}
            placeholder="Rent, Super Selectos…"
            autoComplete="off"
          />
        </div>

        <div className="grid gap-2">
          <Label>Category</Label>
          <HouseCategoryChips
            value={isHouseCategory(category) ? category : "OTHER"}
            onChange={(next) => {
              setCategory(next)
              setCategoryTouched(true)
            }}
          />
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
          <Label htmlFor="house-charge-period">For</Label>
          <MonthStepper
            value={periodMonth}
            onChange={(next) => {
              setPeriodTouched(true)
              setPeriodMonth(next)
            }}
            inputId="house-charge-period"
          />
        </div>

        <div className="grid gap-2">
          <Label>Paid on</Label>
          <HouseDateChips
            label="Paid on"
            value={paidOn}
            onChange={(next) => {
              if (next) setPaidOn(next)
            }}
          />
        </div>

        <HouseSplitEditor
          members={splitMembers}
          splitMode={splitMode}
          onSplitModeChange={(mode) => {
            setSplitMode(mode)
            setSplitError(null)
          }}
          included={included}
          onToggle={toggleMember}
          onEveryone={onEveryone}
          weights={weights}
          onWeight={(memberId, weight) => {
            setSplitError(null)
            setWeights((prev) => ({
              ...prev,
              [memberId]: Math.max(0, weight),
            }))
          }}
          amounts={amounts}
          onAmount={onAmountShare}
          preview={preview}
          fractionDigits={fractionDigits}
          currency={room.currency}
          amountCents={amountCents}
          error={splitError}
        />

        <Button
          type="submit"
          className="cta-lg"
          disabled={mutation.isPending || !allowed}
        >
          {mutation.isPending ? "Saving…" : editing ? "Save" : "Add charge"}
        </Button>
      </form>
    </main>
  )
}
