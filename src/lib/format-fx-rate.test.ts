import { describe, expect, it } from "vitest"

import { formatFxRate } from "./format-fx-rate"

describe("formatFxRate", () => {
  it("formats large rates with two decimals", () => {
    expect(formatFxRate(452.24)).toBe("452.24")
  })

  it("trims trailing zeros for mid-range rates", () => {
    expect(formatFxRate(17.4)).toBe("17.4")
    expect(formatFxRate(1.0)).toBe("1")
  })

  it("keeps precision for small rates", () => {
    expect(formatFxRate(0.00221)).toBe("0.00221")
  })

  it("returns empty for invalid rates", () => {
    expect(formatFxRate(0)).toBe("")
    expect(formatFxRate(-1)).toBe("")
    expect(formatFxRate(Number.NaN)).toBe("")
  })
})
