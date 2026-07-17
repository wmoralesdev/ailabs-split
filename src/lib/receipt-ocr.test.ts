import { describe, expect, it } from "vitest"

import { extractDraft } from "./receipt-ocr"

describe("extractDraft", () => {
  it("prefers the payable total over earlier subtotal-like amounts", () => {
    const draft = extractDraft(`
Restaurante La Mesa
Subtotal gravado 4,000
IVA 900
Total a pagar 5,900
`)

    expect(draft.amountCents).toBe(590_000)
  })

  it("uses a total label on the previous line", () => {
    const draft = extractDraft(`
Cafe Central
Subtotal 4,000
TOTAL
5,900
`)

    expect(draft.amountCents).toBe(590_000)
  })

  it("parses decimal totals with currency symbols", () => {
    const draft = extractDraft(`
Dinner
Food 10.00
Tip 2.50
Grand total $12.50
`)

    expect(draft.amountCents).toBe(1_250)
  })
})
