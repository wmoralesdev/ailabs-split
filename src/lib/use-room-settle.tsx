import { useMemo, useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

import { PaymentProofDialog } from "@/components/payment-proof-dialog"
import { PaymentProofSheet } from "@/components/payment-proof-sheet"
import { PayProfileSheet } from "@/components/pay-profile-sheet"
import { transferKey } from "@/components/transfer-card"
import { copyText } from "@/lib/invite-link"
import { roomKeys } from "@/lib/room-query"
import {
  buildTripSummary,
  computeNetsWithSettlements,
  convertToBase,
  formatMoney,
  formatTransferSentence,
  simplifyTransfers,
} from "@/lib/settle"
import type { Transfer } from "@/lib/settle"
import type {
  DeleteSettlementInput,
  RecordSettlementInput,
} from "@/lib/schemas"
import { deleteSettlement, recordSettlement } from "@/server/rooms"
import type { RoomDto, SettlementDto } from "@/server/rooms"

/** Minimum transfers left in a trip or bill, in the room's base currency. */
export function computeRoomTransfers(room: RoomDto): Transfer[] {
  const nets = computeNetsWithSettlements(
    room.members,
    room.expenses
      .filter((expense) => !expense.isPersonal)
      .map((expense) => ({
        paidById: expense.paidById,
        shares: expense.shares.map((share) => ({
          memberId: share.memberId,
          amountCents: convertToBase(
            share.amountCents,
            expense.currency,
            room.currency,
            room.fxRates,
            room.fxAdjustmentBps
          ),
        })),
      })),
    room.settlements.map((settlement) => ({
      fromMemberId: settlement.fromMemberId,
      toMemberId: settlement.toMemberId,
      amountCents: convertToBase(
        settlement.amountCents,
        settlement.currency,
        room.currency,
        room.fxRates,
        room.fxAdjustmentBps
      ),
    }))
  )
  return simplifyTransfers(nets)
}

/** Share text through the OS sheet, or copy it when there is none. */
async function shareText(text: string, copiedMessage: string) {
  const share = "share" in navigator ? navigator.share.bind(navigator) : null
  if (share) {
    try {
      await share({ text })
    } catch {
      // Dismissed share sheet.
    }
    return
  }
  await copyText(text)
  toast.success(copiedMessage)
}

/** Share the room's text summary (expenses, payments, what's left). */
export async function shareRoomSummary(
  room: RoomDto,
  transfers: Transfer[] = computeRoomTransfers(room)
) {
  const text = buildTripSummary({
    name: room.name,
    code: room.code,
    currency: room.currency,
    expenses: room.expenses,
    settlements: room.settlements,
    transfers,
  })
  const share = "share" in navigator ? navigator.share.bind(navigator) : null
  if (share) {
    try {
      await share({ title: `${room.name} summary`, text })
    } catch {
      // Dismissed share sheet.
    }
    return
  }
  await copyText(text)
  toast.success("Summary copied")
}

/**
 * Settle state and actions for a trip or a bill: the transfers left, marking
 * one paid (with optional proof), undo, reminders, and the sheets they open.
 * Render `sheets` once wherever the hook is used.
 */
export function useRoomSettle(room: RoomDto, memberId: string) {
  const queryClient = useQueryClient()
  const [pendingKey, setPendingKey] = useState<string | null>(null)
  const [pendingTransfer, setPendingTransfer] = useState<Transfer | null>(null)
  const [viewing, setViewing] = useState<SettlementDto | null>(null)
  const [payMemberId, setPayMemberId] = useState<string | null>(null)

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: roomKeys.room(room.code) })

  const deleteMutation = useMutation({
    mutationFn: (input: DeleteSettlementInput) =>
      deleteSettlement({ data: input }),
    onSuccess: async () => {
      await invalidate()
      toast.success("Payment undone")
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Could not undo payment"
      )
    },
  })

  const recordMutation = useMutation({
    mutationFn: (input: RecordSettlementInput) =>
      recordSettlement({ data: input }),
    onSuccess: async (settlement) => {
      setPendingTransfer(null)
      await invalidate()
      toast.success("Payment recorded", {
        description: `${settlement.fromMemberName} paid ${settlement.toMemberName} ${formatMoney(settlement.amountCents, settlement.currency)}`,
        action: {
          label: "Undo",
          onClick: () =>
            deleteMutation.mutate({
              code: room.code,
              settlementId: settlement.id,
            }),
        },
      })
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Could not record payment"
      )
    },
    onSettled: () => setPendingKey(null),
  })

  const transfers = useMemo(() => computeRoomTransfers(room), [room])
  const mine = transfers.filter(
    (transfer) => transfer.fromId === memberId || transfer.toId === memberId
  )
  const others = transfers.filter(
    (transfer) => transfer.fromId !== memberId && transfer.toId !== memberId
  )
  const totalCents = transfers.reduce(
    (sum, transfer) => sum + transfer.amountCents,
    0
  )
  const paidCount = room.settlements.length
  const stepCount = paidCount + transfers.length
  const payMember =
    room.members.find((member) => member.id === payMemberId) ?? null

  function payeeProps(transfer: Transfer) {
    const payee = room.members.find((member) => member.id === transfer.toId)
    return {
      payee: payee?.pay ?? null,
      onPayeeDetails:
        payee && !payee.payLocked ? () => setPayMemberId(payee.id) : undefined,
    }
  }

  function confirmPaid(proof?: { base64: string; mimeType: "image/jpeg" }) {
    if (!pendingTransfer) return
    setPendingKey(transferKey(pendingTransfer))
    recordMutation.mutate({
      code: room.code,
      fromMemberId: pendingTransfer.fromId,
      toMemberId: pendingTransfer.toId,
      amountCents: pendingTransfer.amountCents,
      currency: room.currency,
      ...(proof ? { proof } : {}),
    })
  }

  const sheets = (
    <>
      <PaymentProofSheet
        transfer={pendingTransfer}
        currency={room.currency}
        memberId={memberId}
        open={pendingTransfer !== null}
        saving={recordMutation.isPending}
        onOpenChange={(next) => {
          if (recordMutation.isPending) return
          if (!next) setPendingTransfer(null)
        }}
        onConfirm={confirmPaid}
      />
      <PayProfileSheet
        room={room}
        member={payMember}
        viewerMemberId={memberId || null}
        open={payMember !== null}
        onOpenChange={(next) => {
          if (!next) setPayMemberId(null)
        }}
      />
      <PaymentProofDialog
        open={viewing !== null}
        onOpenChange={(next) => {
          if (!next) setViewing(null)
        }}
        code={room.code}
        settlementId={viewing?.id ?? null}
        label={
          viewing
            ? `${viewing.fromMemberName} paid ${viewing.toMemberName} ${formatMoney(viewing.amountCents, viewing.currency)}`
            : ""
        }
      />
    </>
  )

  return {
    transfers,
    mine,
    others,
    totalCents,
    paidCount,
    stepCount,
    recording: recordMutation.isPending,
    undoing: deleteMutation.isPending,
    isPending: (transfer: Transfer) => pendingKey === transferKey(transfer),
    payeeProps,
    openPayDetails: (id: string) => setPayMemberId(id),
    markPaid: (transfer: Transfer) => setPendingTransfer(transfer),
    remind: (transfer: Transfer) =>
      shareText(
        formatTransferSentence(transfer, room.currency),
        "Copied, paste it in the group chat"
      ),
    undo: (settlementId: string) =>
      deleteMutation.mutate({ code: room.code, settlementId }),
    viewProof: (settlement: SettlementDto) => setViewing(settlement),
    shareSummary: () => shareRoomSummary(room, transfers),
    sheets,
  }
}
