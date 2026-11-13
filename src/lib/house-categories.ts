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

const TITLE_HINTS: ReadonlyArray<readonly [HouseCategory, RegExp]> = [
  ["RENT", /\b(rent|alquiler|renta)\b/i],
  ["INTERNET", /\b(internet|wi-?fi|fibra|claro|tigo)\b/i],
  [
    "UTILITIES",
    /\b(utilities|electric\w*|power|water|gas|luz|agua|energ[ií]a|caess|anda|delsur)\b/i,
  ],
  [
    "SUBSCRIPTIONS",
    /\b(netflix|spotify|disney|hbo|max|youtube|prime|subscription)\b/i,
  ],
  ["REPAIRS", /\b(repair|fix|plumber|plomero|reparaci[oó]n)\b/i],
  ["FURNITURE", /\b(furniture|sofa|couch|mueble|table|chair|bed)\b/i],
  [
    "HOUSEHOLD_SUPPLIES",
    /\b(cleaning|supplies|detergent|toilet paper|limpieza)\b/i,
  ],
  [
    "GROCERIES",
    /\b(groceries|grocery|super|selectos|walmart|pricesmart|despensa|market)\b/i,
  ],
]

/** Category implied by a charge title, or null when nothing matches. */
export function suggestHouseCategory(title: string): HouseCategory | null {
  const trimmed = title.trim()
  if (!trimmed) return null
  for (const [category, pattern] of TITLE_HINTS) {
    if (pattern.test(trimmed)) return category
  }
  return null
}

/** Category label for a row subtitle, or null when it would repeat the title. */
export function houseCategoryHint(
  value: string | null | undefined,
  title: string
): string | null {
  const label = houseCategoryDisplay(value)
  return label.toLowerCase() === title.trim().toLowerCase() ? null : label
}

export function houseCategoryDisplay(value: string | null | undefined): string {
  if (!value) return "Other"
  if (isHouseCategory(value)) return houseCategoryLabel(value)
  return value
}
