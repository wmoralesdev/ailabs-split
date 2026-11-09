import { partsSplitCents } from "@/lib/settle"

export type ItemSplit =
  | { mode: "UNASSIGNED" }
  | { mode: "EQUAL"; memberIds: string[] }
  | { mode: "PARTS"; parts: Array<{ memberId: string; weight: number }> }
  | { mode: "QUANTITY"; shares: Array<{ memberId: string; quantity: number }> }
  | { mode: "AMOUNT"; shares: Array<{ memberId: string; amountCents: number }> }

export type LineItem = {
  id: string
  name: string
  quantity: number
  unitPriceCents: number
  amountCents: number
  modifiers: string[]
  source: "OCR" | "MANUAL"
  confidence: number | null
  split: ItemSplit
}

export type AdjustmentKind = "TAX" | "FEE" | "DISCOUNT" | "TIP"

export type Adjustment = {
  id: string
  kind: AdjustmentKind
  name: string
  /** Fixed cents. Ignored when rateBps is set. */
  amountCents: number
  /**
   * Percent of the current item subtotal, in basis points (1300 = 13%).
   * Recomputed as items change. Null or omitted means a fixed amount.
   */
  rateBps?: number | null
  allocate: "BY_ITEMS"
  source: "OCR" | "MANUAL"
  confidence: number | null
}

export type TipConfig = {
  /** null if the ticket had no %; 0 if it printed 0%. */
  percent: number | null
  /** TICKET = footer. MANUAL = user added. NONE = no tip. */
  source: "TICKET" | "MANUAL" | "NONE"
  printedCents: number | null
  amountCents: number
}

export type CheckPayload = {
  items: LineItem[]
  adjustments: Adjustment[]
  tip: TipConfig
  notedSubtotalCents: number | null
  notedTotalCents: number | null
  rawText?: string
}

export type MemberDinnerShare = {
  memberId: string
  itemCents: number
  adjustmentCents: number
  tipCents: number
  totalCents: number
}

export type DinnerSplitResult = {
  itemSubtotalCents: number
  adjustmentTotalCents: number
  tipCents: number
  computedTotalCents: number
  totalCents: number
  residualCents: number
  unassignedItemIds: string[]
  shares: MemberDinnerShare[]
  canConfirm: boolean
  confirmBlockReason: string | null
  ocrDeltaCents: number | null
}

const RESIDUAL_BUCKET = "__residual__"
export const PRINTED_TOTAL_ADJUSTMENT_NAME = "Printed total"

export function emptyTip(): TipConfig {
  return {
    percent: null,
    source: "NONE",
    printedCents: null,
    amountCents: 0,
  }
}

export function ticketTip(
  printedCents: number,
  percent?: number | null
): TipConfig {
  const amount = printedCents > 0 ? printedCents : 0
  return {
    percent: percent ?? null,
    source: "TICKET",
    printedCents,
    amountCents: amount,
  }
}

export function manualTip(
  amountCents: number,
  percent?: number | null
): TipConfig {
  return {
    percent: percent ?? null,
    source: "MANUAL",
    printedCents: null,
    amountCents: Math.max(0, amountCents),
  }
}

export function tipCentsFromPercent(
  subtotalCents: number,
  percent: number
): number {
  return Math.round((subtotalCents * percent) / 100)
}

/** 1300 → "13%", 1350 → "13.5%". */
export function formatRateBps(bps: number): string {
  const percent = bps / 100
  const text = Number.isInteger(percent)
    ? String(percent)
    : percent.toFixed(2).replace(/0+$/, "").replace(/\.$/, "")
  return `${text}%`
}

/**
 * Fixed extras use amountCents. Percent extras (rateBps) follow the current
 * item subtotal, so IVA stays correct as dishes are added or removed.
 */
export function adjustmentAmountCents(
  adjustment: Pick<Adjustment, "amountCents" | "rateBps">,
  itemSubtotalCents: number
): number {
  const rate = adjustment.rateBps
  if (rate != null && rate > 0) {
    if (itemSubtotalCents <= 0) return 0
    return Math.round((itemSubtotalCents * rate) / 10_000)
  }
  return adjustment.amountCents
}

export function emptyCheckPayload(): CheckPayload {
  return {
    items: [],
    adjustments: [],
    tip: emptyTip(),
    notedSubtotalCents: null,
    notedTotalCents: null,
  }
}

function addCents(map: Map<string, number>, id: string, cents: number) {
  map.set(id, (map.get(id) ?? 0) + cents)
}

function qtyWeight(quantity: number): number {
  return Math.max(1, Math.round(quantity * 1000))
}

export type LineSplitResult = {
  shares: Map<string, number>
  residualCents: number
  invalid: boolean
}

export function splitLineItemShares(item: LineItem): LineSplitResult {
  switch (item.split.mode) {
    case "UNASSIGNED":
      return {
        shares: new Map(),
        residualCents: item.amountCents,
        invalid: false,
      }
    case "EQUAL": {
      const ids = [...new Set(item.split.memberIds.filter(Boolean))]
      if (ids.length === 0) {
        return {
          shares: new Map(),
          residualCents: item.amountCents,
          invalid: false,
        }
      }
      const parts = partsSplitCents(
        item.amountCents,
        ids.map((memberId) => ({ memberId, weight: 1 }))
      )
      return {
        shares: new Map(parts.map((part) => [part.memberId, part.amountCents])),
        residualCents: 0,
        invalid: false,
      }
    }
    case "PARTS": {
      const parts = item.split.parts.filter((part) => part.weight > 0)
      if (parts.length === 0) {
        return {
          shares: new Map(),
          residualCents: item.amountCents,
          invalid: false,
        }
      }
      const split = partsSplitCents(item.amountCents, parts)
      return {
        shares: new Map(split.map((part) => [part.memberId, part.amountCents])),
        residualCents: 0,
        invalid: false,
      }
    }
    case "QUANTITY": {
      const assigned = item.split.shares.filter((share) => share.quantity > 0)
      const assignedQty = assigned.reduce(
        (sum, share) => sum + share.quantity,
        0
      )
      if (assigned.length === 0 || assignedQty <= 0) {
        return {
          shares: new Map(),
          residualCents: item.amountCents,
          invalid: false,
        }
      }
      if (assignedQty > item.quantity) {
        const split = partsSplitCents(
          item.amountCents,
          assigned.map((share) => ({
            memberId: share.memberId,
            weight: qtyWeight(share.quantity),
          }))
        )
        return {
          shares: new Map(
            split.map((part) => [part.memberId, part.amountCents])
          ),
          residualCents: 0,
          invalid: true,
        }
      }
      const leftoverQty = item.quantity - assignedQty
      const weights = [
        ...assigned.map((share) => ({
          memberId: share.memberId,
          weight: qtyWeight(share.quantity),
        })),
        ...(leftoverQty > 0
          ? [{ memberId: RESIDUAL_BUCKET, weight: qtyWeight(leftoverQty) }]
          : []),
      ]
      const split = partsSplitCents(item.amountCents, weights)
      const shares = new Map<string, number>()
      let residualCents = 0
      for (const part of split) {
        if (part.memberId === RESIDUAL_BUCKET) {
          residualCents += part.amountCents
        } else {
          addCents(shares, part.memberId, part.amountCents)
        }
      }
      return { shares, residualCents, invalid: false }
    }
    case "AMOUNT": {
      const shares = new Map<string, number>()
      let assigned = 0
      for (const share of item.split.shares) {
        addCents(shares, share.memberId, share.amountCents)
        assigned += share.amountCents
      }
      if (assigned === item.amountCents) {
        return { shares, residualCents: 0, invalid: false }
      }
      if (assigned < item.amountCents) {
        return {
          shares,
          residualCents: item.amountCents - assigned,
          invalid: false,
        }
      }
      return { shares, residualCents: 0, invalid: true }
    }
    default: {
      const _never: never = item.split
      return _never
    }
  }
}

function allocateByItems(
  amountCents: number,
  itemCents: Map<string, number>
): Map<string, number> | null {
  if (amountCents === 0) return new Map()
  const weights = [...itemCents.entries()]
    .filter(([, weight]) => weight > 0)
    .map(([memberId, weight]) => ({ memberId, weight }))
  if (weights.length === 0) return null
  const sign = amountCents < 0 ? -1 : 1
  const parts = partsSplitCents(Math.abs(amountCents), weights)
  return new Map(parts.map((part) => [part.memberId, part.amountCents * sign]))
}

export function computeDinnerSplit(input: {
  items: LineItem[]
  adjustments: Adjustment[]
  tip: TipConfig
  notedTotalCents?: number | null
}): DinnerSplitResult {
  const itemCents = new Map<string, number>()
  let residualCents = 0
  const unassignedItemIds: string[] = []
  let lineInvalid = false

  for (const item of input.items) {
    const split = splitLineItemShares(item)
    residualCents += split.residualCents
    if (split.residualCents > 0 || split.invalid) {
      unassignedItemIds.push(item.id)
    }
    if (split.invalid) lineInvalid = true
    for (const [memberId, cents] of split.shares) {
      addCents(itemCents, memberId, cents)
    }
  }

  const itemSubtotalCents = input.items.reduce(
    (sum, item) => sum + item.amountCents,
    0
  )
  const adjustmentTotalCents = input.adjustments.reduce(
    (sum, adjustment) =>
      sum + adjustmentAmountCents(adjustment, itemSubtotalCents),
    0
  )
  const tipCents = input.tip.amountCents > 0 ? input.tip.amountCents : 0
  const computedTotalCents = itemSubtotalCents + adjustmentTotalCents + tipCents

  const adjustmentCents = new Map<string, number>()
  let feesNeedItems = false
  for (const adjustment of input.adjustments) {
    const amountCents = adjustmentAmountCents(adjustment, itemSubtotalCents)
    if (amountCents === 0) continue
    const allocated = allocateByItems(amountCents, itemCents)
    if (!allocated) {
      feesNeedItems = true
      continue
    }
    for (const [memberId, cents] of allocated) {
      addCents(adjustmentCents, memberId, cents)
    }
  }

  const tipAlloc = new Map<string, number>()
  if (tipCents > 0) {
    const allocated = allocateByItems(tipCents, itemCents)
    if (!allocated) {
      feesNeedItems = true
    } else {
      for (const [memberId, cents] of allocated) {
        addCents(tipAlloc, memberId, cents)
      }
    }
  }

  const memberIds = new Set<string>([
    ...itemCents.keys(),
    ...adjustmentCents.keys(),
    ...tipAlloc.keys(),
  ])
  const shares: MemberDinnerShare[] = [...memberIds].map((memberId) => {
    const item = itemCents.get(memberId) ?? 0
    const adjustment = adjustmentCents.get(memberId) ?? 0
    const tip = tipAlloc.get(memberId) ?? 0
    return {
      memberId,
      itemCents: item,
      adjustmentCents: adjustment,
      tipCents: tip,
      totalCents: item + adjustment + tip,
    }
  })

  let confirmBlockReason: string | null = null
  if (input.items.length === 0) {
    confirmBlockReason = "Add at least one item"
  } else if (lineInvalid) {
    confirmBlockReason = "Fix item quantities or amounts before confirming"
  } else if (residualCents > 0) {
    confirmBlockReason = "Assign every item before confirming"
  } else if (feesNeedItems) {
    confirmBlockReason = "Assign dishes before splitting ticket charges"
  }

  const notedTotalCents = input.notedTotalCents ?? null
  const ocrDeltaCents =
    notedTotalCents == null ? null : notedTotalCents - computedTotalCents

  return {
    itemSubtotalCents,
    adjustmentTotalCents,
    tipCents,
    computedTotalCents,
    totalCents: computedTotalCents,
    residualCents,
    unassignedItemIds,
    shares,
    canConfirm: confirmBlockReason == null,
    confirmBlockReason,
    ocrDeltaCents,
  }
}

export function expenseSharesFromDinner(
  result: DinnerSplitResult
): Array<{ memberId: string; amountCents: number }> {
  return result.shares
    .filter((share) => share.totalCents > 0)
    .map((share) => ({
      memberId: share.memberId,
      amountCents: share.totalCents,
    }))
}

export function splitLineItem(
  item: LineItem,
  idA: string,
  idB: string
): [LineItem, LineItem] {
  const quantity = item.quantity > 0 ? item.quantity : 1
  if (quantity > 1) {
    const qtyA = Math.max(1, Math.floor(quantity / 2))
    const qtyB = quantity - qtyA
    const parts = partsSplitCents(item.amountCents, [
      { memberId: "a", weight: qtyA },
      { memberId: "b", weight: qtyB },
    ])
    const amountA =
      parts.find((part) => part.memberId === "a")?.amountCents ?? 0
    const amountB =
      parts.find((part) => part.memberId === "b")?.amountCents ?? 0
    return [
      {
        ...item,
        id: idA,
        quantity: qtyA,
        amountCents: amountA,
        split: { mode: "UNASSIGNED" },
      },
      {
        ...item,
        id: idB,
        quantity: qtyB,
        amountCents: amountB,
        split: { mode: "UNASSIGNED" },
      },
    ]
  }

  const parts = partsSplitCents(item.amountCents, [
    { memberId: "a", weight: 1 },
    { memberId: "b", weight: 1 },
  ])
  const amountA = parts.find((part) => part.memberId === "a")?.amountCents ?? 0
  const amountB = parts.find((part) => part.memberId === "b")?.amountCents ?? 0
  return [
    {
      ...item,
      id: idA,
      name: `${item.name} (1)`,
      quantity: 1,
      unitPriceCents: amountA,
      amountCents: amountA,
      split: { mode: "UNASSIGNED" },
    },
    {
      ...item,
      id: idB,
      name: `${item.name} (2)`,
      quantity: 1,
      unitPriceCents: amountB,
      amountCents: amountB,
      split: { mode: "UNASSIGNED" },
    },
  ]
}

export function assignRestToMember(
  items: LineItem[],
  memberId: string
): LineItem[] {
  return items.map((item) => {
    switch (item.split.mode) {
      case "UNASSIGNED":
        return { ...item, split: { mode: "EQUAL", memberIds: [memberId] } }
      case "QUANTITY": {
        const assignedQty = item.split.shares.reduce(
          (sum, share) => sum + share.quantity,
          0
        )
        const leftover = item.quantity - assignedQty
        if (leftover <= 0) return item
        const existing = item.split.shares.find(
          (share) => share.memberId === memberId
        )
        const shares = existing
          ? item.split.shares.map((share) =>
              share.memberId === memberId
                ? { ...share, quantity: share.quantity + leftover }
                : share
            )
          : [...item.split.shares, { memberId, quantity: leftover }]
        return { ...item, split: { mode: "QUANTITY", shares } }
      }
      case "AMOUNT": {
        const assigned = item.split.shares.reduce(
          (sum, share) => sum + share.amountCents,
          0
        )
        const leftover = item.amountCents - assigned
        if (leftover <= 0) return item
        const existing = item.split.shares.find(
          (share) => share.memberId === memberId
        )
        const shares = existing
          ? item.split.shares.map((share) =>
              share.memberId === memberId
                ? { ...share, amountCents: share.amountCents + leftover }
                : share
            )
          : [...item.split.shares, { memberId, amountCents: leftover }]
        return { ...item, split: { mode: "AMOUNT", shares } }
      }
      case "EQUAL":
      case "PARTS":
        return item
      default: {
        const _never: never = item.split
        return _never
      }
    }
  })
}

export function copyItemSplit(from: LineItem, to: LineItem): LineItem {
  switch (from.split.mode) {
    case "UNASSIGNED":
      return to
    case "EQUAL":
      return {
        ...to,
        split: { mode: "EQUAL", memberIds: [...from.split.memberIds] },
      }
    case "PARTS":
      return {
        ...to,
        split: {
          mode: "PARTS",
          parts: from.split.parts.map((part) => ({ ...part })),
        },
      }
    case "QUANTITY": {
      const memberIds = from.split.shares.map((share) => share.memberId)
      if (from.quantity === to.quantity) {
        return {
          ...to,
          split: {
            mode: "QUANTITY",
            shares: from.split.shares.map((share) => ({ ...share })),
          },
        }
      }
      return { ...to, split: { mode: "EQUAL", memberIds } }
    }
    case "AMOUNT":
      return {
        ...to,
        split: {
          mode: "EQUAL",
          memberIds: from.split.shares.map((share) => share.memberId),
        },
      }
    default: {
      const _never: never = from.split
      return _never
    }
  }
}

export function itemToAdjustment(
  item: LineItem,
  kind: AdjustmentKind,
  id: string
): Adjustment {
  const amount =
    kind === "DISCOUNT" ? -Math.abs(item.amountCents) : item.amountCents
  return {
    id,
    kind,
    name: item.name,
    amountCents: amount,
    allocate: "BY_ITEMS",
    source: item.source,
    confidence: item.confidence,
  }
}

export function adjustmentToItem(adjustment: Adjustment, id: string): LineItem {
  const amount = Math.abs(adjustment.amountCents)
  return {
    id,
    name: adjustment.name,
    quantity: 1,
    unitPriceCents: amount,
    amountCents: amount,
    modifiers: [],
    source: adjustment.source,
    confidence: adjustment.confidence,
    split: { mode: "UNASSIGNED" },
  }
}

export function withForcedPrintedTotal(
  adjustments: Adjustment[],
  computedTotalWithoutForce: number,
  notedTotalCents: number | null | undefined,
  id: string
): Adjustment[] {
  const without = adjustments.filter(
    (adjustment) => adjustment.name !== PRINTED_TOTAL_ADJUSTMENT_NAME
  )
  if (notedTotalCents == null) return without
  const delta = notedTotalCents - computedTotalWithoutForce
  if (delta === 0) return without
  return [
    ...without,
    {
      id,
      kind: delta < 0 ? "DISCOUNT" : "FEE",
      name: PRINTED_TOTAL_ADJUSTMENT_NAME,
      amountCents: delta,
      allocate: "BY_ITEMS",
      source: "MANUAL",
      confidence: null,
    },
  ]
}

export function computedTotalWithoutPrintedForce(input: {
  items: LineItem[]
  adjustments: Adjustment[]
  tip: TipConfig
}): number {
  const adjustments = input.adjustments.filter(
    (adjustment) => adjustment.name !== PRINTED_TOTAL_ADJUSTMENT_NAME
  )
  return computeDinnerSplit({
    items: input.items,
    adjustments,
    tip: input.tip,
  }).computedTotalCents
}

export function itemSplitMemberIds(split: ItemSplit): string[] {
  switch (split.mode) {
    case "UNASSIGNED":
      return []
    case "EQUAL":
      return [...split.memberIds]
    case "PARTS":
      return split.parts
        .filter((part) => part.weight > 0)
        .map((part) => part.memberId)
    case "QUANTITY":
      return split.shares
        .filter((share) => share.quantity > 0)
        .map((share) => share.memberId)
    case "AMOUNT":
      return split.shares.map((share) => share.memberId)
    default: {
      const _never: never = split
      return _never
    }
  }
}
