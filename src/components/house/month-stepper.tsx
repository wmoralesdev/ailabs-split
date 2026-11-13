import { HugeiconsIcon } from "@hugeicons/react"
import { ArrowLeft01Icon, ArrowRight01Icon } from "@hugeicons/core-free-icons"

import { addMonths, formatMonth } from "@/lib/house-month"

export function MonthStepper({
  value,
  onChange,
  label = "For",
}: {
  value: string
  onChange: (next: string) => void
  label?: string
}) {
  return (
    <div
      className="flex items-center justify-between gap-2"
      role="group"
      aria-label={label}
    >
      <button
        type="button"
        className="icon-hit size-11"
        aria-label="Previous month"
        onClick={() => onChange(addMonths(value, -1))}
      >
        <HugeiconsIcon icon={ArrowLeft01Icon} size={18} strokeWidth={2} />
      </button>
      <p className="font-display text-[17px] font-semibold tabular-nums">
        {formatMonth(value)}
      </p>
      <button
        type="button"
        className="icon-hit size-11"
        aria-label="Next month"
        onClick={() => onChange(addMonths(value, 1))}
      >
        <HugeiconsIcon icon={ArrowRight01Icon} size={18} strokeWidth={2} />
      </button>
    </div>
  )
}
