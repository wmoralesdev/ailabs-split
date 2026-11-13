import { useState } from "react"
import { useNavigate } from "@tanstack/react-router"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { HugeiconsIcon } from "@hugeicons/react"
import { CheckmarkCircle02Icon, Edit02Icon } from "@hugeicons/core-free-icons"
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
import { houseCategoryHint } from "@/lib/house-categories"
import { dueThisMonth } from "@/lib/house-ledger"
import type { DueThisMonthItem } from "@/lib/house-ledger"
import { formatMonth, monthKey } from "@/lib/house-month"
import { canConfirmDue } from "@/lib/house-permissions"
import { roomKeys } from "@/lib/room-query"
import { formatMoney } from "@/lib/settle"
import { confirmDueCharge, skipDueCharge, undoSkipDue } from "@/server/houses"
import type { RoomDto } from "@/server/rooms"

type DueKey = { templateId: string; periodMonth: string }

function dueKey(item: DueKey): string {
  return `${item.templateId}:${item.periodMonth}`
}

function isVariable(item: DueThisMonthItem): boolean {
  return item.kind === "VARIABLE" || item.amountCents == null
}

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
  const [openKey, setOpenKey] = useState<string | null>(null)
  const openItem = items.find((item) => dueKey(item) === openKey) ?? null

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: roomKeys.room(room.code) })

  const confirmMutation = useMutation({
    mutationFn: (input: DueKey) =>
      confirmDueCharge({
        data: {
          code: room.code,
          viewerMemberId: actorId ?? undefined,
          ...input,
        },
      }),
    onSuccess: async () => {
      setOpenKey(null)
      await invalidate()
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Could not confirm")
    },
  })

  const skipMutation = useMutation({
    mutationFn: (input: DueKey) =>
      skipDueCharge({
        data: {
          code: room.code,
          viewerMemberId: actorId ?? undefined,
          ...input,
        },
      }),
    onSuccess: async (_room, vars) => {
      setOpenKey(null)
      await invalidate()
      toast.success(`Skipped ${formatMonth(vars.periodMonth)}`, {
        action: {
          label: "Undo",
          onClick: () => undoMutation.mutate(vars),
        },
      })
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Could not skip")
    },
  })

  const undoMutation = useMutation({
    mutationFn: (input: DueKey) =>
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

  const pending =
    confirmMutation.isPending ||
    skipMutation.isPending ||
    undoMutation.isPending

  function paidByName(item: DueThisMonthItem): string {
    return (
      room.house?.members.find((member) => member.id === item.paidById)?.name ??
      "Someone"
    )
  }

  function editFirst(item: DueThisMonthItem) {
    setOpenKey(null)
    void navigate({
      to: "/r/$code/new",
      params: { code: room.code },
      search: { template: item.templateId, month: item.periodMonth },
    })
  }

  if (items.length === 0) return null

  return (
    <section className="mt-8">
      <h2 className="group-label">Due this month</h2>
      <ul className="group-list mt-1">
        {items.map((item) => {
          const variable = isVariable(item)
          const meta = [
            `${paidByName(item)} pays`,
            item.periodMonth === currentMonth
              ? null
              : formatMonth(item.periodMonth),
          ]
            .filter(Boolean)
            .join(" · ")
          return (
            <li key={dueKey(item)} className="group-row min-h-14">
              <button
                type="button"
                className="row-hit min-w-0 flex-1 text-left"
                onClick={() => setOpenKey(dueKey(item))}
              >
                <span className="block truncate text-[15px] font-medium">
                  {item.title}
                </span>
                <span className="block truncate text-[13px] text-muted-foreground">
                  <span
                    className={
                      variable ? undefined : "font-semibold text-foreground"
                    }
                  >
                    {variable
                      ? "Varies"
                      : formatMoney(item.amountCents ?? 0, room.currency)}
                  </span>
                  {` · ${meta}`}
                </span>
              </button>
              {canAct ? (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="bg-muted font-semibold text-primary"
                  disabled={pending}
                  onClick={() =>
                    variable
                      ? editFirst(item)
                      : confirmMutation.mutate({
                          templateId: item.templateId,
                          periodMonth: item.periodMonth,
                        })
                  }
                >
                  {variable ? "Add amount" : "Confirm"}
                </Button>
              ) : null}
            </li>
          )
        })}
      </ul>

      <Sheet
        open={openItem !== null}
        onOpenChange={(open) => {
          if (!open) setOpenKey(null)
        }}
      >
        {openItem ? (
          <SheetContent
            side="bottom"
            className="max-h-[85dvh] overflow-y-auto rounded-t-2xl"
          >
            <div className="mx-auto flex w-full max-w-content flex-col">
              <SheetHeader>
                <SheetTitle>{openItem.title}</SheetTitle>
                <SheetDescription>
                  {[
                    houseCategoryHint(openItem.category, openItem.title),
                    `${paidByName(openItem)} pays`,
                    `For ${formatMonth(openItem.periodMonth)}`,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </SheetDescription>
              </SheetHeader>

              <div className="px-4 pb-2">
                {isVariable(openItem) ? (
                  <p className="text-[15px] text-muted-foreground">
                    The amount changes every month. Add it from the bill.
                  </p>
                ) : (
                  <p className="font-display text-3xl font-semibold tabular-nums">
                    {formatMoney(openItem.amountCents ?? 0, room.currency)}
                  </p>
                )}
              </div>

              {canAct ? (
                <SheetFooter>
                  {isVariable(openItem) ? (
                    <Button
                      type="button"
                      className="cta-lg"
                      disabled={pending}
                      onClick={() => editFirst(openItem)}
                    >
                      Add amount
                    </Button>
                  ) : (
                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        disabled={pending}
                        onClick={() => editFirst(openItem)}
                      >
                        <HugeiconsIcon
                          icon={Edit02Icon}
                          size={14}
                          strokeWidth={2}
                        />
                        Edit first
                      </Button>
                      <Button
                        type="button"
                        disabled={pending}
                        onClick={() =>
                          confirmMutation.mutate({
                            templateId: openItem.templateId,
                            periodMonth: openItem.periodMonth,
                          })
                        }
                      >
                        <HugeiconsIcon
                          icon={CheckmarkCircle02Icon}
                          size={14}
                          strokeWidth={2}
                        />
                        {confirmMutation.isPending ? "Saving…" : "Confirm"}
                      </Button>
                    </div>
                  )}
                  <button
                    type="button"
                    className="text-action self-center text-[15px]"
                    disabled={pending}
                    onClick={() =>
                      skipMutation.mutate({
                        templateId: openItem.templateId,
                        periodMonth: openItem.periodMonth,
                      })
                    }
                  >
                    Skip {formatMonth(openItem.periodMonth)}
                  </button>
                </SheetFooter>
              ) : null}
            </div>
          </SheetContent>
        ) : null}
      </Sheet>
    </section>
  )
}
