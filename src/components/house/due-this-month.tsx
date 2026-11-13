import { useNavigate } from "@tanstack/react-router"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { houseCategoryHint } from "@/lib/house-categories"
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
  const currentMonth = monthKey()
  const items = dueThisMonth(
    room.house?.templates ?? [],
    room.house?.occurrences ?? [],
    currentMonth
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
    onSuccess: async () => {
      await invalidate()
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
          const variable = item.kind === "VARIABLE" || item.amountCents == null
          const pending =
            confirmMutation.isPending ||
            skipMutation.isPending ||
            undoMutation.isPending
          const meta = [
            houseCategoryHint(item.category, item.title),
            `${paidBy} pays`,
            item.periodMonth === currentMonth
              ? null
              : formatMonth(item.periodMonth),
          ]
            .filter(Boolean)
            .join(" · ")
          return (
            <li
              key={`${item.templateId}:${item.periodMonth}`}
              className="px-4 py-3"
            >
              <div className="flex items-baseline justify-between gap-3">
                <p className="min-w-0 truncate font-medium">{item.title}</p>
                <p
                  className={
                    variable
                      ? "shrink-0 text-[13px] text-muted-foreground"
                      : "shrink-0 font-medium tabular-nums"
                  }
                >
                  {variable
                    ? "Varies"
                    : formatMoney(item.amountCents ?? 0, room.currency)}
                </p>
              </div>
              <p className="mt-0.5 truncate text-[13px] text-muted-foreground">
                {meta}
              </p>
              {canAct ? (
                <div className="mt-2.5 flex items-center gap-4">
                  {variable ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      className="bg-muted px-3.5 text-primary hover:bg-foreground/10"
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
                      variant="secondary"
                      className="bg-muted px-3.5 text-primary hover:bg-foreground/10"
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
                  )}
                  {variable ? null : (
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
                  )}
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
