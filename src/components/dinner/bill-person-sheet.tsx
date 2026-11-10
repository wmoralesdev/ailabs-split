import { useEffect, useRef, useState } from "react"

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
import { formatMoney } from "@/lib/settle"
import { cn } from "@/lib/utils"
import type { RoomMemberDto } from "@/server/rooms"

type BillPersonSheetProps = {
  member: RoomMemberDto | null
  open: boolean
  saving: boolean
  assignedCount: number
  assignedAmountCents: number
  currency: string
  blockReason: string | null
  onOpenChange: (open: boolean) => void
  onRename: (name: string) => void
  onRemove: () => void
}

function assignedContext(count: number, amountCents: number, currency: string) {
  if (count <= 0) return null
  const items = count === 1 ? "1 item" : `${count} items`
  return `${items} · ${formatMoney(amountCents, currency)}`
}

function removeConfirmCopy(name: string, count: number) {
  if (count <= 0) return `Remove ${name}?`
  if (count === 1) {
    return `Remove ${name}? His item goes back to unassigned.`
  }
  return `Remove ${name}? His ${count} items go back to unassigned.`
}

const removeActionClass =
  "inline-flex min-h-11 items-center self-center font-medium text-destructive underline-offset-4 transition-colors outline-none hover:underline focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"

export function BillPersonSheet({
  member,
  open,
  saving,
  assignedCount,
  assignedAmountCents,
  currency,
  blockReason,
  onOpenChange,
  onRename,
  onRemove,
}: BillPersonSheetProps) {
  const nameRef = useRef<HTMLInputElement>(null)
  const [name, setName] = useState("")
  const [confirming, setConfirming] = useState(false)

  useEffect(() => {
    if (!open || !member) return
    setName(member.name)
    setConfirming(false)
    const timer = window.setTimeout(() => {
      const field = nameRef.current
      if (!field) return
      field.focus()
      const end = field.value.length
      field.setSelectionRange(end, end)
    }, 50)
    return () => window.clearTimeout(timer)
  }, [open, member])

  const trimmed = name.trim()
  const dirty = Boolean(member && trimmed.length > 0 && trimmed !== member.name)

  function save() {
    if (!dirty || saving) return
    onRename(trimmed)
  }

  if (!member) {
    return <Sheet open={open} onOpenChange={onOpenChange} />
  }

  const canRemove = blockReason == null
  const context = assignedContext(assignedCount, assignedAmountCents, currency)

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="flex max-h-[92dvh] flex-col gap-0 rounded-t-3xl bg-background p-0"
        initialFocus={nameRef}
      >
        <div className="mx-auto flex min-h-0 w-full max-w-content flex-1 flex-col">
          <SheetHeader className="gap-2 px-4 pt-4 pb-2 text-left">
            <SheetTitle className="eyebrow">On this bill</SheetTitle>
            <SheetDescription className="sr-only">
              Edit the name or take them off this bill.
            </SheetDescription>
          </SheetHeader>

          <form
            className="flex min-h-0 flex-1 flex-col"
            onSubmit={(event) => {
              event.preventDefault()
              save()
            }}
          >
            <div className="flex flex-col gap-2 px-4 pb-4">
              <Input
                ref={nameRef}
                id="person-name"
                aria-label="Name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                autoComplete="off"
                enterKeyHint="done"
                className="h-12 bg-card px-3.5 font-display text-[22px] font-semibold tracking-tight"
              />
              {context ? (
                <p className="text-[13px] text-muted-foreground">{context}</p>
              ) : null}
              {blockReason ? (
                <p className="text-[13px] text-muted-foreground">
                  {blockReason}
                </p>
              ) : null}
            </div>

            <SheetFooter className="pb-safe border-t border-border px-4 pt-3">
              <Button
                type="submit"
                className="cta-lg disabled:opacity-40"
                disabled={saving || !dirty}
              >
                {saving ? "Saving…" : "Save"}
              </Button>
              {canRemove && !confirming ? (
                <button
                  type="button"
                  className={removeActionClass}
                  disabled={saving}
                  onClick={() => setConfirming(true)}
                >
                  Remove from bill
                </button>
              ) : null}
              {canRemove && confirming ? (
                <div className="flex flex-col items-center gap-1">
                  <p className="text-center text-[13px] text-muted-foreground">
                    {removeConfirmCopy(member.name, assignedCount)}
                  </p>
                  <button
                    type="button"
                    className={cn(removeActionClass, "font-semibold")}
                    disabled={saving}
                    onClick={onRemove}
                  >
                    Remove
                  </button>
                </div>
              ) : null}
            </SheetFooter>
          </form>
        </div>
      </SheetContent>
    </Sheet>
  )
}
