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
  formatSettleDetail,
  formatSettleHeadlines,
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

  const headlines = formatSettleHeadlines(card)
  const detail = formatSettleDetail(card)

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
        className="surface mt-8 w-full p-4 text-left transition-[transform,background-color] duration-200 outline-none hover:bg-muted/70 focus-visible:ring-2 focus-visible:ring-ring motion-safe:hover:-translate-y-px motion-safe:active:translate-y-px"
      >
        <p className="eyebrow">To settle</p>
        <div className="mt-1 flex flex-col gap-0.5">
          {headlines.map((headline) => (
            <p
              key={headline}
              className="font-display text-[22px] leading-tight font-bold tracking-tight tabular-nums"
            >
              {headline}
            </p>
          ))}
        </div>
        <p className="mt-0.5 text-[15px] text-muted-foreground">{detail}</p>
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
