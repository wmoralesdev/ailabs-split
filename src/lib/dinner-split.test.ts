import { describe, expect, it } from "vitest"

import {
  adjustmentToItem,
  assignRestToMember,
  computeDinnerSplit,
  copyItemSplit,
  emptyTip,
  expenseSharesFromDinner,
  itemToAdjustment,
  manualTip,
  resolveManualFee,
  splitLineItem,
  ticketTip,
  tipCentsFromPercent,
  withForcedPrintedTotal,
} from "./dinner-split"
import type { LineItem, TipConfig } from "./dinner-split"

function item(
  partial: Partial<LineItem> & Pick<LineItem, "id" | "name" | "amountCents">
): LineItem {
  return {
    quantity: 1,
    unitPriceCents: partial.amountCents,
    modifiers: [],
    source: "MANUAL",
    confidence: null,
    split: { mode: "UNASSIGNED" },
    ...partial,
  }
}

const pizzaA = item({
  id: "pizza-a",
  name: "Pizza A",
  amountCents: 2400,
  split: { mode: "EQUAL", memberIds: ["ana", "ben", "cara", "dan"] },
})
const pizzaB = item({
  id: "pizza-b",
  name: "Pizza B",
  amountCents: 2400,
  split: { mode: "EQUAL", memberIds: ["eve", "fay", "gus", "hal"] },
})

describe("computeDinnerSplit pizzas", () => {
  it("splits two pizzas equally with no invented tip or fee", () => {
    const result = computeDinnerSplit({
      items: [pizzaA, pizzaB],
      adjustments: [],
      tip: emptyTip(),
    })

    expect(result.itemSubtotalCents).toBe(4800)
    expect(result.tipCents).toBe(0)
    expect(result.adjustmentTotalCents).toBe(0)
    expect(result.totalCents).toBe(4800)
    expect(result.residualCents).toBe(0)
    expect(result.canConfirm).toBe(true)
    expect(result.shares).toHaveLength(8)
    for (const share of result.shares) {
      expect(share.itemCents).toBe(600)
      expect(share.tipCents).toBe(0)
      expect(share.totalCents).toBe(600)
    }
  })

  it("leaves Ana owed $42 when she paid the $48 check", () => {
    const result = computeDinnerSplit({
      items: [pizzaA, pizzaB],
      adjustments: [],
      tip: emptyTip(),
    })
    const ana = result.shares.find((share) => share.memberId === "ana")
    expect(ana?.totalCents).toBe(600)
    expect(4800 - (ana?.totalCents ?? 0)).toBe(4200)
  })

  it("blocks confirm while a pizza is unassigned", () => {
    const result = computeDinnerSplit({
      items: [pizzaA, { ...pizzaB, split: { mode: "UNASSIGNED" } }],
      adjustments: [],
      tip: emptyTip(),
    })
    expect(result.canConfirm).toBe(false)
    expect(result.residualCents).toBe(2400)
    expect(result.unassignedItemIds).toContain("pizza-b")
  })
})

describe("BY_ITEMS fees and ticket-only tip", () => {
  it("allocates a manual late-night fee and tip proportional to dishes", () => {
    const result = computeDinnerSplit({
      items: [pizzaA, pizzaB],
      adjustments: [
        {
          id: "late",
          kind: "FEE",
          name: "Late Night",
          amountCents: 400,
          allocate: "BY_ITEMS",
          source: "MANUAL",
          confidence: null,
        },
      ],
      tip: manualTip(480, 10),
    })

    expect(result.totalCents).toBe(5680)
    expect(result.tipCents).toBe(480)
    for (const share of result.shares) {
      expect(share.itemCents).toBe(600)
      expect(share.adjustmentCents).toBe(50)
      expect(share.tipCents).toBe(60)
      expect(share.totalCents).toBe(710)
    }
  })

  it("does not invent 10% when the ticket printed no tip", () => {
    const result = computeDinnerSplit({
      items: [pizzaA, pizzaB],
      adjustments: [],
      tip: emptyTip(),
    })
    expect(result.tipCents).toBe(0)
    expect(result.totalCents).toBe(4800)
  })

  it("keeps Panchimalco PROPINA 0% at $0 and total $84.75", () => {
    const frijol = item({
      id: "frijol",
      name: "Frijol/Queso pq",
      quantity: 10,
      unitPriceCents: 140,
      amountCents: 1400,
      split: {
        mode: "QUANTITY",
        shares: [
          { memberId: "ana", quantity: 3 },
          { memberId: "ben", quantity: 3 },
          { memberId: "cara", quantity: 4 },
        ],
      },
    })
    const rest = item({
      id: "rest",
      name: "Rest of ticket",
      amountCents: 7075,
      split: { mode: "EQUAL", memberIds: ["ana", "ben", "cara"] },
    })
    const result = computeDinnerSplit({
      items: [frijol, rest],
      adjustments: [],
      tip: ticketTip(0, 0),
    })
    expect(result.tipCents).toBe(0)
    expect(result.totalCents).toBe(8475)
    expect(result.canConfirm).toBe(true)
    const frijolShare = splitLineItemSharesForTest(frijol)
    expect(frijolShare.get("ana")).toBe(420)
    expect(frijolShare.get("ben")).toBe(420)
    expect(frijolShare.get("cara")).toBe(560)
  })

  it("uses Biblioteca and Celeste footer tips only because they are printed", () => {
    const biblioteca = computeDinnerSplit({
      items: [
        item({
          id: "biblio",
          name: "Biblioteca items",
          amountCents: 18710,
          split: { mode: "EQUAL", memberIds: ["ana"] },
        }),
      ],
      adjustments: [],
      tip: ticketTip(1871),
    })
    expect(biblioteca.tipCents).toBe(1871)
    expect(biblioteca.totalCents).toBe(20581)
    expect(biblioteca.adjustmentTotalCents).toBe(0)

    const celeste = computeDinnerSplit({
      items: [
        item({
          id: "tea",
          name: "Te de Jamaica",
          quantity: 4,
          unitPriceCents: 175,
          amountCents: 700,
          split: {
            mode: "QUANTITY",
            shares: [
              { memberId: "ana", quantity: 1 },
              { memberId: "ben", quantity: 1 },
              { memberId: "cara", quantity: 2 },
            ],
          },
        }),
        item({
          id: "food",
          name: "Plates",
          amountCents: 3740,
          split: { mode: "EQUAL", memberIds: ["ana", "ben", "cara"] },
        }),
      ],
      adjustments: [],
      tip: ticketTip(444),
    })
    expect(celeste.itemSubtotalCents).toBe(4440)
    expect(celeste.tipCents).toBe(444)
    expect(celeste.totalCents).toBe(4884)
    const tipSum = celeste.shares.reduce(
      (sum, share) => sum + share.tipCents,
      0
    )
    expect(tipSum).toBe(444)
  })

  it("does not treat modifiers as extra money", () => {
    const latte = item({
      id: "latte",
      name: "Iced Latte",
      amountCents: 410,
      modifiers: ["16 ONZ"],
      split: { mode: "EQUAL", memberIds: ["ana"] },
    })
    const result = computeDinnerSplit({
      items: [latte],
      adjustments: [],
      tip: emptyTip(),
    })
    expect(result.totalCents).toBe(410)
  })

  it("blocks confirm when fees exist but nobody has dishes", () => {
    const result = computeDinnerSplit({
      items: [
        item({
          id: "open",
          name: "Unassigned taco",
          amountCents: 500,
          split: { mode: "UNASSIGNED" },
        }),
      ],
      adjustments: [
        {
          id: "fee",
          kind: "FEE",
          name: "Service",
          amountCents: 100,
          allocate: "BY_ITEMS",
          source: "MANUAL",
          confidence: null,
        },
      ],
      tip: emptyTip(),
    })
    expect(result.canConfirm).toBe(false)
    expect(result.confirmBlockReason).toMatch(/assign/i)
  })
})

function splitLineItemSharesForTest(line: LineItem): Map<string, number> {
  return computeDinnerSplit({
    items: [line],
    adjustments: [],
    tip: emptyTip(),
  }).shares.reduce((map, share) => {
    map.set(share.memberId, share.itemCents)
    return map
  }, new Map<string, number>())
}

describe("split line, assign rest, reclassify, force total", () => {
  it("splits a qty-2 pizza into two groups", () => {
    const [a, b] = splitLineItem(
      item({
        id: "pizzas",
        name: "Pizza",
        quantity: 2,
        unitPriceCents: 2400,
        amountCents: 4800,
      }),
      "a",
      "b"
    )
    expect(a.quantity).toBe(1)
    expect(b.quantity).toBe(1)
    expect(a.amountCents + b.amountCents).toBe(4800)
    expect(a.split.mode).toBe("UNASSIGNED")
  })

  it("assigns leftover quantity to one person", () => {
    const [next] = assignRestToMember(
      [
        item({
          id: "choc",
          name: "Chocolate",
          quantity: 16,
          unitPriceCents: 200,
          amountCents: 3200,
          split: {
            mode: "QUANTITY",
            shares: [
              { memberId: "ana", quantity: 5 },
              { memberId: "ben", quantity: 5 },
            ],
          },
        }),
      ],
      "cara"
    )
    expect(next.split.mode).toBe("QUANTITY")
    if (next.split.mode !== "QUANTITY") return
    expect(next.split.shares).toEqual([
      { memberId: "ana", quantity: 5 },
      { memberId: "ben", quantity: 5 },
      { memberId: "cara", quantity: 6 },
    ])
    const result = computeDinnerSplit({
      items: [next],
      adjustments: [],
      tip: emptyTip(),
    })
    expect(result.canConfirm).toBe(true)
    expect(result.residualCents).toBe(0)
  })

  it("copies the previous item’s people onto the next line", () => {
    const copied = copyItemSplit(
      pizzaA,
      item({ id: "next", name: "Coke", amountCents: 200 })
    )
    expect(copied.split).toEqual({
      mode: "EQUAL",
      memberIds: ["ana", "ben", "cara", "dan"],
    })
  })

  it("reclassifies an item into a fee and back", () => {
    const fee = itemToAdjustment(
      item({ id: "svc", name: "Service", amountCents: 300 }),
      "FEE",
      "fee-1"
    )
    expect(fee.kind).toBe("FEE")
    expect(fee.amountCents).toBe(300)
    const back = adjustmentToItem(fee, "item-2")
    expect(back.amountCents).toBe(300)
    expect(back.split.mode).toBe("UNASSIGNED")
  })

  it("forces the printed total with a manual delta adjustment", () => {
    const items = [pizzaA, pizzaB]
    const tip: TipConfig = emptyTip()
    const forced = withForcedPrintedTotal([], 4800, 5000, "force-1")
    expect(forced[0]?.amountCents).toBe(200)
    const result = computeDinnerSplit({
      items,
      adjustments: forced,
      tip,
      notedTotalCents: 5000,
    })
    expect(result.totalCents).toBe(5000)
    expect(result.ocrDeltaCents).toBe(0)
    expect(
      result.shares.reduce((sum, share) => sum + share.totalCents, 0)
    ).toBe(5000)
  })

  it("uses largest-remainder so a 1¢ tip still sums", () => {
    const result = computeDinnerSplit({
      items: [
        item({
          id: "a",
          name: "A",
          amountCents: 100,
          split: { mode: "EQUAL", memberIds: ["ana", "ben"] },
        }),
      ],
      adjustments: [],
      tip: manualTip(1),
    })
    const tipSum = result.shares.reduce((sum, share) => sum + share.tipCents, 0)
    expect(tipSum).toBe(1)
    expect(result.totalCents).toBe(101)
    expect(
      result.shares.reduce((sum, share) => sum + share.totalCents, 0)
    ).toBe(101)
  })

  it("builds AMOUNT expense shares from person totals", () => {
    const result = computeDinnerSplit({
      items: [pizzaA, pizzaB],
      adjustments: [],
      tip: emptyTip(),
    })
    const shares = expenseSharesFromDinner(result)
    expect(shares.reduce((sum, share) => sum + share.amountCents, 0)).toBe(4800)
    expect(shares).toHaveLength(8)
  })

  it("computes a manual 10% from the item subtotal only when asked", () => {
    expect(tipCentsFromPercent(4800, 10)).toBe(480)
    expect(tipCentsFromPercent(8475, 10)).toBe(848)
  })
})

describe("resolveManualFee", () => {
  it("keeps an entered amount and does not invent a percent", () => {
    expect(
      resolveManualFee({
        unit: "amount",
        amountDigits: "250",
        percentText: "10",
        fractionDigits: 2,
        itemSubtotalCents: 2000,
      })
    ).toEqual({ amountCents: 250, percent: null })
  })

  it("turns a percent into cents from the item subtotal", () => {
    expect(
      resolveManualFee({
        unit: "percent",
        amountDigits: "999",
        percentText: "10",
        fractionDigits: 2,
        itemSubtotalCents: 18710,
      })
    ).toEqual({ amountCents: 1871, percent: 10 })
  })

  it("rejects percent when there are no items to take a cut of", () => {
    expect(
      resolveManualFee({
        unit: "percent",
        amountDigits: "",
        percentText: "10",
        fractionDigits: 2,
        itemSubtotalCents: 0,
      })
    ).toBeNull()
  })
})
