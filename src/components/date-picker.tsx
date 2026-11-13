import { useEffect, useRef, useState } from "react"

import { Calendar } from "@/components/ui/calendar"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTitle } from "@/components/ui/popover"
import {
  formatTypedDate,
  isIsoDate,
  isoToLocalDate,
  localIsoDate,
  parseTypedDate,
} from "@/lib/house-month"
import { handleTastePickerOpenChange } from "@/lib/taste-picker"
import { cn } from "@/lib/utils"

export function DatePicker({
  value,
  onChange,
  id,
  "aria-label": ariaLabel = "Pick a date",
  className,
}: {
  value: string | null
  onChange: (next: string) => void
  id?: string
  "aria-label"?: string
  className?: string
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(() =>
    value && isIsoDate(value) ? formatTypedDate(value) : ""
  )
  const selected = value && isIsoDate(value) ? isoToLocalDate(value) : undefined
  const [month, setMonth] = useState<Date>(selected ?? new Date())

  useEffect(() => {
    if (value && isIsoDate(value)) {
      setDraft(formatTypedDate(value))
      setMonth(isoToLocalDate(value))
      return
    }
    if (value == null) setDraft("")
  }, [value])

  function commitDraft(text: string) {
    const parsed = parseTypedDate(text)
    if (parsed) {
      onChange(parsed)
      setDraft(formatTypedDate(parsed))
      setMonth(isoToLocalDate(parsed))
      return
    }
    if (value && isIsoDate(value)) setDraft(formatTypedDate(value))
  }

  return (
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
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        placeholder="MM/DD/YYYY"
        aria-label={ariaLabel}
        value={draft}
        onChange={(event) => {
          const next = event.target.value
          setDraft(next)
          const parsed = parseTypedDate(next)
          if (!parsed) return
          onChange(parsed)
          setMonth(isoToLocalDate(parsed))
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => commitDraft(draft)}
        className={cn(
          "h-8 w-[9.5rem] rounded-full px-3 text-sm tabular-nums",
          className
        )}
      />
      <PopoverContent
        anchor={inputRef}
        align="start"
        sideOffset={8}
        initialFocus={false}
        finalFocus={false}
        data-taste-picker=""
        className="w-auto p-0"
      >
        <PopoverTitle className="sr-only">Pick a date</PopoverTitle>
        <Calendar
          mode="single"
          captionLayout="label"
          selected={selected}
          month={month}
          onMonthChange={setMonth}
          onSelect={(date) => {
            if (!date) return
            const iso = localIsoDate(date)
            onChange(iso)
            setDraft(formatTypedDate(iso))
            setMonth(date)
          }}
          onDayClick={(date) => {
            const iso = localIsoDate(date)
            onChange(iso)
            setDraft(formatTypedDate(iso))
            setMonth(date)
          }}
        />
      </PopoverContent>
    </Popover>
  )
}
