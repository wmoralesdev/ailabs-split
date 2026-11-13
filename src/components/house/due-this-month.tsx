import { useNavigate } from "@tanstack/react-router"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { houseCategoryDisplay } from "@/lib/house-categories"
import { dueThisMonth } from "@/lib/house-ledger"
import { formatMonth, monthKey } from "@/lib/house-month"
import { canConfirmDue } from "@/lib/house-permissions"
import { roomKeys } from "@/lib/room-query"
import { formatMoney } from "@/lib/settle"
import { confirmDueCharge, skipDueCharge, undoSkipDue } from "@/server/houses"
import type { RoomDto } from "@/server/rooms"

export function DueThisMonth({ room }: { room: RoomDto }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const role = room.house?.viewer.role ?? "VISITOR"
  const actorId = room.house?.viewer.memberId ?? null
  const canAct = canConfirmDue(role)
  const items = dueThisMonth(
    room.house?.templates ?? [],
    room.house?.occurrences ?? [],
    monthKey()
  )

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: roomKeys.room(room.code) })

  const confirmMutation = useMutation({
    mutationFn: (input: { templateId: string; periodMonth: string }) =>
      confirmDueCharge({
        data: {
          code: room.code,
          viewerMemberId: actorId ?? undefined,
          ...input,
        },
      }),
    onSuccess: async (_room, vars) => {
      await invalidate()
      const title =
        items.find(
          (item) =>
            item.templateId === vars.templateId &&
            item.periodMonth === vars.periodMonth
        )?.title ?? "Charge"
      toast.success(`${title} added for ${formatMonth(vars.periodMonth)}`)
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Could not confirm")
    },
  })

  const skipMutation = useMutation({
    mutationFn: (input: { templateId: string; periodMonth: string }) =>
      skipDueCharge({
        data: {
          code: room.code,
          viewerMemberId: actorId ?? undefined,
          ...input,
        },
      }),
    onSuccess: async (_room, vars) => {
      await invalidate()
      toast.success(`Skipped ${formatMonth(vars.periodMonth)}`, {
        action: {
          label: "Undo",
          onClick: () =>
            undoMutation.mutate({
              templateId: vars.templateId,
              periodMonth: vars.periodMonth,
            }),
        },
      })
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Could not skip")
    },
  })

  const undoMutation = useMutation({
    mutationFn: (input: { templateId: string; periodMonth: string }) =>
      undoSkipDue({
        data: {
          code: room.code,
          viewerMemberId: actorId ?? undefined,
          ...input,
        },
      }),
    onSuccess: async () => {
      await invalidate()
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Could not undo")
    },
  })

  if (items.length === 0) return null

  return (
    <section className="mt-8">
      <h2 className="group-label">Due this month</h2>
      <ul className="group-list mt-1">
        {items.map((item) => {
          const paidBy =
            room.house?.members.find((member) => member.id === item.paidById)
              ?.name ?? "Someone"
          const amount =
            item.kind === "VARIABLE" || item.amountCents == null
              ? "Amount changes every month"
              : formatMoney(item.amountCents, room.currency)
          const pending =
            confirmMutation.isPending ||
            skipMutation.isPending ||
            undoMutation.isPending
          return (
            <li
              key={`${item.templateId}:${item.periodMonth}`}
              className="px-3 py-2"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-medium">{item.title}</p>
                  <p className="mt-0.5 truncate text-[13px] text-muted-foreground">
                    {houseCategoryDisplay(item.category)} ·{" "}
                    {formatMonth(item.periodMonth)} · {amount} · {paidBy} pays
                  </p>
                </div>
                {canAct ? (
                  item.kind === "VARIABLE" ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      disabled={pending}
                      onClick={() =>
                        void navigate({
                          to: "/r/$code/new",
                          params: { code: room.code },
                          search: {
                            template: item.templateId,
                            month: item.periodMonth,
                          },
                        })
                      }
                    >
                      Add amount
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      size="sm"
                      disabled={pending}
                      onClick={() =>
                        confirmMutation.mutate({
                          templateId: item.templateId,
                          periodMonth: item.periodMonth,
                        })
                      }
                    >
                      Confirm
                    </Button>
                  )
                ) : null}
              </div>
              {canAct ? (
                <div className="mt-1 flex gap-3">
                  <button
                    type="button"
                    className="text-action text-[13px]"
                    disabled={pending}
                    onClick={() =>
                      void navigate({
                        to: "/r/$code/new",
                        params: { code: room.code },
                        search: {
                          template: item.templateId,
                          month: item.periodMonth,
                        },
                      })
                    }
                  >
                    Edit first
                  </button>
                  <button
                    type="button"
                    className="text-action text-[13px]"
                    disabled={pending}
                    onClick={() =>
                      skipMutation.mutate({
                        templateId: item.templateId,
                        periodMonth: item.periodMonth,
                      })
                    }
                  >
                    Skip this month
                  </button>
                </div>
              ) : null}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
