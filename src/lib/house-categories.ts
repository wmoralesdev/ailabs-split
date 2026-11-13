export const HOUSE_CATEGORIES = [
  "RENT",
  "UTILITIES",
  "INTERNET",
  "GROCERIES",
  "HOUSEHOLD_SUPPLIES",
  "REPAIRS",
  "FURNITURE",
  "SUBSCRIPTIONS",
  "OTHER",
] as const

export type HouseCategory = (typeof HOUSE_CATEGORIES)[number]

export function isHouseCategory(value: string): value is HouseCategory {
  return (HOUSE_CATEGORIES as readonly string[]).includes(value)
}

export function houseCategoryLabel(category: HouseCategory): string {
  switch (category) {
    case "RENT":
      return "Rent"
    case "UTILITIES":
      return "Utilities"
    case "INTERNET":
      return "Internet"
    case "GROCERIES":
      return "Groceries"
    case "HOUSEHOLD_SUPPLIES":
      return "Household supplies"
    case "REPAIRS":
      return "Repairs"
    case "FURNITURE":
      return "Furniture"
    case "SUBSCRIPTIONS":
      return "Subscriptions"
    case "OTHER":
      return "Other"
    default: {
      const _never: never = category
      return _never
    }
  }
}

export function houseCategoryDisplay(value: string | null | undefined): string {
  if (!value) return "Other"
  if (isHouseCategory(value)) return houseCategoryLabel(value)
  return value
}
