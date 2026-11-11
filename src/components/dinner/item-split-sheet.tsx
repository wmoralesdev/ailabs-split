import { useEffect, useMemo, useState } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { Add01Icon, MinusSignIcon } from "@hugeicons/core-free-icons"

import { LineQtyName } from "@/components/dinner/line-qty-name"
import { OwingAmount } from "@/components/dinner/owing-amount"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { initials } from "@/lib/dinner-labels"
import {
  lineAmountCents,
  splitLineItemShares,
  unitPriceFromLine,
} from "@/lib/dinner-split"
import type { ItemSplit, LineItem } from "@/lib/dinner-split"
import {
  atmDigitsFromInput,
  atmDigitsToCents,
  centsToAtmDigits,
  currencyFractionDigits,
  formatAtmAmount,
  formatAtmAmountInput,
} from "@/lib/atm-amount"
import { formatMoney } from "@/lib/settle"
import type { RoomMemberDto } from "@/server/rooms"
import { cn } from "@/lib/utils"

type SplitTab = "EQUAL" | "PARTS" | "QUANTITY" | "AMOUNT"

export function ItemSplitSheet({
  item,
  members,
  currency,
  previousItem,
  open,
  onOpenChange,
  onSave,
  onSplitLine,
  readOnly = false,
}: {
  item: LineItem | null
  members: RoomMemberDto[]
  currency: string
  previousItem: LineItem | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: (item: LineItem) => void
  onSplitLine: (item: LineItem) => void
  readOnly?: boolean
}) {
  const fractionDigits = currencyFractionDigits(currency)
  const [name, setName] = useState("")
  const [quantity, setQuantity] = useState(1)
  const [amountDigits, setAmountDigits] = useState("")
  const [modifiers, setModifiers] = useState("")
  const [tab, setTab] = useState<SplitTab>("EQUAL")
  const [equalIds, setEqualIds] = useState<Set<string>>(() => new Set())
  const [weights, setWeights] = useState<Record<string, number>>({})
  const [qtyShares, setQtyShares] = useState<Record<string, number>>({})
  const [amountShares, setAmountShares] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!item) return
    setName(item.name)
    setQuantity(item.quantity)
    setAmountDigits(
      centsToAtmDigits(
        item.unitPriceCents > 0
          ? item.unitPriceCents
          : unitPriceFromLine(item.amountCents, item.quantity),
        fractionDigits
      )
    )
    setModifiers(item.modifiers.join(", "))
    switch (item.split.mode) {
      case "UNASSIGNED":
        setTab(item.quantity > 1 ? "QUANTITY" : "EQUAL")
        setEqualIds(new Set())
        setWeights(Object.fromEntries(members.map((member) => [member.id, 0])))
        setQtyShares(
          Object.fromEntries(members.map((member) => [member.id, 0]))
        )
        setAmountShares({})
        break
      case "EQUAL":
        setTab("EQUAL")
        setEqualIds(new Set(item.split.memberIds))
        break
      case "PARTS":
        setTab("PARTS")
        setWeights(
          Object.fromEntries(
            members.map((member) => [
              member.id,
              item.split.mode === "PARTS"
                ? (item.split.parts.find((part) => part.memberId === member.id)
                    ?.weight ?? 0)
                : 0,
            ])
          )
        )
        break
      case "QUANTITY": {
        const split = item.split
        setTab("QUANTITY")
        setQtyShares(
          Object.fromEntries(
            members.map((member) => [
              member.id,
              split.shares.find((share) => share.memberId === member.id)
                ?.quantity ?? 0,
            ])
          )
        )
        break
      }
      case "AMOUNT": {
        const split = item.split
        setTab("AMOUNT")
        setAmountShares(
          Object.fromEntries(
            split.shares.map((share) => [
              share.memberId,
              centsToAtmDigits(share.amountCents, fractionDigits),
            ])
          )
        )
        break
      }
      default: {
        const _never: never = item.split
        return _never
      }
    }
  }, [item, fractionDigits, members])

  const unitPriceCents = atmDigitsToCents(amountDigits, fractionDigits)
  const amountCents = lineAmountCents(unitPriceCents, quantity)
  const qtyAssigned = Object.values(qtyShares).reduce(
    (sum, qty) => sum + qty,
    0
  )
  const qtyLeft = quantity - qtyAssigned

  const tabs = useMemo(() => {
    const next: SplitTab[] = ["EQUAL", "PARTS"]
    if (quantity > 1) next.push("QUANTITY")
    next.push("AMOUNT")
    return next
  }, [quantity])

  function toggleEqual(memberId: string) {
    setEqualIds((prev) => {
      const next = new Set(prev)
      if (next.has(memberId)) next.delete(memberId)
      else next.add(memberId)
      return next
    })
  }

  function buildSplit(): ItemSplit {
    switch (tab) {
      case "EQUAL":
        return equalIds.size === 0
          ? { mode: "UNASSIGNED" }
          : { mode: "EQUAL", memberIds: [...equalIds] }
      case "PARTS": {
        const parts = members
          .map((member) => ({
            memberId: member.id,
            weight: weights[member.id] ?? 0,
          }))
          .filter((part) => part.weight > 0)
        return parts.length === 0
          ? { mode: "UNASSIGNED" }
          : { mode: "PARTS", parts }
      }
      case "QUANTITY": {
        const shares = members
          .map((member) => ({
            memberId: member.id,
            quantity: qtyShares[member.id] ?? 0,
          }))
          .filter((share) => share.quantity > 0)
        return shares.length === 0
          ? { mode: "UNASSIGNED" }
          : { mode: "QUANTITY", shares }
      }
      case "AMOUNT": {
        const shares = members
          .map((member) => ({
            memberId: member.id,
            amountCents: atmDigitsToCents(
              amountShares[member.id] ?? "",
              fractionDigits
            ),
          }))
          .filter((share) => share.amountCents > 0)
        return shares.length === 0
          ? { mode: "UNASSIGNED" }
          : { mode: "AMOUNT", shares }
      }
      default: {
        const _never: never = tab
        return _never
      }
    }
  }

  function save() {
    if (!item) return
    const qty = Math.max(1, quantity)
    onSave({
      ...item,
      name: name.trim() || item.name,
      quantity: qty,
      amountCents: lineAmountCents(unitPriceCents, qty),
      unitPriceCents,
      modifiers: modifiers
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean),
      split: buildSplit(),
    })
    onOpenChange(false)
  }

  function copyPrevious() {
    if (!previousItem) return
    switch (previousItem.split.mode) {
      case "UNASSIGNED":
        return
      case "EQUAL":
        setTab("EQUAL")
        setEqualIds(new Set(previousItem.split.memberIds))
        return
      case "PARTS":
        setTab("PARTS")
        setWeights(
          Object.fromEntries(
            members.map((member) => [
              member.id,
              previousItem.split.mode === "PARTS"
                ? (previousItem.split.parts.find(
                    (part) => part.memberId === member.id
                  )?.weight ?? 0)
                : 0,
            ])
          )
        )
        return
      case "QUANTITY": {
        const split = previousItem.split
        if (previousItem.quantity === quantity) {
          setTab("QUANTITY")
          setQtyShares(
            Object.fromEntries(
              members.map((member) => [
                member.id,
                split.shares.find((share) => share.memberId === member.id)
                  ?.quantity ?? 0,
              ])
            )
          )
          return
        }
        setTab("EQUAL")
        setEqualIds(new Set(split.shares.map((share) => share.memberId)))
        return
      }
      case "AMOUNT":
        setTab("EQUAL")
        setEqualIds(
          new Set(previousItem.split.shares.map((share) => share.memberId))
        )
        return
      default: {
        const _never: never = previousItem.split
        return _never
      }
    }
  }

  if (!item) {
    return <Sheet open={open} onOpenChange={onOpenChange} />
  }

  if (readOnly) {
    const lineShares = splitLineItemShares(item)
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="bottom"
          className="flex max-h-[92dvh] flex-col gap-0 rounded-t-3xl bg-background p-0"
        >
          <div className="mx-auto flex min-h-0 w-full max-w-content flex-1 flex-col">
            <SheetHeader className="gap-0.5 px-4 pt-4 pb-3 text-left">
              <SheetTitle className="eyebrow">This item</SheetTitle>
              <div className="flex items-baseline justify-between gap-3">
                <LineQtyName
                  name={item.name}
                  quantity={item.quantity}
                  className="min-w-0 flex-1"
                  nameClassName="truncate font-display text-xl font-bold tracking-tight"
                />
                <p className="shrink-0 font-display text-xl font-bold tabular-nums">
                  {formatMoney(item.amountCents, currency)}
                </p>
              </div>
              <SheetDescription className="text-[13px]">
                {item.modifiers.length > 0
                  ? item.modifiers.join(", ")
                  : "Who had this."}
              </SheetDescription>
            </SheetHeader>
            <ul
              className="group-list min-h-0 flex-1 overflow-y-auto px-4 pb-6"
              aria-label="Who had this"
            >
              {members.map((member) => (
                <li key={member.id} className="group-row justify-between gap-3">
                  <span className="min-w-0 truncate text-[15px]">
                    {member.name}
                  </span>
                  <OwingAmount
                    cents={lineShares.shares.get(member.id) ?? 0}
                    currency={currency}
                  />
                </li>
              ))}
            </ul>
          </div>
        </SheetContent>
      </Sheet>
    )
  }

  const tabLabel: Record<SplitTab, string> = {
    EQUAL: "Equal",
    PARTS: "Parts",
    QUANTITY: "Qty",
    AMOUNT: "Amount",
  }
  const equalShareCents =
    equalIds.size > 0 ? Math.round(amountCents / equalIds.size) : 0

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="flex max-h-[92dvh] flex-col gap-0 rounded-t-3xl bg-background p-0"
      >
        <div className="mx-auto flex min-h-0 w-full max-w-content flex-1 flex-col">
          <SheetHeader className="gap-0.5 px-4 pt-4 pb-3 text-left">
            <SheetTitle className="eyebrow">Split item</SheetTitle>
            <div className="flex items-baseline justify-between gap-3">
              <LineQtyName
                name={name || item.name}
                quantity={quantity}
                className="min-w-0 flex-1"
                nameClassName="truncate font-display text-xl font-bold tracking-tight"
              />
              <p className="shrink-0 font-display text-xl font-bold tabular-nums">
                {formatMoney(amountCents, currency)}
              </p>
            </div>
            <SheetDescription className="text-[13px]">
              {item.modifiers.length > 0
                ? item.modifiers.join(", ")
                : "Pick who had it and how to split it."}
            </SheetDescription>
          </SheetHeader>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
            <Tabs
              value={tab}
              onValueChange={(value) => {
                if (
                  value === "EQUAL" ||
                  value === "PARTS" ||
                  value === "QUANTITY" ||
                  value === "AMOUNT"
                ) {
                  setTab(value)
                }
              }}
            >
              <TabsList
                className="segmented w-full group-data-horizontal/tabs:h-9"
                style={{
                  gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))`,
                }}
              >
                {tabs.map((entry) => (
                  <TabsTrigger
                    key={entry}
                    value={entry}
                    className="segmented-item"
                  >
                    {tabLabel[entry]}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>

            <ul className="group-list mt-3">
              {members.map((member) => {
                const active =
                  tab === "EQUAL"
                    ? equalIds.has(member.id)
                    : tab === "PARTS"
                      ? (weights[member.id] ?? 0) > 0
                      : tab === "QUANTITY"
                        ? (qtyShares[member.id] ?? 0) > 0
                        : atmDigitsToCents(
                            amountShares[member.id] ?? "",
                            fractionDigits
                          ) > 0
                return (
                  <li
                    key={member.id}
                    className={cn("group-row", "justify-between gap-2")}
                  >
                    <button
                      type="button"
                      className="row-hit flex min-h-12 min-w-0 flex-1 items-center gap-3 px-1 text-left"
                      aria-pressed={
                        tab === "EQUAL" || tab === "PARTS" ? active : undefined
                      }
                      onClick={() => {
                        if (tab === "EQUAL") toggleEqual(member.id)
                        if (tab === "PARTS") {
                          setWeights((prev) => ({
                            ...prev,
                            [member.id]: (prev[member.id] ?? 0) > 0 ? 0 : 1,
                          }))
                        }
                      }}
                    >
                      <Avatar className="size-8">
                        <AvatarFallback
                          className={
                            active
                              ? "bg-foreground text-xs font-semibold text-background"
                              : "bg-muted text-xs font-semibold text-muted-foreground"
                          }
                        >
                          {initials(member.name)}
                        </AvatarFallback>
                      </Avatar>
                      <span
                        className={
                          active
                            ? "truncate text-[15px] font-semibold"
                            : "truncate text-[15px] text-muted-foreground"
                        }
                      >
                        {member.name}
                      </span>
                      {tab === "EQUAL" ? (
                        active ? (
                          <span className="ml-auto pr-2 text-[15px] font-medium tabular-nums">
                            {formatMoney(equalShareCents, currency)}
                          </span>
                        ) : (
                          <span className="ml-auto pr-2 text-[15px] font-normal text-muted-foreground">
                            Nothing
                          </span>
                        )
                      ) : null}
                    </button>
                    {tab === "PARTS" ? (
                      <Stepper
                        value={weights[member.id] ?? 0}
                        lessLabel={`Fewer parts for ${member.name}`}
                        moreLabel={`More parts for ${member.name}`}
                        onChange={(next) =>
                          setWeights((prev) => ({ ...prev, [member.id]: next }))
                        }
                      />
                    ) : null}
                    {tab === "QUANTITY" ? (
                      <Stepper
                        value={qtyShares[member.id] ?? 0}
                        lessLabel={`Less for ${member.name}`}
                        moreLabel={`More for ${member.name}`}
                        onChange={(next) =>
                          setQtyShares((prev) => ({
                            ...prev,
                            [member.id]: next,
                          }))
                        }
                      />
                    ) : null}
                    {tab === "AMOUNT" ? (
                      <Input
                        inputMode="numeric"
                        value={formatAtmAmountInput(
                          amountShares[member.id] ?? "",
                          fractionDigits
                        )}
                        onChange={(event) =>
                          setAmountShares((prev) => ({
                            ...prev,
                            [member.id]: atmDigitsFromInput(event.target.value),
                          }))
                        }
                        onFocus={(event) => event.target.select()}
                        placeholder={formatAtmAmount("", fractionDigits)}
                        aria-label={`Amount for ${member.name}`}
                        className="h-9 w-28 rounded-lg text-right tabular-nums"
                      />
                    ) : null}
                  </li>
                )
              })}
            </ul>
            {tab === "QUANTITY" ? (
              <p
                className={
                  qtyLeft === 0
                    ? "mt-2 px-4 text-[13px] font-medium text-muted-foreground"
                    : "mt-2 px-4 text-[13px] font-medium text-destructive"
                }
              >
                {qtyLeft === 0
                  ? `All ${quantity} assigned`
                  : `${qtyLeft} of ${quantity} left`}
              </p>
            ) : null}

            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
              {tab === "EQUAL" && members.length > 1 ? (
                <button
                  type="button"
                  className="item-everyone mt-0 min-h-11 w-auto"
                  onClick={() =>
                    setEqualIds(new Set(members.map((member) => member.id)))
                  }
                >
                  Everyone
                </button>
              ) : null}
              {previousItem ? (
                <button
                  type="button"
                  className="item-everyone mt-0 min-h-11 w-auto"
                  onClick={copyPrevious}
                >
                  Same as last item
                </button>
              ) : null}
            </div>

            <details className="surface group mt-5">
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between px-4 text-[15px] font-medium outline-none hover:bg-muted/70 focus-visible:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset">
                Edit item
                <span className="text-[13px] text-muted-foreground group-open:hidden">
                  Name, quantity, price
                </span>
              </summary>
              <div className="flex flex-col gap-3.5 px-4 pb-4">
                <div className="grid gap-1.5">
                  <Label htmlFor="item-name">Name</Label>
                  <Input
                    id="item-name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                  />
                </div>
                <div className="grid grid-cols-[auto_1fr] items-end gap-2.5">
                  <div className="grid gap-1.5">
                    <Label>Quantity</Label>
                    <Stepper
                      value={quantity}
                      min={1}
                      tall
                      lessLabel="Fewer"
                      moreLabel="More"
                      onChange={setQuantity}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="item-amount">Price</Label>
                    <Input
                      id="item-amount"
                      inputMode="numeric"
                      value={formatAtmAmountInput(amountDigits, fractionDigits)}
                      onChange={(event) =>
                        setAmountDigits(atmDigitsFromInput(event.target.value))
                      }
                      onFocus={(event) => event.target.select()}
                      placeholder={formatAtmAmount("", fractionDigits)}
                      className="text-right tabular-nums"
                    />
                  </div>
                </div>
                {quantity > 1 && unitPriceCents > 0 ? (
                  <p className="text-[13px] text-muted-foreground">
                    {formatMoney(amountCents, currency)} on the bill
                  </p>
                ) : null}
                <div className="grid gap-1.5">
                  <Label htmlFor="item-mods">Notes on the ticket</Label>
                  <Input
                    id="item-mods"
                    value={modifiers}
                    onChange={(event) => setModifiers(event.target.value)}
                    placeholder="16 ONZ, RES…"
                  />
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  className="btn-tint w-full bg-muted"
                  onClick={() => {
                    onSplitLine(item)
                    onOpenChange(false)
                  }}
                >
                  Split line into two
                </Button>
              </div>
            </details>
          </div>

          <SheetFooter className="pb-safe border-t border-border px-4 pt-3">
            <Button type="button" className="cta-lg" onClick={save}>
              Save item
            </Button>
          </SheetFooter>
        </div>
      </SheetContent>
    </Sheet>
  )
}

function Stepper({
  value,
  min = 0,
  tall = false,
  lessLabel,
  moreLabel,
  onChange,
}: {
  value: number
  min?: number
  tall?: boolean
  lessLabel: string
  moreLabel: string
  onChange: (next: number) => void
}) {
  return (
    <div
      className={cn(
        "flex shrink-0 items-center bg-muted",
        tall ? "h-(--control-height) rounded-xl" : "h-8 rounded-lg"
      )}
    >
      <button
        type="button"
        className="stepper-hit h-full w-9 rounded-l-[inherit] after:absolute after:inset-x-0 after:-inset-y-1.5"
        aria-label={lessLabel}
        disabled={value <= min}
        onClick={() => onChange(Math.max(min, value - 1))}
      >
        <HugeiconsIcon icon={MinusSignIcon} size={14} strokeWidth={2.2} />
      </button>
      <span className="w-6 text-center text-[15px] font-semibold tabular-nums">
        {value}
      </span>
      <button
        type="button"
        className="stepper-hit h-full w-9 rounded-r-[inherit] after:absolute after:inset-x-0 after:-inset-y-1.5"
        aria-label={moreLabel}
        onClick={() => onChange(value + 1)}
      >
        <HugeiconsIcon icon={Add01Icon} size={14} strokeWidth={2.2} />
      </button>
    </div>
  )
}
