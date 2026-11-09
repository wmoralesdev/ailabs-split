import { useEffect, useRef, useState } from "react"
import type { ReactNode } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { Add01Icon, Delete02Icon } from "@hugeicons/core-free-icons"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  atmDigitsFromInput,
  atmDigitsToCents,
  formatAtmAmount,
  formatAtmAmountInput,
} from "@/lib/atm-amount"
import { manualTip, tipCentsFromPercent } from "@/lib/dinner-split"
import type { Adjustment, TipConfig } from "@/lib/dinner-split"
import { formatMoney } from "@/lib/settle"
import { cn } from "@/lib/utils"

type FeeMode = "amount" | "percent"

export function TipFeesSection({
  tip,
  adjustments,
  itemSubtotalCents,
  currency,
  fractionDigits,
  onChangeTip,
  onChangeAdjustments,
}: {
  tip: TipConfig
  adjustments: Adjustment[]
  itemSubtotalCents: number
  currency: string
  fractionDigits: number
  onChangeTip: (tip: TipConfig) => void
  onChangeAdjustments: (adjustments: Adjustment[]) => void
}) {
  const [customTip, setCustomTip] = useState("")
  const [feeName, setFeeName] = useState("")
  const [feeAmount, setFeeAmount] = useState("")
  const [feePercent, setFeePercent] = useState("")
  const [feeMode, setFeeMode] = useState<FeeMode>("amount")
  const [showFee, setShowFee] = useState(false)
  const feeFormRef = useRef<HTMLFormElement>(null)

  useEffect(() => {
    if (!showFee) return
    feeFormRef.current?.scrollIntoView({ block: "center", behavior: "smooth" })
  }, [showFee])

  const showTipChips = tip.amountCents === 0
  const feeCents = feeCentsFromDraft({
    feeMode,
    feeAmount,
    feePercent,
    itemSubtotalCents,
    fractionDigits,
  })
  const percentPreview =
    feeMode === "percent" && feeCents > 0
      ? formatMoney(feeCents, currency)
      : null
  const canAddFee = feeName.trim().length > 0 && feeCents > 0

  function applyTipPercent(percent: number) {
    onChangeTip(
      manualTip(tipCentsFromPercent(itemSubtotalCents, percent), percent)
    )
  }

  function applyCustomTip() {
    const amountCents = atmDigitsToCents(customTip, fractionDigits)
    if (amountCents <= 0) return
    onChangeTip(manualTip(amountCents))
    setCustomTip("")
  }

  function addFee() {
    if (!canAddFee) return
    onChangeAdjustments([
      ...adjustments,
      {
        id: crypto.randomUUID(),
        kind: "FEE",
        name: feeName.trim(),
        amountCents: feeCents,
        allocate: "BY_ITEMS",
        source: "MANUAL",
        confidence: null,
      },
    ])
    setFeeName("")
    setFeeAmount("")
    setFeePercent("")
    setFeeMode("amount")
    setShowFee(false)
  }

  return (
    <section aria-labelledby="extras-heading" className="flex flex-col gap-2.5">
      <h2 id="extras-heading" className="font-display text-lg font-semibold">
        Tip and fees
      </h2>
      {adjustments.length > 0 ? (
        <ul className="group-list">
          {adjustments.map((adjustment) => (
            <li
              key={adjustment.id}
              className="flex min-h-11 items-center justify-between gap-3 pr-1 pl-4"
            >
              <span className="text-[15px]">{adjustment.name}</span>
              <span className="flex items-center gap-1">
                <span className="text-[15px] tabular-nums">
                  {formatMoney(adjustment.amountCents, currency)}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove ${adjustment.name}`}
                  onClick={() =>
                    onChangeAdjustments(
                      adjustments.filter((entry) => entry.id !== adjustment.id)
                    )
                  }
                >
                  <HugeiconsIcon
                    icon={Delete02Icon}
                    size={16}
                    strokeWidth={2}
                  />
                </Button>
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {showTipChips ? (
        <div className="flex flex-col gap-2">
          <div>
            <Label htmlFor="custom-tip">Add tip</Label>
            <p className="mt-1 text-[13px] leading-snug text-muted-foreground">
              Only if you want one. Nothing is added unless the ticket prints
              it.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2">
              {[10, 15].map((percent) => (
                <button
                  key={percent}
                  type="button"
                  className="choice-chip"
                  onClick={() => applyTipPercent(percent)}
                >
                  {percent}%
                </button>
              ))}
            </div>
            <FieldWell prefix="$" className="min-w-[8rem] flex-1">
              <Input
                id="custom-tip"
                inputMode="numeric"
                value={formatAtmAmountInput(customTip, fractionDigits)}
                onChange={(event) =>
                  setCustomTip(atmDigitsFromInput(event.target.value))
                }
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault()
                    applyCustomTip()
                  }
                }}
                onBlur={applyCustomTip}
                placeholder={formatAtmAmount("", fractionDigits)}
                aria-label="Custom tip amount"
                className="text-right tabular-nums"
              />
            </FieldWell>
          </div>
        </div>
      ) : tip.amountCents > 0 ? (
        <div className="group-list flex min-h-11 items-center justify-between gap-3 pr-1 pl-4">
          <p className="text-[15px]">
            Tip
            <span className="text-muted-foreground">
              {tip.source === "TICKET" ? " · on ticket" : " · added"}
            </span>
          </p>
          <span className="flex items-center gap-1">
            <span className="text-[15px] font-semibold tabular-nums">
              {formatMoney(tip.amountCents, currency)}
            </span>
            {tip.source === "TICKET" ? null : (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Remove tip"
                onClick={() => onChangeTip(manualTip(0))}
              >
                <HugeiconsIcon icon={Delete02Icon} size={16} strokeWidth={2} />
              </Button>
            )}
          </span>
        </div>
      ) : null}

      {showFee ? (
        <form
          ref={feeFormRef}
          className="flex flex-col gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            addFee()
          }}
        >
          <Label htmlFor="fee-name">Add fee</Label>
          <FieldWell>
            <Input
              id="fee-name"
              value={feeName}
              onChange={(event) => setFeeName(event.target.value)}
              placeholder="Fee name"
              aria-label="Fee name"
              autoComplete="off"
              spellCheck={false}
              enterKeyHint="next"
            />
          </FieldWell>
          <div className="flex items-center gap-2">
            <div
              className="segmented grid w-[5.75rem] shrink-0 grid-cols-2"
              role="group"
              aria-label="Amount or percent"
            >
              <button
                type="button"
                className="segmented-item"
                aria-pressed={feeMode === "amount"}
                aria-label="Amount"
                onClick={() => setFeeMode("amount")}
              >
                $
              </button>
              <button
                type="button"
                className="segmented-item"
                aria-pressed={feeMode === "percent"}
                aria-label="Percent"
                onClick={() => setFeeMode("percent")}
              >
                %
              </button>
            </div>
            <FeeValueField
              feeMode={feeMode}
              feeAmount={feeAmount}
              feePercent={feePercent}
              fractionDigits={fractionDigits}
              onAmountChange={setFeeAmount}
              onPercentChange={setFeePercent}
            />
          </div>
          {percentPreview ? (
            <p className="text-[13px] leading-snug text-muted-foreground">
              Adds {percentPreview} on the item subtotal
            </p>
          ) : null}
          <Button
            type="submit"
            variant="secondary"
            className="w-full bg-muted font-semibold text-primary"
            disabled={!canAddFee}
          >
            <HugeiconsIcon icon={Add01Icon} size={16} strokeWidth={2} />
            Add fee
          </Button>
        </form>
      ) : (
        <Button
          type="button"
          variant="ghost"
          className="self-start px-0 text-primary hover:bg-transparent"
          onClick={() => setShowFee(true)}
        >
          <HugeiconsIcon icon={Add01Icon} size={16} strokeWidth={2} />
          Add a fee or service charge
        </Button>
      )}
    </section>
  )
}

function FeeValueField({
  feeMode,
  feeAmount,
  feePercent,
  fractionDigits,
  onAmountChange,
  onPercentChange,
}: {
  feeMode: FeeMode
  feeAmount: string
  feePercent: string
  fractionDigits: number
  onAmountChange: (value: string) => void
  onPercentChange: (value: string) => void
}) {
  switch (feeMode) {
    case "amount":
      return (
        <FieldWell prefix="$" className="flex-1">
          <Input
            inputMode="numeric"
            value={formatAtmAmountInput(feeAmount, fractionDigits)}
            onChange={(event) =>
              onAmountChange(atmDigitsFromInput(event.target.value))
            }
            aria-label="Fee amount"
            placeholder={formatAtmAmount("", fractionDigits)}
            enterKeyHint="done"
            className="text-right tabular-nums"
          />
        </FieldWell>
      )
    case "percent":
      return (
        <FieldWell suffix="%" className="flex-1">
          <Input
            inputMode="decimal"
            value={feePercent}
            onChange={(event) => onPercentChange(event.target.value)}
            aria-label="Fee percent"
            placeholder="10"
            enterKeyHint="done"
            className="text-right tabular-nums"
          />
        </FieldWell>
      )
    default: {
      const _never: never = feeMode
      return _never
    }
  }
}

function FieldWell({
  prefix,
  suffix,
  className,
  children,
}: {
  prefix?: string
  suffix?: string
  className?: string
  children: ReactNode
}) {
  return (
    <div className={cn("field-well", className)}>
      {prefix ? (
        <span className="field-well-affix pl-3.5" aria-hidden="true">
          {prefix}
        </span>
      ) : null}
      {children}
      {suffix ? (
        <span className="field-well-affix pr-3.5" aria-hidden="true">
          {suffix}
        </span>
      ) : null}
    </div>
  )
}

function feeCentsFromDraft({
  feeMode,
  feeAmount,
  feePercent,
  itemSubtotalCents,
  fractionDigits,
}: {
  feeMode: FeeMode
  feeAmount: string
  feePercent: string
  itemSubtotalCents: number
  fractionDigits: number
}): number {
  switch (feeMode) {
    case "amount":
      return atmDigitsToCents(feeAmount, fractionDigits)
    case "percent": {
      const percent = parsePositivePercent(feePercent)
      if (percent == null) return 0
      return tipCentsFromPercent(itemSubtotalCents, percent)
    }
    default: {
      const _never: never = feeMode
      return _never
    }
  }
}

function parsePositivePercent(raw: string): number | null {
  const trimmed = raw.trim().replace(/%/g, "")
  if (!trimmed) return null
  const n = Number.parseFloat(trimmed)
  if (!Number.isFinite(n) || n <= 0 || n > 100) return null
  return n
}
