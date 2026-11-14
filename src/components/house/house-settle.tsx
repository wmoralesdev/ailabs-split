import { useMemo, useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { HugeiconsIcon } from "@hugeicons/react"
import { Tick02Icon, UndoIcon } from "@hugeicons/core-free-icons"
import { toast } from "sonner"

import { PartialPaymentSheet } from "@/components/house/partial-payment-sheet"
import {
  PaymentProofButton,
  PaymentProofDialog,
} from "@/components/payment-proof-dialog"
import { PaymentProofSheet } from "@/components/payment-proof-sheet"
import { PayProfileSheet } from "@/components/pay-profile-sheet"
import {
  SettleEmptyState,
  TransferCard,
  transferKey,
} from "@/components/transfer-card"
import { Button } from "@/components/ui/button"
import {
  atmDigitsToCents,
  centsToAtmDigits,
  currencyFractionDigits,
} from "@/lib/atm-amount"
import { formatRelativeTime } from "@/lib/format-relative-time"
import {
  formatHouseTransfer,
  houseBalanceCopy,
  houseNets,
  houseTransfers,
  monthBreakdown,
  movedOutSubtitle,
} from "@/lib/house-ledger"
import { formatMonth, isMovedOutOn, localIsoDate } from "@/lib/house-month"
import { canDeletePayment, canRecordPayment } from "@/lib/house-permissions"
import { copyText } from "@/lib/invite-link"
import { roomKeys } from "@/lib/room-query"
import { cn } from "@/lib/utils"
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

export function HouseSettle({ room }: { room: RoomDto }) {
  const queryClient = useQueryClient()
  const role = room.house?.viewer.role ?? "VISITOR"
  const actorId = room.house?.viewer.memberId ?? null
  const members = room.house?.members ?? []
  const today = localIsoDate()
  const fractionDigits = currencyFractionDigits(room.currency)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [proofOpen, setProofOpen] = useState(false)
  const [viewing, setViewing] = useState<SettlementDto | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(actorId)
  const [openMonth, setOpenMonth] = useState<string | null>(null)
  const [payMemberId, setPayMemberId] = useState<string | null>(null)
  const payMember =
    room.members.find((member) => member.id === payMemberId) ?? null

  const nets = useMemo(
    () => houseNets(room.members, room.expenses, room.settlements),
    [room]
  )
  const transfers = useMemo(
    () => houseTransfers(room.members, room.expenses, room.settlements),
    [room]
  )
  const selected = selectedId ?? actorId
  const breakdown = useMemo(
    () =>
      selected ? monthBreakdown(selected, room.expenses, room.settlements) : [],
    [selected, room]
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

  function openFromTransfer(transfer: Transfer) {
    setDraft({
      fromId: transfer.fromId,
      toId: transfer.toId,
      amountDigits: centsToAtmDigits(transfer.amountCents, fractionDigits),
      lockPair: true,
    })
    setProofOpen(false)
  }

  function openCustom() {
    if (!actorId) return
    const other = members.find((member) => member.id !== actorId)?.id ?? actorId
    setDraft({
      fromId: actorId,
      toId: other,
      amountDigits: "",
      lockPair: false,
    })
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

  const mine = transfers.filter(
    (row) => row.fromId === actorId || row.toId === actorId
  )
  const others = transfers.filter(
    (row) => row.fromId !== actorId && row.toId !== actorId
  )

  function renderTransfer(transfer: Transfer, emphasis: boolean) {
    const payee = room.members.find((member) => member.id === transfer.toId)
    return (
      <TransferCard
        key={transferKey(transfer)}
        transfer={transfer}
        currency={room.currency}
        memberId={actorId ?? ""}
        emphasis={emphasis}
        pending={
          recordMutation.isPending &&
          draft?.fromId === transfer.fromId &&
          draft.toId === transfer.toId
        }
        disabled={recordMutation.isPending}
        payee={payee?.pay ?? null}
        onPayeeDetails={
          payee && !payee.payLocked ? () => setPayMemberId(payee.id) : undefined
        }
        canMark={canRecordPayment(
          role,
          actorId,
          transfer.fromId,
          transfer.toId
        )}
        onMarkPaid={() => openFromTransfer(transfer)}
        onRemind={() => void remind(transfer)}
      />
    )
  }

  const canRecordCustom = Boolean(
    actorId &&
    members.some((member) =>
      canRecordPayment(role, actorId, actorId, member.id)
    )
  )

  return (
    <main className="page-gutter mx-auto max-w-content pt-2 pb-8">
      <h1 className="font-display text-[28px] leading-tight font-bold tracking-tight">
        Settle up
      </h1>
      <p className="mt-0.5 text-[15px] text-muted-foreground">
        Amounts in {room.currency}
      </p>

      {transfers.length === 0 ? (
        <SettleEmptyState
          title={
            room.expenses.length === 0 ? "Nothing to settle" : "All settled"
          }
          hint={
            room.expenses.length === 0
              ? "Add a charge to get started."
              : "Everyone is square."
          }
        />
      ) : null}

      {mine.length > 0 ? (
        <section className="mt-5" aria-labelledby="house-yours-heading">
          <h2 id="house-yours-heading" className="group-label">
            Yours
          </h2>
          <ul className="flex flex-col gap-2.5">
            {mine.map((transfer) => renderTransfer(transfer, true))}
          </ul>
        </section>
      ) : null}

      {others.length > 0 ? (
        <section className="mt-6" aria-labelledby="house-others-heading">
          <h2 id="house-others-heading" className="group-label">
            {mine.length > 0 ? "Between others" : "Who pays whom"}
          </h2>
          <ul className="group-list">
            {others.map((transfer) => renderTransfer(transfer, false))}
          </ul>
        </section>
      ) : null}

      <section className="mt-8">
        <h2 className="group-label">Balances</h2>
        <ul className="group-list mt-1">
          {members.map((member) => {
            const net =
              nets.find((row) => row.memberId === member.id)?.netCents ?? 0
            const left = isMovedOutOn(member.leftOn, today)
              ? movedOutSubtitle(member.leftOn)
              : null
            const selectedRow = member.id === selected
            return (
              <li key={member.id}>
                <button
                  type="button"
                  aria-pressed={selectedRow}
                  className="group-row-hit w-full text-left"
                  onClick={() => setSelectedId(member.id)}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">
                      {member.name}
                    </span>
                    {left ? (
                      <span className="mt-0.5 block text-[13px] text-muted-foreground">
                        {left}
                      </span>
                    ) : null}
                  </span>
                  <span
                    className={cn(
                      "max-w-[9.75rem] shrink-0 text-right text-[13px] leading-snug tabular-nums",
                      net === 0
                        ? "text-muted-foreground"
                        : "font-medium text-foreground"
                    )}
                  >
                    {houseBalanceCopy(member.name, net, room.currency)}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      </section>

      {breakdown.length > 0 ? (
        <section className="mt-8">
          <h2 className="group-label">By month</h2>
          <ul className="group-list mt-1">
            {breakdown.map((row) => {
              const expanded =
                (openMonth ?? breakdown[0]?.periodMonth) === row.periodMonth
              return (
                <li key={row.periodMonth}>
                  <button
                    type="button"
                    className="group-row-hit w-full text-left"
                    aria-expanded={expanded}
                    onClick={() =>
                      setOpenMonth(expanded ? "" : row.periodMonth)
                    }
                  >
                    <span className="flex-1 font-medium">
                      {formatMonth(row.periodMonth)}
                    </span>
                    <span className="text-[13px] text-muted-foreground tabular-nums">
                      {formatMoney(row.runningCents, room.currency)}
                    </span>
                  </button>
                  {expanded ? (
                    <dl className="grid grid-cols-2 gap-x-3 gap-y-1 px-3 pb-3 text-[13px] text-muted-foreground">
                      <dt>Your share</dt>
                      <dd className="text-right tabular-nums">
                        {formatMoney(row.yourShareCents, room.currency)}
                      </dd>
                      <dt>You paid</dt>
                      <dd className="text-right tabular-nums">
                        {formatMoney(row.youPaidCents, room.currency)}
                      </dd>
                      <dt>Payments</dt>
                      <dd className="text-right tabular-nums">
                        {formatMoney(row.paymentsCents, room.currency)}
                      </dd>
                    </dl>
                  ) : null}
                </li>
              )
            })}
          </ul>
        </section>
      ) : null}

      {room.settlements.length > 0 ? (
        <section className="mt-8">
          <h2 className="group-label">Payments</h2>
          <ul className="group-list mt-1">
            {room.settlements.map((settlement) => {
              const canUndo = canDeletePayment(
                role,
                actorId,
                settlement.createdByMemberId,
                settlement.toMemberId
              )
              return (
                <li key={settlement.id} className="group-row">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted">
                    <HugeiconsIcon
                      icon={Tick02Icon}
                      size={14}
                      strokeWidth={2.2}
                    />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px]">
                      {settlement.fromMemberName} paid {settlement.toMemberName}
                    </span>
                    <span className="block text-[13px] text-muted-foreground">
                      {formatMoney(settlement.amountCents, settlement.currency)}{" "}
                      · {formatRelativeTime(settlement.createdAt)}
                    </span>
                  </span>
                  {settlement.hasProof ? (
                    <PaymentProofButton
                      fromName={settlement.fromMemberName}
                      onClick={() => setViewing(settlement)}
                    />
                  ) : null}
                  {canUndo ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="shrink-0 text-primary"
                      disabled={deleteMutation.isPending}
                      onClick={() => deleteMutation.mutate(settlement.id)}
                      aria-label={`Undo payment from ${settlement.fromMemberName} to ${settlement.toMemberName}`}
                    >
                      <HugeiconsIcon
                        icon={UndoIcon}
                        size={14}
                        strokeWidth={2}
                      />
                      Undo
                    </Button>
                  ) : null}
                </li>
              )
            })}
          </ul>
        </section>
      ) : null}

      {canRecordCustom ? (
        <button
          type="button"
          className="text-action mt-6 text-[15px]"
          onClick={openCustom}
        >
          Record a payment
        </button>
      ) : null}

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
    </main>
  )
}
