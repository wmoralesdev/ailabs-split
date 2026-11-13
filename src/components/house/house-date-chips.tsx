import { ChipRow } from "@/components/chip-row"
import { Input } from "@/components/ui/input"
import { addDaysIso, isIsoDate, localIsoDate } from "@/lib/house-month"

function addDaysIsoSafe(iso: string, days: number): string {
  try {
    return addDaysIso(iso, days)
  } catch {
    return iso
  }
}

export function HouseDateChips({
  value,
  onChange,
  label,
  allowEmpty,
  emptyLabel = "Not set",
}: {
  value: string | null
  onChange: (next: string | null) => void
  label: string
  allowEmpty?: boolean
  emptyLabel?: string
}) {
  const today = localIsoDate()
  const yesterday = addDaysIsoSafe(today, -1)
  const picked = value && isIsoDate(value) ? value : today

  return (
    <ChipRow role="group" aria-label={label} bleed>
      {allowEmpty ? (
        <DateChip
          label={emptyLabel}
          pressed={value == null}
          onClick={() => onChange(null)}
        />
      ) : null}
      <DateChip
        label="Today"
        pressed={value === today}
        onClick={() => onChange(today)}
      />
      <DateChip
        label="Yesterday"
        pressed={value === yesterday}
        onClick={() => onChange(yesterday)}
      />
      <Input
        type="date"
        value={picked}
        onChange={(event) => {
          const next = event.target.value
          if (isIsoDate(next)) onChange(next)
        }}
        aria-label="Pick a date"
        className="h-8 w-[9.5rem] rounded-full px-3 text-sm"
      />
    </ChipRow>
  )
}

function DateChip({
  label,
  pressed,
  onClick,
}: {
  label: string
  pressed: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className="person-chip"
    >
      {label}
    </button>
  )
}
