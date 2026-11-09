import { HugeiconsIcon } from "@hugeicons/react"
import { Cancel01Icon } from "@hugeicons/core-free-icons"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { mergeNames } from "@/lib/landing-prefs"

type NameListInputProps = {
  id: string
  label: string
  names: string[]
  draft: string
  onNamesChange: (names: string[]) => void
  onDraftChange: (draft: string) => void
  placeholder?: string
  hint?: string
  error?: string | null
  /** Names already in the room; shown first and not removable. */
  fixed?: string[]
}

/** Chips plus one labelled field; Enter, comma or Add commits the name. */
export function NameListInput({
  id,
  label,
  names,
  draft,
  onNamesChange,
  onDraftChange,
  placeholder = "Name",
  hint,
  error,
  fixed = [],
}: NameListInputProps) {
  function commit() {
    if (!draft.trim()) return
    const taken = new Set(fixed.map((name) => name.toLowerCase()))
    onNamesChange(
      mergeNames(names, draft).filter((name) => !taken.has(name.toLowerCase()))
    )
    onDraftChange("")
  }

  const describedBy = [
    hint && !error ? `${id}-hint` : null,
    error ? `${id}-error` : null,
  ]
    .filter(Boolean)
    .join(" ")

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      {fixed.length + names.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5" aria-label="Added so far">
          {fixed.map((name) => (
            <li key={name} className="person-chip bg-muted">
              {name}
            </li>
          ))}
          {names.map((name) => (
            <li key={name} className="person-chip pr-0">
              {name}
              <button
                type="button"
                onClick={() =>
                  onNamesChange(names.filter((entry) => entry !== name))
                }
                className="relative inline-flex h-8 w-7 items-center justify-center rounded-r-full text-muted-foreground after:absolute after:-inset-y-1.5 after:inset-x-0 hover:text-foreground"
                aria-label={`Remove ${name}`}
              >
                <HugeiconsIcon icon={Cancel01Icon} size={12} strokeWidth={2.2} />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="flex gap-2">
        <Input
          id={id}
          value={draft}
          autoComplete="off"
          enterKeyHint="done"
          onChange={(event) => onDraftChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === ",") {
              event.preventDefault()
              commit()
            }
          }}
          onBlur={commit}
          placeholder={placeholder}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy || undefined}
          className="flex-1"
        />
        <Button
          type="button"
          variant="outline"
          className="shrink-0 border-transparent bg-card px-4 text-primary disabled:text-muted-foreground"
          onClick={commit}
          disabled={!draft.trim()}
        >
          Add
        </Button>
      </div>
      {hint && !error ? (
        <p id={`${id}-hint`} className="text-[13px] leading-snug text-muted-foreground">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} className="text-[13px] leading-snug text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}
