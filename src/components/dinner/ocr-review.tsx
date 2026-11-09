import { formatMoney } from "@/lib/settle"
import type { Adjustment, CheckPayload, LineItem } from "@/lib/dinner-split"
import { emptyTip, itemToAdjustment, ticketTip } from "@/lib/dinner-split"
import { cn } from "@/lib/utils"

type Reclass = "item" | "modifier" | "fee" | "tax" | "tip" | "ignore"

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
      onChange({ ...payload, items: [...payload.items, item], adjustments: rest })
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

  return (
    <div className="flex flex-col gap-5">
      <ul className="divide-y divide-border/60">
        {payload.items.map((item, index) => (
          <li key={item.id} className="py-3">
            <div className="flex items-baseline justify-between gap-3">
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
                {item.confidence != null && item.confidence < 0.7 ? (
                  <p className="text-xs text-destructive">Low confidence</p>
                ) : null}
              </div>
              <p className="text-sm font-semibold tabular-nums">
                {formatMoney(item.amountCents, currency)}
              </p>
            </div>
            <ReclassRow
              current="item"
              onPick={(kind) => reclassItem(index, kind)}
            />
          </li>
        ))}
      </ul>

      {payload.adjustments.map((adjustment) => (
        <AdjustmentReview
          key={adjustment.id}
          adjustment={adjustment}
          currency={currency}
          onPick={(kind) => reclassAdjustment(adjustment.id, kind)}
        />
      ))}

      {payload.tip.source !== "NONE" ? (
        <div className="flex items-baseline justify-between gap-3 border-t border-border/70 pt-3">
          <p className="text-sm font-medium">
            Tip
            {payload.tip.percent != null ? ` ${payload.tip.percent}%` : ""}
          </p>
          <p className="text-sm font-semibold tabular-nums">
            {formatMoney(payload.tip.amountCents, currency)}
          </p>
        </div>
      ) : null}

      <div className="flex flex-col gap-1 border-t border-border/70 pt-3 text-sm">
        {payload.notedSubtotalCents != null ? (
          <Row
            label="Printed subtotal"
            value={formatMoney(payload.notedSubtotalCents, currency)}
          />
        ) : null}
        {noted != null ? (
          <Row label="Printed total" value={formatMoney(noted, currency)} />
        ) : null}
        {delta != null && delta !== 0 ? (
          <p className="text-xs font-medium text-destructive">
            OCR is off by {formatMoney(Math.abs(delta), currency)}. You can
            still assign.
          </p>
        ) : null}
        <button
          type="button"
          className="mt-1 text-left text-sm font-medium text-muted-foreground"
          onClick={() => onChange({ ...payload, tip: emptyTip() })}
        >
          Clear printed tip
        </button>
      </div>
    </div>
  )
}

function AdjustmentReview({
  adjustment,
  currency,
  onPick,
}: {
  adjustment: Adjustment
  currency: string
  onPick: (kind: Reclass) => void
}) {
  return (
    <div className="border-t border-border/70 py-3">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm font-medium">{adjustment.name}</p>
        <p className="text-sm font-semibold tabular-nums">
          {formatMoney(adjustment.amountCents, currency)}
        </p>
      </div>
      <ReclassRow
        current={adjustment.kind === "TAX" ? "tax" : "fee"}
        onPick={onPick}
      />
    </div>
  )
}

function ReclassRow({
  current,
  onPick,
}: {
  current: Reclass
  onPick: (kind: Reclass) => void
}) {
  const options: Array<{ id: Reclass; label: string }> = [
    { id: "item", label: "Item" },
    { id: "modifier", label: "Modifier" },
    { id: "fee", label: "Fee" },
    { id: "tax", label: "Tax" },
    { id: "tip", label: "Tip" },
    { id: "ignore", label: "Ignore" },
  ]
  return (
    <div className="mt-2 flex flex-wrap gap-1">
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          onClick={() => onPick(option.id)}
          className={cn(
            "rounded-full border px-2 py-0.5 text-[11px] font-medium",
            current === option.id
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border text-muted-foreground hover:text-foreground"
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  )
}
