import { useEffect, useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import type { RoomMemberDto } from "@/server/rooms"

type BillPersonSheetProps = {
  member: RoomMemberDto | null
  open: boolean
  saving: boolean
  assigned: boolean
  blockReason: string | null
  onOpenChange: (open: boolean) => void
  onRename: (name: string) => void
  onRemove: () => void
}

export function BillPersonSheet({
  member,
  open,
  saving,
  assigned,
  blockReason,
  onOpenChange,
  onRename,
  onRemove,
}: BillPersonSheetProps) {
  const [name, setName] = useState("")

  useEffect(() => {
    if (!open || !member) return
    setName(member.name)
  }, [open, member])

  function save() {
    const next = name.trim()
    if (!next || saving) return
    if (member && next === member.name) {
      onOpenChange(false)
      return
    }
    onRename(next)
  }

  if (!member) {
    return <Sheet open={open} onOpenChange={onOpenChange} />
  }

  const canRemove = blockReason == null

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="flex max-h-[92dvh] flex-col gap-0 rounded-t-3xl bg-background p-0"
      >
        <div className="mx-auto flex min-h-0 w-full max-w-content flex-1 flex-col">
          <SheetHeader className="gap-0.5 px-4 pt-4 pb-3 text-left">
            <SheetTitle className="eyebrow">On this bill</SheetTitle>
            <p className="font-display text-xl font-bold tracking-tight">
              {member.name}
            </p>
            <SheetDescription className="text-[13px]">
              Change the name or take them off.
            </SheetDescription>
          </SheetHeader>

          <form
            className="flex min-h-0 flex-1 flex-col"
            onSubmit={(event) => {
              event.preventDefault()
              save()
            }}
          >
            <div className="flex flex-col gap-3 px-4 pb-4">
              <div className="grid gap-1.5">
                <Label htmlFor="person-name">Name</Label>
                <Input
                  id="person-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  autoComplete="off"
                  enterKeyHint="done"
                />
              </div>
              {canRemove && assigned ? (
                <p className="text-[13px] text-muted-foreground">
                  They're taken off any dishes they're on.
                </p>
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
                className="cta-lg"
                disabled={saving || !name.trim()}
              >
                {saving ? "Saving…" : "Save name"}
              </Button>
              {canRemove ? (
                <button
                  type="button"
                  className="text-action self-center"
                  disabled={saving}
                  onClick={onRemove}
                >
                  Remove from bill
                </button>
              ) : null}
            </SheetFooter>
          </form>
        </div>
      </SheetContent>
    </Sheet>
  )
}
