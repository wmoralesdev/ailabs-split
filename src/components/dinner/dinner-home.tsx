import { useMemo, useState } from "react"
import { Link, useNavigate } from "@tanstack/react-router"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  ArrowRight01Icon,
  Copy01Icon,
  Edit02Icon,
  Link01Icon,
} from "@hugeicons/core-free-icons"
import { toast } from "sonner"

import { RenameDinnerSheet } from "@/components/dinner/dinner-name"
import { OwingAmount } from "@/components/dinner/owing-amount"
import { PullToRefresh } from "@/components/pull-to-refresh"
import { PayAccountButton } from "@/components/pay-account-button"
import { MyPayLine, PayProfileSheet } from "@/components/pay-profile-sheet"
import { RoomExitControl } from "@/components/room-exit-control"
import { TicketPhotoPicker } from "@/components/ticket-photo-picker"
import { Button } from "@/components/ui/button"
import { copyText } from "@/lib/invite-link"
import { dinnerBill, dinnerCanEdit } from "@/lib/dinner-bill"
import { computeDinnerSplit } from "@/lib/dinner-split"
import { formatRelativeTime } from "@/lib/format-relative-time"
import { memberLink } from "@/lib/member-storage"
import { compressTicketNow, startPendingDinnerScan } from "@/lib/ticket-scan"
import { useRequireSignIn } from "@/lib/use-auth-user"
import { useOnlineStatus } from "@/lib/online-status"
import {
  computeNetsWithSettlements,
  formatMoney,
  simplifyTransfers,
} from "@/lib/settle"
import type { CheckDto, RoomDto } from "@/server/rooms"

export function DinnerHome({
  room,
  memberId,
  switchIdentity,
  refetch,
}: {
  room: RoomDto
  memberId: string
  switchIdentity: () => void
  refetch: () => Promise<unknown>
}) {
  const online = useOnlineStatus()
  const me = room.members.find((member) => member.id === memberId)
  const bill = dinnerBill(room.checks)
  const canEdit = dinnerCanEdit(room)
  const [copied, setCopied] = useState<"code" | "link" | null>(null)
  const [renameOpen, setRenameOpen] = useState(false)
  const [payOpen, setPayOpen] = useState(false)

  const nets = useMemo(() => {
    return computeNetsWithSettlements(
      room.members,
      room.expenses
        .filter((expense) => !expense.isPersonal)
        .map((expense) => ({
          paidById: expense.paidById,
          shares: expense.shares.map((share) => ({
            memberId: share.memberId,
            amountCents: share.amountCents,
          })),
        })),
      room.settlements.map((settlement) => ({
        fromMemberId: settlement.fromMemberId,
        toMemberId: settlement.toMemberId,
        amountCents: settlement.amountCents,
      }))
    )
  }, [room])

  const transfers = useMemo(() => simplifyTransfers(nets), [nets])

  async function copyCode() {
    await copyText(room.code)
    setCopied("code")
    window.setTimeout(() => setCopied(null), 1500)
  }

  async function copyMyLink() {
    if (!me) return
    await copyText(memberLink(room.code, me.name))
    setCopied("link")
    toast.success("Your personal link is copied")
    window.setTimeout(() => setCopied(null), 1500)
  }

  return (
    <PullToRefresh disabled={!online} onRefresh={() => refetch()}>
      <main className="page-gutter mx-auto max-w-content pt-2">
        <header>
          <div className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
            <span className="font-medium text-foreground">Bill</span>
            <span aria-hidden>·</span>
            <span>{room.currency}</span>
          </div>
          <h1 className="mt-0.5">
            {canEdit ? (
              <button
                type="button"
                onClick={() => setRenameOpen(true)}
                aria-haspopup="dialog"
                aria-label={`Rename ${room.name}`}
                className="flex min-h-11 w-full items-center gap-2 rounded-xl text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="min-w-0 flex-1 font-display text-[28px] leading-tight font-bold tracking-tight">
                  {room.name}
                </span>
                <HugeiconsIcon
                  icon={Edit02Icon}
                  size={18}
                  strokeWidth={2}
                  className="shrink-0 text-muted-foreground"
                />
              </button>
            ) : (
              <span className="block font-display text-[28px] leading-tight font-bold tracking-tight">
                {room.name}
              </span>
            )}
          </h1>
        </header>
        {canEdit ? (
          <RenameDinnerSheet
            open={renameOpen}
            onOpenChange={setRenameOpen}
            code={room.code}
            name={room.name}
          />
        ) : null}
        <PayProfileSheet
          room={room}
          member={payOpen ? (me ?? null) : null}
          viewerMemberId={memberId}
          open={payOpen && me != null}
          onOpenChange={setPayOpen}
        />

        {bill ? (
          <BillCard
            room={room}
            bill={bill}
            memberId={memberId}
            transfers={transfers}
            canEdit={canEdit}
          />
        ) : canEdit ? (
          <StartBillCard code={room.code} />
        ) : (
          <WaitingOnBill />
        )}

        <section className="mt-6" aria-labelledby="people-heading">
          <div className="flex items-baseline justify-between gap-3">
            <h2
              id="people-heading"
              className="font-display text-lg font-semibold"
            >
              People
            </h2>
            <button
              type="button"
              onClick={() => void copyCode()}
              className="icon-hit min-h-11 gap-1.5 rounded-full px-2 text-[13px] font-medium"
              aria-label={`Copy bill code ${room.code}`}
            >
              <span className="font-display tracking-widest text-foreground">
                {room.code}
              </span>
              <HugeiconsIcon icon={Copy01Icon} size={13} strokeWidth={2} />
              {copied === "code" ? "Copied" : "Copy"}
            </button>
          </div>
          {bill ? (
            <PeopleShares room={room} bill={bill} memberId={memberId} />
          ) : (
            <ul className="flex flex-wrap gap-1.5" aria-label="At the table">
              {room.members.map((member) => (
                <li key={member.id} className="person-chip">
                  {member.name}
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-[13px] leading-snug text-muted-foreground">
            {room.members.length}{" "}
            {room.members.length === 1 ? "person" : "people"} · the table joins
            with the code
            {canEdit ? ", or add them on the bill." : "."}
          </p>
          <div className="mt-3 flex min-h-13 items-center gap-1 rounded-xl bg-card pr-1.5 pl-3.5">
            <button
              type="button"
              className="min-w-0 flex-1 rounded-sm py-1.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
              disabled={!me}
              onClick={() => setPayOpen(true)}
            >
              <span className="block truncate text-[15px]">
                You · {me?.name ?? "Unknown"}
              </span>
              <MyPayLine pay={me?.pay ?? null} />
            </button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => void copyMyLink()}
              aria-label={
                copied === "link"
                  ? "Personal link copied"
                  : "Copy my device link"
              }
            >
              <HugeiconsIcon icon={Link01Icon} size={16} strokeWidth={2} />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-primary"
              onClick={switchIdentity}
            >
              Not you?
            </Button>
          </div>
        </section>

        <div className="mt-8 mb-4">
          <RoomExitControl
            code={room.code}
            name={room.name}
            kind={room.kind}
            owned={room.owned}
            placement="page"
          />
        </div>
      </main>
    </PullToRefresh>
  )
}

function WaitingOnBill() {
  return (
    <section className="surface mt-4 p-4" aria-labelledby="ticket-heading">
      <h2 id="ticket-heading" className="font-display text-lg font-semibold">
        Waiting on the bill
      </h2>
      <p className="mt-0.5 text-[15px] text-muted-foreground">
        The host will scan the ticket or add the items.
      </p>
    </section>
  )
}

function PeopleShares({
  room,
  bill,
  memberId,
}: {
  room: RoomDto
  bill: CheckDto
  memberId: string
}) {
  const split = computeDinnerSplit({
    items: bill.payload.items,
    adjustments: bill.payload.adjustments,
    tip: bill.payload.tip,
    notedTotalCents: bill.payload.notedTotalCents,
  })
  const centsById = new Map(
    split.shares.map((share) => [share.memberId, share.totalCents])
  )
  return (
    <ul className="group-list mt-2.5" aria-label="At the table">
      {room.members.map((member) => (
        <li key={member.id} className="group-row justify-between">
          <span className="min-w-0 truncate text-[15px]">
            {member.name}
            {member.id === memberId ? (
              <span className="text-muted-foreground"> (you)</span>
            ) : null}
          </span>
          <OwingAmount
            cents={centsById.get(member.id) ?? 0}
            currency={room.currency}
          />
        </li>
      ))}
    </ul>
  )
}

function StartBillCard({ code }: { code: string }) {
  const navigate = useNavigate()
  const [pending, setPending] = useState(false)
  const requireSignIn = useRequireSignIn()
  return (
    <section className="surface mt-4 p-4" aria-labelledby="ticket-heading">
      <h2 id="ticket-heading" className="font-display text-lg font-semibold">
        Split the ticket
      </h2>
      <p className="mt-0.5 text-[15px] text-muted-foreground">
        Items and the printed total fill in from the photo.
      </p>
      <TicketPhotoPicker
        pending={pending}
        pendingLabel="Reading ticket…"
        beforePick={requireSignIn}
        onFile={(file) => {
          if (!file) return
          setPending(true)
          startPendingDinnerScan({
            code,
            image: compressTicketNow(file),
            nameFromTicket: false,
          })
          void navigate({ to: "/r/$code/check", params: { code } })
        }}
        className="mt-3.5"
      />
      <Link
        to="/r/$code/check"
        params={{ code }}
        className="text-action mt-1 w-full justify-center text-[15px]"
      >
        Enter items by hand
      </Link>
    </section>
  )
}

function BillCard({
  room,
  bill,
  memberId,
  transfers,
  canEdit,
}: {
  room: RoomDto
  bill: CheckDto
  memberId: string
  transfers: ReturnType<typeof simplifyTransfers>
  canEdit: boolean
}) {
  const split = computeDinnerSplit({
    items: bill.payload.items,
    adjustments: bill.payload.adjustments,
    tip: bill.payload.tip,
    notedTotalCents: bill.payload.notedTotalCents,
  })
  const confirmed = bill.status === "CONFIRMED"
  const iOwe = transfers.filter((transfer) => transfer.fromId === memberId)
  const owedToMe = transfers.filter((transfer) => transfer.toId === memberId)
  const oweCents = iOwe.reduce((sum, t) => sum + t.amountCents, 0)
  const owedCents = owedToMe.reduce((sum, t) => sum + t.amountCents, 0)
  const payeePay =
    iOwe.length === 1
      ? (room.members.find((member) => member.id === iOwe[0].toId)?.pay ?? null)
      : null

  let headline: string
  let detail: string
  const moneyHeadline = oweCents > 0 || owedCents > 0
  if (!confirmed) {
    headline = "Draft in progress"
    detail = canEdit
      ? "Assign every item, then confirm to see who owes what."
      : "The host is still assigning items."
  } else if (oweCents > 0) {
    headline = `You owe ${formatMoney(oweCents, room.currency)}`
    detail =
      iOwe.length === 1
        ? `Pay ${iOwe[0].toName}`
        : `To ${iOwe.map((t) => t.toName).join(" and ")}`
  } else if (owedCents > 0) {
    headline = `You get back ${formatMoney(owedCents, room.currency)}`
    detail =
      owedToMe.length === 1
        ? `From ${owedToMe[0].fromName}`
        : `From ${owedToMe.length} people`
  } else if (transfers.length > 0) {
    headline = "You owe nothing"
    detail = `${transfers.length} ${transfers.length === 1 ? "payment" : "payments"} left between others`
  } else {
    headline = "You owe nothing"
    detail = "Nothing to pay."
  }

  const status = confirmed
    ? "Confirmed"
    : bill.isPrecuenta
      ? "Precuenta · draft"
      : "Draft"

  return (
    <section className="mt-4" aria-labelledby="bill-heading">
      <div className="surface p-4">
        <p className="eyebrow">
          <span id="bill-heading">The bill</span> ·{" "}
          {formatMoney(split.totalCents, bill.currency)} · {status}
        </p>
        <p
          className={
            moneyHeadline
              ? "mt-1 font-display text-[22px] leading-tight font-bold tracking-tight tabular-nums"
              : "mt-1 font-display text-[22px] leading-tight font-bold tracking-tight text-muted-foreground"
          }
        >
          {headline}
        </p>
        <p className="mt-0.5 text-[15px] text-muted-foreground">{detail}</p>
        {confirmed && iOwe.length === 1 && payeePay ? (
          <PayAccountButton
            pay={payeePay}
            ownerLabel={`${iOwe[0].toName}'s`}
            className="mt-3"
          />
        ) : null}
        {!confirmed ? (
          <Link
            to="/r/$code/check/$checkId"
            params={{ code: room.code, checkId: bill.id }}
            className="split-cta mt-3.5 w-full"
          >
            {canEdit ? "Assign the items" : "See the items"}
            <HugeiconsIcon icon={ArrowRight01Icon} size={18} strokeWidth={2} />
          </Link>
        ) : transfers.length > 0 ? (
          <Link
            to="/r/$code/settle"
            params={{ code: room.code }}
            className="split-cta mt-3.5 w-full"
          >
            {oweCents > 0 ? "Pay and mark it done" : "See who owes what"}
            <HugeiconsIcon icon={ArrowRight01Icon} size={18} strokeWidth={2} />
          </Link>
        ) : null}
      </div>
      <Link
        to="/r/$code/check/$checkId"
        params={{ code: room.code, checkId: bill.id }}
        className="group-list group-row-hit mt-2.5 w-full text-left"
      >
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold">
            {bill.paidByName} paid
          </p>
          <p className="truncate text-[13px] text-muted-foreground">
            {bill.payload.items.length}{" "}
            {bill.payload.items.length === 1 ? "line" : "lines"} ·{" "}
            {formatRelativeTime(bill.createdAt)}
          </p>
        </div>
        <span className="shrink-0 text-[15px] font-semibold tabular-nums">
          {formatMoney(split.totalCents, bill.currency)}
        </span>
        <HugeiconsIcon
          icon={ArrowRight01Icon}
          size={16}
          strokeWidth={2}
          className="shrink-0 text-muted-foreground"
        />
      </Link>
    </section>
  )
}
