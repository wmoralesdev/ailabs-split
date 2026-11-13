import { useEffect, useId, useMemo, useRef, useState } from "react"
import type { KeyboardEvent as ReactKeyboardEvent } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { ArrowDown01Icon, Tick02Icon } from "@hugeicons/core-free-icons"

import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

export type MemberPickerMember = {
  id: string
  name: string
}

type MemberPickerProps = {
  members: MemberPickerMember[]
  value: string
  onChange: (id: string) => void
  placeholder?: string
  id?: string
  label?: string
}

const CHIP_THRESHOLD = 5

export function MemberPicker({
  members,
  value,
  onChange,
  placeholder = "Who paid?",
  id,
  label = "Paid by",
}: MemberPickerProps) {
  if (members.length < CHIP_THRESHOLD) {
    return (
      <div className="flex flex-wrap gap-2" role="group" aria-label={label}>
        {members.map((member) => (
          <button
            key={member.id}
            type="button"
            aria-pressed={value === member.id}
            onClick={() => onChange(member.id)}
            className="person-chip"
          >
            {member.name}
          </button>
        ))}
      </div>
    )
  }

  return (
    <SearchableMemberSelect
      id={id}
      members={members}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      label={label}
    />
  )
}

function SearchableMemberSelect({
  members,
  value,
  onChange,
  placeholder,
  id,
  label = "Paid by",
}: MemberPickerProps) {
  const listId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [highlight, setHighlight] = useState(0)

  const selected = members.find((member) => member.id === value)
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return members
    return members.filter((member) => member.name.toLowerCase().includes(q))
  }, [members, query])

  useEffect(() => {
    const selectedIndex = filtered.findIndex((member) => member.id === value)
    setHighlight(selectedIndex >= 0 ? selectedIndex : 0)
  }, [filtered, open, query, value])

  useEffect(() => {
    if (!open) return
    const option = rootRef.current?.querySelector("[data-picker-active='true']")
    option?.scrollIntoView({ block: "nearest" })
  }, [highlight, open])

  useEffect(() => {
    if (!open) return

    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false)
        setQuery("")
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false)
        setQuery("")
      }
    }

    document.addEventListener("mousedown", onPointerDown)
    document.addEventListener("keydown", onKeyDown)
    return () => {
      document.removeEventListener("mousedown", onPointerDown)
      document.removeEventListener("keydown", onKeyDown)
    }
  }, [open])

  function pick(memberId: string) {
    onChange(memberId)
    setOpen(false)
    setQuery("")
  }

  function onFilterKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault()
      setHighlight((index) =>
        filtered.length === 0 ? 0 : Math.min(index + 1, filtered.length - 1)
      )
      return
    }
    if (event.key === "ArrowUp") {
      event.preventDefault()
      setHighlight((index) => Math.max(index - 1, 0))
      return
    }
    if (event.key === "Enter") {
      event.preventDefault()
      const member = filtered.at(highlight)
      if (member) pick(member.id)
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        id={id}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={selected ? `${label}, ${selected.name}` : label}
        onClick={() => setOpen((prev) => !prev)}
        className="picker-trigger"
      >
        <span
          className={cn(
            "truncate",
            selected ? "text-foreground" : "text-muted-foreground"
          )}
        >
          {selected?.name ?? placeholder}
        </span>
        <HugeiconsIcon
          icon={ArrowDown01Icon}
          size={16}
          strokeWidth={2}
          className="shrink-0 text-muted-foreground"
        />
      </button>

      {open ? (
        <div className="absolute inset-x-0 top-[calc(100%+0.35rem)] z-50 overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-md">
          <div className="border-b border-border p-2">
            <Input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onFilterKeyDown}
              placeholder="Search names…"
              size="sm"
              aria-autocomplete="list"
              aria-controls={listId}
            />
          </div>
          <ul
            id={listId}
            role="listbox"
            className="max-h-56 overflow-y-auto p-1"
          >
            {filtered.length === 0 ? (
              <li className="px-3 py-3 text-[15px] text-muted-foreground">
                No matches
              </li>
            ) : (
              filtered.map((member, index) => {
                const isActive = member.id === value
                const isHighlighted = index === highlight
                return (
                  <li key={member.id} role="option" aria-selected={isActive}>
                    <button
                      type="button"
                      data-picker-active={isHighlighted ? "true" : undefined}
                      className={cn(
                        "flex min-h-11 w-full items-center justify-between gap-2 rounded-lg px-3 text-left text-[15px]",
                        isHighlighted || isActive
                          ? "bg-muted text-foreground"
                          : "hover:bg-muted/60"
                      )}
                      onMouseEnter={() => setHighlight(index)}
                      onClick={() => pick(member.id)}
                    >
                      {member.name}
                      {isActive ? (
                        <HugeiconsIcon
                          icon={Tick02Icon}
                          size={18}
                          strokeWidth={2.2}
                          className="shrink-0 text-primary"
                        />
                      ) : null}
                    </button>
                  </li>
                )
              })
            )}
          </ul>
        </div>
      ) : null}
    </div>
  )
}
