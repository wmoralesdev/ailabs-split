import { useMemo, useRef, useState } from "react"
import { useNavigate } from "@tanstack/react-router"
import {
  onlineManager,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query"
import { toast } from "sonner"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Add01Icon,
  ArrowLeft01Icon,
  MinusSignIcon,
} from "@hugeicons/core-free-icons"

import { ItemSplitSheet } from "@/components/dinner/item-split-sheet"
import { OcrReview } from "@/components/dinner/ocr-review"
import { TipFeesSection } from "@/components/dinner/tip-fees-section"
import { MemberPicker } from "@/components/member-picker"
import { TicketPhotoPicker } from "@/components/ticket-photo-picker"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { itemSplitSummary } from "@/lib/dinner-labels"
import {
  assignRestToMember,
  computedTotalWithoutPrintedForce,
  computeDinnerSplit,
  emptyCheckPayload,
  splitLineItem,
  splitLineItemShares,
  withForcedPrintedTotal,
} from "@/lib/dinner-split"
import type { CheckPayload, LineItem } from "@/lib/dinner-split"
import {
  atmDigitsFromInput,
  atmDigitsToCents,
  currencyFractionDigits,
  formatAtmAmount,
  formatAtmAmountInput,
} from "@/lib/atm-amount"
import { compressImageForOcr } from "@/lib/compress-image"
import { useOnlineStatus } from "@/lib/online-status"
import { checkPayloadFromOcr } from "@/lib/receipt-ocr"
import { roomKeys } from "@/lib/room-query"
import { formatMoney } from "@/lib/settle"
import { cn } from "@/lib/utils"
import { scanReceipt } from "@/server/ocr"
import {
  confirmCheck,
  deleteCheck,
  revertCheck,
  upsertCheck,
} from "@/server/checks"
import type { CheckDto, RoomDto } from "@/server/rooms"

type Phase = "review" | "assign"

export function CheckEditor({
  room,
  selfMemberId,
  check,
}: {
  room: RoomDto
  selfMemberId: string
  check: CheckDto | null
  startWithScan?: boolean
}) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const isOnline = useOnlineStatus()
  const fd = currencyFractionDigits(room.currency)

  const [checkId, setCheckId] = useState<string | null>(check?.id ?? null)
  const [merchant, setMerchant] = useState(check?.merchant ?? "")
  const [isPrecuenta, setIsPrecuenta] = useState(check?.isPrecuenta ?? false)
  const [paidById, setPaidById] = useState(
    check?.paidById ??
      (room.members.some((member) => member.id === selfMemberId)
        ? selfMemberId
        : (room.members[0]?.id ?? ""))
  )
  const [payload, setPayload] = useState<CheckPayload>(
    check?.payload ?? emptyCheckPayload()
  )
  const [phase, setPhase] = useState<Phase>("assign")
  const itemNameRef = useRef<HTMLInputElement>(null)
  const [ocrPending, setOcrPending] = useState(false)
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null)
  const [newName, setNewName] = useState("")
  const [newQty, setNewQty] = useState(1)
  const [newAmount, setNewAmount] = useState("")

  const nameById = useMemo(
    () => new Map(room.members.map((member) => [member.id, member.name])),
    [room.members]
  )
  const split = useMemo(
    () =>
      computeDinnerSplit({
        items: payload.items,
        adjustments: payload.adjustments,
        tip: payload.tip,
        notedTotalCents: payload.notedTotalCents,
      }),
    [payload]
  )
  const selectedItem =
    payload.items.find((item) => item.id === selectedItemId) ?? null
  const selectedIndex = payload.items.findIndex(
    (item) => item.id === selectedItemId
  )
  const previousItem =
    selectedIndex > 0 ? (payload.items[selectedIndex - 1] ?? null) : null

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: roomKeys.room(room.code) })

  const saveMutation = useMutation({
    mutationFn: async (confirmAfter: boolean) => {
      const saved = await upsertCheck({
        data: {
          code: room.code,
          checkId: checkId ?? undefined,
          merchant: merchant.trim() || "Dinner",
          paidById,
          isPrecuenta,
          payload,
        },
      })
      setCheckId(saved.id)
      if (confirmAfter) {
        return await confirmCheck({
          data: { code: room.code, checkId: saved.id },
        })
      }
      return saved
    },
    onSuccess: async (saved, confirmAfter) => {
      await invalidate()
      if (confirmAfter) {
        toast.success("Check confirmed")
        await navigate({ to: "/r/$code", params: { code: room.code } })
        return
      }
      toast.success("Draft saved")
      if (!check) {
        await navigate({
          to: "/r/$code/check/$checkId",
          params: { code: room.code, checkId: saved.id },
          replace: true,
        })
      }
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Could not save")
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!checkId) return
      await deleteCheck({ data: { code: room.code, checkId } })
    },
    onSuccess: async () => {
      await invalidate()
      toast.success("Check deleted")
      await navigate({ to: "/r/$code", params: { code: room.code } })
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Could not delete")
    },
  })

  const revertMutation = useMutation({
    mutationFn: async () => {
      if (!checkId) return
      return await revertCheck({ data: { code: room.code, checkId } })
    },
    onSuccess: async () => {
      await invalidate()
      toast.success("Moved back to draft")
    },
  })

  async function onScan(file: File | null) {
    if (!file) return
    if (!onlineManager.isOnline()) {
      toast.error("Scanning needs a connection")
      return
    }
    setOcrPending(true)
    try {
      const compressed = await compressImageForOcr(file)
      const draft = await scanReceipt({
        data: {
          code: room.code,
          imageBase64: compressed.base64,
          mimeType: compressed.mimeType,
          mode: "dinner",
        },
      })
      const next = draft.check
        ? checkPayloadFromOcr(draft.check)
        : emptyCheckPayload()
      setPayload(next)
      if (draft.check?.merchant) setMerchant(draft.check.merchant)
      else if (draft.title) setMerchant(draft.title)
      if (draft.check?.isPrecuenta) setIsPrecuenta(true)
      setPhase(next.items.length > 0 ? "review" : "assign")
      toast.success("Ticket scanned")
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not read ticket"
      )
    } finally {
      setOcrPending(false)
    }
  }

  function addManualItem() {
    const amountCents = atmDigitsToCents(newAmount, fd)
    if (!newName.trim() || amountCents <= 0) {
      toast.error("Add a name and amount")
      return
    }
    const quantity = Math.max(1, newQty)
    const item: LineItem = {
      id: crypto.randomUUID(),
      name: newName.trim(),
      quantity,
      unitPriceCents: Math.round(amountCents / quantity),
      amountCents,
      modifiers: [],
      source: "MANUAL",
      confidence: null,
      split:
        room.members.length === 1
          ? { mode: "EQUAL", memberIds: [room.members[0].id] }
          : { mode: "UNASSIGNED" },
    }
    setPayload((prev) => ({ ...prev, items: [...prev.items, item] }))
    setNewName("")
    setNewQty(1)
    setNewAmount("")
    setPhase("assign")
    itemNameRef.current?.focus()
  }

  function setItemSplit(itemId: string, memberIds: string[]) {
    setPayload((prev) => ({
      ...prev,
      items: prev.items.map((item) =>
        item.id === itemId
          ? {
              ...item,
              split:
                memberIds.length === 0
                  ? { mode: "UNASSIGNED" }
                  : { mode: "EQUAL", memberIds },
            }
          : item
      ),
    }))
  }

  function toggleItemMember(item: LineItem, memberId: string) {
    const current = item.split.mode === "EQUAL" ? item.split.memberIds : []
    setItemSplit(
      item.id,
      current.includes(memberId)
        ? current.filter((id) => id !== memberId)
        : [...current, memberId]
    )
  }

  function forcePrintedTotal() {
    const without = computedTotalWithoutPrintedForce(payload)
    setPayload((prev) => ({
      ...prev,
      adjustments: withForcedPrintedTotal(
        prev.adjustments,
        without,
        prev.notedTotalCents,
        crypto.randomUUID()
      ),
    }))
  }

  const unassignedCount = payload.items.filter(
    (item) => item.split.mode === "UNASSIGNED"
  ).length
  const backHome = () =>
    void navigate({ to: "/r/$code", params: { code: room.code } })

  if (phase === "review") {
    return (
      <main className="page-gutter mx-auto flex min-h-full max-w-content flex-col pt-2">
        <EditorHeader title="Check the ticket" onBack={backHome} />
        <div className="mt-5 flex flex-col gap-5">
          <div className="grid gap-2">
            <Label htmlFor="merchant">Place</Label>
            <Input
              id="merchant"
              value={merchant}
              onChange={(event) => setMerchant(event.target.value)}
            />
          </div>
          {isPrecuenta ? (
            <p className="text-sm text-muted-foreground">Marked as precuenta</p>
          ) : null}
          <OcrReview
            payload={payload}
            currency={room.currency}
            onChange={setPayload}
          />
        </div>
        <div className="action-bar mt-auto">
          <Button
            type="button"
            className="cta-lg"
            onClick={() => setPhase("assign")}
          >
            Continue to assign
          </Button>
        </div>
      </main>
    )
  }

  return (
    <main className="page-gutter mx-auto flex min-h-full max-w-content flex-col pt-2">
      <EditorHeader
        title={checkId ? merchant || "Check" : "New check"}
        onBack={backHome}
      />

      <div className="mt-3 flex flex-col gap-6 pb-6">
        {payload.items.length === 0 && isOnline ? (
          <TicketPhotoPicker
            pending={ocrPending}
            onFile={(file) => void onScan(file)}
          />
        ) : null}
        {payload.items.length === 0 && !isOnline ? (
          <p className="text-[15px] text-muted-foreground">
            Scanning needs a connection. Type the items in below.
          </p>
        ) : null}

        <div className="grid gap-1.5">
          <Label htmlFor="merchant-assign">Place</Label>
          <Input
            id="merchant-assign"
            value={merchant}
            onChange={(event) => setMerchant(event.target.value)}
            placeholder="Celeste Imperio"
            enterKeyHint="next"
          />
        </div>

        {room.members.length > 1 ? (
          <div className="grid gap-2">
            <Label>Paid by</Label>
            <MemberPicker
              members={room.members}
              value={paidById}
              onChange={setPaidById}
            />
          </div>
        ) : null}

        <section aria-labelledby="items-heading">
          <div className="flex items-baseline justify-between gap-3">
            <h2
              id="items-heading"
              className="font-display text-lg font-semibold"
            >
              Items
            </h2>
            {unassignedCount > 0 && room.members.length > 1 ? (
              <button
                type="button"
                className="min-h-11 text-[15px] font-medium text-primary"
                onClick={() =>
                  setPayload((prev) => ({
                    ...prev,
                    items: assignRestToMember(prev.items, selfMemberId),
                  }))
                }
              >
                Assign rest to me
              </button>
            ) : null}
          </div>
          {room.members.length > 1 && payload.items.length > 0 ? (
            <p className="text-[13px] leading-snug text-muted-foreground">
              Tap who shared each item. Tap the item for parts or amounts.
            </p>
          ) : null}

          {payload.items.length > 0 ? (
            <ul className="group-list mt-2.5">
              {payload.items.map((item) => (
                <ItemCard
                  key={item.id}
                  item={item}
                  members={room.members}
                  currency={room.currency}
                  nameById={nameById}
                  onOpen={() => setSelectedItemId(item.id)}
                  onToggle={(memberId) => toggleItemMember(item, memberId)}
                  onEveryone={() =>
                    setItemSplit(
                      item.id,
                      room.members.map((member) => member.id)
                    )
                  }
                />
              ))}
            </ul>
          ) : null}

          <form
            className="surface mt-2.5 flex flex-col gap-3 p-3.5"
            onSubmit={(event) => {
              event.preventDefault()
              addManualItem()
            }}
          >
            <div className="grid gap-1.5">
              <Label htmlFor="new-item-name">Item</Label>
              <Input
                ref={itemNameRef}
                id="new-item-name"
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
                placeholder="Pizza Margherita"
                autoComplete="off"
                enterKeyHint="next"
              />
            </div>
            <div className="grid grid-cols-[auto_1fr] items-end gap-2.5">
              <div className="grid gap-1.5">
                <Label htmlFor="new-item-qty">Qty</Label>
                <div className="flex h-(--control-height) items-center rounded-xl bg-muted">
                  <button
                    type="button"
                    className="inline-flex h-full w-10 items-center justify-center rounded-l-xl text-muted-foreground disabled:opacity-40"
                    onClick={() => setNewQty((value) => Math.max(1, value - 1))}
                    disabled={newQty <= 1}
                    aria-label="One fewer"
                  >
                    <HugeiconsIcon
                      icon={MinusSignIcon}
                      size={16}
                      strokeWidth={2}
                    />
                  </button>
                  <input
                    id="new-item-qty"
                    inputMode="numeric"
                    value={String(newQty)}
                    onChange={(event) =>
                      setNewQty(
                        Math.max(
                          1,
                          Number.parseInt(event.target.value, 10) || 1
                        )
                      )
                    }
                    onFocus={(event) => event.target.select()}
                    className="w-7 bg-transparent text-center text-base font-semibold tabular-nums outline-none"
                  />
                  <button
                    type="button"
                    className="inline-flex h-full w-10 items-center justify-center rounded-r-xl text-muted-foreground"
                    onClick={() => setNewQty((value) => value + 1)}
                    aria-label="One more"
                  >
                    <HugeiconsIcon icon={Add01Icon} size={16} strokeWidth={2} />
                  </button>
                </div>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="new-item-amount">Price</Label>
                <Input
                  id="new-item-amount"
                  inputMode="numeric"
                  enterKeyHint="done"
                  value={formatAtmAmountInput(newAmount, fd)}
                  onChange={(event) =>
                    setNewAmount(atmDigitsFromInput(event.target.value))
                  }
                  onFocus={(event) => event.target.select()}
                  placeholder={formatAtmAmount("", fd)}
                  className="text-right tabular-nums"
                />
              </div>
            </div>
            <Button
              type="submit"
              variant="secondary"
              className="w-full bg-muted font-semibold text-primary"
              disabled={!newName.trim() || atmDigitsToCents(newAmount, fd) <= 0}
            >
              <HugeiconsIcon icon={Add01Icon} size={16} strokeWidth={2} />
              Add item
            </Button>
          </form>
        </section>

        <TipFeesSection
          tip={payload.tip}
          adjustments={payload.adjustments}
          itemSubtotalCents={split.itemSubtotalCents}
          currency={room.currency}
          fractionDigits={fd}
          onChangeTip={(nextTip) =>
            setPayload((prev) => ({ ...prev, tip: nextTip }))
          }
          onChangeAdjustments={(nextAdjustments) =>
            setPayload((prev) => ({ ...prev, adjustments: nextAdjustments }))
          }
        />

        <Totals
          split={split}
          currency={room.currency}
          onForcePrinted={
            split.ocrDeltaCents != null && split.ocrDeltaCents !== 0
              ? forcePrintedTotal
              : undefined
          }
        />

        {split.shares.length > 0 ? (
          <section aria-labelledby="by-person-heading">
            <h2
              id="by-person-heading"
              className="font-display text-lg font-semibold"
            >
              By person
            </h2>
            <ul className="group-list mt-2.5">
              {split.shares.map((share) => (
                <li
                  key={share.memberId}
                  className="flex min-h-11 items-center justify-between px-4 text-[15px]"
                >
                  <span>{nameById.get(share.memberId) ?? share.memberId}</span>
                  <span className="font-semibold tabular-nums">
                    {formatMoney(share.totalCents, room.currency)}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {payload.items.length > 0 || checkId ? (
          <div className="flex flex-col gap-1">
            <Button
              type="button"
              variant="ghost"
              className="w-full"
              disabled={saveMutation.isPending}
              onClick={() => saveMutation.mutate(false)}
            >
              Save draft for later
            </Button>
            {check?.status === "CONFIRMED" ? (
              <Button
                type="button"
                variant="ghost"
                className="w-full"
                onClick={() => revertMutation.mutate()}
              >
                Move back to draft
              </Button>
            ) : null}
            {checkId ? (
              <Button
                type="button"
                variant="ghost"
                className="w-full text-destructive hover:text-destructive"
                onClick={() => {
                  if (window.confirm("Delete this check?")) {
                    deleteMutation.mutate()
                  }
                }}
              >
                Delete check
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="action-bar mt-auto">
        <div className="mb-2 flex items-baseline justify-between gap-3">
          <p className="font-display text-xl font-bold tabular-nums">
            {formatMoney(split.totalCents, room.currency)}
          </p>
          {split.confirmBlockReason ? (
            <p
              className="text-right text-[13px] font-medium text-destructive"
              role="alert"
            >
              {split.confirmBlockReason}
            </p>
          ) : payload.items.length > 0 ? (
            <p className="text-[13px] text-muted-foreground">
              Split between {split.shares.length}{" "}
              {split.shares.length === 1 ? "person" : "people"}
            </p>
          ) : null}
        </div>
        <Button
          type="button"
          className="cta-lg"
          disabled={!split.canConfirm || saveMutation.isPending}
          onClick={() => saveMutation.mutate(true)}
        >
          {saveMutation.isPending ? "Saving…" : "Confirm check"}
        </Button>
      </div>

      <ItemSplitSheet
        item={selectedItem}
        members={room.members}
        currency={room.currency}
        previousItem={previousItem}
        open={selectedItem != null}
        onOpenChange={(open) => {
          if (!open) setSelectedItemId(null)
        }}
        onSave={(next) => {
          setPayload((prev) => ({
            ...prev,
            items: prev.items.map((item) =>
              item.id === next.id ? next : item
            ),
          }))
        }}
        onSplitLine={(item) => {
          const [a, b] = splitLineItem(
            item,
            crypto.randomUUID(),
            crypto.randomUUID()
          )
          setPayload((prev) => ({
            ...prev,
            items: prev.items.flatMap((entry) =>
              entry.id === item.id ? [a, b] : [entry]
            ),
          }))
        }}
      />
    </main>
  )
}

function ItemCard({
  item,
  members,
  currency,
  nameById,
  onOpen,
  onToggle,
  onEveryone,
}: {
  item: LineItem
  members: RoomDto["members"]
  currency: string
  nameById: Map<string, string>
  onOpen: () => void
  onToggle: (memberId: string) => void
  onEveryone: () => void
}) {
  const unassigned = item.split.mode === "UNASSIGNED"
  const inlineEditable = item.split.mode === "EQUAL" || unassigned
  const selected = new Set(
    item.split.mode === "EQUAL" ? item.split.memberIds : []
  )
  const everyone = members.length > 1 && selected.size === members.length
  const lineShares = splitLineItemShares(item)
  const perPerson = [...lineShares.shares.values()]
  const evenShare =
    perPerson.length > 0 && perPerson.every((cents) => cents === perPerson[0])

  let summary: string
  if (unassigned) {
    summary = "Who had this?"
  } else if (item.split.mode === "EQUAL" && evenShare) {
    summary =
      perPerson.length === 1
        ? `${nameById.get(item.split.memberIds[0]) ?? "One person"} pays it all`
        : `${formatMoney(perPerson[0], currency)} each`
  } else if (item.split.mode === "EQUAL") {
    summary = `About ${formatMoney(Math.round(item.amountCents / perPerson.length), currency)} each`
  } else {
    summary = itemSplitSummary(item, nameById)
  }

  return (
    <li
      className={cn(
        "overflow-hidden",
        unassigned && members.length > 1 && "bg-destructive/[0.04]"
      )}
    >
      <button
        type="button"
        onClick={onOpen}
        className="flex w-full items-start justify-between gap-3 px-4 pt-3 pb-2 text-left outline-none focus-visible:bg-muted"
      >
        <span className="min-w-0">
          <span className="block text-[15px] font-semibold">
            {item.quantity > 1 ? `${item.quantity} × ` : ""}
            {item.name}
          </span>
          {item.modifiers.length > 0 ? (
            <span className="block text-[13px] text-muted-foreground">
              {item.modifiers.join(" · ")}
            </span>
          ) : null}
          <span
            className={cn(
              "block text-[13px]",
              unassigned
                ? "font-medium text-destructive"
                : "text-muted-foreground"
            )}
          >
            {summary}
          </span>
        </span>
        <span className="shrink-0 text-[15px] font-semibold tabular-nums">
          {formatMoney(item.amountCents, currency)}
        </span>
      </button>
      {members.length > 1 ? (
        <div className="flex flex-wrap gap-1.5 px-4 pb-3">
          {inlineEditable ? (
            <>
              {members.map((member) => (
                <button
                  key={member.id}
                  type="button"
                  className="person-chip"
                  aria-pressed={selected.has(member.id)}
                  onClick={() => onToggle(member.id)}
                >
                  {member.name}
                </button>
              ))}
              {members.length > 2 ? (
                <button
                  type="button"
                  className="person-chip person-chip-ghost"
                  aria-pressed={everyone}
                  onClick={onEveryone}
                >
                  Everyone
                </button>
              ) : null}
            </>
          ) : (
            <button
              type="button"
              className="person-chip person-chip-ghost"
              onClick={onOpen}
            >
              Custom split · edit
            </button>
          )}
        </div>
      ) : null}
    </li>
  )
}

function EditorHeader({
  title,
  onBack,
}: {
  title: string
  onBack: () => void
}) {
  return (
    <div className="flex items-center gap-1">
      <Button
        type="button"
        variant="ghost"
        size="icon-lg"
        className="-ml-3"
        onClick={onBack}
        aria-label="Back"
      >
        <HugeiconsIcon icon={ArrowLeft01Icon} size={20} strokeWidth={2} />
      </Button>
      <h1 className="min-w-0 truncate font-display text-[22px] font-bold tracking-tight">
        {title}
      </h1>
    </div>
  )
}

function Totals({
  split,
  currency,
  onForcePrinted,
}: {
  split: ReturnType<typeof computeDinnerSplit>
  currency: string
  onForcePrinted?: () => void
}) {
  return (
    <div className="surface flex flex-col gap-1.5 p-4 text-[15px]">
      <div className="flex justify-between">
        <span className="text-muted-foreground">Subtotal</span>
        <span className="tabular-nums">
          {formatMoney(split.itemSubtotalCents, currency)}
        </span>
      </div>
      {split.adjustmentTotalCents !== 0 ? (
        <div className="flex justify-between">
          <span className="text-muted-foreground">Fees</span>
          <span className="tabular-nums">
            {formatMoney(split.adjustmentTotalCents, currency)}
          </span>
        </div>
      ) : null}
      {split.tipCents > 0 ? (
        <div className="flex justify-between">
          <span className="text-muted-foreground">Tip</span>
          <span className="tabular-nums">
            {formatMoney(split.tipCents, currency)}
          </span>
        </div>
      ) : null}
      <div className="mt-1 flex justify-between border-t border-border/70 pt-2.5 text-[17px] font-semibold">
        <span>Total</span>
        <span className="tabular-nums">
          {formatMoney(split.totalCents, currency)}
        </span>
      </div>
      {split.residualCents > 0 ? (
        <p className={cn("text-xs font-medium text-destructive")}>
          Unassigned {formatMoney(split.residualCents, currency)}
        </p>
      ) : null}
      {split.ocrDeltaCents != null && split.ocrDeltaCents !== 0 ? (
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-destructive">
            Printed total differs by{" "}
            {formatMoney(Math.abs(split.ocrDeltaCents), currency)}
          </p>
          {onForcePrinted ? (
            <button
              type="button"
              className="text-xs font-medium text-primary"
              onClick={onForcePrinted}
            >
              Use printed total
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
