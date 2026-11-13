import { useState } from "react"
import type { ReactNode } from "react"
import { useNavigate, useRouter } from "@tanstack/react-router"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { HugeiconsIcon } from "@hugeicons/react"
import { Cancel01Icon, Delete02Icon } from "@hugeicons/core-free-icons"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { hideRoomLocal } from "@/lib/hidden-rooms"
import { forgetMember } from "@/lib/member-storage"
import { forgetRecentTrip } from "@/lib/recent-trips"
import { forgetRoomCache } from "@/lib/room-cache"
import { roomKeys } from "@/lib/room-query"
import { useSignedInUserId } from "@/lib/use-auth-user"
import { cn } from "@/lib/utils"
import { parseRoomKind, roomKindNoun } from "@/lib/room-kind"
import type { RoomKind } from "@/lib/room-kind"
import { deleteRoom, hideRoom } from "@/server/rooms"

type Placement = "row" | "page"

function deleteConfirmDetail(kind: RoomKind): string {
  switch (kind) {
    case "DINNER":
      return "It's gone for everyone at the table. This cannot be undone."
    case "TRIP":
      return "It's gone for everyone on this trip. This cannot be undone."
    case "HOUSEHOLD":
      return "Charges, payments, and recurring for everyone are gone."
    default: {
      const _never: never = kind
      throw new Error(`Unknown room kind: ${String(_never)}`)
    }
  }
}

function deletedToast(kind: RoomKind): string {
  switch (kind) {
    case "DINNER":
      return "Bill deleted"
    case "TRIP":
      return "Trip deleted"
    case "HOUSEHOLD":
      return "House deleted"
    default: {
      const _never: never = kind
      throw new Error(`Unknown room kind: ${String(_never)}`)
    }
  }
}

export function RoomExitControl({
  code,
  name,
  kind,
  owned,
  placement,
  onDone,
}: {
  code: string
  name: string
  kind: RoomKind
  owned: boolean
  placement: Placement
  onDone?: () => void
}) {
  const parsed = parseRoomKind(kind)
  const noun = roomKindNoun(parsed)
  const userId = useSignedInUserId()
  const router = useRouter()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [confirmOpen, setConfirmOpen] = useState(false)

  async function leaveHome() {
    onDone?.()
    await router.invalidate()
    if (placement === "page") {
      await navigate({ to: "/", search: { stay: true } })
    }
  }

  const hideMutation = useMutation({
    mutationFn: async () => {
      if (userId) {
        await hideRoom({ data: { code } })
      }
      hideRoomLocal(code)
      forgetRecentTrip(code)
    },
    onSuccess: async () => {
      toast.success("Hidden from your list")
      await leaveHome()
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Could not hide")
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async () => {
      await deleteRoom({ data: { code } })
      queryClient.removeQueries({ queryKey: roomKeys.room(code) })
      forgetRoomCache(code)
      forgetRecentTrip(code)
      forgetMember(code)
    },
    onSuccess: async () => {
      toast.success(deletedToast(parsed))
      setConfirmOpen(false)
      await leaveHome()
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Could not delete")
    },
  })

  const pending = hideMutation.isPending || deleteMutation.isPending

  function onTrigger() {
    if (owned) {
      setConfirmOpen(true)
      return
    }
    hideMutation.mutate()
  }

  let trigger: ReactNode
  switch (placement) {
    case "row":
      trigger = (
        <button
          type="button"
          className="inline-flex size-11 shrink-0 items-center justify-center self-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label={owned ? `Delete ${name}` : `Hide ${name}`}
          disabled={pending}
          onClick={onTrigger}
        >
          <HugeiconsIcon
            icon={owned ? Delete02Icon : Cancel01Icon}
            size={14}
            strokeWidth={2}
          />
        </button>
      )
      break
    case "page":
      trigger = (
        <button
          type="button"
          className={cn(
            "text-action w-full justify-center",
            owned && "text-destructive hover:text-destructive"
          )}
          disabled={pending}
          onClick={onTrigger}
        >
          {pending
            ? owned
              ? "Deleting…"
              : "Hiding…"
            : owned
              ? `Delete this ${noun}`
              : `Hide this ${noun}`}
        </button>
      )
      break
    default: {
      const _never: never = placement
      throw new Error(`Unknown placement: ${String(_never)}`)
    }
  }

  return (
    <>
      {trigger}
      <Sheet open={confirmOpen} onOpenChange={setConfirmOpen}>
        <SheetContent
          side="bottom"
          showCloseButton={false}
          className="pb-safe gap-0 rounded-t-3xl px-4 pt-5"
        >
          <SheetHeader className="gap-1 p-0 text-left">
            <SheetTitle className="font-display text-[22px] font-bold tracking-tight">
              Delete this {noun}?
            </SheetTitle>
            <SheetDescription className="text-[15px] leading-snug text-muted-foreground">
              {deleteConfirmDetail(parsed)}
            </SheetDescription>
          </SheetHeader>
          <SheetFooter className="mt-4 flex-col gap-2 p-0">
            <Button
              type="button"
              variant="destructive"
              className="cta-lg"
              disabled={pending}
              onClick={() => deleteMutation.mutate()}
            >
              {deleteMutation.isPending ? "Deleting…" : `Delete this ${noun}`}
            </Button>
            <button
              type="button"
              className="text-action w-full justify-center"
              disabled={pending}
              onClick={() => setConfirmOpen(false)}
            >
              Keep it
            </button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  )
}
