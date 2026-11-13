import { describe, expect, it } from "vitest"

import {
  HOUSE_CATEGORIES,
  houseCategoryDisplay,
  houseCategoryLabel,
} from "./house-categories"

describe("houseCategoryLabel", () => {
  it("labels every key", () => {
    expect(HOUSE_CATEGORIES.map(houseCategoryLabel)).toEqual([
      "Rent",
      "Utilities",
      "Internet",
      "Groceries",
      "Household supplies",
      "Repairs",
      "Furniture",
      "Subscriptions",
      "Other",
    ])
  })

  it("falls back for unknown stored values", () => {
    expect(houseCategoryDisplay("RENT")).toBe("Rent")
    expect(houseCategoryDisplay("Custom")).toBe("Custom")
  })
})
