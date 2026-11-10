import { useEffect, useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

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
import { rememberRecentTrip } from "@/lib/recent-trips"
import { roomKeys } from "@/lib/room-query"
import { renameRoom } from "@/server/rooms"

export function useRenameDinner(code: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (name: string) => renameRoom({ data: { code, name } }),
    onSuccess: async (room) => {
      rememberRecentTrip({
        code: room.code,
        name: room.name,
        kind: room.kind,
      })
      await queryClient.invalidateQueries({ queryKey: roomKeys.room(code) })
      toast.success("Dinner renamed")
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Could not rename dinner"
      )
    },
  })
}

export function DinnerNameField({
  code,
  name,
  id = "dinner-name",
}: {
  code: string
  name: string
  id?: string
}) {
  const [draft, setDraft] = useState(name)
  const rename = useRenameDinner(code)

  useEffect(() => {
    setDraft(name)
  }, [name])

  function commit() {
    const trimmed = draft.trim()
    if (!trimmed) {
      setDraft(name)
      return
    }
    if (trimmed === name) return
    rename.mutate(trimmed)
  }

  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>Dinner</Label>
      <Input
        id={id}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key !== "Enter") return
          event.preventDefault()
          event.currentTarget.blur()
        }}
        placeholder="Tuesday lunch"
        maxLength={60}
        autoComplete="off"
        enterKeyHint="done"
      />
    </div>
  )
}

export function RenameDinnerSheet({
  open,
  onOpenChange,
  code,
  name,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  code: string
  name: string
}) {
  const [draft, setDraft] = useState(name)
  const rename = useRenameDinner(code)

  useEffect(() => {
    if (open) setDraft(name)
  }, [open, name])

  const trimmed = draft.trim()

  function save() {
    if (!trimmed) return
    if (trimmed === name.trim()) {
      onOpenChange(false)
      return
    }
    rename.mutate(trimmed, {
      onSuccess: () => onOpenChange(false),
    })
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="pb-safe gap-0 rounded-t-3xl px-4 pt-5"
      >
        <SheetHeader className="gap-1 p-0 text-left">
          <SheetTitle className="font-display text-[22px] font-bold tracking-tight">
            Dinner name
          </SheetTitle>
          <SheetDescription className="text-[15px] leading-snug text-muted-foreground">
            The dinner title. Place on the bill is separate.
          </SheetDescription>
        </SheetHeader>
        <form
          className="mt-4"
          onSubmit={(event) => {
            event.preventDefault()
            save()
          }}
        >
          <div className="grid gap-1.5">
            <Label htmlFor="dinner-name">Dinner</Label>
            <Input
              id="dinner-name"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onFocus={(event) => event.currentTarget.select()}
              maxLength={60}
              autoComplete="off"
              enterKeyHint="done"
              placeholder="Tuesday lunch"
              autoFocus
            />
          </div>
          <SheetFooter className="mt-4 flex-col gap-2 p-0">
            <Button
              type="submit"
              className="cta-lg"
              disabled={!trimmed || rename.isPending}
            >
              {rename.isPending ? "Saving…" : "Save name"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}
