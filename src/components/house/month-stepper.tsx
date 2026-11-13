import { useEffect, useRef, useState } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { ArrowLeft01Icon, ArrowRight01Icon } from "@hugeicons/core-free-icons"

import { ChevronStepper } from "@/components/chevron-stepper"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTitle } from "@/components/ui/popover"
import {
  addMonths,
  formatMonth,
  isMonthKey,
  parseMonthKey,
  parseTypedMonth,
} from "@/lib/house-month"
import { handleTastePickerOpenChange } from "@/lib/taste-picker"
import { cn } from "@/lib/utils"

const MONTH_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const

function pad2(value: number): string {
  return String(value).padStart(2, "0")
}

function monthFromParts(year: number, month: number): string {
  return `${year}-${pad2(month)}`
}

export function MonthStepper({
  value,
  onChange,
  label = "For",
  inputId,
}: {
  value: string
  onChange: (next: string) => void
  label?: string
  inputId?: string
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(() =>
    isMonthKey(value) ? formatMonth(value) : value
  )
  const selected = isMonthKey(value)
    ? parseMonthKey(value)
    : { year: new Date().getFullYear(), month: 1 }
  const [gridYear, setGridYear] = useState(selected.year)

  useEffect(() => {
    if (!isMonthKey(value)) return
    setDraft(formatMonth(value))
    setGridYear(parseMonthKey(value).year)
  }, [value])

  function commitDraft(text: string) {
    const next = parseTypedMonth(text)
    if (next) {
      onChange(next)
      setDraft(formatMonth(next))
      setGridYear(parseMonthKey(next).year)
      return
    }
    if (isMonthKey(value)) setDraft(formatMonth(value))
  }

  return (
    <ChevronStepper
      label={label}
      prevLabel="Previous month"
      nextLabel="Next month"
      onPrev={() => onChange(addMonths(value, -1))}
      onNext={() => onChange(addMonths(value, 1))}
    >
      <Popover
        open={open}
        modal={false}
        onOpenChange={(next, eventDetails) =>
          handleTastePickerOpenChange(
            next,
            eventDetails,
            inputRef.current,
            setOpen,
            () => commitDraft(draft)
          )
        }
      >
        <Input
          ref={inputRef}
          id={inputId}
          type="text"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          aria-label={label}
          value={draft}
          onChange={(event) => {
            const next = event.target.value
            setDraft(next)
            const parsedMonth = parseTypedMonth(next)
            if (!parsedMonth) return
            onChange(parsedMonth)
            setGridYear(parseMonthKey(parsedMonth).year)
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => commitDraft(draft)}
          className="h-11 max-w-[10rem] border-0 bg-transparent px-1 text-center font-display text-[17px] font-semibold shadow-none focus-visible:ring-2"
        />
        <PopoverContent
          anchor={inputRef}
          align="center"
          side="top"
          sideOffset={8}
          initialFocus={false}
          finalFocus={false}
          data-taste-picker=""
          className="w-[18.5rem] p-2"
        >
          <PopoverTitle className="sr-only">Pick a month</PopoverTitle>
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              className="icon-hit size-11"
              aria-label="Previous year"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => setGridYear((year) => year - 1)}
            >
              <HugeiconsIcon icon={ArrowLeft01Icon} size={18} strokeWidth={2} />
            </button>
            <p className="font-display text-[17px] font-semibold tabular-nums">
              {gridYear}
            </p>
            <button
              type="button"
              className="icon-hit size-11"
              aria-label="Next year"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => setGridYear((year) => year + 1)}
            >
              <HugeiconsIcon
                icon={ArrowRight01Icon}
                size={18}
                strokeWidth={2}
              />
            </button>
          </div>
          <div className="mt-1 grid grid-cols-3 gap-1.5">
            {MONTH_LABELS.map((monthLabel, index) => {
              const month = index + 1
              const key = monthFromParts(gridYear, month)
              const pressed = value === key
              return (
                <button
                  key={key}
                  type="button"
                  aria-pressed={pressed}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    onChange(key)
                    setDraft(formatMonth(key))
                    inputRef.current?.focus()
                  }}
                  className={cn("person-chip w-full justify-center")}
                >
                  {monthLabel}
                </button>
              )
            })}
          </div>
        </PopoverContent>
      </Popover>
    </ChevronStepper>
  )
}
