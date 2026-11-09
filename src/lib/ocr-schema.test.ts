import { describe, expect, it } from "vitest"

import { computeDinnerSplit } from "./dinner-split"
import {
  checkFromExtract,
  draftFromExtract,
  parseReceiptExtract,
} from "./ocr-schema"
import type { ReceiptExtract } from "./ocr-schema"
import {
  BIBLIOTECA_CAFE_MD,
  CELESTE_IMPERIO_MD,
  PUPUSERIA_PANCHIMALCO_MD,
} from "./receipt-ocr-fixtures"
import { checkPayloadFromOcr, extractCheckDraft } from "./receipt-ocr"
import type { OcrCheckDraft } from "./receipt-ocr"

function extractFromParsed(draft: OcrCheckDraft): ReceiptExtract {
  return {
    title: draft.merchant ?? null,
    merchant: draft.merchant ?? null,
    date: draft.date ?? null,
    isPrecuenta: draft.isPrecuenta === true,
    guestCountPrinted: draft.guestCountPrinted ?? null,
    items: draft.items.map((item) => ({
      name: item.name,
      quantity: item.quantity ?? 1,
      unitPriceCents: item.unitPriceCents ?? null,
      amountCents: item.amountCents,
      modifiers: item.modifiers,
    })),
    subtotalCents: draft.subtotalCents ?? null,
    totalCents: draft.totalCents ?? null,
    tip: draft.tip
      ? {
          amountCents: draft.tip.amountCents,
          percentHint: draft.tip.percentHint ?? null,
        }
      : null,
    fees: draft.fees.map((entry) => ({
      name: entry.name,
      amountCents: entry.amountCents,
    })),
    tax: (draft.tax ?? []).map((entry) => ({
      name: entry.name,
      amountCents: entry.amountCents,
    })),
    discounts: (draft.discounts ?? []).map((entry) => ({
      name: entry.name,
      amountCents: entry.amountCents,
    })),
    rawText: draft.rawText,
  }
}

describe("draftFromExtract", () => {
  it("round-trips Biblioteca parser output into a dinner draft", () => {
    const parsed = extractCheckDraft(BIBLIOTECA_CAFE_MD)
    const draft = draftFromExtract(extractFromParsed(parsed), "dinner")
    expect(draft.check?.isPrecuenta).toBe(true)
    expect(draft.check?.tip?.amountCents).toBe(1871)
    expect(draft.amountCents).toBe(20581)
    expect(draft.title).toBe(parsed.merchant)
    const latte = draft.check?.items.find((item) => item.name === "Iced Latte")
    expect(latte?.modifiers.some((mod) => /onz/i.test(mod))).toBe(true)

    const payload = checkPayloadFromOcr(draft.check!)
    const split = computeDinnerSplit(payload)
    expect(split.tipCents).toBe(1871)
  })

  it("keeps printed 0% tip instead of inventing 10%", () => {
    const parsed = extractCheckDraft(PUPUSERIA_PANCHIMALCO_MD)
    const check = checkFromExtract(extractFromParsed(parsed), parsed.rawText)
    expect(check.tip?.amountCents).toBe(0)
    expect(check.tip?.percentHint).toBe(0)
    expect(checkPayloadFromOcr(check).tip.source).toBe("TICKET")
    expect(computeDinnerSplit(checkPayloadFromOcr(check)).tipCents).toBe(0)
  })

  it("keeps Celeste continuation modifiers", () => {
    const parsed = extractCheckDraft(CELESTE_IMPERIO_MD)
    const draft = draftFromExtract(extractFromParsed(parsed), "dinner")
    const wantan = draft.check?.items.find((item) =>
      /wantan frito/i.test(item.name)
    )
    expect(wantan?.modifiers).toContain("RES")
    expect(draft.check?.items).toHaveLength(5)
  })

  it("omits check in trip mode and still fills title/total", () => {
    const parsed = extractCheckDraft(BIBLIOTECA_CAFE_MD)
    const draft = draftFromExtract(extractFromParsed(parsed), "trip")
    expect(draft.check).toBeUndefined()
    expect(draft.title).toBeTruthy()
    expect(draft.amountCents).toBe(20581)
  })

  it("treats missing tip as absent, not 10%", () => {
    const extract = extractFromParsed(extractCheckDraft(BIBLIOTECA_CAFE_MD))
    extract.tip = null
    const check = checkFromExtract(extract, extract.rawText)
    expect(check.tip).toBeUndefined()
    expect(checkPayloadFromOcr(check).tip.source).toBe("NONE")
  })
})

describe("parseReceiptExtract", () => {
  it("accepts a complete extract", () => {
    const parsed = parseReceiptExtract(
      extractFromParsed(extractCheckDraft(CELESTE_IMPERIO_MD))
    )
    expect(parsed?.items.length).toBe(5)
  })

  it("rejects objects that are missing items", () => {
    expect(parseReceiptExtract({ title: "Cafe" })).toBeNull()
  })
})
