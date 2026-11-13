import { describe, expect, it } from "vitest"

import {
  HOUSE_RECEIPT_VISION_INSTRUCTIONS,
  draftFromHouseExtract,
  extraChargeNote,
  fixtureHouseExtract,
  inferHouseCategory,
  matchVariableDue,
  parseHouseReceiptExtract,
} from "./house-receipt-ocr"
import type { DueThisMonthItem } from "./house-ledger"

function due(partial: Partial<DueThisMonthItem>): DueThisMonthItem {
  return {
    templateId: "t1",
    title: "Power",
    category: "UTILITIES",
    kind: "VARIABLE",
    amountCents: null,
    periodMonth: "2026-11",
    dueDay: 5,
    paidById: "w1",
    splitMode: "EQUAL",
    ...partial,
  }
}

describe("inferHouseCategory", () => {
  it("maps grocery tickets to Groceries", () => {
    expect(inferHouseCategory({ kind: "GROCERY", provider: "Selectos" })).toBe(
      "GROCERIES"
    )
  })

  it("maps internet providers to Internet", () => {
    expect(
      inferHouseCategory({ kind: "UTILITY", provider: "Claro Hogar" })
    ).toBe("INTERNET")
  })

  it("maps power and water to Utilities", () => {
    expect(inferHouseCategory({ kind: "UTILITY", provider: "CAESS" })).toBe(
      "UTILITIES"
    )
  })
})

describe("matchVariableDue", () => {
  it("fills the matching variable due, not a fixed template", () => {
    const items = [
      due({
        templateId: "rent",
        title: "Rent",
        category: "RENT",
        kind: "FIXED",
      }),
      due({ templateId: "luz", title: "Power" }),
    ]
    expect(matchVariableDue("UTILITIES", "2026-11", items)?.templateId).toBe(
      "luz"
    )
  })

  it("returns null when nothing matches", () => {
    expect(matchVariableDue("INTERNET", "2026-11", [due({})])).toBeNull()
  })
})

describe("draftFromHouseExtract", () => {
  it("keeps the photo on a utility receipt and drops PII fields", () => {
    const draft = draftFromHouseExtract({
      documentKind: "UTILITY",
      provider: "CAESS",
      periodMonth: "2026-10",
      dueOn: "2026-11-05",
      totalCents: 4720,
      previousBalanceCents: 850,
      lateFeeCents: null,
    })
    expect(draft).toEqual({
      kind: "UTILITY",
      title: "CAESS",
      category: "UTILITIES",
      amountCents: 4720,
      periodMonth: "2026-10",
      dueOn: "2026-11-05",
      previousBalanceCents: 850,
      lateFeeCents: null,
      savePhoto: true,
    })
    expect(JSON.stringify(draft)).not.toMatch(/NIC|NIS|titular|account/i)
  })

  it("treats a grocery ticket as title plus total without a saved photo", () => {
    const draft = draftFromHouseExtract({
      documentKind: "GROCERY",
      provider: "Super Selectos",
      periodMonth: null,
      dueOn: null,
      totalCents: 1865,
      previousBalanceCents: null,
      lateFeeCents: null,
    })
    expect(draft.savePhoto).toBe(false)
    expect(draft.category).toBe("GROCERIES")
    expect(draft.title).toBe("Super Selectos")
    expect(draft.amountCents).toBe(1865)
  })
})

describe("parseHouseReceiptExtract", () => {
  it("rejects account-holder fields that are not in the contract", () => {
    expect(
      parseHouseReceiptExtract({
        documentKind: "UTILITY",
        provider: "CAESS",
        periodMonth: "2026-10",
        dueOn: null,
        totalCents: 100,
        previousBalanceCents: null,
        lateFeeCents: null,
        nic: "123",
        titular: "Ana",
      })
    ).toMatchObject({ provider: "CAESS", totalCents: 100 })
  })
})

describe("extraChargeNote", () => {
  it("does not fold previous balance into the charge", () => {
    expect(
      extraChargeNote(
        {
          kind: "UTILITY",
          title: "CAESS",
          category: "UTILITIES",
          amountCents: 4720,
          periodMonth: "2026-10",
          dueOn: null,
          previousBalanceCents: 850,
          lateFeeCents: null,
          savePhoto: true,
        },
        "USD"
      )
    ).toBe(
      "Receipt also lists a previous balance of $8.50. It is not in this charge."
    )
  })
})

describe("fixtureHouseExtract", () => {
  it("returns a utility draft with no PII fields", () => {
    const extract = fixtureHouseExtract("utility")
    expect(extract.provider).toBe("CAESS")
    expect(extract.totalCents).toBe(4720)
    expect(extract).not.toHaveProperty("nic")
    expect(JSON.stringify(extract)).not.toMatch(/NIC|titular|account/i)
    expect(draftFromHouseExtract(extract).savePhoto).toBe(true)
  })

  it("returns a grocery ticket as title plus total", () => {
    const extract = fixtureHouseExtract("grocery")
    expect(extract.provider).toBe("Super Selectos")
    expect(extract.totalCents).toBe(1865)
    expect(draftFromHouseExtract(extract).savePhoto).toBe(false)
  })
})

describe("HOUSE_RECEIPT_VISION_INSTRUCTIONS", () => {
  it("forbids NIC, account, address, and titular", () => {
    expect(HOUSE_RECEIPT_VISION_INSTRUCTIONS).toMatch(/Never extract NIC/)
    expect(HOUSE_RECEIPT_VISION_INSTRUCTIONS).toMatch(/account number/)
    expect(HOUSE_RECEIPT_VISION_INSTRUCTIONS).toMatch(/address/)
    expect(HOUSE_RECEIPT_VISION_INSTRUCTIONS).toMatch(/titular/)
  })
})
