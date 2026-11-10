import { z } from "zod"

import { normalizeOcrItemQty } from "@/lib/ocr-qty"
import type { OcrCheckDraft, OcrDraft, OcrNamedAmount } from "@/lib/receipt-ocr"

/** Vision items are model-read, not a deterministic OCR parse. */
const VISION_CONFIDENCE = 0.75
const RAW_TEXT_LIMIT = 20_000

const namedAmountSchema = z.object({
  name: z.string().describe("Printed label, e.g. IVA or servicio"),
  amountCents: z.number().describe("Integer cents. 4.10 USD → 410"),
})

const itemSchema = z.object({
  name: z
    .string()
    .describe(
      "Product name only — no quantity, no '8 ×', no CNT/QTY/AMT prefix, no size/modifier suffixes. Example: Frijol/Queso pq"
    ),
  quantity: z
    .number()
    .describe(
      "Printed count from CNT, QTY, QUANTITY, AMT, AMOUNT, CANT, CANTIDAD, or similar. When unit price ≠ line total and the total divides evenly by the unit, use that quotient (e.g. 8), not 1 per row"
    ),
  unitPriceCents: z
    .number()
    .nullable()
    .describe(
      "P.UNI / P.UNIT / unit price in cents if printed; otherwise null. Example: 1.40 → 140"
    ),
  amountCents: z.number().describe("Line total in cents"),
  modifiers: z
    .array(z.string())
    .describe("Nested lines like ** 16 ONZ, RES, VAS — not separate items"),
})

const tipSchema = z.object({
  amountCents: z
    .number()
    .describe("Printed tip in cents. PROPINA 0% / $0.00 → 0, never 10%"),
  percentHint: z
    .number()
    .nullable()
    .describe("Printed percent if present, else null"),
})

/**
 * Split's receipt contract. OpenAI structured outputs enforce this shape;
 * layouts still vary — missing fields are null or empty arrays.
 */
export const receiptExtractSchema = z.object({
  title: z
    .string()
    .nullable()
    .describe("Short expense title, usually the merchant"),
  merchant: z.string().nullable().describe("Business name on the ticket"),
  date: z.string().nullable().describe("Printed date if any"),
  isPrecuenta: z
    .boolean()
    .describe("True if PRECUENTA, PRE-TICKET, or NO VALIDO COMO TICKET"),
  guestCountPrinted: z
    .number()
    .nullable()
    .describe("Invitados / clientes atendidos if printed"),
  items: z.array(itemSchema),
  subtotalCents: z.number().nullable(),
  totalCents: z
    .number()
    .nullable()
    .describe("Payable total, not an earlier subtotal"),
  tip: tipSchema
    .nullable()
    .describe("Only if a tip/propina line is printed; else null"),
  fees: z.array(namedAmountSchema),
  tax: z.array(namedAmountSchema),
  discounts: z.array(namedAmountSchema),
  rawText: z
    .string()
    .describe("Faithful transcription of readable printed text, not a summary"),
})

export type ReceiptExtract = z.infer<typeof receiptExtractSchema>

export const RECEIPT_VISION_INSTRUCTIONS = `Extract a restaurant or receipt photo into the JSON schema.

Amounts are integer cents (4.10 → 410). Nested modifiers like ** 16 ONZ or RES/VAS belong on the previous item, not as their own items.

Quantity lives in \`quantity\`, never in \`name\`. If unit price (P.UNI / P.UNIT / similar) differs from the line TOTAL and the total divides evenly by the unit, that quotient is quantity — even when no count is printed. A leading column labeled CNT, QTY, QUANTITY, AMT, AMOUNT, CANT, CANTIDAD, or similar is also quantity. Example: \`8 Frijol/Queso pq  1.40  $11.20\` or \`Frijol/Queso pq  1.40  $11.20\` → name "Frijol/Queso pq", quantity 8, unitPriceCents 140, amountCents 1120. Do not write "8 × Frijol/Queso pq". If quantity is 1, the name is only the product (\`Chicharron/Frijol pq\`), never prefixed with "1 ×".

Do not invent tip, tax, IVA, or fees — only footer lines that are printed. PROPINA 0% or $0.00 means tip amountCents 0 and percentHint 0, never 10%. If no tip line exists, tip is null.

Gravado that matches the subtotal is not extra tax. Ignore Invitados, CLIENTES ATENDIDOS, MESA, MESERO, Order No, NIT, Caja.

isPrecuenta is true for PRECUENTA, PRE-TICKET, or NO VALIDO COMO TICKET. rawText is a transcription of what you can read, not a paraphrase. If the photo is unreadable, return empty items and whatever rawText you can see.`

export type OcrScanMode = "trip" | "dinner"

function nonempty(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed ? trimmed : undefined
}

function namedAmounts(
  rows: Array<{ name: string; amountCents: number }>
): OcrNamedAmount[] {
  const amounts: OcrNamedAmount[] = []
  for (const row of rows) {
    const name = row.name.trim()
    const amountCents = Math.round(row.amountCents)
    if (!name || !Number.isFinite(amountCents) || amountCents === 0) continue
    amounts.push({ name, amountCents, confidence: VISION_CONFIDENCE })
  }
  return amounts
}

export function checkFromExtract(
  extract: ReceiptExtract,
  rawText: string
): OcrCheckDraft {
  const items: OcrCheckDraft["items"] = []
  for (const row of extract.items) {
    const name = row.name.trim()
    const amountCents = Math.round(row.amountCents)
    if (!name || !Number.isFinite(amountCents) || amountCents < 0) continue
    const normalized = normalizeOcrItemQty({
      name,
      quantity:
        typeof row.quantity === "number" && row.quantity > 0 ? row.quantity : 1,
      unitPriceCents: row.unitPriceCents,
      amountCents,
    })
    if (!normalized.name) continue
    items.push({
      name: normalized.name,
      quantity: normalized.quantity,
      unitPriceCents: normalized.unitPriceCents,
      amountCents,
      modifiers: row.modifiers
        .map((mod) => mod.trim())
        .filter((mod) => mod.length > 0),
      confidence: VISION_CONFIDENCE,
    })
  }

  const tipAmount =
    extract.tip && Number.isFinite(extract.tip.amountCents)
      ? Math.round(extract.tip.amountCents)
      : undefined

  const tax = namedAmounts(extract.tax)
  const fees = namedAmounts(extract.fees)
  const discounts = namedAmounts(extract.discounts).map((entry) => ({
    name: entry.name,
    amountCents: entry.amountCents,
  }))

  return {
    merchant: nonempty(extract.merchant) ?? nonempty(extract.title),
    date: nonempty(extract.date),
    isPrecuenta: extract.isPrecuenta === true,
    guestCountPrinted: extract.guestCountPrinted,
    items,
    subtotalCents:
      extract.subtotalCents == null
        ? undefined
        : Math.round(extract.subtotalCents),
    totalCents:
      extract.totalCents == null ? undefined : Math.round(extract.totalCents),
    tip:
      tipAmount == null
        ? undefined
        : {
            amountCents: Math.max(0, tipAmount),
            percentHint:
              extract.tip?.percentHint == null
                ? undefined
                : extract.tip.percentHint,
            confidence: VISION_CONFIDENCE,
          },
    fees,
    tax: tax.length > 0 ? tax : undefined,
    discounts: discounts.length > 0 ? discounts : undefined,
    rawText: rawText.slice(0, RAW_TEXT_LIMIT),
  }
}

export function draftFromExtract(
  extract: ReceiptExtract,
  mode: OcrScanMode
): OcrDraft {
  const rawText = extract.rawText.trim().slice(0, RAW_TEXT_LIMIT)
  const title = nonempty(extract.title) ?? nonempty(extract.merchant)
  const date = nonempty(extract.date)
  const amountCents =
    extract.totalCents != null &&
    Number.isFinite(extract.totalCents) &&
    extract.totalCents > 0
      ? Math.round(extract.totalCents)
      : undefined

  const trip: OcrDraft = {
    title,
    amountCents,
    date,
    rawText: rawText || undefined,
  }

  switch (mode) {
    case "trip":
      return trip
    case "dinner":
      return {
        ...trip,
        check: checkFromExtract(extract, rawText),
      }
    default: {
      const _exhaustive: never = mode
      return _exhaustive
    }
  }
}

export function parseReceiptExtract(raw: unknown): ReceiptExtract | null {
  const parsed = receiptExtractSchema.safeParse(raw)
  return parsed.success ? parsed.data : null
}
