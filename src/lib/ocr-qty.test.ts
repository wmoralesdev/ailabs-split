import { describe, expect, it } from "vitest"

import { normalizeOcrItemQty } from "./ocr-qty"

describe("normalizeOcrItemQty", () => {
  it("moves a CNT multiplier out of the name when P.UNI ≠ TOTAL", () => {
    expect(
      normalizeOcrItemQty({
        name: "8 × Frijol/Queso pq",
        quantity: 1,
        unitPriceCents: 140,
        amountCents: 1120,
      })
    ).toEqual({
      name: "Frijol/Queso pq",
      quantity: 8,
      unitPriceCents: 140,
    })
  })

  it("treats a leading CNT without × as quantity when it matches the line", () => {
    expect(
      normalizeOcrItemQty({
        name: "10 Revuelta pq",
        quantity: 1,
        unitPriceCents: 140,
        amountCents: 1400,
      })
    ).toEqual({
      name: "Revuelta pq",
      quantity: 10,
      unitPriceCents: 140,
    })
  })

  it("infers quantity when unit price ≠ total and the total divides evenly", () => {
    expect(
      normalizeOcrItemQty({
        name: "Soda vidrio",
        quantity: 1,
        unitPriceCents: 125,
        amountCents: 750,
      })
    ).toEqual({
      name: "Soda vidrio",
      quantity: 6,
      unitPriceCents: 125,
    })
  })

  it("does not invent quantity when the total is not divisible by the unit", () => {
    expect(
      normalizeOcrItemQty({
        name: "Taco",
        quantity: 1,
        unitPriceCents: 175,
        amountCents: 400,
      })
    ).toEqual({
      name: "Taco",
      quantity: 1,
      unitPriceCents: 175,
    })
  })

  it("does not prefix quantity 1 onto the name", () => {
    expect(
      normalizeOcrItemQty({
        name: "1 × Chicharron/Frijol pq",
        quantity: 1,
        unitPriceCents: 140,
        amountCents: 140,
      })
    ).toEqual({
      name: "Chicharron/Frijol pq",
      quantity: 1,
      unitPriceCents: 140,
    })
  })

  it("strips a leftover × after CNT was already parsed", () => {
    expect(
      normalizeOcrItemQty({
        name: "× Yuca frita",
        quantity: 2,
        unitPriceCents: 450,
        amountCents: 900,
      })
    ).toEqual({
      name: "Yuca frita",
      quantity: 2,
      unitPriceCents: 450,
    })
  })

  it("does not steal a leading number that is part of the product", () => {
    expect(
      normalizeOcrItemQty({
        name: "3 Leches",
        quantity: 1,
        unitPriceCents: 500,
        amountCents: 500,
      })
    ).toEqual({
      name: "3 Leches",
      quantity: 1,
      unitPriceCents: 500,
    })
  })

  it("keeps a correct quantity and does not double the prefix", () => {
    expect(
      normalizeOcrItemQty({
        name: "8 × Frijol/Queso pq",
        quantity: 8,
        unitPriceCents: 140,
        amountCents: 1120,
      })
    ).toEqual({
      name: "Frijol/Queso pq",
      quantity: 8,
      unitPriceCents: 140,
    })
  })
})
