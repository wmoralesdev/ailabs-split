import { useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { HugeiconsIcon } from "@hugeicons/react"
import { Cancel01Icon } from "@hugeicons/core-free-icons"

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
import { roomKeys } from "@/lib/room-query"
import { addRoomMembers } from "@/server/rooms"

export function AddPeopleSheet({
  code,
  open,
  onOpenChange,
}: {
  code: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const queryClient = useQueryClient()
  const [names, setNames] = useState<string[]>([])
  const [draft, setDraft] = useState("")

  const mutation = useMutation({
    mutationFn: (memberNames: string[]) =>
      addRoomMembers({ data: { code, names: memberNames } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: roomKeys.room(code) })
      toast.success("People added")
      setNames([])
      setDraft("")
      onOpenChange(false)
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Could not add people"
      )
    },
  })

  function commitDraft() {
    const parts = draft
      .split(/[\n,]/)
      .map((name) => name.trim())
      .filter(Boolean)
    if (parts.length === 0) return
    setNames((prev) => {
      const next = [...prev]
      for (const part of parts) {
        if (!next.some((name) => name.toLowerCase() === part.toLowerCase())) {
          next.push(part)
        }
      }
      return next
    })
    setDraft("")
  }

  function save() {
    commitDraft()
    const unique = Array.from(
      new Set(
        [...names, ...draft.split(/[\n,]/).map((n) => n.trim())].filter(Boolean)
      )
    )
    if (unique.length === 0) {
      toast.error("Type a name")
      return
    }
    mutation.mutate(unique)
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="gap-0 rounded-t-2xl px-5 pt-5 pb-safe">
        <SheetHeader className="gap-2 p-0 text-left">
          <SheetTitle className="font-display text-2xl font-semibold tracking-tight">
            Add people
          </SheetTitle>
          <SheetDescription>
            Names you add can be assigned items before they open the link.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-5 flex flex-col gap-3">
          {names.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {names.map((name) => (
                <span key={name} className="landing-member-chip">
                  {name}
                  <button
                    type="button"
                    onClick={() =>
                      setNames((prev) => prev.filter((entry) => entry !== name))
                    }
                    className="inline-flex size-5 items-center justify-center rounded-sm transition-colors hover:bg-background/70"
                    aria-label={`Remove ${name}`}
                  >
                    <HugeiconsIcon
                      icon={Cancel01Icon}
                      size={12}
                      strokeWidth={2}
                    />
                  </button>
                </span>
              ))}
            </div>
          ) : null}
          <div className="flex gap-2">
            <div className="flex-1">
              <Label htmlFor="add-people-name" className="sr-only">
                Name
              </Label>
              <Input
                id="add-people-name"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === ",") {
                    event.preventDefault()
                    commitDraft()
                  }
                }}
                placeholder="Type a name"
              />
            </div>
            <Button
              type="button"
              variant="outline"
              className="shrink-0 px-4"
              onClick={commitDraft}
              disabled={!draft.trim()}
            >
              Add
            </Button>
          </div>
        </div>

        <SheetFooter className="mt-6 p-0">
          <Button
            type="button"
            className="w-full"
            onClick={save}
            disabled={mutation.isPending}
          >
            {mutation.isPending ? "Saving…" : "Save names"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
