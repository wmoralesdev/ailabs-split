import { useMemo, useRef, useState } from "react"
import { Link } from "@tanstack/react-router"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Add01Icon,
  ArrowRight01Icon,
  Camera01Icon,
  Copy01Icon,
  Link01Icon,
  PencilEdit02Icon,
} from "@hugeicons/core-free-icons"
import { toast } from "sonner"

import { PullToRefresh } from "@/components/pull-to-refresh"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { copyText } from "@/lib/invite-link"
import { initials } from "@/lib/dinner-labels"
import { computeDinnerSplit } from "@/lib/dinner-split"
import { formatRelativeTime } from "@/lib/format-relative-time"
import { mergeNames } from "@/lib/landing-prefs"
import { memberLink } from "@/lib/member-storage"
import { useOnlineStatus } from "@/lib/online-status"
import { roomKeys } from "@/lib/room-query"
import {
  computeNetsWithSettlements,
  formatMoney,
  simplifyTransfers,
} from "@/lib/settle"
import { cn } from "@/lib/utils"
import { addRoomMembers } from "@/server/rooms"
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
  const [copied, setCopied] = useState<"code" | "link" | null>(null)

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
  const confirmedTotalCents = room.expenses.reduce(
    (sum, expense) => sum + expense.amountCents,
    0
  )

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
            <span className="font-medium text-foreground">Dinner</span>
            <span aria-hidden>·</span>
            <span>{room.currency}</span>
          </div>
          <h1 className="mt-0.5 font-display text-[28px] leading-tight font-bold tracking-tight">
            {room.name}
          </h1>
        </header>

        <PositionCard
          room={room}
          memberId={memberId}
          transfers={transfers}
          confirmedTotalCents={confirmedTotalCents}
        />

        <section className="mt-6" aria-labelledby="people-heading">
          <div className="flex items-baseline justify-between gap-3">
            <h2
              id="people-heading"
              className="font-display text-lg font-semibold"
            >
              People
            </h2>
            <p className="text-[13px] text-muted-foreground">
              {room.members.length}{" "}
              {room.members.length === 1 ? "person" : "people"}
            </p>
          </div>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {room.members.map((member) => (
              <li key={member.id} className="person-chip">
                {member.name}
              </li>
            ))}
          </ul>
          <InlineAddPeople
            code={room.code}
            existing={room.members.map((member) => member.name)}
          />
          <div className="mt-3 flex h-11 items-center gap-1 rounded-xl bg-card pr-1.5 pl-3.5">
            <p className="min-w-0 flex-1 truncate text-[15px]">
              You · {me?.name ?? "Unknown"}
            </p>
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

        <section className="mt-6" aria-labelledby="checks-heading">
          <div className="flex items-baseline justify-between gap-3">
            <h2
              id="checks-heading"
              className="font-display text-lg font-semibold"
            >
              Checks
            </h2>
            <button
              type="button"
              onClick={() => void copyCode()}
              className="inline-flex min-h-11 items-center gap-1.5 text-[13px] font-medium text-muted-foreground hover:text-foreground"
              aria-label={`Copy dinner code ${room.code}`}
            >
              <span className="font-display tracking-widest text-foreground">
                {room.code}
              </span>
              <HugeiconsIcon icon={Copy01Icon} size={13} strokeWidth={2} />
              {copied === "code" ? "Copied" : "Copy"}
            </button>
          </div>
          {room.checks.length === 0 ? (
            <p className="mt-1 text-[15px] text-muted-foreground">
              Nothing yet. Scan the ticket or type the items in.
            </p>
          ) : (
            <ul className="group-list mt-1">
              {room.checks.map((check) => (
                <CheckRow key={check.id} check={check} room={room} />
              ))}
            </ul>
          )}
          {room.checks.length > 0 ? (
            <Link
              to="/r/$code/check"
              params={{ code: room.code }}
              className="split-cta-tinted mt-3 w-full"
            >
              <HugeiconsIcon icon={Add01Icon} size={16} strokeWidth={2} />
              New check
            </Link>
          ) : null}
        </section>
      </main>
    </PullToRefresh>
  )
}

function PositionCard({
  room,
  memberId,
  transfers,
  confirmedTotalCents,
}: {
  room: RoomDto
  memberId: string
  transfers: ReturnType<typeof simplifyTransfers>
  confirmedTotalCents: number
}) {
  if (room.checks.length === 0) {
    return (
      <section className="surface mt-4 p-4">
        <p className="font-display text-lg font-semibold">Add the bill</p>
        <p className="mt-0.5 text-[15px] text-muted-foreground">
          Take a photo or pick one from your gallery.
        </p>
        <div className="mt-3.5 flex flex-col gap-2">
          <Link
            to="/r/$code/check"
            params={{ code: room.code }}
            search={{ scan: true }}
            className="split-cta"
          >
            <HugeiconsIcon icon={Camera01Icon} size={18} strokeWidth={2} />
            Scan ticket
          </Link>
          <Link
            to="/r/$code/check"
            params={{ code: room.code }}
            className="split-cta-tinted"
          >
            <HugeiconsIcon icon={PencilEdit02Icon} size={18} strokeWidth={2} />
            Enter bill manually
          </Link>
        </div>
      </section>
    )
  }

  const iOwe = transfers.filter((transfer) => transfer.fromId === memberId)
  const owedToMe = transfers.filter((transfer) => transfer.toId === memberId)
  const oweCents = iOwe.reduce((sum, t) => sum + t.amountCents, 0)
  const owedCents = owedToMe.reduce((sum, t) => sum + t.amountCents, 0)
  const confirmedCount = room.checks.filter(
    (check) => check.status === "CONFIRMED"
  ).length

  let headline: string
  let detail: string
  if (oweCents > 0) {
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
    headline = "You're square"
    detail = `${transfers.length} ${transfers.length === 1 ? "payment" : "payments"} left between others`
  } else {
    headline = confirmedCount > 0 ? "Everyone is square" : "Draft in progress"
    detail =
      confirmedCount > 0
        ? "Nothing left to pay."
        : "Confirm the check to see who owes what."
  }

  return (
    <section className="surface mt-4 p-4" aria-label="Your balance">
      <p className="eyebrow">
        {formatMoney(confirmedTotalCents, room.currency)} confirmed ·{" "}
        {confirmedCount} {confirmedCount === 1 ? "check" : "checks"}
      </p>
      <p className="mt-1 font-display text-[22px] leading-tight font-bold tracking-tight tabular-nums">
        {headline}
      </p>
      <p className="mt-0.5 text-[15px] text-muted-foreground">{detail}</p>
      {transfers.length > 0 ? (
        <Link
          to="/r/$code/settle"
          params={{ code: room.code }}
          className="split-cta mt-3.5 w-full"
        >
          {oweCents > 0 ? "Pay and mark it done" : "See who owes what"}
          <HugeiconsIcon icon={ArrowRight01Icon} size={18} strokeWidth={2} />
        </Link>
      ) : null}
    </section>
  )
}

function InlineAddPeople({
  code,
  existing,
}: {
  code: string
  existing: string[]
}) {
  const queryClient = useQueryClient()
  const inputRef = useRef<HTMLInputElement>(null)
  const [draft, setDraft] = useState("")

  const mutation = useMutation({
    mutationFn: (names: string[]) => addRoomMembers({ data: { code, names } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: roomKeys.room(code) })
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Could not add people"
      )
    },
  })

  function submit() {
    const taken = new Set(existing.map((name) => name.toLowerCase()))
    const names = mergeNames([], draft).filter(
      (name) => !taken.has(name.toLowerCase())
    )
    setDraft("")
    inputRef.current?.focus()
    if (names.length === 0) return
    mutation.mutate(names)
  }

  return (
    <form
      className="mt-2.5 flex flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault()
        submit()
      }}
    >
      <Label htmlFor="dinner-add-person" className="sr-only">
        Add people
      </Label>
      <div className="flex gap-2">
        <Input
          ref={inputRef}
          id="dinner-add-person"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Add a name, then Enter"
          autoComplete="off"
          enterKeyHint="done"
          className="flex-1"
        />
        <Button
          type="submit"
          variant="outline"
          className="shrink-0 border-transparent bg-card px-4 text-primary disabled:text-muted-foreground"
          disabled={!draft.trim() || mutation.isPending}
        >
          Add
        </Button>
      </div>
    </form>
  )
}

function CheckRow({ check, room }: { check: CheckDto; room: RoomDto }) {
  const split = computeDinnerSplit({
    items: check.payload.items,
    adjustments: check.payload.adjustments,
    tip: check.payload.tip,
    notedTotalCents: check.payload.notedTotalCents,
  })
  const confirmed = check.status === "CONFIRMED"

  return (
    <li>
      <Link
        to="/r/$code/check/$checkId"
        params={{ code: room.code, checkId: check.id }}
        className="group-row-hit w-full text-left"
      >
        <Avatar className="size-8 shrink-0">
          <AvatarFallback className="bg-accent text-xs font-semibold text-accent-foreground">
            {initials(check.paidByName)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold">{check.merchant}</p>
          <p className="truncate text-[13px] text-muted-foreground">
            {check.paidByName} paid · {formatRelativeTime(check.createdAt)}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[15px] font-semibold tabular-nums">
            {formatMoney(split.totalCents, check.currency)}
          </p>
          <p
            className={cn(
              "text-[13px] font-medium",
              confirmed ? "text-muted-foreground" : "text-primary"
            )}
          >
            {confirmed
              ? "Confirmed"
              : check.isPrecuenta
                ? "Precuenta · draft"
                : "Draft"}
          </p>
        </div>
      </Link>
    </li>
  )
}
