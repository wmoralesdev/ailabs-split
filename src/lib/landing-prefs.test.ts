import { describe, expect, test } from "vitest"

import { defaultDinnerName, isDefaultDinnerName } from "./landing-prefs"

describe("isDefaultDinnerName", () => {
  test("matches the meal-of-day fallback", () => {
    expect(
      isDefaultDinnerName(defaultDinnerName(new Date("2026-11-12T15:00:00")))
    ).toBe(true)
    expect(isDefaultDinnerName("Monday breakfast")).toBe(true)
    expect(isDefaultDinnerName("Pedido de Amazon")).toBe(false)
    expect(isDefaultDinnerName("Amazon")).toBe(false)
  })
})
