/** Suggested categories for chip pickers; free-text still allowed. */
export const EXPENSE_CATEGORIES = [
  "Food",
  "Lodging",
  "Transport",
  "Drinks",
  "Activities",
  "Other",
] as const

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number]
