import { parseAmountToCents } from "@/lib/settle"

export type OcrDraft = {
  title?: string
  amountCents?: number
  date?: string
  rawText?: string
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
