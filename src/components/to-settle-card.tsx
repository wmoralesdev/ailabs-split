import { useCallback, useEffect, useMemo, useState } from "react"
import { useNavigate } from "@tanstack/react-router"
import { useMutation, useQueries, useQueryClient } from "@tanstack/react-query"
import { HugeiconsIcon } from "@hugeicons/react"
import { ArrowRight01Icon } from "@hugeicons/core-free-icons"
import { toast } from "sonner"

import { PaymentProofSheet } from "@/components/payment-proof-sheet"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import {
  buildSettleAllCard,
  candidateDinnerCodes,
  dinnerSettleLine,
  formatLineAmount,
  formatLinePayHint,
  formatPayAllSummary,
  amountWithCode,
  formatSettleDetail,
  joinPersonNames,
  outgoingSettleItems,
  readHiddenDinnerCodes,
} from "@/lib/dinner-settle-all"
import type { DinnerSettleLine } from "@/lib/dinner-settle-all"
import { mergeHiddenRoomCodes } from "@/lib/hidden-rooms"
import { recallMember } from "@/lib/member-storage"
import { listRecentTrips } from "@/lib/recent-trips"
import { roomKeys, roomQueryOptions } from "@/lib/room-query"
import { deleteSettlements, recordSettlements } from "@/server/rooms"
import type { OwnedRoomDto } from "@/server/rooms"

type Candidate = { code: string; memberId: string }

function readCandidates(
  yours: readonly OwnedRoomDto[],
  extraHidden: readonly string[]
): Candidate[] {
  const hidden = readHiddenDinnerCodes(extraHidden)
  const codes = candidateDinnerCodes({
    recent: listRecentTrips(),
    yours,
    hidden,
  })
  const out: Candidate[] = []
  for (const code of codes) {
    const memberId = recallMember(code)
    if (memberId) out.push({ code, memberId })
  }
  return out
}

export function ToSettleCard({
  yours,
  serverHiddenCodes,
  revision = 0,
}: {
  yours: readonly OwnedRoomDto[]
  serverHiddenCodes: readonly string[]
  revision?: number
}) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [listOpen, setListOpen] = useState(false)
  const [proofOpen, setProofOpen] = useState(false)

  const refreshCandidates = useCallback(() => {
    mergeHiddenRoomCodes([...serverHiddenCodes])
    setCandidates(readCandidates(yours, serverHiddenCodes))
  }, [serverHiddenCodes, yours])

  useEffect(() => {
    refreshCandidates()
    window.addEventListener("focus", refreshCandidates)
    return () => window.removeEventListener("focus", refreshCandidates)
  }, [refreshCandidates, revision])

  const queries = useQueries({
    queries: candidates.map(({ code, memberId }) =>
      roomQueryOptions(code, memberId)
    ),
  })

  const lines = useMemo(() => {
    const next: DinnerSettleLine[] = []
    for (const [index, candidate] of candidates.entries()) {
      const room = queries[index]?.data
      if (!room) continue
      const line = dinnerSettleLine(room, candidate.memberId)
      if (line) next.push(line)
    }
    return next
  }, [candidates, queries])

  const card = buildSettleAllCard(lines)
  const payAll = card ? formatPayAllSummary(card) : null
  const payItems = card ? outgoingSettleItems(card.lines) : []
  const waiting = queries.some((query) => query.isPending)

  const invalidateLines = async () => {
    if (!card) return
    await Promise.all(
      card.lines.map((line) =>
        queryClient.invalidateQueries({ queryKey: roomKeys.room(line.code) })
      )
    )
    refreshCandidates()
  }

  const deleteMutation = useMutation({
    mutationFn: (items: Array<{ code: string; settlementId: string }>) =>
      deleteSettlements({ data: { items } }),
    onSuccess: async () => {
      await invalidateLines()
      toast.success("Payments undone")
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Could not undo payments"
      )
    },
  })

  const recordMutation = useMutation({
    mutationFn: (input: {
      items: typeof payItems
      proof?: { base64: string; mimeType: "image/jpeg" }
    }) => recordSettlements({ data: input }),
    onSuccess: async (created) => {
      setProofOpen(false)
      await invalidateLines()
      const count = created.length
      toast.success("Payments recorded", {
        description: `${count} ${count === 1 ? "payment" : "payments"}`,
        action: {
          label: "Undo",
          onClick: () =>
            deleteMutation.mutate(
              created.map((settlement) => ({
                code: settlement.code,
                settlementId: settlement.id,
              }))
            ),
        },
      })
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Could not record payments"
      )
    },
  })

  if (waiting && !card) return null
  if (!card) return null

  const detail = formatSettleDetail(card)
  const showCode = card.buckets.length > 1
  const owe = card.buckets
    .filter((bucket) => bucket.oweCents > 0)
    .map((bucket) => amountWithCode(bucket.oweCents, bucket.currency, showCode))
  const owed = card.buckets
    .filter((bucket) => bucket.owedCents > 0)
    .map((bucket) => amountWithCode(bucket.owedCents, bucket.currency, showCode))
  const sides = [
    ...(owe.length > 0
      ? [
          {
            label: "You owe",
            amounts: owe,
            people:
              card.payeeNames.length > 0
                ? `To ${joinPersonNames(card.payeeNames)}`
                : null,
          },
        ]
      : []),
    ...(owed.length > 0
      ? [
          {
            label: "You get back",
            amounts: owed,
            people:
              card.payerNames.length > 0
                ? card.payerNames.length > 3
                  ? `From ${card.payerNames.length} people`
                  : `From ${joinPersonNames(card.payerNames)}`
                : null,
          },
        ]
      : []),
  ]

  function openDinnerSettle(code: string) {
    setListOpen(false)
    void navigate({ to: "/r/$code/settle", params: { code } })
  }

  function confirmPayAll(proof?: { base64: string; mimeType: "image/jpeg" }) {
    if (payItems.length === 0) return
    recordMutation.mutate({ items: payItems, ...(proof ? { proof } : {}) })
  }

  return (
    <>
      <button
        type="button"
        data-testid="to-settle-card"
        aria-haspopup="dialog"
        onClick={() => setListOpen(true)}
        className="mt-8 w-full overflow-hidden rounded-3xl bg-card text-left transition-[transform,background-color] duration-200 outline-none focus-visible:ring-2 focus-visible:ring-ring motion-safe:hover:-translate-y-px motion-safe:active:translate-y-px"
      >
        <span className="flex items-center justify-between gap-3 px-4 pt-4">
          <span className="text-[13px] font-medium text-muted-foreground">
            To settle · {card.dinnerCount}{" "}
            {card.dinnerCount === 1 ? "bill" : "bills"}
          </span>
          <span className="inline-flex items-center gap-0.5 text-[13px] font-medium text-primary">
            See all
            <HugeiconsIcon icon={ArrowRight01Icon} size={14} strokeWidth={2} />
          </span>
        </span>
        <span
          className={
            sides.length > 1
              ? "grid grid-cols-2 divide-x divide-border/70"
              : "grid grid-cols-1"
          }
        >
          {sides.map((side) => (
            <span key={side.label} className="min-w-0 px-4 pt-2 pb-4">
              <span className="block text-[13px] text-muted-foreground">
                {side.label}
              </span>
              {side.amounts.map((amount) => (
                <span
                  key={amount}
                  className="mt-0.5 block truncate font-display text-[28px] leading-tight font-bold tracking-tight tabular-nums"
                >
                  {amount}
                </span>
              ))}
              {side.people ? (
                <span className="mt-0.5 block truncate text-[13px] text-muted-foreground">
                  {side.people}
                </span>
              ) : null}
            </span>
          ))}
        </span>
      </button>

      <Sheet open={listOpen} onOpenChange={setListOpen}>
        <SheetContent
          side="bottom"
          className="flex max-h-[92dvh] flex-col gap-0 rounded-t-3xl bg-background p-0"
        >
          <div className="mx-auto flex min-h-0 w-full max-w-content flex-1 flex-col">
            <SheetHeader className="gap-0.5 px-4 pt-4 pb-3 text-left">
              <SheetTitle className="font-display text-[22px] font-bold tracking-tight">
                Settle everything
              </SheetTitle>
              <SheetDescription className="text-[15px] leading-snug">
                {detail}
              </SheetDescription>
            </SheetHeader>

            <ul className="group-list mx-4 mb-4">
              {card.lines.map((line) => (
                <li key={line.code}>
                  <button
                    type="button"
                    className="group-row-hit w-full text-left"
                    onClick={() => openDinnerSettle(line.code)}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-foreground">
                        {line.name}
                      </span>
                      <span className="mt-0.5 block text-[13px] text-muted-foreground">
                        {formatLinePayHint(line)}
                      </span>
                    </span>
                    <span className="shrink-0 text-[15px] font-semibold tabular-nums">
                      {formatLineAmount(line)}
                    </span>
                    <HugeiconsIcon
                      icon={ArrowRight01Icon}
                      size={16}
                      strokeWidth={2}
                      className="shrink-0 text-muted-foreground"
                    />
                  </button>
                </li>
              ))}
            </ul>

            {payAll ? (
              <SheetFooter className="pb-safe border-t border-border px-4 pt-3">
                <Button
                  type="button"
                  className="cta-lg"
                  onClick={() => {
                    setListOpen(false)
                    setProofOpen(true)
                  }}
                >
                  I paid all of it
                </Button>
              </SheetFooter>
            ) : null}
          </div>
        </SheetContent>
      </Sheet>

      <PaymentProofSheet
        transfer={null}
        summary={payAll}
        currency={card.buckets[0]?.currency ?? "USD"}
        memberId={card.lines[0]?.memberId ?? ""}
        open={proofOpen}
        saving={recordMutation.isPending}
        onOpenChange={(next) => {
          if (recordMutation.isPending) return
          setProofOpen(next)
        }}
        onConfirm={confirmPayAll}
      />
    </>
  )
}
