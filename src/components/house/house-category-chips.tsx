import { HOUSE_CATEGORIES, houseCategoryLabel } from "@/lib/house-categories"
import type { HouseCategory } from "@/lib/house-categories"
import { cn } from "@/lib/utils"

export function HouseCategoryChips({
  value,
  onChange,
}: {
  value: HouseCategory
  onChange: (next: HouseCategory) => void
}) {
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Category">
      {HOUSE_CATEGORIES.map((category) => {
        const active = value === category
        return (
          <button
            key={category}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(category)}
            className={cn(
              "h-8 rounded-full px-3 text-[13px] font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
              active
                ? "bg-foreground text-background"
                : "bg-card text-foreground hover:bg-muted"
            )}
          >
            {houseCategoryLabel(category)}
          </button>
        )
      })}
    </div>
  )
}
