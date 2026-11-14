import { useEffect, useRef, useState } from "react"

import { HouseDateChips } from "@/components/house/house-date-chips"
import { PayDetailsRow } from "@/components/pay-profile-sheet"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { formatDay } from "@/lib/house-month"
import type { HouseMemberDto } from "@/lib/house-types"
import type { PayDetailsDto } from "@/lib/pay-details"
import { cn } from "@/lib/utils"

const removeActionClass =
  "inline-flex min-h-11 items-center self-center font-medium text-destructive underline-offset-4 transition-colors outline-none hover:underline focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"

export function HousePersonSheet({
  member,
  open,
  saving,
  canEdit,
  canRemove,
  canConvert,
  canMoveOut,
  moveOutBlocked,
  balanceLine,
  pay,
  onPayDetails,
  onOpenChange,
  onRename,
  onStay,
  onKind,
  onRemove,
}: {
  member: HouseMemberDto | null
  open: boolean
  saving: boolean
  canEdit: boolean
  canRemove: boolean
  canConvert: boolean
  canMoveOut: boolean
  moveOutBlocked: string | null
  balanceLine: string | null
  pay: PayDetailsDto | null
  /** Omitted when the viewer can't see or change this number. */
  onPayDetails?: () => void
  onOpenChange: (open: boolean) => void
  onRename: (name: string) => void
  onStay: (input: { joinedOn?: string | null; leftOn?: string | null }) => void
  onKind: (isGuest: boolean) => void
  onRemove: () => void
}) {
  const nameRef = useRef<HTMLInputElement>(null)
  const [name, setName] = useState("")
  const [confirmingRemove, setConfirmingRemove] = useState(false)
  const [movingOut, setMovingOut] = useState(false)

  useEffect(() => {
    if (!open || !member) return
    setName(member.name)
    setConfirmingRemove(false)
    setMovingOut(Boolean(member.leftOn))
    const timer = window.setTimeout(() => {
      const field = nameRef.current
      if (!field) return
      field.focus()
      const end = field.value.length
      field.setSelectionRange(end, end)
    }, 50)
    return () => window.clearTimeout(timer)
  }, [open, member?.id, member?.name, member?.joinedOn, member?.leftOn])

  if (!member) {
    return <Sheet open={open} onOpenChange={onOpenChange} />
  }

  const trimmed = name.trim()
  const dirty = trimmed.length > 0 && trimmed !== member.name
  const status = member.isOwner
    ? "Owner"
    : member.isGuest
      ? "Guest"
      : member.claimed
        ? null
        : "Not claimed yet"

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="flex max-h-[92dvh] flex-col gap-0 rounded-t-3xl bg-background p-0"
        initialFocus={nameRef}
      >
        <div className="mx-auto flex min-h-0 w-full max-w-content flex-1 flex-col">
          <SheetHeader className="gap-2 px-4 pt-4 pb-2 text-left">
            <SheetTitle className="eyebrow">In this house</SheetTitle>
            <SheetDescription className="sr-only">
              Edit this person, move-in and move-out dates.
            </SheetDescription>
          </SheetHeader>

          <form
            className="flex min-h-0 flex-1 flex-col"
            onSubmit={(event) => {
              event.preventDefault()
              if (dirty && canEdit) onRename(trimmed)
            }}
          >
            <div className="flex flex-col gap-4 px-4 pb-4">
              <Input
                ref={nameRef}
                id="house-person-name"
                aria-label="Name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                autoComplete="off"
                enterKeyHint="done"
                readOnly={!canEdit}
                className="h-12 bg-card px-3.5 font-display text-[22px] font-semibold tracking-tight"
              />
              {status ? (
                <p className="text-[13px] text-muted-foreground">{status}</p>
              ) : null}
              {balanceLine ? (
                <p className="text-[15px] font-medium tabular-nums">
                  {balanceLine}
                </p>
              ) : null}

              {onPayDetails ? (
                <PayDetailsRow pay={pay} onClick={onPayDetails} />
              ) : null}

              {canEdit ? (
                <div className="flex flex-col gap-2">
                  <p className="text-[13px] font-medium text-muted-foreground">
                    Moved in
                    {member.joinedOn ? ` ${formatDay(member.joinedOn)}` : ""}
                  </p>
                  <HouseDateChips
                    label="Moved in"
                    value={member.joinedOn}
                    onChange={(next) => onStay({ joinedOn: next })}
                  />
                </div>
              ) : member.joinedOn ? (
                <p className="text-[13px] text-muted-foreground">
                  Moved in {formatDay(member.joinedOn)}
                </p>
              ) : null}

              {canMoveOut ? (
                <div className="flex flex-col gap-2">
                  {movingOut || member.leftOn ? (
                    <>
                      <p className="text-[13px] font-medium text-muted-foreground">
                        Moved out
                      </p>
                      <HouseDateChips
                        label="Moved out"
                        value={member.leftOn}
                        allowEmpty
                        emptyLabel="Still here"
                        onChange={(next) => {
                          if (next == null) setMovingOut(false)
                          onStay({ leftOn: next })
                        }}
                      />
                    </>
                  ) : (
                    <button
                      type="button"
                      className={cn(removeActionClass, "self-start")}
                      disabled={saving}
                      onClick={() => {
                        if (moveOutBlocked) return
                        setMovingOut(true)
                      }}
                    >
                      Move out…
                    </button>
                  )}
                  {moveOutBlocked ? (
                    <p className="text-[13px] text-muted-foreground">
                      {moveOutBlocked}
                    </p>
                  ) : null}
                </div>
              ) : member.leftOn ? (
                <p className="text-[13px] text-muted-foreground">
                  Moved out {formatDay(member.leftOn)}
                </p>
              ) : null}

              {canConvert ? (
                <button
                  type="button"
                  className="text-action self-start text-[15px]"
                  disabled={saving}
                  onClick={() => onKind(!member.isGuest)}
                >
                  {member.isGuest ? "Make housemate" : "Make guest"}
                </button>
              ) : null}
            </div>

            <SheetFooter className="pb-safe border-t border-border px-4 pt-3">
              {canEdit ? (
                <Button
                  type="submit"
                  className="cta-lg disabled:opacity-40"
                  disabled={saving || !dirty}
                >
                  {saving ? "Saving…" : "Save"}
                </Button>
              ) : null}
              {canRemove && !confirmingRemove ? (
                <button
                  type="button"
                  className={removeActionClass}
                  disabled={saving}
                  onClick={() => setConfirmingRemove(true)}
                >
                  Remove
                </button>
              ) : null}
              {canRemove && confirmingRemove ? (
                <Button
                  type="button"
                  variant="destructive"
                  className="cta-lg"
                  disabled={saving}
                  onClick={onRemove}
                >
                  Remove {member.name}?
                </Button>
              ) : null}
            </SheetFooter>
          </form>
        </div>
      </SheetContent>
    </Sheet>
  )
}
