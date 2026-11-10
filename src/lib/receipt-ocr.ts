import {
  emptyCheckPayload,
  emptyTip,
  ticketTip,
} from "@/lib/dinner-split"
import type { CheckPayload, LineItem } from "@/lib/dinner-split"
import { normalizeOcrItemQty } from "@/lib/ocr-qty"
import { parseAmountToCents } from "@/lib/settle"

export type OcrCheckItem = {
  name: string
  quantity?: number
  unitPriceCents?: number
  amountCents: number
  modifiers: string[]
  confidence: number
}

export type OcrNamedAmount = {
  name: string
  amountCents: number
  confidence: number
}

export type OcrCheckDraft = {
  merchant?: string
  date?: string
  currencyHint?: string
  isPrecuenta?: boolean
  guestCountPrinted?: number | null
  items: OcrCheckItem[]
  subtotalCents?: number
  tax?: OcrNamedAmount[]
  tip?: { amountCents: number; percentHint?: number; confidence: number }
  fees: OcrNamedAmount[]
  discounts?: Array<{ name: string; amountCents: number }>
  totalCents?: number
  rawText: string
}

export type OcrDraft = {
  title?: string
  amountCents?: number
  date?: string
  rawText?: string
  check?: OcrCheckDraft
}

type AmountCandidate = {
  amountCents: number
  lineIndex: number
  score: number
}

const MONEY_NUMBER_PATTERN =
  /(?:[$₡€£]\s*)?((?:\d{1,3}(?:[.,]\d{3})+|\d+)(?:[.,]\d{1,2})?)(?:\s*(?:USD|EUR|CRC|SVC|MXN|GTQ|HNL|NIO|PAB|GBP))?/gi

const TOTAL_KEYWORDS =
  /\b(?:grand\s+total|total\s+(?:a\s+pagar|due|venta|general|neto)|importe\s+total|monto\s+total|amount\s+due|balance\s+due|total)\b/i

const SUBTOTAL_KEYWORDS =
  /\b(?:subtotal|sub\s*total|tax|iva|impuesto|propina|tip|discount|descuento|cambio|change|vuelto|gravado|exento)\b/i

function scoreAmountLine(
  line: string,
  previousLine: string,
  amountCents: number,
  lineIndex: number,
  lineCount: number
): number {
  const context = `${previousLine} ${line}`
  const hasTotal = TOTAL_KEYWORDS.test(context)
  const hasSubtotal = SUBTOTAL_KEYWORDS.test(context)

  let score = lineIndex / Math.max(lineCount, 1)
  if (hasTotal) score += 100
  if (
    /\b(?:a\s+pagar|grand\s+total|amount\s+due|balance\s+due)\b/i.test(context)
  ) {
    score += 25
  }
  if (hasSubtotal) score -= 60
  if (/[$₡€£]|USD|EUR|CRC|SVC|MXN|GTQ|HNL|NIO|PAB|GBP/i.test(line)) {
    score += 3
  }
  score += Math.min(amountCents / 100_000, 10)

  return score
}

function extractAmountCandidates(lines: string[]): AmountCandidate[] {
  const candidates: AmountCandidate[] = []

  lines.forEach((line, lineIndex) => {
    const previousLine = lines[lineIndex - 1] ?? ""
    for (const match of line.matchAll(MONEY_NUMBER_PATTERN)) {
      const rawAmount = match[1]
      if (!rawAmount) continue

      const amountCents = parseAmountToCents(rawAmount)
      if (amountCents === null || amountCents <= 0) continue

      candidates.push({
        amountCents,
        lineIndex,
        score: scoreAmountLine(
          line,
          previousLine,
          amountCents,
          lineIndex,
          lines.length
        ),
      })
    }
  })

  return candidates
}

export function extractDraft(markdown: string): OcrDraft {
  const lines = markdown
    .split(/\r?\n/)
    .map((line) => line.replace(/^[#>*\-\s]+/, "").trim())
    .filter(Boolean)

  const amountCents = extractAmountCandidates(lines).sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    return b.lineIndex - a.lineIndex
  })[0]?.amountCents

  const dateMatch = markdown.match(
    /(\d{4}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}[-/]\d{1,2}[-/]\d{2,4})/
  )

  const title =
    lines.find(
      (line) =>
        line.length >= 3 &&
        line.length <= 48 &&
        !/\d+[.,]\d{2}/.test(line) &&
        !/total|subtotal|tax|iva/i.test(line)
    ) ?? lines[0]

  return {
    title,
    amountCents,
    date: dateMatch?.[1],
    rawText: markdown.slice(0, 2000),
  }
}

const SKIP_LINE =
  /^(invitados|clientes atendidos|mesa:?|mesas$|mesero|caja(?:\s+no)?\.?|pague en caja|gracias|order no|cambio|vuelto|tel:?$|fecha(?:\s+de)?|atendido por|ticket$|no valido|precuenta|pre-ticket|preticket|doscientos|f\s*:|cant\s+descript|cnt\s+producto|cant\s+descripcion|hora\b|#\s*no valido)/i

const FOOTER_LINE =
  /^(sub\s*total|subtotal|sub\s*vta|subnosujetas|sub\s*no\s*sujetas|propina|tip\b|iva\b|tax\b|impuesto|descuento|discount|total(?:\s|$)|total ventas)/i

const FISCAL_NAME =
  /gravad|nosujet|no sujet|sub vta|ventas gravadas|exento/i

const MONEY_AT_END =
  /(?:\$\s*)?(\d{1,3}(?:[.,]\d{3})*[.,]\d{2}|\d+[.,]\d{2})[A-Za-z]?\s*$/

const RAW_TEXT_LIMIT = 20_000

function normalizeOcrLines(markdown: string): string[] {
  return markdown
    .split(/\r?\n/)
    .map((line) =>
      line
        .replace(/^\s*\|/, "")
        .replace(/\|\s*$/, "")
        .replace(/\|/g, " ")
        .replace(/^[#>*]+\s+/, "")
        .replace(/\s+/g, " ")
        .trim()
    )
    .filter(Boolean)
}

function peelMoneyFromEnd(line: string): { rest: string; amounts: number[] } {
  let rest = line.trim()
  const amounts: number[] = []
  while (amounts.length < 2) {
    const match = rest.match(MONEY_AT_END)
    if (!match || match.index == null) break
    const cents = parseAmountToCents(match[1])
    if (cents == null) break
    amounts.unshift(cents)
    rest = rest.slice(0, match.index).trim()
  }
  return { rest, amounts }
}

function parseItemLine(
  line: string
): {
  quantity: number
  name: string
  unitPriceCents?: number
  amountCents: number
} | null {
  const { rest, amounts } = peelMoneyFromEnd(line)
  if (amounts.length === 0) return null
  const qtyMatch = rest.match(/^(\d+)\s+(.+)$/)
  if (!qtyMatch) return null
  const name = qtyMatch[2].trim()
  if (!name || FOOTER_LINE.test(name) || SKIP_LINE.test(name)) return null
  if (FOOTER_LINE.test(line) || SKIP_LINE.test(line)) return null
  const quantity = Number.parseInt(qtyMatch[1], 10)
  if (!Number.isFinite(quantity) || quantity <= 0) return null
  const amountCents = amounts.length === 2 ? amounts[1] : amounts[0]
  const unitPriceCents =
    amounts.length === 2 ? amounts[0] : Math.round(amountCents / quantity)
  return {
    ...normalizeOcrItemQty({
      name,
      quantity,
      unitPriceCents,
      amountCents,
    }),
    amountCents,
  }
}

function isModifierLine(line: string): string | null {
  const starred = line.match(/^(?:\*{1,2}|•|-)\s*(.+)$/)
  if (starred) return starred[1].trim() || null
  if (/^(res|vas|pollo|cerdo)$/i.test(line)) return line.toUpperCase()
  if (/^\d+\s*onz\b/i.test(line)) return line
  return null
}

function footerKind(line: string): string | null {
  if (/propina|\btip\b/i.test(line)) return "tip"
  if (/\biva\b|\btax\b|impuesto/i.test(line) && !FISCAL_NAME.test(line)) {
    return "tax"
  }
  if (/descuento|discount/i.test(line)) return "discount"
  if (/servicio|service|late\s*night|delivery|cargo|recargo|fee/i.test(line)) {
    return "fee"
  }
  if (/total\s+a\s+pagar|total\s+pagar|grand\s+total|amount\s+due/i.test(line)) {
    return "total"
  }
  if (/^total\b|total ventas/i.test(line) && !/sub\s*total|subtotal/i.test(line)) {
    return "total"
  }
  if (/sub\s*total|subtotal/i.test(line) && !FISCAL_NAME.test(line)) {
    return "subtotal"
  }
  if (FISCAL_NAME.test(line)) return "fiscal"
  return null
}

function lastMoneyOnLine(line: string): number | null {
  const matches = [...line.matchAll(MONEY_NUMBER_PATTERN)]
  const last = matches[matches.length - 1]
  if (!last[1]) return null
  return parseAmountToCents(last[1])
}

function guestCountFrom(text: string): number | null {
  const match = text.match(
    /(?:invitados|clientes atendidos)\s*:?\s*(\d+)/i
  )
  if (!match) return null
  const value = Number.parseInt(match[1], 10)
  return Number.isFinite(value) ? value : null
}

/**
 * Structured dinner-ticket parse. Does not invent tip/tax: only footer lines.
 * Nested `** 16 ONZ` and `RES`/`VAS` become modifiers, not items.
 */
export function extractCheckDraft(markdown: string): OcrCheckDraft {
  const lines = normalizeOcrLines(markdown)
  const items: OcrCheckItem[] = []
  const tax: OcrNamedAmount[] = []
  const fees: OcrNamedAmount[] = []
  const discounts: Array<{ name: string; amountCents: number }> = []
  let subtotalCents: number | undefined
  let totalCents: number | undefined
  let tip:
    | { amountCents: number; percentHint?: number; confidence: number }
    | undefined
  let seenItem = false

  const headerLines: string[] = []

  for (const line of lines) {
    if (SKIP_LINE.test(line) && !FOOTER_LINE.test(line)) {
      if (!seenItem) headerLines.push(line)
      continue
    }

    const modifier = isModifierLine(line)
    if (modifier && items.length > 0 && !parseItemLine(line)) {
      const last = items[items.length - 1]
      if (!last.modifiers.includes(modifier)) {
        last.modifiers.push(modifier)
      }
      continue
    }

    if (FOOTER_LINE.test(line) && seenItem) {
      const kind = footerKind(line)
      const amount = lastMoneyOnLine(line)
      if (kind === "tip") {
        const percentMatch = line.match(/(\d+(?:[.,]\d+)?)\s*%/)
        const percentHint = percentMatch
          ? Number.parseFloat(percentMatch[1].replace(",", "."))
          : undefined
        const amountCents = amount ?? 0
        tip = {
          amountCents,
          percentHint: Number.isFinite(percentHint) ? percentHint : undefined,
          confidence: 0.9,
        }
        continue
      }
      if (kind === "tax" && amount != null && amount > 0) {
        tax.push({ name: line, amountCents: amount, confidence: 0.8 })
        continue
      }
      if (kind === "discount") {
        if (amount && amount !== 0) {
          discounts.push({ name: "Discount", amountCents: Math.abs(amount) })
        }
        continue
      }
      if (kind === "fee" && amount != null && amount !== 0) {
        fees.push({ name: line, amountCents: amount, confidence: 0.8 })
        continue
      }
      if (kind === "subtotal" && amount != null) {
        subtotalCents = amount
        continue
      }
      if (kind === "total" && amount != null) {
        totalCents = amount
        continue
      }
      if (kind === "fiscal") continue
    }

    const parsed = parseItemLine(line)
    if (parsed) {
      seenItem = true
      items.push({
        name: parsed.name,
        quantity: parsed.quantity,
        unitPriceCents: parsed.unitPriceCents,
        amountCents: parsed.amountCents,
        modifiers: [],
        confidence: 0.85,
      })
      continue
    }

    if (!seenItem) headerLines.push(line)
  }

  const isPrecuenta =
    /precuenta|pre-ticket|preticket|no valido como ticket/i.test(markdown)
  const merchant =
    headerLines.find(
      (line) =>
        line.length >= 8 &&
        line.length <= 60 &&
        !/caja|fecha|invitados|mesa|mesero|ticket|tel:/i.test(line) &&
        !/\d+[.,]\d{2}/.test(line)
    ) ?? headerLines[0]

  const currencyHint = /usd|dolares americanos|\$/.test(markdown)
    ? "USD"
    : undefined

  const dateMatch = markdown.match(
    /(\d{4}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}[-/]\d{1,2}[-/]\d{2,4})/
  )

  const filteredTax = tax.filter((entry) => {
    if (subtotalCents != null && entry.amountCents === subtotalCents) {
      return false
    }
    if (FISCAL_NAME.test(entry.name)) return false
    return entry.amountCents > 0
  })

  return {
    merchant,
    date: dateMatch?.[1],
    currencyHint,
    isPrecuenta,
    guestCountPrinted: guestCountFrom(markdown),
    items,
    subtotalCents,
    tax: filteredTax.length > 0 ? filteredTax : undefined,
    tip,
    fees,
    discounts: discounts.length > 0 ? discounts : undefined,
    totalCents,
    rawText: markdown.slice(0, RAW_TEXT_LIMIT),
  }
}

export function checkPayloadFromOcr(
  draft: OcrCheckDraft,
  nextId: () => string = () => crypto.randomUUID()
): CheckPayload {
  const items: LineItem[] = draft.items.map((entry) => ({
    id: nextId(),
    name: entry.name,
    quantity: entry.quantity && entry.quantity > 0 ? entry.quantity : 1,
    unitPriceCents: entry.unitPriceCents ?? entry.amountCents,
    amountCents: entry.amountCents,
    modifiers: entry.modifiers,
    source: "OCR",
    confidence: entry.confidence,
    split: { mode: "UNASSIGNED" },
  }))

  const adjustments = [
    ...(draft.tax ?? []).map((entry) => ({
      id: nextId(),
      kind: "TAX" as const,
      name: "Tax",
      amountCents: entry.amountCents,
      allocate: "BY_ITEMS" as const,
      source: "OCR" as const,
      confidence: entry.confidence,
    })),
    ...draft.fees.map((entry) => ({
      id: nextId(),
      kind: "FEE" as const,
      name: entry.name.slice(0, 80),
      amountCents: entry.amountCents,
      allocate: "BY_ITEMS" as const,
      source: "OCR" as const,
      confidence: entry.confidence,
    })),
    ...(draft.discounts ?? []).map((entry) => ({
      id: nextId(),
      kind: "DISCOUNT" as const,
      name: entry.name.slice(0, 80),
      amountCents: -Math.abs(entry.amountCents),
      allocate: "BY_ITEMS" as const,
      source: "OCR" as const,
      confidence: null,
    })),
  ]

  let tip = emptyTip()
  if (draft.tip) {
    tip = ticketTip(draft.tip.amountCents, draft.tip.percentHint ?? null)
  }

  const payload = emptyCheckPayload()
  return {
    ...payload,
    items,
    adjustments,
    tip,
    notedSubtotalCents: draft.subtotalCents ?? null,
    notedTotalCents: draft.totalCents ?? null,
    rawText: draft.rawText,
  }
}
