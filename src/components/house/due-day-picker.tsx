import { useEffect, useRef, useState } from "react"

import { ChevronStepper } from "@/components/chevron-stepper"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTitle } from "@/components/ui/popover"
import { parseDueDay } from "@/lib/house-month"
import { handleTastePickerOpenChange } from "@/lib/taste-picker"
import { cn } from "@/lib/utils"

const DUE_DAYS = Array.from({ length: 28 }, (_, index) => index + 1)

export function DueDayPicker({
  value,
  onChange,
  inputId,
}: {
  value: number
  onChange: (next: number) => void
  inputId?: string
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(String(value))

  useEffect(() => {
    setDraft(String(value))
  }, [value])

  function commitDraft(text: string) {
    const parsed = parseDueDay(text)
    if (parsed != null) {
      onChange(parsed)
      setDraft(String(parsed))
      return
    }
    setDraft(String(value))
  }

  return (
    <ChevronStepper
      label="Due day"
      prevLabel="Previous day"
      nextLabel="Next day"
      prevDisabled={value <= 1}
      nextDisabled={value >= 28}
      onPrev={() => onChange(Math.max(1, value - 1))}
      onNext={() => onChange(Math.min(28, value + 1))}
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
          inputMode="numeric"
          autoComplete="off"
          spellCheck={false}
          aria-label="Due day"
          value={draft}
          onChange={(event) => {
            const next = event.target.value
            setDraft(next)
            const parsed = parseDueDay(next)
            if (parsed == null) return
            onChange(parsed)
          }}
          onFocus={(event) => {
            setOpen(true)
            event.target.select()
          }}
          onBlur={() => commitDraft(draft)}
          className="h-11 max-w-[4.5rem] border-0 bg-transparent px-1 text-center font-display text-[17px] font-semibold tabular-nums shadow-none focus-visible:ring-2"
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
          <PopoverTitle className="sr-only">Pick a due day</PopoverTitle>
          <div className="grid grid-cols-7 gap-1">
            {DUE_DAYS.map((day) => {
              const pressed = day === value
              return (
                <button
                  key={day}
                  type="button"
                  aria-pressed={pressed}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    onChange(day)
                    setDraft(String(day))
                    inputRef.current?.focus()
                  }}
                  className={cn(
                    "person-chip size-9 min-w-0 justify-center px-0 tabular-nums"
                  )}
                >
                  {day}
                </button>
              )
            })}
          </div>
        </PopoverContent>
      </Popover>
    </ChevronStepper>
  )
}
