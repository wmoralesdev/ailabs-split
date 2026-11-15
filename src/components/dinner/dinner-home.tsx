import { useState } from "react"
import { Link, useNavigate } from "@tanstack/react-router"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  ArrowRight01Icon,
  Edit02Icon,
  Invoice03Icon,
} from "@hugeicons/core-free-icons"

import { RoomBalanceHero } from "@/components/balance-hero"
import { RenameDinnerSheet } from "@/components/dinner/dinner-name"
import { PullToRefresh } from "@/components/pull-to-refresh"
import { MyPayLine, PayProfileSheet } from "@/components/pay-profile-sheet"
import { RoomExitControl } from "@/components/room-exit-control"
import { TicketPhotoPicker } from "@/components/ticket-photo-picker"
import { Button } from "@/components/ui/button"
import { dinnerBill, dinnerCanEdit } from "@/lib/dinner-bill"
import { computeDinnerSplit } from "@/lib/dinner-split"
import { formatRelativeTime } from "@/lib/format-relative-time"
import { compressTicketNow, startPendingDinnerScan } from "@/lib/ticket-scan"
import { useRequireSignIn } from "@/lib/use-auth-user"
import { useOnlineStatus } from "@/lib/online-status"
import { formatMoney } from "@/lib/settle"
import { shareRoomSummary } from "@/lib/use-room-settle"
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
  const [renameOpen, setRenameOpen] = useState(false)
  const [payOpen, setPayOpen] = useState(false)
  const confirmed = bill?.status === "CONFIRMED"
  const split = bill
    ? computeDinnerSplit({
        items: bill.payload.items,
        adjustments: bill.payload.adjustments,
        tip: bill.payload.tip,
        notedTotalCents: bill.payload.notedTotalCents,
      })
    : null
  const partById = new Map<string, number>(
    (split?.shares ?? [])
      .filter((share) => share.totalCents > 0)
      .map((share) => [share.memberId, share.totalCents])
  )

  return (
    <PullToRefresh disabled={!online} onRefresh={() => refetch()}>
      <main className="page-gutter mx-auto max-w-content pt-2">
        <header>
          <h1 className="flex min-w-0 items-center gap-1.5">
            <span className="min-w-0 truncate font-display text-[34px] leading-tight font-bold tracking-tight">
              {room.name}
            </span>
            {canEdit ? (
              <button
                type="button"
                onClick={() => setRenameOpen(true)}
                aria-haspopup="dialog"
                aria-label={`Rename ${room.name}`}
                className="icon-hit size-10 shrink-0"
              >
                <HugeiconsIcon icon={Edit02Icon} size={18} strokeWidth={2} />
              </button>
            ) : null}
          </h1>
          <p className="mt-0.5 text-[15px] text-muted-foreground tabular-nums">
            Bill · {room.currency}
            {split ? ` · ${formatMoney(split.totalCents, room.currency)}` : ""}
            {bill && split && billStatus(bill, split.unassignedItemIds.length)
              ? ` · ${billStatus(bill, split.unassignedItemIds.length)}`
              : ""}
          </p>
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
            canEdit={canEdit}
          />
        ) : canEdit ? (
          <StartBillCard code={room.code} />
        ) : (
          <WaitingOnBill />
        )}

        <section className="mt-8" aria-labelledby="people-heading">
          <div className="flex items-baseline justify-between gap-3 px-1">
            <h2
              id="people-heading"
              className="text-[13px] font-medium text-muted-foreground"
            >
              People
            </h2>
            <p className="text-[13px] text-muted-foreground tabular-nums">
              {room.members.length} at the table
            </p>
          </div>
          <ul className="group-list group-list-inset mt-1">
            {room.members.map((member) => {
              const part = partById.get(member.id)
              if (member.id === memberId) {
                return (
                  <li key={member.id} className="flex items-stretch">
                    <button
                      type="button"
                      className="group-row-hit min-w-0 flex-1 text-left"
                      onClick={() => setPayOpen(true)}
                    >
                      <PersonAvatar name={member.name} self />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">
                          <span className="font-medium">{member.name}</span>
                          <span className="text-muted-foreground"> · you</span>
                        </span>
                        {member.pay || part == null ? (
                          <MyPayLine pay={member.pay ?? null} />
                        ) : (
                          <span className="block text-[13px] text-muted-foreground tabular-nums">
                            Your part {formatMoney(part, room.currency)}
                          </span>
                        )}
                      </span>
                    </button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="mr-2 self-center text-primary"
                      onClick={switchIdentity}
                    >
                      Not you?
                    </Button>
                  </li>
                )
              }
              return (
                <li key={member.id} className="group-row min-h-14">
                  <PersonAvatar name={member.name} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">
                      {member.name}
                    </span>
                    {part != null ? (
                      <span className="block text-[13px] text-muted-foreground tabular-nums">
                        Their part {formatMoney(part, room.currency)}
                      </span>
                    ) : null}
                  </span>
                </li>
              )
            })}
          </ul>
          {room.members.length < 2 ? (
            <p className="mt-2 px-1 text-[13px] leading-snug text-muted-foreground">
              Tap Invite so the table joins
              {canEdit ? ", or add them on the bill." : "."}
            </p>
          ) : null}
        </section>

        <div className="mt-8 mb-4 flex flex-col">
          {confirmed ? (
            <button
              type="button"
              className="text-action w-full justify-center text-[15px]"
              onClick={() => void shareRoomSummary(room)}
            >
              Share summary
            </button>
          ) : null}
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
    <section
      className="mt-5 rounded-3xl bg-card px-4 pt-5 pb-4"
      aria-labelledby="ticket-heading"
    >
      <h2
        id="ticket-heading"
        className="font-display text-[28px] leading-tight font-bold tracking-tight"
      >
        Waiting on the bill
      </h2>
      <p className="mt-0.5 text-[15px] text-muted-foreground">
        The host will scan the ticket or add the items.
      </p>
    </section>
  )
}

function StartBillCard({ code }: { code: string }) {
  const navigate = useNavigate()
  const [pending, setPending] = useState(false)
  const requireSignIn = useRequireSignIn()
  return (
    <section
      className="mt-5 rounded-3xl bg-card px-4 pt-5 pb-4"
      aria-labelledby="ticket-heading"
    >
      <h2
        id="ticket-heading"
        className="font-display text-[28px] leading-tight font-bold tracking-tight"
      >
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

/** Tickets are just tickets: say what is left, never "draft". */
function billStatus(bill: CheckDto, unassigned: number): string | null {
  if (bill.status === "CONFIRMED") return bill.isPrecuenta ? "Precuenta" : null
  if (unassigned > 0) {
    return `${unassigned} ${unassigned === 1 ? "item" : "items"} to assign`
  }
  return "Not saved yet"
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("")
}

function PersonAvatar({ name, self = false }: { name: string; self?: boolean }) {
  return (
    <span
      aria-hidden
      className={
        self
          ? "flex size-10 shrink-0 items-center justify-center rounded-full bg-primary text-[13px] font-semibold text-primary-foreground"
          : "flex size-10 shrink-0 items-center justify-center rounded-full bg-muted text-[13px] font-semibold text-foreground"
      }
    >
      {initials(name)}
    </span>
  )
}

function BillCard({
  room,
  bill,
  memberId,
  canEdit,
}: {
  room: RoomDto
  bill: CheckDto
  memberId: string
  canEdit: boolean
}) {
  const split = computeDinnerSplit({
    items: bill.payload.items,
    adjustments: bill.payload.adjustments,
    tip: bill.payload.tip,
    notedTotalCents: bill.payload.notedTotalCents,
  })
  const confirmed = bill.status === "CONFIRMED"
  const lines = bill.payload.items.length

  return (
    <>
      {confirmed ? (
        <RoomBalanceHero room={room} memberId={memberId} />
      ) : (
        <section
          className="mt-5 rounded-3xl bg-card px-4 pt-5 pb-4"
          aria-labelledby="bill-heading"
        >
          <p className="text-[15px] font-medium text-muted-foreground">
            {billStatus(bill, split.unassignedItemIds.length) ?? "The ticket"}
          </p>
          <h2
            id="bill-heading"
            className="mt-1 font-display text-[28px] leading-tight font-bold tracking-tight"
          >
            {canEdit ? "Assign the items" : "The host is on it"}
          </h2>
          <p className="mt-1 text-[15px] text-muted-foreground">
            {canEdit
              ? "Tap who had what and save. Everyone sees what they owe."
              : "You'll see what you owe once every item has someone."}
          </p>
          <Link
            to="/r/$code/check/$checkId"
            params={{ code: room.code, checkId: bill.id }}
            className="split-cta mt-4 w-full"
          >
            {canEdit ? "Assign the items" : "See the items"}
            <HugeiconsIcon icon={ArrowRight01Icon} size={18} strokeWidth={2} />
          </Link>
        </section>
      )}
      <Link
        to="/r/$code/check/$checkId"
        params={{ code: room.code, checkId: bill.id }}
        className="group-row-hit mt-3 w-full overflow-hidden rounded-2xl bg-card text-left"
      >
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted text-foreground">
          <HugeiconsIcon icon={Invoice03Icon} size={18} strokeWidth={1.8} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">The ticket</span>
          <span className="block truncate text-[13px] text-muted-foreground">
            {bill.paidByName} paid · {lines} {lines === 1 ? "line" : "lines"} ·{" "}
            {formatRelativeTime(bill.createdAt)}
          </span>
        </span>
        <span className="shrink-0 font-semibold tabular-nums">
          {formatMoney(split.totalCents, bill.currency)}
        </span>
        <HugeiconsIcon
          icon={ArrowRight01Icon}
          size={16}
          strokeWidth={2}
          className="-ml-1 shrink-0 text-muted-foreground"
        />
      </Link>
    </>
  )
}
