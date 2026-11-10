import { HugeiconsIcon } from "@hugeicons/react"
import { Delete02Icon } from "@hugeicons/core-free-icons"

import { LineKindPicker } from "@/components/dinner/line-kind-picker"
import type { LineKind } from "@/components/dinner/line-kind-picker"
import { Button } from "@/components/ui/button"
import type { CheckPayload, LineItem } from "@/lib/dinner-split"
import { emptyTip, itemToAdjustment, ticketTip } from "@/lib/dinner-split"
import { formatMoney } from "@/lib/settle"

type Reclass = LineKind

export function OcrReview({
  payload,
  currency,
  onChange,
}: {
  payload: CheckPayload
  currency: string
  onChange: (payload: CheckPayload) => void
}) {
  function reclassItem(index: number, kind: Reclass) {
    const items = payload.items.map((entry) => ({
      ...entry,
      modifiers: [...entry.modifiers],
    }))
    const item = items[index]

    if (kind === "item") return
    if (kind === "ignore") {
      onChange({ ...payload, items: items.filter((_, i) => i !== index) })
      return
    }
    if (kind === "modifier") {
      if (index === 0) return
      const parent = items[index - 1]
      parent.modifiers = [...parent.modifiers, item.name]
      items.splice(index, 1)
      onChange({ ...payload, items })
      return
    }
    if (kind === "tip") {
      onChange({
        ...payload,
        items: items.filter((_, i) => i !== index),
        tip: ticketTip(item.amountCents),
      })
      return
    }
    const adjKind = kind === "tax" ? "TAX" : "FEE"
    const adjustment = itemToAdjustment(item, adjKind, crypto.randomUUID())
    onChange({
      ...payload,
      items: items.filter((_, i) => i !== index),
      adjustments: [...payload.adjustments, adjustment],
    })
  }

  function reclassAdjustment(id: string, kind: Reclass) {
    const adjustment = payload.adjustments.find((entry) => entry.id === id)
    if (!adjustment) return
    const rest = payload.adjustments.filter((entry) => entry.id !== id)
    if (kind === "ignore") {
      onChange({ ...payload, adjustments: rest })
      return
    }
    if (kind === "item") {
      const amount = Math.abs(adjustment.amountCents)
      const item: LineItem = {
        id: crypto.randomUUID(),
        name: adjustment.name,
        quantity: 1,
        unitPriceCents: amount,
        amountCents: amount,
        modifiers: [],
        source: adjustment.source,
        confidence: adjustment.confidence,
        split: { mode: "UNASSIGNED" },
      }
      onChange({
        ...payload,
        items: [...payload.items, item],
        adjustments: rest,
      })
      return
    }
    if (kind === "tip") {
      onChange({
        ...payload,
        adjustments: rest,
        tip: ticketTip(Math.abs(adjustment.amountCents)),
      })
    }
  }

  const itemSum = payload.items.reduce((sum, item) => sum + item.amountCents, 0)
  const noted = payload.notedTotalCents
  const delta = noted == null ? null : noted - itemSum - payload.tip.amountCents

  const hasTip = payload.tip.source !== "NONE"
  const hasPrinted = payload.notedSubtotalCents != null || noted != null

  return (
    <div className="flex flex-col gap-5">
      <section aria-label="Lines on the ticket">
        <p className="group-label">
          {payload.items.length} {payload.items.length === 1 ? "line" : "lines"}{" "}
          · change any that aren’t food or drink
        </p>
        <ul className="group-list">
          {payload.items.map((item, index) => (
            <ReviewRow
              key={item.id}
              name={`${item.quantity > 1 ? `${item.quantity} × ` : ""}${item.name}`}
              detail={
                item.modifiers.length > 0 ? item.modifiers.join(" · ") : null
              }
              lowConfidence={item.confidence != null && item.confidence < 0.7}
              amount={formatMoney(item.amountCents, currency)}
              current="item"
              options={
                index > 0
                  ? ITEM_OPTIONS
                  : ITEM_OPTIONS.filter((option) => option !== "modifier")
              }
              onPick={(kind) => reclassItem(index, kind)}
            />
          ))}
          {payload.adjustments.map((adjustment) => (
            <ReviewRow
              key={adjustment.id}
              name={adjustment.name}
              amount={formatMoney(adjustment.amountCents, currency)}
              current={adjustment.kind === "TAX" ? "tax" : "fee"}
              options={[
                adjustment.kind === "TAX" ? "tax" : "fee",
                "item",
                "tip",
                "ignore",
              ]}
              onPick={(kind) => reclassAdjustment(adjustment.id, kind)}
            />
          ))}
        </ul>
      </section>

      {hasTip || hasPrinted ? (
        <section aria-label="Printed totals">
          <ul className="group-list">
            {hasTip ? (
              <li className="group-row justify-between pr-1">
                <span>
                  Tip
                  <span className="text-muted-foreground">
                    {payload.tip.percent != null
                      ? ` · ${payload.tip.percent}%`
                      : " · on ticket"}
                  </span>
                </span>
                <span className="flex items-center gap-1">
                  <span className="font-semibold tabular-nums">
                    {formatMoney(payload.tip.amountCents, currency)}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Remove printed tip"
                    onClick={() => onChange({ ...payload, tip: emptyTip() })}
                  >
                    <HugeiconsIcon
                      icon={Delete02Icon}
                      size={16}
                      strokeWidth={2}
                    />
                  </Button>
                </span>
              </li>
            ) : null}
            {payload.notedSubtotalCents != null ? (
              <Row
                label="Printed subtotal"
                value={formatMoney(payload.notedSubtotalCents, currency)}
              />
            ) : null}
            {noted != null ? (
              <Row label="Printed total" value={formatMoney(noted, currency)} />
            ) : null}
          </ul>
          {delta != null && delta !== 0 ? (
            <p className="group-footer font-medium text-destructive">
              The lines are off the printed total by{" "}
              {formatMoney(Math.abs(delta), currency)}. You can still assign.
            </p>
          ) : null}
        </section>
      ) : null}
    </div>
  )
}

const ITEM_OPTIONS: Reclass[] = [
  "item",
  "modifier",
  "fee",
  "tax",
  "tip",
  "ignore",
]

function ReviewRow({
  name,
  detail = null,
  lowConfidence = false,
  amount,
  current,
  options,
  onPick,
}: {
  name: string
  detail?: string | null
  lowConfidence?: boolean
  amount: string
  current: Reclass
  options: Reclass[]
  onPick: (kind: Reclass) => void
}) {
  return (
    <li className="flex items-start justify-between gap-3 px-4 pt-2.5 pb-1">
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-medium">{name}</p>
        {detail ? (
          <p className="text-[13px] text-muted-foreground">{detail}</p>
        ) : null}
        <LineKindPicker
          lineName={name}
          amount={amount}
          current={current}
          options={options}
          lowConfidence={lowConfidence}
          onPick={onPick}
        />
      </div>
      <p className="pt-px text-[15px] font-semibold tabular-nums">{amount}</p>
    </li>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <li className="group-row justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular-nums">{value}</span>
    </li>
  )
}
