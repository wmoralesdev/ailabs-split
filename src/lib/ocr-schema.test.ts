import { describe, expect, it } from "vitest"

import { computeDinnerSplit } from "./dinner-split"
import {
  RECEIPT_VISION_INSTRUCTIONS,
  checkFromExtract,
  draftFromExtract,
  parseReceiptExtract,
} from "./ocr-schema"
import type { ReceiptExtract } from "./ocr-schema"
import { PUPUSERIA_PANCHIMALCO_LIVE_EXTRACT } from "./panchimalco-live-ocr"
import { PASTARIA_MESA_M11_LIVE_EXTRACT } from "./pastaria-live-ocr"
import {
  BIBLIOTECA_CAFE_MD,
  CELESTE_IMPERIO_MD,
  PASTARIA_MESA_M11_MD,
  PUPUSERIA_PANCHIMALCO_MD,
  PUPUSERIA_PANCHIMALCO_PRETICKET_MD,
  UNIT_DIVIDES_TOTAL_MD,
} from "./receipt-ocr-fixtures"
import { checkPayloadFromOcr, extractCheckDraft } from "./receipt-ocr"
import type { OcrCheckDraft } from "./receipt-ocr"

function withCntBakedIntoNames(extract: ReceiptExtract): ReceiptExtract {
  return {
    ...extract,
    items: extract.items.map((item) => ({
      ...item,
      name: item.quantity > 1 ? `${item.quantity}×${item.name}` : item.name,
      quantity: 1,
    })),
  }
}

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
    extract.rawText = extract.rawText.replace(/PROPINA[^\n]*\n/i, "")
    const check = checkFromExtract(extract, extract.rawText)
    expect(check.tip).toBeUndefined()
    expect(checkPayloadFromOcr(check).tip.source).toBe("NONE")
  })

  it("pulls Panchimalco CNT out of vision item names into quantity", () => {
    const parsed = extractCheckDraft(PUPUSERIA_PANCHIMALCO_PRETICKET_MD)
    const extract = extractFromParsed(parsed)
    extract.items = extract.items.map((item) => ({
      ...item,
      name: item.quantity > 1 ? `${item.quantity} × ${item.name}` : item.name,
      quantity: 1,
    }))

    const check = checkFromExtract(extract, extract.rawText)
    const frijol = check.items.find((item) => item.name === "Frijol/Queso pq")
    expect(frijol?.quantity).toBe(8)
    expect(frijol?.name).toBe("Frijol/Queso pq")
    const chicharron = check.items.find(
      (item) => item.name === "Chicharron/Frijol pq"
    )
    expect(chicharron?.quantity).toBe(1)
    expect(chicharron?.name).not.toMatch(/^\d/)
    expect(check.items.every((item) => !/^\d+\s*[×xX]/u.test(item.name))).toBe(
      true
    )
    expect(check.totalCents).toBe(6000)
    expect(check.tip?.amountCents).toBe(0)

    const payload = checkPayloadFromOcr(check)
    expect(
      payload.items.find((item) => item.name === "Soda vidrio")?.quantity
    ).toBe(6)
    expect(computeDinnerSplit(payload).totalCents).toBe(6000)
  })

  it("infers quantity from vision rows where unit price divides the line total", () => {
    const parsed = extractCheckDraft(UNIT_DIVIDES_TOTAL_MD)
    const extract = extractFromParsed(parsed)
    extract.items = extract.items.map((item) => ({
      ...item,
      quantity: 1,
    }))

    const check = checkFromExtract(extract, extract.rawText)
    expect(
      check.items.find((item) => item.name === "Frijol/Queso pq")?.quantity
    ).toBe(8)
    expect(
      check.items.find((item) => item.name === "Soda vidrio")?.quantity
    ).toBe(6)
    expect(
      check.items.find((item) => item.name === "Frijol pq")?.quantity
    ).toBe(1)
    expect(check.items.every((item) => !/^\d+\s*[×xX]/u.test(item.name))).toBe(
      true
    )
    expect(check.tip?.amountCents).toBe(0)
  })

  it("keeps live Panchimalco gpt-5-mini qty on the field, tip $0, total $60", () => {
    const check = checkFromExtract(
      PUPUSERIA_PANCHIMALCO_LIVE_EXTRACT,
      PUPUSERIA_PANCHIMALCO_LIVE_EXTRACT.rawText
    )
    const frijol = check.items.find((item) => item.name === "Frijol/Queso pq")
    const revuelta = check.items.find((item) => item.name === "Revuelta pq")
    expect(frijol?.quantity).toBe(8)
    expect(frijol?.name).toBe("Frijol/Queso pq")
    expect(revuelta?.quantity).toBe(10)
    expect(revuelta?.name).toBe("Revuelta pq")
    expect(check.items.every((item) => !/^\d+\s*[×xX]/u.test(item.name))).toBe(
      true
    )
    expect(check.tip?.amountCents).toBe(0)
    expect(check.tip?.percentHint).toBe(0)
    expect(check.totalCents).toBe(6000)
    expect(check.isPrecuenta).toBe(true)
  })

  it("peels live CNT baked into names as 8×Frijol with quantity 1", () => {
    const extract = withCntBakedIntoNames(PUPUSERIA_PANCHIMALCO_LIVE_EXTRACT)
    expect(extract.items[0]?.name).toBe("8×Frijol/Queso pq")
    expect(extract.items[1]?.name).toBe("10×Revuelta pq")

    const check = checkFromExtract(extract, extract.rawText)
    const frijol = check.items.find((item) => item.name === "Frijol/Queso pq")
    const revuelta = check.items.find((item) => item.name === "Revuelta pq")
    expect(frijol?.quantity).toBe(8)
    expect(frijol?.name).toBe("Frijol/Queso pq")
    expect(revuelta?.quantity).toBe(10)
    expect(revuelta?.name).toBe("Revuelta pq")
    expect(check.items.every((item) => !/^\d+\s*[×xX]/u.test(item.name))).toBe(
      true
    )
    expect(check.tip?.amountCents).toBe(0)
    expect(check.totalCents).toBe(6000)

    const payload = checkPayloadFromOcr(check)
    expect(
      payload.items.find((item) => item.name === "Frijol/Queso pq")?.quantity
    ).toBe(8)
    expect(
      payload.items.find((item) => item.name === "Revuelta pq")?.quantity
    ).toBe(10)
    expect(payload.tip.amountCents).toBe(0)
    expect(computeDinnerSplit(payload).totalCents).toBe(
      payload.items.reduce((sum, item) => sum + item.amountCents, 0)
    )
  })
})

describe("RECEIPT_VISION_INSTRUCTIONS", () => {
  it("tells the model quantity comes from unit÷total and any count column", () => {
    expect(RECEIPT_VISION_INSTRUCTIONS).toMatch(/P\.UNI/)
    expect(RECEIPT_VISION_INSTRUCTIONS).toMatch(/divides evenly/)
    expect(RECEIPT_VISION_INSTRUCTIONS).toMatch(/QTY/)
    expect(RECEIPT_VISION_INSTRUCTIONS).toMatch(/CANTIDAD/)
    expect(RECEIPT_VISION_INSTRUCTIONS).toMatch(/AMT/)
    expect(RECEIPT_VISION_INSTRUCTIONS).toMatch(/AMOUNT/)
    expect(RECEIPT_VISION_INSTRUCTIONS).toMatch(/Frijol\/Queso pq/)
    expect(RECEIPT_VISION_INSTRUCTIONS).toMatch(/PRE-TICKET/)
  })

  it("tells the model to keep last extras, $0 AYCE, and wrapped names", () => {
    expect(RECEIPT_VISION_INSTRUCTIONS).toMatch(/last one immediately above/)
    expect(RECEIPT_VISION_INSTRUCTIONS).toMatch(/AYCE/)
    expect(RECEIPT_VISION_INSTRUCTIONS).toMatch(/PAN ALMUERZO CENA/)
    expect(RECEIPT_VISION_INSTRUCTIONS).toMatch(/wrapped onto the next line/)
    expect(RECEIPT_VISION_INSTRUCTIONS).toMatch(/Propina \(10%\)/)
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

describe("checkFromExtract Pastaria recovery", () => {
  it("keeps $0 AYCE rows from vision", () => {
    const parsed = extractCheckDraft(PASTARIA_MESA_M11_MD)
    const extract = extractFromParsed(parsed)
    const check = checkFromExtract(extract, extract.rawText)
    expect(
      check.items.filter((item) => item.amountCents === 0).length
    ).toBeGreaterThan(8)
    expect(
      check.items.find((item) => /insalata caesar/i.test(item.name))
        ?.amountCents
    ).toBe(0)
  })

  it("recovers pan and footer totals when vision stops before Subtotal", () => {
    const parsed = extractCheckDraft(PASTARIA_MESA_M11_MD)
    const extract = extractFromParsed(parsed)
    extract.items = extract.items.filter(
      (item) => !/pan almuerzo|formaggi|te cupon/i.test(item.name)
    )
    extract.tip = null
    extract.subtotalCents = null
    extract.totalCents = null
    extract.merchant = null
    extract.title = null

    const check = checkFromExtract(extract, extract.rawText)
    const pan = check.items.find((item) => /pan almuerzo cena/i.test(item.name))
    expect(pan).toMatchObject({ quantity: 2, amountCents: 100 })
    expect(check.items.find((item) => /formaggi/i.test(item.name))).toBeTruthy()
    expect(check.tip?.amountCents).toBe(567)
    expect(check.tip?.percentHint).toBe(10)
    expect(check.subtotalCents).toBe(5665)
    expect(check.totalCents).toBe(6232)
    expect(check.merchant).toMatch(/pastaria/i)
    expect(check.guestCountPrinted).toBe(6)
    expect(check.items.length).not.toBe(6)

    const payload = checkPayloadFromOcr(check)
    expect(payload.tip.amountCents).toBe(567)
    expect(computeDinnerSplit(payload).totalCents).toBe(6232)
  })

  it("keeps live gpt-5-mini Pastaria pan, $0 AYCE, and printed propina", () => {
    const check = checkFromExtract(
      PASTARIA_MESA_M11_LIVE_EXTRACT,
      PASTARIA_MESA_M11_LIVE_EXTRACT.rawText
    )
    expect(check.items).toHaveLength(16)
    expect(
      check.items.find((item) => item.name === "PAN ALMUERZO CENA")
    ).toMatchObject({ quantity: 2, amountCents: 100 })
    expect(
      check.items.find((item) => item.name === "INSALATA CAESAR AYCE")
        ?.amountCents
    ).toBe(0)
    expect(
      check.items.find((item) => item.name === "BRUSC BASIL PEPPERONI AYCE")
    ).toBeTruthy()
    expect(check.items.at(-1)?.name).toBe("PAST 4 FORMAGGI AYCE")
    expect(check.tip?.amountCents).toBe(567)
    expect(check.tip?.percentHint).toBe(10)
    expect(check.subtotalCents).toBe(5665)
    expect(check.totalCents).toBe(6232)
    expect(check.guestCountPrinted).toBe(6)
    expect(check.items.length).not.toBe(check.guestCountPrinted)
    expect(check.fees).toEqual([])
  })
})
