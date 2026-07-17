import {
  COMMON_BASE_CURRENCY_CODES,
  CURRENCY_OPTIONS,
  currencyShortLabel,
  isCommonBaseCurrency,
} from "@/lib/room-code"
import { cn } from "@/lib/utils"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

type BaseCurrencyPickerProps = {
  value: string
  onChange: (code: string) => void
  id?: string
}

const moreOptions = CURRENCY_OPTIONS.filter(
  (option) => !isCommonBaseCurrency(option.code)
)

export function BaseCurrencyPicker({
  value,
  onChange,
  id,
}: BaseCurrencyPickerProps) {
  const moreSelected = !isCommonBaseCurrency(value)
  const moreItems = moreOptions.map((option) => ({
    label: currencyShortLabel(option.code),
    value: option.code,
  }))

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {COMMON_BASE_CURRENCY_CODES.map((code) => {
          const selected = value === code
          return (
            <button
              key={code}
              type="button"
              id={selected ? id : undefined}
              aria-pressed={selected}
              onClick={() => onChange(code)}
              className={cn(
                "landing-chip min-h-10 min-w-14 px-3 text-sm",
                selected ? "landing-chip-on" : "landing-chip-idle"
              )}
            >
              {code}
            </button>
          )
        })}

        <Select
          items={moreItems}
          value={moreSelected ? value : null}
          onValueChange={(next) => {
            if (next) onChange(next)
          }}
        >
          <SelectTrigger
            size="sm"
            className={cn(
              "landing-chip min-h-10 min-w-14 border px-3 text-sm shadow-none",
              moreSelected
                ? "border-primary/35 bg-primary/12 text-foreground"
                : "border-transparent bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
            aria-label="More currencies"
          >
            <SelectValue placeholder="More">
              {moreSelected ? value : "More"}
            </SelectValue>
          </SelectTrigger>
          <SelectContent
            align="start"
            alignItemWithTrigger={false}
            className="w-auto min-w-56"
          >
            {moreOptions.map((option) => (
              <SelectItem key={option.code} value={option.code}>
                {currencyShortLabel(option.code)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}
