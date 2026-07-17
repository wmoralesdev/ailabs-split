import { EXPENSE_CATEGORIES } from "@/lib/expense-categories"
import { cn } from "@/lib/utils"

export function CategoryChips({
  value,
  onChange,
}: {
  value: string
  onChange: (next: string) => void
}) {
  const selected = value.trim()

  return (
    <div className="flex flex-wrap gap-1.5">
      {EXPENSE_CATEGORIES.map((category) => {
        const active = selected.toLowerCase() === category.toLowerCase()
        return (
          <button
            key={category}
            type="button"
            onClick={() => onChange(active ? "" : category)}
            className={cn(
              "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
              active
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-background/60 text-muted-foreground hover:text-foreground"
            )}
          >
            {category}
          </button>
        )
      })}
    </div>
  )
}
