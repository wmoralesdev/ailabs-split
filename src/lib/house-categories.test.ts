import { describe, expect, it } from "vitest"

import {
  HOUSE_CATEGORIES,
  houseCategoryDisplay,
  houseCategoryHint,
  houseCategoryLabel,
  suggestHouseCategory,
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

  it("suggests a category from the title", () => {
    expect(suggestHouseCategory("Rent")).toBe("RENT")
    expect(suggestHouseCategory("Alquiler noviembre")).toBe("RENT")
    expect(suggestHouseCategory("Internet")).toBe("INTERNET")
    expect(suggestHouseCategory("CAESS")).toBe("UTILITIES")
    expect(suggestHouseCategory("Super Selectos")).toBe("GROCERIES")
    expect(suggestHouseCategory("Pizza night")).toBeNull()
    expect(suggestHouseCategory("  ")).toBeNull()
  })

  it("drops the category hint when it repeats the title", () => {
    expect(houseCategoryHint("RENT", "Rent")).toBeNull()
    expect(houseCategoryHint("RENT", "Alquiler")).toBe("Rent")
    expect(houseCategoryHint(null, "Pizza")).toBe("Other")
  })

  it("falls back for unknown stored values", () => {
    expect(houseCategoryDisplay("RENT")).toBe("Rent")
    expect(houseCategoryDisplay("Custom")).toBe("Custom")
  })
})
