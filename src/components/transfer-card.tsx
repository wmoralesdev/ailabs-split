import { HugeiconsIcon } from "@hugeicons/react"
import { CheckmarkCircle02Icon, Share01Icon } from "@hugeicons/core-free-icons"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { formatMoney } from "@/lib/settle"
import type { Transfer } from "@/lib/settle"
import { cn } from "@/lib/utils"

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("")
}

export function transferKey(transfer: Transfer): string {
  return `${transfer.fromId}-${transfer.toId}`
}

export function TransferCard({
  transfer,
  currency,
  memberId,
  emphasis = false,
  pending,
  disabled,
  canMark = true,
  onMarkPaid,
  onRemind,
}: {
  transfer: Transfer
  currency: string
  memberId: string
  emphasis?: boolean
  pending: boolean
  disabled: boolean
  /** False hides the mark-paid control for viewers who can't record it. */
  canMark?: boolean
  onMarkPaid: () => void
  onRemind: () => void
}) {
  const iPay = transfer.fromId === memberId
  const iGet = transfer.toId === memberId
  const sentence = iPay
    ? `You pay ${transfer.toName}`
    : iGet
      ? `${transfer.fromName} pays you`
      : `${transfer.fromName} pays ${transfer.toName}`
  const markLabel = iPay
    ? `I paid ${transfer.toName}`
    : iGet
      ? `${transfer.fromName} paid me`
      : "Mark paid"

  if (!emphasis) {
    return (
      <li className="group-row min-h-14">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px]">{sentence}</p>
          <p className="text-[15px] font-semibold tabular-nums">
            {formatMoney(transfer.amountCents, currency)}
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="text-muted-foreground"
          onClick={onRemind}
          aria-label={`Remind ${transfer.fromName}`}
        >
          <HugeiconsIcon icon={Share01Icon} size={16} strokeWidth={2} />
        </Button>
        {canMark ? (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="bg-muted font-semibold text-primary"
            onClick={onMarkPaid}
            disabled={disabled}
          >
            {pending ? "Saving…" : markLabel}
          </Button>
        ) : null}
      </li>
    )
  }

  return (
    <li className="surface p-4">
      <div className="flex items-center gap-2.5">
        <div className="flex -space-x-1.5">
          <Avatar className="size-7 ring-2 ring-card">
            <AvatarFallback className="bg-muted text-[11px] font-semibold text-foreground">
              {initials(transfer.fromName)}
            </AvatarFallback>
          </Avatar>
          <Avatar className="size-7 ring-2 ring-card">
            <AvatarFallback className="bg-accent text-[11px] font-semibold text-accent-foreground">
              {initials(transfer.toName)}
            </AvatarFallback>
          </Avatar>
        </div>
        <p className="min-w-0 truncate text-[15px] font-medium">{sentence}</p>
      </div>
      <p className="mt-2 font-display text-[26px] leading-none font-bold tracking-tight tabular-nums">
        {formatMoney(transfer.amountCents, currency)}
      </p>
      <div className="mt-4 flex gap-2">
        {canMark ? (
          <Button
            type="button"
            className="flex-1 font-semibold"
            onClick={onMarkPaid}
            disabled={disabled}
          >
            <HugeiconsIcon
              icon={CheckmarkCircle02Icon}
              size={18}
              strokeWidth={2}
            />
            {pending ? "Saving…" : markLabel}
          </Button>
        ) : null}
        <Button
          type="button"
          variant="secondary"
          size="icon-lg"
          className={cn("bg-muted text-primary", !canMark && "ml-auto")}
          onClick={onRemind}
          aria-label={
            iPay
              ? `Share payment to ${transfer.toName}`
              : `Remind ${transfer.fromName}`
          }
        >
          <HugeiconsIcon icon={Share01Icon} size={18} strokeWidth={2} />
        </Button>
      </div>
    </li>
  )
}

export function SettleEmptyState({
  title,
  hint,
}: {
  title: string
  hint: string
}) {
  return (
    <div className="surface mt-5 flex flex-col items-center gap-3 px-4 py-8 text-center">
      <span className="flex size-11 items-center justify-center rounded-full bg-foreground text-background">
        <HugeiconsIcon icon={CheckmarkCircle02Icon} size={22} strokeWidth={2} />
      </span>
      <div>
        <p className="font-display text-lg font-semibold">{title}</p>
        <p className="mt-0.5 text-[15px] text-muted-foreground">{hint}</p>
      </div>
    </div>
  )
}
