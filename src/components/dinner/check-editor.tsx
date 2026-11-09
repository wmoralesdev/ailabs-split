import { useEffect, useMemo, useRef, useState } from "react"
import { useNavigate } from "@tanstack/react-router"
import { onlineManager, useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  ArrowLeft01Icon,
  Camera01Icon,
  Delete02Icon,
} from "@hugeicons/core-free-icons"

import { ItemSplitSheet } from "@/components/dinner/item-split-sheet"
import { OcrReview } from "@/components/dinner/ocr-review"
import { MemberPicker } from "@/components/member-picker"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { itemSplitSummary } from "@/lib/dinner-labels"
import {
  assignRestToMember,
  computedTotalWithoutPrintedForce,
  computeDinnerSplit,
  emptyCheckPayload,
  manualTip,
  splitLineItem,
  tipCentsFromPercent,
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

type Phase = "start" | "review" | "assign"

export function CheckEditor({
  room,
  selfMemberId,
  check,
  startWithScan,
}: {
  room: RoomDto
  selfMemberId: string
  check: CheckDto | null
  startWithScan?: boolean
}) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const isOnline = useOnlineStatus()
  const fileRef = useRef<HTMLInputElement>(null)
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
  const [phase, setPhase] = useState<Phase>(() => {
    if (check) return "assign"
    if (startWithScan) return "start"
    return "start"
  })
  const [ocrPending, setOcrPending] = useState(false)
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null)
  const [newName, setNewName] = useState("")
  const [newQty, setNewQty] = useState(1)
  const [newAmount, setNewAmount] = useState("")
  const [customTip, setCustomTip] = useState("")
  const [feeName, setFeeName] = useState("")
  const [feeAmount, setFeeAmount] = useState("")
  const [showFee, setShowFee] = useState(false)

  useEffect(() => {
    if (!startWithScan) return
    fileRef.current?.click()
  }, [startWithScan])

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

  const showTipChips = payload.tip.amountCents === 0

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
      toast.error(error instanceof Error ? error.message : "Could not read ticket")
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
      split: { mode: "UNASSIGNED" },
    }
    setPayload((prev) => ({ ...prev, items: [...prev.items, item] }))
    setNewName("")
    setNewQty(1)
    setNewAmount("")
    setPhase("assign")
  }

  function applyTipPercent(percent: number) {
    const amountCents = tipCentsFromPercent(split.itemSubtotalCents, percent)
    setPayload((prev) => ({
      ...prev,
      tip: manualTip(amountCents, percent),
    }))
  }

  function applyCustomTip() {
    const amountCents = atmDigitsToCents(customTip, fd)
    if (amountCents <= 0) return
    setPayload((prev) => ({ ...prev, tip: manualTip(amountCents) }))
    setCustomTip("")
  }

  function addFee() {
    const amountCents = atmDigitsToCents(feeAmount, fd)
    if (!feeName.trim() || amountCents === 0) return
    setPayload((prev) => ({
      ...prev,
      adjustments: [
        ...prev.adjustments,
        {
          id: crypto.randomUUID(),
          kind: "FEE",
          name: feeName.trim(),
          amountCents,
          allocate: "BY_ITEMS",
          source: "MANUAL",
          confidence: null,
        },
      ],
    }))
    setFeeName("")
    setFeeAmount("")
    setShowFee(false)
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

  if (phase === "start" && payload.items.length === 0 && !check) {
    return (
      <main className="page-gutter mx-auto max-w-content pt-6">
        <EditorHeader
          title="New check"
          onBack={() =>
            void navigate({ to: "/r/$code", params: { code: room.code } })
          }
        />
        <div className="mt-8 flex flex-col gap-3">
          {isOnline ? (
            <label className="border-border hover:bg-muted/40 flex h-(--control-height) cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed text-sm">
              <HugeiconsIcon icon={Camera01Icon} size={18} strokeWidth={2} />
              {ocrPending ? "Reading ticket…" : "Scan ticket"}
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="sr-only"
                disabled={ocrPending}
                onChange={(event) =>
                  void onScan(event.target.files?.[0] ?? null)
                }
              />
            </label>
          ) : (
            <p className="text-sm text-muted-foreground">
              Scanning needs a connection. Enter the bill by hand.
            </p>
          )}
          <Button type="button" variant="outline" onClick={() => setPhase("assign")}>
            Enter bill manually
          </Button>
        </div>
      </main>
    )
  }

  return (
    <main className="page-gutter mx-auto max-w-content pt-6 pb-28">
      <EditorHeader
        title={checkId ? merchant || "Check" : "New check"}
        onBack={() =>
          void navigate({ to: "/r/$code", params: { code: room.code } })
        }
      />

      {phase === "review" ? (
        <div className="mt-6 flex flex-col gap-5">
          <div className="grid gap-2">
            <Label htmlFor="merchant">Place</Label>
            <Input
              id="merchant"
              value={merchant}
              onChange={(event) => setMerchant(event.target.value)}
            />
          </div>
          {isPrecuenta ? (
            <p className="text-xs text-muted-foreground">Marked as precuenta</p>
          ) : null}
          <OcrReview payload={payload} currency={room.currency} onChange={setPayload} />
          <Button type="button" onClick={() => setPhase("assign")}>
            Continue to assign
          </Button>
        </div>
      ) : (
        <div className="mt-6 flex flex-col gap-6">
          <div className="grid gap-2">
            <Label htmlFor="merchant-assign">Place</Label>
            <Input
              id="merchant-assign"
              value={merchant}
              onChange={(event) => setMerchant(event.target.value)}
              placeholder="Celeste Imperio"
            />
          </div>

          <div className="grid gap-2">
            <Label>Paid by</Label>
            <MemberPicker
              members={room.members}
              value={paidById}
              onChange={setPaidById}
            />
          </div>

          <div>
            <div className="flex items-end justify-between gap-3">
              <Label>Items</Label>
              {payload.items.some((item) => item.split.mode === "UNASSIGNED") &&
              room.members[0] ? (
                <button
                  type="button"
                  className="text-xs font-medium text-primary"
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
            <ul className="mt-2 divide-y divide-border/60">
              {payload.items.map((item) => {
                const unassigned = item.split.mode === "UNASSIGNED"
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      className="flex w-full items-start justify-between gap-3 py-3 text-left"
                      onClick={() => setSelectedItemId(item.id)}
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium">
                          {item.quantity > 1 ? `${item.quantity} × ` : ""}
                          {item.name}
                        </p>
                        {item.modifiers.length > 0 ? (
                          <p className="text-xs text-muted-foreground">
                            {item.modifiers.join(" · ")}
                          </p>
                        ) : null}
                        <p
                          className={
                            unassigned
                              ? "text-xs font-medium text-destructive"
                              : "text-xs text-muted-foreground"
                          }
                        >
                          {itemSplitSummary(item, nameById)}
                        </p>
                      </div>
                      <p className="text-sm font-semibold tabular-nums">
                        {formatMoney(item.amountCents, room.currency)}
                      </p>
                    </button>
                  </li>
                )
              })}
            </ul>

            <div className="mt-3 grid grid-cols-[1fr_4.5rem_6.5rem_auto] items-end gap-2">
              <Input
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
                placeholder="Item"
              />
              <Input
                inputMode="numeric"
                value={String(newQty)}
                onChange={(event) =>
                  setNewQty(Math.max(1, Number.parseInt(event.target.value, 10) || 1))
                }
                aria-label="Quantity"
              />
              <Input
                inputMode="numeric"
                value={formatAtmAmountInput(newAmount, fd)}
                onChange={(event) =>
                  setNewAmount(atmDigitsFromInput(event.target.value))
                }
                onFocus={(event) => event.target.select()}
                placeholder={formatAtmAmount("", fd)}
                aria-label="Item amount"
                className="text-right tabular-nums"
              />
              <Button
                type="button"
                variant="outline"
                onClick={addManualItem}
                aria-label="Add item"
              >
                Add
              </Button>
            </div>
          </div>

          {payload.adjustments.length > 0 ? (
            <div>
              <Label>Fees</Label>
              <ul className="mt-2 divide-y divide-border/60">
                {payload.adjustments.map((adjustment) => (
                  <li
                    key={adjustment.id}
                    className="flex items-center justify-between gap-3 py-2"
                  >
                    <span className="text-sm">{adjustment.name}</span>
                    <span className="flex items-center gap-2">
                      <span className="text-sm tabular-nums">
                        {formatMoney(adjustment.amountCents, room.currency)}
                      </span>
                      <button
                        type="button"
                        className="text-muted-foreground"
                        aria-label={`Remove ${adjustment.name}`}
                        onClick={() =>
                          setPayload((prev) => ({
                            ...prev,
                            adjustments: prev.adjustments.filter(
                              (entry) => entry.id !== adjustment.id
                            ),
                          }))
                        }
                      >
                        <HugeiconsIcon
                          icon={Delete02Icon}
                          size={14}
                          strokeWidth={2}
                        />
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {showTipChips ? (
            <div className="flex flex-col gap-2">
              <Label>Add tip</Label>
              <p className="text-xs text-muted-foreground">
                Only if you want to — nothing is added from a missing footer.
              </p>
              <div className="flex flex-wrap gap-1.5">
                {[10, 15].map((percent) => (
                  <button
                    key={percent}
                    type="button"
                    className="landing-chip landing-chip-idle"
                    onClick={() => applyTipPercent(percent)}
                  >
                    {percent}%
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <Input
                  inputMode="numeric"
                  value={formatAtmAmountInput(customTip, fd)}
                  onChange={(event) =>
                    setCustomTip(atmDigitsFromInput(event.target.value))
                  }
                  placeholder="Custom amount"
                  className="text-right tabular-nums"
                />
                <Button type="button" variant="outline" onClick={applyCustomTip}>
                  Add
                </Button>
              </div>
            </div>
          ) : payload.tip.amountCents > 0 ? (
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm">
                Tip
                {payload.tip.source === "TICKET" ? " (ticket)" : " (added)"}
              </p>
              <p className="text-sm font-semibold tabular-nums">
                {formatMoney(payload.tip.amountCents, room.currency)}
              </p>
            </div>
          ) : null}

          {showFee ? (
            <div className="flex flex-col gap-2">
              <Label>Add fee</Label>
              <div className="flex gap-2">
                <Input
                  value={feeName}
                  onChange={(event) => setFeeName(event.target.value)}
                  placeholder="Service"
                />
                <Input
                  inputMode="numeric"
                  value={formatAtmAmountInput(feeAmount, fd)}
                  onChange={(event) =>
                    setFeeAmount(atmDigitsFromInput(event.target.value))
                  }
                  className="w-28 text-right tabular-nums"
                />
                <Button type="button" variant="outline" onClick={addFee}>
                  Add
                </Button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              className="text-left text-sm font-medium text-muted-foreground hover:text-foreground"
              onClick={() => setShowFee(true)}
            >
              Add fee
            </button>
          )}

          {isOnline && payload.items.length === 0 ? (
            <label className="border-border hover:bg-muted/40 flex h-(--control-height) cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed text-sm">
              <HugeiconsIcon icon={Camera01Icon} size={18} strokeWidth={2} />
              {ocrPending ? "Reading ticket…" : "Scan ticket instead"}
              <input
                type="file"
                accept="image/*"
                className="sr-only"
                disabled={ocrPending}
                onChange={(event) => void onScan(event.target.files?.[0] ?? null)}
              />
            </label>
          ) : null}

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
            <div>
              <Label>By person</Label>
              <ul className="mt-2 divide-y divide-border/60">
                {split.shares.map((share) => (
                  <li
                    key={share.memberId}
                    className="flex items-center justify-between py-2 text-sm"
                  >
                    <span>{nameById.get(share.memberId) ?? share.memberId}</span>
                    <span className="tabular-nums">
                      {formatMoney(share.totalCents, room.currency)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {split.confirmBlockReason ? (
            <p className="text-xs text-destructive" role="alert">
              {split.confirmBlockReason}
            </p>
          ) : null}

          <div className="flex flex-col gap-2">
            <Button
              type="button"
              disabled={!split.canConfirm || saveMutation.isPending}
              onClick={() => saveMutation.mutate(true)}
            >
              {saveMutation.isPending ? "Saving…" : "Confirm check"}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={saveMutation.isPending}
              onClick={() => saveMutation.mutate(false)}
            >
              Save draft
            </Button>
            {check?.status === "CONFIRMED" ? (
              <Button
                type="button"
                variant="ghost"
                onClick={() => revertMutation.mutate()}
              >
                Move back to draft
              </Button>
            ) : null}
            {checkId ? (
              <Button
                type="button"
                variant="destructive"
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
        </div>
      )}

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

function EditorHeader({
  title,
  onBack,
}: {
  title: string
  onBack: () => void
}) {
  return (
    <div className="flex items-center gap-2">
      <Button
        type="button"
        variant="ghost"
        size="icon-lg"
        className="-ml-2"
        onClick={onBack}
        aria-label="Back"
      >
        <HugeiconsIcon icon={ArrowLeft01Icon} size={20} strokeWidth={2} />
      </Button>
      <h1 className="font-display text-3xl font-semibold tracking-tight">
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
    <div className="flex flex-col gap-1 border-y border-border/70 py-3 text-sm">
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
      <div className="flex justify-between font-semibold">
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
