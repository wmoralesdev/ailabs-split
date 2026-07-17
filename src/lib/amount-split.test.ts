import { describe, expect, it } from "vitest"

import { redistributeAmounts } from "@/lib/amount-split"
import { centsToAtmDigits } from "@/lib/atm-amount"

const fd = 2
const ids = ["a", "b", "c", "d"]

describe("redistributeAmounts", () => {
  it("splits equally among unlocked when none are manual", () => {
    const result = redistributeAmounts({
      totalCents: 10_000,
      includedIds: ids,
      manualIds: new Set(),
      amounts: {},
      fractionDigits: fd,
    })
    expect(result).toEqual({
      a: centsToAtmDigits(2500, fd),
      b: centsToAtmDigits(2500, fd),
      c: centsToAtmDigits(2500, fd),
      d: centsToAtmDigits(2500, fd),
    })
  })

  it("locks one amount and splits the rest", () => {
    const result = redistributeAmounts({
      totalCents: 10_000,
      includedIds: ids,
      manualIds: new Set(["a"]),
      amounts: { a: centsToAtmDigits(4000, fd) },
      fractionDigits: fd,
    })
    expect(result.a).toBe(centsToAtmDigits(4000, fd))
    expect(result.b).toBe(centsToAtmDigits(2000, fd))
    expect(result.c).toBe(centsToAtmDigits(2000, fd))
    expect(result.d).toBe(centsToAtmDigits(2000, fd))
  })

  it("locks two amounts and splits remaining between the other two", () => {
    const result = redistributeAmounts({
      totalCents: 10_000,
      includedIds: ids,
      manualIds: new Set(["a", "b"]),
      amounts: {
        a: centsToAtmDigits(1000, fd),
        b: centsToAtmDigits(1000, fd),
      },
      fractionDigits: fd,
    })
    expect(result.a).toBe(centsToAtmDigits(1000, fd))
    expect(result.b).toBe(centsToAtmDigits(1000, fd))
    expect(result.c).toBe(centsToAtmDigits(4000, fd))
    expect(result.d).toBe(centsToAtmDigits(4000, fd))
  })

  it("sets unlocked to empty when manuals exceed total", () => {
    const result = redistributeAmounts({
      totalCents: 10_000,
      includedIds: ids,
      manualIds: new Set(["a"]),
      amounts: { a: centsToAtmDigits(12_000, fd) },
      fractionDigits: fd,
    })
    expect(result.a).toBe(centsToAtmDigits(12_000, fd))
    expect(result.b).toBe("")
    expect(result.c).toBe("")
    expect(result.d).toBe("")
  })
})
