import { HugeiconsIcon } from "@hugeicons/react"
import { Add01Icon, MinusSignIcon } from "@hugeicons/core-free-icons"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  atmDigitsFromInput,
  formatAtmAmount,
  formatAtmAmountInput,
} from "@/lib/atm-amount"
import type { SplitMode } from "@/lib/schemas"
import { formatMoney } from "@/lib/settle"

export type HouseSplitMember = {
  id: string
  name: string
  group: "main" | "others"
}

export function HouseSplitEditor({
  members,
  splitMode,
  onSplitModeChange,
  included,
  onToggle,
  onEveryone,
  weights,
  onWeight,
  amounts,
  onAmount,
  preview,
  fractionDigits,
  currency,
  amountCents,
  error,
}: {
  members: HouseSplitMember[]
  splitMode: SplitMode
  onSplitModeChange: (mode: SplitMode) => void
  included: Set<string>
  onToggle: (memberId: string) => void
  onEveryone: () => void
  weights: Record<string, number>
  onWeight: (memberId: string, weight: number) => void
  amounts: Record<string, string>
  onAmount: (memberId: string, digits: string) => void
  preview: Record<string, number>
  fractionDigits: number
  currency: string
  amountCents: number
  error: string | null
}) {
  const main = members.filter((member) => member.group === "main")
  const others = members.filter((member) => member.group === "others")
  const allMainOn =
    main.length > 0 && main.every((member) => included.has(member.id))
  const activeCount = members.filter((member) =>
    splitMode === "PARTS"
      ? (weights[member.id] ?? 0) > 0
      : included.has(member.id)
  ).length
  const assigned = Object.values(preview).reduce((sum, cents) => sum + cents, 0)
  const remaining = amountCents - assigned

  return (
    <div className="flex flex-col gap-2">
      <p className="text-[13px] font-medium text-muted-foreground">Split</p>
      <Tabs
        value={splitMode}
        onValueChange={(value) => onSplitModeChange(value as SplitMode)}
      >
        <TabsList className="segmented w-full grid-cols-3 group-data-horizontal/tabs:h-9">
          <TabsTrigger value="EQUAL" className="segmented-item">
            Equal
          </TabsTrigger>
          <TabsTrigger value="PARTS" className="segmented-item">
            Parts
          </TabsTrigger>
          <TabsTrigger value="AMOUNT" className="segmented-item">
            Amounts
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {splitMode === "EQUAL" ? (
        <div className="flex flex-col gap-2">
          <div
            className="flex gap-1.5 overflow-x-auto [mask-image:linear-gradient(to_right,black_85%,transparent)] pb-1"
            role="group"
            aria-label="Split"
          >
            <button
              type="button"
              aria-pressed={allMainOn}
              onClick={onEveryone}
              className="person-chip"
            >
              Everyone
            </button>
            {main.map((member) => (
              <button
                key={member.id}
                type="button"
                aria-pressed={included.has(member.id)}
                onClick={() => onToggle(member.id)}
                className="person-chip"
              >
                {member.name}
              </button>
            ))}
          </div>
          {others.length > 0 ? (
            <div>
              <p className="px-1 pb-1 text-[13px] text-muted-foreground">
                Others
              </p>
              <div className="flex gap-1.5 overflow-x-auto pb-1">
                {others.map((member) => (
                  <button
                    key={member.id}
                    type="button"
                    aria-pressed={included.has(member.id)}
                    onClick={() => onToggle(member.id)}
                    className="person-chip"
                  >
                    {member.name}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : (
        <ul className="group-list">
          {members.map((member) => {
            const isParts = splitMode === "PARTS"
            const weight = weights[member.id] ?? 0
            const active = isParts ? weight > 0 : included.has(member.id)
            const shareCents = preview[member.id] ?? 0
            return (
              <li key={member.id} className="group-row justify-between">
                <button
                  type="button"
                  onClick={() =>
                    isParts
                      ? onWeight(member.id, weight > 0 ? 0 : 1)
                      : onToggle(member.id)
                  }
                  className="row-hit flex min-h-10 min-w-0 flex-1 items-center text-left text-[15px]"
                >
                  <span
                    className={
                      active
                        ? "truncate font-medium"
                        : "truncate text-muted-foreground"
                    }
                  >
                    {member.name}
                    {member.group === "others" ? (
                      <span className="font-normal text-muted-foreground">
                        {" "}
                        · Others
                      </span>
                    ) : null}
                  </span>
                </button>
                {isParts ? (
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="size-8 rounded-full"
                      onClick={() => onWeight(member.id, weight - 1)}
                      disabled={weight <= 0}
                      aria-label={`Fewer parts for ${member.name}`}
                    >
                      <HugeiconsIcon
                        icon={MinusSignIcon}
                        size={14}
                        strokeWidth={2}
                      />
                    </Button>
                    <span className="w-5 text-center text-sm font-semibold tabular-nums">
                      {weight}
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="size-8 rounded-full"
                      onClick={() => onWeight(member.id, weight + 1)}
                      aria-label={`More parts for ${member.name}`}
                    >
                      <HugeiconsIcon
                        icon={Add01Icon}
                        size={14}
                        strokeWidth={2}
                      />
                    </Button>
                    <span className="w-16 text-right text-[13px] text-muted-foreground tabular-nums">
                      {formatMoney(active ? shareCents : 0, currency)}
                    </span>
                  </div>
                ) : active ? (
                  <Input
                    inputMode="numeric"
                    autoComplete="off"
                    value={formatAtmAmountInput(
                      amounts[member.id] ?? "",
                      fractionDigits
                    )}
                    onChange={(event) =>
                      onAmount(
                        member.id,
                        atmDigitsFromInput(event.target.value)
                      )
                    }
                    onFocus={(event) => event.target.select()}
                    placeholder={formatAtmAmount("", fractionDigits)}
                    size="sm"
                    className="w-28 text-right tabular-nums"
                  />
                ) : (
                  <span className="text-[13px] text-muted-foreground">
                    Not included
                  </span>
                )}
              </li>
            )
          })}
        </ul>
      )}

      <div className="flex items-center justify-between px-1 text-[13px] text-muted-foreground">
        <span>
          {activeCount} of {members.length} people
        </span>
        {splitMode === "AMOUNT" && amountCents > 0 ? (
          <span
            className={
              remaining === 0
                ? "font-medium text-primary"
                : "font-medium text-destructive"
            }
          >
            {remaining === 0
              ? "Balanced"
              : remaining > 0
                ? `${formatMoney(remaining, currency)} left`
                : `${formatMoney(-remaining, currency)} over`}
          </span>
        ) : amountCents > 0 ? (
          <span>{formatMoney(assigned, currency)} split</span>
        ) : null}
      </div>
      {error ? (
        <p className="text-[13px] text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}
