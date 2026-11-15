import { useMemo, useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

import { PartialPaymentSheet } from "@/components/house/partial-payment-sheet"
import { PaymentProofDialog } from "@/components/payment-proof-dialog"
import { PaymentProofSheet } from "@/components/payment-proof-sheet"
import { PayProfileSheet } from "@/components/pay-profile-sheet"
import {
  atmDigitsToCents,
  centsToAtmDigits,
  currencyFractionDigits,
} from "@/lib/atm-amount"
import { formatHouseTransfer, houseTransfers } from "@/lib/house-ledger"
import { canRecordPayment } from "@/lib/house-permissions"
import { copyText } from "@/lib/invite-link"
import { roomKeys } from "@/lib/room-query"
import { formatMoney } from "@/lib/settle"
import type { Transfer } from "@/lib/settle"
import { deleteHousePayment, recordHousePayment } from "@/server/houses"
import type { RoomDto, SettlementDto } from "@/server/rooms"

type Draft = {
  fromId: string
  toId: string
  amountDigits: string
  lockPair: boolean
}

/**
 * Settle state and actions for a house: transfers left, the partial-payment
 * and proof sheets, undo, and reminders, all under the house permission
 * matrix. Render `sheets` once wherever the hook is used.
 */
export function useHouseSettle(room: RoomDto) {
  const queryClient = useQueryClient()
  const role = room.house?.viewer.role ?? "VISITOR"
  const actorId = room.house?.viewer.memberId ?? null
  const members = room.house?.members ?? []
  const fractionDigits = currencyFractionDigits(room.currency)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [proofOpen, setProofOpen] = useState(false)
  const [viewing, setViewing] = useState<SettlementDto | null>(null)
  const [payMemberId, setPayMemberId] = useState<string | null>(null)
  const payMember =
    room.members.find((member) => member.id === payMemberId) ?? null

  const transfers = useMemo(
    () => houseTransfers(room.members, room.expenses, room.settlements),
    [room]
  )

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: roomKeys.room(room.code) })

  const deleteMutation = useMutation({
    mutationFn: (settlementId: string) =>
      deleteHousePayment({
        data: {
          code: room.code,
          viewerMemberId: actorId ?? undefined,
          settlementId,
        },
      }),
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
    mutationFn: (input: {
      fromMemberId: string
      toMemberId: string
      amountCents: number
      proof?: { base64: string; mimeType: "image/jpeg" }
    }) =>
      recordHousePayment({
        data: {
          code: room.code,
          viewerMemberId: actorId ?? undefined,
          ...input,
        },
      }),
    onSuccess: async (next, vars) => {
      setDraft(null)
      setProofOpen(false)
      await invalidate()
      const created = next.settlements.find(
        (row) =>
          row.fromMemberId === vars.fromMemberId &&
          row.toMemberId === vars.toMemberId &&
          row.amountCents === vars.amountCents
      )
      toast.success("Payment recorded", {
        description: `${vars.fromMemberId === actorId ? "You" : (members.find((member) => member.id === vars.fromMemberId)?.name ?? "They")} paid ${formatMoney(vars.amountCents, room.currency)}`,
        action: created
          ? {
              label: "Undo",
              onClick: () => deleteMutation.mutate(created.id),
            }
          : undefined,
      })
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Could not record payment"
      )
    },
  })

  const suggestedCents =
    draft == null
      ? 0
      : (transfers.find(
          (row) => row.fromId === draft.fromId && row.toId === draft.toId
        )?.amountCents ?? 0)
  const draftAmountCents = draft
    ? atmDigitsToCents(draft.amountDigits, fractionDigits)
    : 0
  const draftFromName =
    members.find((member) => member.id === draft?.fromId)?.name ?? ""
  const draftToName =
    members.find((member) => member.id === draft?.toId)?.name ?? ""
  const proofTransfer: Transfer | null =
    draft && draftAmountCents > 0
      ? {
          fromId: draft.fromId,
          fromName: draftFromName,
          toId: draft.toId,
          toName: draftToName,
          amountCents: draftAmountCents,
        }
      : null

  function markPaid(transfer: Transfer) {
    setDraft({
      fromId: transfer.fromId,
      toId: transfer.toId,
      amountDigits: centsToAtmDigits(transfer.amountCents, fractionDigits),
      lockPair: true,
    })
    setProofOpen(false)
  }

  function recordCustom() {
    if (!actorId) return
    const other = members.find((member) => member.id !== actorId)?.id ?? actorId
    setDraft({ fromId: actorId, toId: other, amountDigits: "", lockPair: false })
    setProofOpen(false)
  }

  async function remind(transfer: Transfer) {
    const text = formatHouseTransfer(transfer, room.currency)
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
    toast.success("Copied, paste it in the group chat")
  }

  function payeeProps(transfer: Transfer) {
    const payee = room.members.find((member) => member.id === transfer.toId)
    return {
      payee: payee?.pay ?? null,
      onPayeeDetails:
        payee && !payee.payLocked ? () => setPayMemberId(payee.id) : undefined,
    }
  }

  const sheets = (
    <>
      <PartialPaymentSheet
        open={draft !== null && !proofOpen}
        onOpenChange={(open) => {
          if (!open && !recordMutation.isPending) {
            setDraft(null)
            setProofOpen(false)
          }
        }}
        members={members}
        fromId={draft?.fromId ?? ""}
        toId={draft?.toId ?? ""}
        onFromChange={(id) =>
          setDraft((current) =>
            current ? { ...current, fromId: id } : current
          )
        }
        onToChange={(id) =>
          setDraft((current) => (current ? { ...current, toId: id } : current))
        }
        lockPair={draft?.lockPair ?? true}
        amountDigits={draft?.amountDigits ?? ""}
        onAmountDigits={(digits) =>
          setDraft((current) =>
            current ? { ...current, amountDigits: digits } : current
          )
        }
        fractionDigits={fractionDigits}
        currency={room.currency}
        suggestedCents={suggestedCents}
        actorId={actorId}
        onContinue={() => {
          if (!draft) return
          if (!canRecordPayment(role, actorId, draft.fromId, draft.toId)) {
            toast.error("You can only record a payment you're part of")
            return
          }
          setProofOpen(true)
        }}
      />
      <PaymentProofSheet
        transfer={proofTransfer}
        summary={
          proofTransfer
            ? {
                sentence: `${draftFromName} pays ${draftToName}`,
                amountLabel: formatMoney(draftAmountCents, room.currency),
              }
            : null
        }
        currency={room.currency}
        memberId={actorId ?? ""}
        open={proofOpen && proofTransfer !== null}
        saving={recordMutation.isPending}
        onOpenChange={(open) => {
          if (recordMutation.isPending) return
          if (!open) setProofOpen(false)
        }}
        onConfirm={(proof) => {
          if (!draft) return
          recordMutation.mutate({
            fromMemberId: draft.fromId,
            toMemberId: draft.toId,
            amountCents: draftAmountCents,
            ...(proof ? { proof } : {}),
          })
        }}
      />
      <PayProfileSheet
        room={room}
        member={payMember}
        viewerMemberId={actorId}
        open={payMember !== null}
        onOpenChange={(open) => {
          if (!open) setPayMemberId(null)
        }}
      />
      <PaymentProofDialog
        open={viewing !== null}
        onOpenChange={(open) => {
          if (!open) setViewing(null)
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
    role,
    actorId,
    members,
    transfers,
    mine: transfers.filter(
      (row) => row.fromId === actorId || row.toId === actorId
    ),
    others: transfers.filter(
      (row) => row.fromId !== actorId && row.toId !== actorId
    ),
    recording: recordMutation.isPending,
    undoing: deleteMutation.isPending,
    isPending: (transfer: Transfer) =>
      recordMutation.isPending &&
      draft?.fromId === transfer.fromId &&
      draft.toId === transfer.toId,
    canMark: (transfer: Transfer) =>
      canRecordPayment(role, actorId, transfer.fromId, transfer.toId),
    canRecordCustom: Boolean(
      actorId &&
      members.some((member) =>
        canRecordPayment(role, actorId, actorId, member.id)
      )
    ),
    payeeProps,
    openPayDetails: (id: string) => setPayMemberId(id),
    markPaid,
    recordCustom,
    remind,
    undo: (settlementId: string) => deleteMutation.mutate(settlementId),
    viewProof: (settlement: SettlementDto) => setViewing(settlement),
    sheets,
  }
}
