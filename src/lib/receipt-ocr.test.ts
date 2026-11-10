import { describe, expect, it } from "vitest"

import { computeDinnerSplit } from "./dinner-split"
import {
  BIBLIOTECA_CAFE_MD,
  CELESTE_IMPERIO_MD,
  PUPUSERIA_PANCHIMALCO_MD,
  PUPUSERIA_PANCHIMALCO_PRETICKET_MD,
} from "./receipt-ocr-fixtures"
import {
  checkPayloadFromOcr,
  extractCheckDraft,
  extractDraft,
} from "./receipt-ocr"

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

describe("extractCheckDraft", () => {
  it("parses Biblioteca footer tip, nested modifiers, and ignores invitados", () => {
    const draft = extractCheckDraft(BIBLIOTECA_CAFE_MD)
    expect(draft.isPrecuenta).toBe(true)
    expect(draft.guestCountPrinted).toBe(1)
    expect(draft.subtotalCents).toBe(18710)
    expect(draft.totalCents).toBe(20581)
    expect(draft.tip?.amountCents).toBe(1871)
    expect(draft.tax ?? []).toEqual([])
    expect(draft.fees).toEqual([])
    const pollos = draft.items.filter((item) => item.name === "POLLO CHIPOTLE")
    expect(pollos.length).toBeGreaterThan(1)
    const latte = draft.items.find((item) => item.name === "Iced Latte")
    expect(latte?.modifiers.some((mod) => /onz/i.test(mod))).toBe(true)
    expect(draft.items.some((item) => /onz/i.test(item.name))).toBe(false)

    const payload = checkPayloadFromOcr(draft, () => crypto.randomUUID())
    expect(payload.tip.source).toBe("TICKET")
    expect(payload.tip.amountCents).toBe(1871)
    expect(payload.adjustments).toEqual([])
    const split = computeDinnerSplit({
      ...payload,
      notedTotalCents: payload.notedTotalCents,
    })
    expect(split.tipCents).toBe(1871)
    expect(split.totalCents).toBe(split.itemSubtotalCents + 1871)
  })

  it("parses Panchimalco quantities and keeps printed 0% tip", () => {
    const draft = extractCheckDraft(PUPUSERIA_PANCHIMALCO_MD)
    expect(draft.totalCents).toBe(8475)
    expect(draft.subtotalCents).toBe(8475)
    expect(draft.tip?.amountCents).toBe(0)
    expect(draft.tip?.percentHint).toBe(0)
    expect(draft.discounts).toBeUndefined()
    const frijol = draft.items.find((item) => /frijol\/queso/i.test(item.name))
    expect(frijol?.quantity).toBe(10)
    expect(frijol?.amountCents).toBe(1400)
    const chocolate = draft.items.find((item) => /chocolate/i.test(item.name))
    expect(chocolate?.quantity).toBe(16)
    expect(chocolate?.amountCents).toBe(3200)
    expect(draft.items.reduce((sum, item) => sum + item.amountCents, 0)).toBe(
      8475
    )

    const payload = checkPayloadFromOcr(draft)
    expect(payload.tip.source).toBe("TICKET")
    expect(payload.tip.amountCents).toBe(0)
    const split = computeDinnerSplit(payload)
    expect(split.tipCents).toBe(0)
    expect(split.totalCents).toBe(8475)
    expect(split.totalCents).not.toBe(8475 + 848)
  })

  it("parses the Panchimalco PRE-TICKET CNT column into qty, not the name", () => {
    const draft = extractCheckDraft(PUPUSERIA_PANCHIMALCO_PRETICKET_MD)
    expect(draft.isPrecuenta).toBe(true)
    expect(draft.totalCents).toBe(6000)
    expect(draft.subtotalCents).toBe(6000)
    expect(draft.tip?.amountCents).toBe(0)
    expect(draft.tip?.percentHint).toBe(0)

    const expected = [
      ["Frijol/Queso pq", 8, 140, 1120],
      ["Revuelta pq", 10, 140, 1400],
      ["Chicharron/Frijol pq", 1, 140, 140],
      ["Frijol pq", 1, 140, 140],
      ["Queso/Ajo pq", 2, 175, 350],
      ["Queso/Espinaca pq", 1, 175, 175],
      ["Chocolate/leche", 1, 225, 225],
      ["Orden de chorizo", 1, 525, 525],
      ["Yuca frita", 2, 450, 900],
      ["Soda vidrio", 6, 125, 750],
      ["Soda lata", 1, 150, 150],
      ["Del valle", 1, 125, 125],
    ] as const

    expect(draft.items).toHaveLength(expected.length)
    for (const [name, quantity, unitPriceCents, amountCents] of expected) {
      const item = draft.items.find((row) => row.name === name)
      expect(item, name).toMatchObject({
        name,
        quantity,
        unitPriceCents,
        amountCents,
      })
    }

    expect(draft.items.every((item) => !/^\d+\s*[×xX]/u.test(item.name))).toBe(
      true
    )
    expect(
      draft.items
        .filter((item) => item.quantity === 1)
        .every((item) => !/^\d+\s/.test(item.name))
    ).toBe(true)
    expect(draft.items.reduce((sum, item) => sum + item.amountCents, 0)).toBe(
      6000
    )

    const payload = checkPayloadFromOcr(draft)
    const frijol = payload.items.find((item) => item.name === "Frijol/Queso pq")
    expect(frijol?.quantity).toBe(8)
    expect(frijol?.name).toBe("Frijol/Queso pq")
    expect(payload.tip.amountCents).toBe(0)
    expect(computeDinnerSplit(payload).totalCents).toBe(6000)
  })

  it("parses Celeste continuation modifiers and printed propina", () => {
    const draft = extractCheckDraft(CELESTE_IMPERIO_MD)
    expect(draft.guestCountPrinted).toBe(3)
    expect(draft.subtotalCents).toBe(4440)
    expect(draft.tip?.amountCents).toBe(444)
    expect(draft.totalCents).toBe(4884)
    const wantan = draft.items.find((item) => /wantan frito/i.test(item.name))
    expect(wantan?.modifiers).toContain("RES")
    const tea = draft.items.find((item) => /jamaica/i.test(item.name))
    expect(tea?.quantity).toBe(4)
    expect(tea?.amountCents).toBe(700)
    expect(tea?.modifiers).toContain("VAS")
    expect(draft.items).toHaveLength(5)
    expect(draft.items.reduce((sum, item) => sum + item.amountCents, 0)).toBe(
      4440
    )
  })
})
