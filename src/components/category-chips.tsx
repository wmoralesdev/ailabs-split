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
              "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
              active
                ? "border-primary bg-primary text-primary-foreground hover:bg-primary/90"
                : "border-border bg-background/60 text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            {category}
          </button>
        )
      })}
    </div>
  )
}
