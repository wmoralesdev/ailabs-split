import { useNavigate } from "@tanstack/react-router"
import { useMutation, useQueryClient } from "@tanstack/react-query"
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
import { houseCategoryDisplay } from "@/lib/house-categories"
import { formatDay, formatMonth } from "@/lib/house-month"
import { canDeleteCharge, canEditCharge } from "@/lib/house-permissions"
import { roomKeys } from "@/lib/room-query"
import { formatMoney } from "@/lib/settle"
import { deleteHouseCharge } from "@/server/houses"
import type { ExpenseDto, RoomDto } from "@/server/rooms"

export function HouseChargeSheet({
  room,
  expense,
  open,
  onOpenChange,
}: {
  room: RoomDto
  expense: ExpenseDto | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const role = room.house?.viewer.role ?? "VISITOR"
  const actorId = room.house?.viewer.memberId ?? null
  const isAuthor = Boolean(
    expense && actorId && expense.createdByMemberId === actorId
  )
  const canEdit = expense ? canEditCharge(role, isAuthor) : false
  const canDelete = expense ? canDeleteCharge(role, isAuthor) : false

  const deleteMutation = useMutation({
    mutationFn: () => {
      if (!expense) throw new Error("Charge not found")
      return deleteHouseCharge({
        data: {
          code: room.code,
          viewerMemberId: actorId ?? undefined,
          expenseId: expense.id,
        },
      })
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: roomKeys.room(room.code),
      })
      toast.success("Charge deleted")
      onOpenChange(false)
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Could not delete the charge"
      )
    },
  })

  if (!expense) {
    return <Sheet open={open} onOpenChange={onOpenChange} />
  }

  const paidBy =
    room.house?.members.find((member) => member.id === expense.paidById)
      ?.name ?? expense.paidByName

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="max-h-[85dvh] overflow-y-auto rounded-t-2xl"
      >
        <div className="mx-auto flex w-full max-w-content flex-col">
          <SheetHeader>
            <SheetTitle>{expense.title}</SheetTitle>
            <SheetDescription>
              {houseCategoryDisplay(expense.category)} · Paid by {paidBy}
              {expense.paidOn ? ` · ${formatDay(expense.paidOn)}` : ""}
              {expense.periodMonth
                ? ` · For ${formatMonth(expense.periodMonth)}`
                : ""}
            </SheetDescription>
          </SheetHeader>

          <div className="flex flex-col gap-4 px-4 pb-2">
            <p className="font-display text-3xl font-semibold tabular-nums">
              {formatMoney(expense.amountCents, expense.currency)}
            </p>
            <div>
              <h3 className="text-sm font-medium">Your share</h3>
              <ul className="mt-2 divide-y divide-border/60">
                {expense.shares.map((share) => (
                  <li
                    key={share.memberId}
                    className="flex items-center justify-between gap-3 py-2"
                  >
                    <span className="text-[15px]">{share.memberName}</span>
                    <span className="text-[15px] font-medium tabular-nums">
                      {formatMoney(share.amountCents, expense.currency)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <SheetFooter>
            {canEdit || canDelete ? (
              <div className="grid grid-cols-2 gap-2">
                {canEdit ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      onOpenChange(false)
                      void navigate({
                        to: "/r/$code/new",
                        params: { code: room.code },
                        search: { edit: expense.id },
                      })
                    }}
                  >
                    Edit
                  </Button>
                ) : (
                  <span />
                )}
                {canDelete ? (
                  <Button
                    type="button"
                    variant="destructive"
                    disabled={deleteMutation.isPending}
                    onClick={() => {
                      if (
                        !window.confirm(
                          "Delete this charge? This cannot be undone."
                        )
                      ) {
                        return
                      }
                      deleteMutation.mutate()
                    }}
                  >
                    {deleteMutation.isPending ? "Deleting…" : "Delete"}
                  </Button>
                ) : null}
              </div>
            ) : null}
          </SheetFooter>
        </div>
      </SheetContent>
    </Sheet>
  )
}
