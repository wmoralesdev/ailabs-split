import { describe, expect, it } from "vitest"

import {
  appendAtmDigit,
  atmDigitsFromInput,
  atmDigitsToCents,
  backspaceAtmDigit,
  centsToAtmDigits,
  currencyFractionDigits,
  formatAtmAmount,
  normalizeAtmDigits,
} from "./atm-amount"

describe("currencyFractionDigits", () => {
  it("returns 2 for common currencies", () => {
    expect(currencyFractionDigits("USD")).toBe(2)
    expect(currencyFractionDigits("EUR")).toBe(2)
    expect(currencyFractionDigits("CRC")).toBe(2)
  })

  it("returns 0 for zero-decimal currencies", () => {
    expect(currencyFractionDigits("JPY")).toBe(0)
    expect(currencyFractionDigits("KRW")).toBe(0)
  })

  it("falls back to 2 for invalid codes", () => {
    expect(currencyFractionDigits("NOT")).toBe(2)
  })
})

describe("formatAtmAmount", () => {
  it("formats 2-decimal ATM entry", () => {
    expect(formatAtmAmount("", 2)).toBe("0.00")
    expect(formatAtmAmount("1", 2)).toBe("0.01")
    expect(formatAtmAmount("12", 2)).toBe("0.12")
    expect(formatAtmAmount("1289", 2)).toBe("12.89")
    expect(formatAtmAmount("100", 2)).toBe("1.00")
  })

  it("formats 0-decimal ATM entry", () => {
    expect(formatAtmAmount("", 0)).toBe("0")
    expect(formatAtmAmount("1", 0)).toBe("1")
    expect(formatAtmAmount("1289", 0)).toBe("1289")
  })

  it("formats 3-decimal ATM entry", () => {
    expect(formatAtmAmount("1289", 3)).toBe("1.289")
    expect(formatAtmAmount("5", 3)).toBe("0.005")
  })
})

describe("atmDigitsToCents / centsToAtmDigits", () => {
  it("maps 2-decimal digits to cents 1:1", () => {
    expect(atmDigitsToCents("1289", 2)).toBe(1289)
    expect(atmDigitsToCents("1", 2)).toBe(1)
    expect(atmDigitsToCents("", 2)).toBe(0)
  })

  it("maps 0-decimal digits into app cents (*100)", () => {
    expect(atmDigitsToCents("1289", 0)).toBe(128900)
    expect(atmDigitsToCents("1", 0)).toBe(100)
  })

  it("round-trips cents through digits for 2 decimals", () => {
    expect(centsToAtmDigits(1289, 2)).toBe("1289")
    expect(atmDigitsToCents(centsToAtmDigits(1050, 2), 2)).toBe(1050)
  })

  it("round-trips cents through digits for 0 decimals", () => {
    expect(centsToAtmDigits(128900, 0)).toBe("1289")
    expect(atmDigitsToCents(centsToAtmDigits(500, 0), 0)).toBe(500)
  })
})

describe("digit buffer edits", () => {
  it("appends and backspaces digits", () => {
    expect(appendAtmDigit("", "1")).toBe("1")
    expect(appendAtmDigit("12", "8")).toBe("128")
    expect(appendAtmDigit("128", "9")).toBe("1289")
    expect(backspaceAtmDigit("1289")).toBe("128")
    expect(backspaceAtmDigit("1")).toBe("")
  })

  it("ignores non-digits and strips leading zeros", () => {
    expect(appendAtmDigit("12", ".")).toBe("12")
    expect(normalizeAtmDigits("001289")).toBe("1289")
    expect(atmDigitsFromInput("$12.89")).toBe("1289")
  })
})
