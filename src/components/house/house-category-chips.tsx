import { ChipRow } from "@/components/chip-row"
import { HOUSE_CATEGORIES, houseCategoryLabel } from "@/lib/house-categories"
import type { HouseCategory } from "@/lib/house-categories"

export function HouseCategoryChips({
  value,
  onChange,
}: {
  value: HouseCategory
  onChange: (next: HouseCategory) => void
}) {
  return (
    <ChipRow role="group" aria-label="Category" bleed>
      {HOUSE_CATEGORIES.map((category) => (
        <button
          key={category}
          type="button"
          aria-pressed={value === category}
          onClick={() => onChange(category)}
          className="person-chip"
        >
          {houseCategoryLabel(category)}
        </button>
      ))}
    </ChipRow>
  )
}
