/**
 * Quantity belongs on the field; the name is the product only.
 *
 * If unit price (P.UNI / similar) differs from the line total and the total
 * divides evenly by the unit, that quotient is quantity — even with no count
 * column. A leading CNT, QTY, QUANTITY, AMT, AMOUNT, CANT, CANTIDAD (or
 * similar) is also quantity. Recover when the model bakes `N ×` into the name.
 */

export type OcrQtyFields = {
  name: string
  quantity: number
  unitPriceCents?: number | null
  amountCents: number
}

export type NormalizedOcrQty = {
  name: string
  quantity: number
  unitPriceCents?: number
}

const MULTIPLIER_PREFIX = /^(\d+)\s*[×xX]\s+(.+)$/u
const LEADING_COUNT = /^(\d+)\s+(.+)$/
const LEADING_MULTIPLIER = /^[×xX]\s+/u

function positiveInt(value: number): number | null {
  if (!Number.isFinite(value) || value <= 0) return null
  const rounded = Math.round(value)
  return rounded > 0 ? rounded : null
}

function qtyFromUnit(unit: number, amount: number): number | null {
  if (unit <= 0 || amount <= 0 || amount % unit !== 0) return null
  const qty = amount / unit
  return qty >= 1 ? qty : null
}

export function normalizeOcrItemQty(item: OcrQtyFields): NormalizedOcrQty {
  let name = item.name.trim()
  let quantity = positiveInt(item.quantity) ?? 1
  let unitPriceCents =
    item.unitPriceCents == null
      ? undefined
      : (positiveInt(item.unitPriceCents) ?? undefined)
  const amountCents = Math.round(item.amountCents)

  const multiplier = name.match(MULTIPLIER_PREFIX)
  const leading = multiplier ?? name.match(LEADING_COUNT)
  if (leading) {
    const prefixQty = Number.parseInt(leading[1], 10)
    const rest = leading[2].trim()
    const fromUnit =
      unitPriceCents != null ? qtyFromUnit(unitPriceCents, amountCents) : null
    const prefixExplainsTotal =
      unitPriceCents != null && prefixQty * unitPriceCents === amountCents
    const takePrefix =
      Boolean(multiplier) ||
      prefixQty === 1 ||
      prefixExplainsTotal ||
      fromUnit === prefixQty
    if (takePrefix && rest.length > 0) {
      name = rest
      if (quantity <= 1) quantity = prefixQty
    }
  }

  name = name.replace(LEADING_MULTIPLIER, "").trim()

  if (quantity === 1 && unitPriceCents != null) {
    const inferred = qtyFromUnit(unitPriceCents, amountCents)
    if (inferred != null && inferred > 1) quantity = inferred
  }

  if (
    quantity > 1 &&
    (unitPriceCents == null || unitPriceCents === amountCents) &&
    amountCents % quantity === 0
  ) {
    unitPriceCents = amountCents / quantity
  }

  return { name, quantity, unitPriceCents }
}
