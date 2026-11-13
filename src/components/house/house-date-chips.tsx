import { ChipRow } from "@/components/chip-row"
import { DatePicker } from "@/components/date-picker"
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
      <DatePicker
        value={value && isIsoDate(value) ? value : null}
        onChange={onChange}
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
