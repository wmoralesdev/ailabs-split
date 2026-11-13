import { ChipRow } from "@/components/chip-row"
import { EXPENSE_CATEGORIES } from "@/lib/expense-categories"

export function CategoryChips({
  value,
  onChange,
}: {
  value: string
  onChange: (next: string) => void
}) {
  const selected = value.trim()

  return (
    <ChipRow role="group" aria-label="Category" bleed>
      {EXPENSE_CATEGORIES.map((category) => {
        const active = selected.toLowerCase() === category.toLowerCase()
        return (
          <button
            key={category}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(active ? "" : category)}
            className="person-chip"
          >
            {category}
          </button>
        )
      })}
    </ChipRow>
  )
}
