/**
 * Quantity belongs on the field; the name is the product only.
 *
 * If unit price (P.UNI / similar) differs from the line total and the total
 * divides evenly by the unit, that quotient is quantity — even with no count
 * column. A leading CNT, QTY, QUANTITY, AMT, AMOUNT, CANT, CANTIDAD (or
 * similar) is also quantity. Recover when the model bakes `N ×` into the name.
 *
 * If the name starts with N (optional ×/x) and unit × N equals the line total,
 * N is quantity and must leave the name — including `8×Frijol` with no space.
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

/** Column labels that are quantity, not part of the product. */
const COUNT_ALIAS_PREFIX =
  /^(?:cnt|qty|quantity|amt|amount|cant|cantidad)\b[\s.:#-]*/i

/** Unicode ×: spaces optional. ASCII x/X: spaces, or glued only if unit × N matches. */
const UNICODE_MULTIPLIER = /^(\d+)\s*[×]\s*(.+)$/u
const SPACED_X_MULTIPLIER = /^(\d+)\s+[xX]\s+(.+)$/
const GLUED_X_COUNT = /^(\d+)[xX](.+)$/
const LEADING_COUNT = /^(\d+)\s+(.+)$/
const LEADING_MULTIPLIER = /^[×xX]\s*/u

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

function peelLeadingQty(name: string): {
  prefixQty: number
  rest: string
  hadMultiplier: boolean
} | null {
  const unicode = name.match(UNICODE_MULTIPLIER)
  if (unicode) {
    return {
      prefixQty: Number.parseInt(unicode[1], 10),
      rest: unicode[2].trim(),
      hadMultiplier: true,
    }
  }
  const spacedX = name.match(SPACED_X_MULTIPLIER)
  if (spacedX) {
    return {
      prefixQty: Number.parseInt(spacedX[1], 10),
      rest: spacedX[2].trim(),
      hadMultiplier: true,
    }
  }
  const gluedX = name.match(GLUED_X_COUNT)
  if (gluedX && gluedX[2].trim().length > 0) {
    return {
      prefixQty: Number.parseInt(gluedX[1], 10),
      rest: gluedX[2].trim(),
      hadMultiplier: false,
    }
  }
  const leading = name.match(LEADING_COUNT)
  if (leading) {
    return {
      prefixQty: Number.parseInt(leading[1], 10),
      rest: leading[2].trim(),
      hadMultiplier: false,
    }
  }
  return null
}

function stripCountAlias(name: string): string {
  let next = name.trim()
  for (let i = 0; i < 3; i += 1) {
    const stripped = next.replace(COUNT_ALIAS_PREFIX, "").trim()
    if (stripped === next) break
    next = stripped
  }
  return next
}

export function normalizeOcrItemQty(item: OcrQtyFields): NormalizedOcrQty {
  let name = stripCountAlias(item.name)
  let quantity = positiveInt(item.quantity) ?? 1
  let unitPriceCents =
    item.unitPriceCents == null
      ? undefined
      : (positiveInt(item.unitPriceCents) ?? undefined)
  const amountCents = Math.round(item.amountCents)

  const peeled = peelLeadingQty(name)
  if (peeled) {
    const prefixQty = peeled.prefixQty
    const rest = peeled.rest
    const fromUnit =
      unitPriceCents != null ? qtyFromUnit(unitPriceCents, amountCents) : null
    const prefixExplainsTotal =
      unitPriceCents != null && prefixQty * unitPriceCents === amountCents
    const takePrefix =
      peeled.hadMultiplier ||
      prefixQty === 1 ||
      prefixExplainsTotal ||
      fromUnit === prefixQty
    if (takePrefix && rest.length > 0) {
      name = rest
      if (quantity <= 1 || prefixExplainsTotal || fromUnit === prefixQty) {
        quantity = prefixQty
      }
    }
  }

  name = name.replace(LEADING_MULTIPLIER, "").trim()

  if (quantity === 1 && unitPriceCents != null) {
    const inferred = qtyFromUnit(unitPriceCents, amountCents)
    if (inferred != null && inferred > 1) quantity = inferred
  }

  const leftover = peelLeadingQty(name)
  if (leftover && leftover.rest.length > 0 && leftover.prefixQty === quantity) {
    name = leftover.rest
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
