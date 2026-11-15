import { useState } from "react"
import type { ReactNode } from "react"
import { useNavigate } from "@tanstack/react-router"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Airplane01Icon,
  ArrowRight01Icon,
  Home01Icon,
  Restaurant01Icon,
} from "@hugeicons/core-free-icons"

import { RoomExitControl } from "@/components/room-exit-control"
import { roomKindLabel } from "@/lib/room-kind"
import type { RoomKind } from "@/lib/room-kind"

const KIND_ICON = {
  DINNER: Restaurant01Icon,
  TRIP: Airplane01Icon,
  HOUSEHOLD: Home01Icon,
} as const

/**
 * A landing list of rooms. Rows open the room; delete or hide stays out of
 * the way behind "Edit", so the list reads as places to go back to.
 */
export function RoomListSection({
  title,
  label,
  children,
}: {
  title: string
  label: string
  children: (editing: boolean) => ReactNode
}) {
  const [editing, setEditing] = useState(false)
  return (
    <section className="animate-rise-delay mt-8" aria-label={label}>
      <div className="flex items-center justify-between gap-3 px-1">
        <h2 className="text-[13px] font-medium text-muted-foreground">
          {title}
        </h2>
        <button
          type="button"
          className="text-action text-[13px]"
          aria-pressed={editing}
          onClick={() => setEditing((on) => !on)}
        >
          {editing ? "Done" : "Edit"}
        </button>
      </div>
      <ul className="group-list group-list-inset mt-1">{children(editing)}</ul>
    </section>
  )
}

export function RoomListRow({
  code,
  name,
  kind,
  owned,
  meta,
  eyebrow,
  editing,
  onChanged,
}: {
  code: string
  name: string
  kind: RoomKind
  owned: boolean
  /** Right-hand status: a house balance or when it was last opened. */
  meta: ReactNode
  /** Small line above the name, e.g. "Continue". */
  eyebrow?: string
  editing: boolean
  onChanged?: () => void
}) {
  const navigate = useNavigate()
  return (
    <li className="flex items-stretch">
      <button
        type="button"
        className="group-row-hit min-w-0 flex-1 text-left"
        aria-label={`${eyebrow ?? "Open"} ${name}`}
        onClick={() =>
          void navigate({ to: "/r/$code", params: { code } })
        }
      >
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted text-foreground">
          <HugeiconsIcon icon={KIND_ICON[kind]} size={18} strokeWidth={1.8} />
        </span>
        <span className="min-w-0 flex-1">
          {eyebrow ? (
            <span
              className="block text-[13px] font-medium text-primary"
              aria-hidden
            >
              {eyebrow}
            </span>
          ) : null}
          <span className="block truncate text-[16px] font-medium text-foreground">
            {name}
          </span>
          <span className="block text-[13px] text-muted-foreground">
            {roomKindLabel(kind)}
          </span>
        </span>
        {meta}
        {editing ? null : (
          <HugeiconsIcon
            icon={ArrowRight01Icon}
            size={16}
            strokeWidth={2}
            className="-ml-1 shrink-0 text-muted-foreground"
          />
        )}
      </button>
      {editing ? (
        <RoomExitControl
          code={code}
          name={name}
          kind={kind}
          owned={owned}
          placement="row"
          onDone={onChanged}
        />
      ) : null}
    </li>
  )
}

/** Muted right-hand time, e.g. "22h ago". */
export function RoomRowTime({ children }: { children: ReactNode }) {
  return (
    <span className="shrink-0 text-[13px] text-muted-foreground tabular-nums">
      {children}
    </span>
  )
}
