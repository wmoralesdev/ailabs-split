import { useEffect, useMemo, useState } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { Add01Icon, MinusSignIcon } from "@hugeicons/core-free-icons"

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
}: {
  item: LineItem | null
  members: RoomMemberDto[]
  currency: string
  previousItem: LineItem | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: (item: LineItem) => void
  onSplitLine: (item: LineItem) => void
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
    setAmountDigits(centsToAtmDigits(item.amountCents, fractionDigits))
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

  const amountCents = atmDigitsToCents(amountDigits, fractionDigits)
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
      amountCents,
      unitPriceCents: Math.round(amountCents / qty),
      modifiers: modifiers
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean),
      split: buildSplit(),
    })
    onOpenChange(false)
  }

  function assignOnly(memberId: string) {
    setTab("EQUAL")
    setEqualIds(new Set([memberId]))
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

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="max-h-[90dvh] overflow-y-auto rounded-t-3xl"
      >
        <div className="mx-auto flex w-full max-w-content flex-col">
          <SheetHeader>
            <SheetTitle>Split item</SheetTitle>
            <SheetDescription>
              {formatMoney(amountCents, currency)}
              {item.modifiers.length > 0
                ? ` · ${item.modifiers.join(", ")}`
                : ""}
            </SheetDescription>
          </SheetHeader>

          <div className="flex flex-col gap-5 px-6 pb-2">
            <div className="grid gap-2">
              <Label htmlFor="item-name">Name</Label>
              <Input
                id="item-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label>Quantity</Label>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="size-8 rounded-full"
                    onClick={() =>
                      setQuantity((value) => Math.max(1, value - 1))
                    }
                    aria-label="Fewer"
                  >
                    <HugeiconsIcon
                      icon={MinusSignIcon}
                      size={14}
                      strokeWidth={2}
                    />
                  </Button>
                  <span className="w-8 text-center text-sm font-semibold tabular-nums">
                    {quantity}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="size-8 rounded-full"
                    onClick={() => setQuantity((value) => value + 1)}
                    aria-label="More"
                  >
                    <HugeiconsIcon icon={Add01Icon} size={14} strokeWidth={2} />
                  </Button>
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="item-amount">Amount</Label>
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
            <div className="grid gap-2">
              <Label htmlFor="item-mods">Modifiers</Label>
              <Input
                id="item-mods"
                value={modifiers}
                onChange={(event) => setModifiers(event.target.value)}
                placeholder="16 ONZ, RES…"
              />
            </div>

            <div className="flex flex-col gap-3">
              <Label>Who · tap a name for 100%</Label>
              <div className="flex flex-wrap gap-1.5">
                {members.map((member) => (
                  <button
                    key={member.id}
                    type="button"
                    onClick={() => assignOnly(member.id)}
                    className="rounded-full border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground hover:text-foreground"
                  >
                    {member.name}
                  </button>
                ))}
              </div>
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
                  className="grid w-full"
                  style={{
                    gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))`,
                  }}
                >
                  {tabs.map((entry) => (
                    <TabsTrigger key={entry} value={entry}>
                      {entry === "EQUAL"
                        ? "Equal"
                        : entry === "PARTS"
                          ? "Parts"
                          : entry === "QUANTITY"
                            ? "Qty"
                            : "Amount"}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>

              <ul className="divide-y divide-border/60">
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
                      className="flex items-center justify-between gap-3 py-2.5"
                    >
                      <button
                        type="button"
                        className="flex min-w-0 items-center gap-3 text-left"
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
                        <Avatar
                          className={
                            active ? "size-9" : "size-9 opacity-40 grayscale"
                          }
                        >
                          <AvatarFallback className="bg-accent text-xs font-semibold text-accent-foreground">
                            {initials(member.name)}
                          </AvatarFallback>
                        </Avatar>
                        <span
                          className={
                            active
                              ? "truncate font-medium"
                              : "truncate text-muted-foreground"
                          }
                        >
                          {member.name}
                        </span>
                      </button>
                      {tab === "PARTS" ? (
                        <div className="flex items-center gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="size-8 rounded-full"
                            onClick={() =>
                              setWeights((prev) => ({
                                ...prev,
                                [member.id]: Math.max(
                                  0,
                                  (prev[member.id] ?? 0) - 1
                                ),
                              }))
                            }
                          >
                            <HugeiconsIcon
                              icon={MinusSignIcon}
                              size={14}
                              strokeWidth={2}
                            />
                          </Button>
                          <span className="w-5 text-center text-sm font-semibold tabular-nums">
                            {weights[member.id] ?? 0}
                          </span>
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="size-8 rounded-full"
                            onClick={() =>
                              setWeights((prev) => ({
                                ...prev,
                                [member.id]: (prev[member.id] ?? 0) + 1,
                              }))
                            }
                          >
                            <HugeiconsIcon
                              icon={Add01Icon}
                              size={14}
                              strokeWidth={2}
                            />
                          </Button>
                        </div>
                      ) : null}
                      {tab === "QUANTITY" ? (
                        <div className="flex items-center gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="size-8 rounded-full"
                            aria-label={`Less for ${member.name}`}
                            onClick={() =>
                              setQtyShares((prev) => ({
                                ...prev,
                                [member.id]: Math.max(
                                  0,
                                  (prev[member.id] ?? 0) - 1
                                ),
                              }))
                            }
                          >
                            <HugeiconsIcon
                              icon={MinusSignIcon}
                              size={14}
                              strokeWidth={2}
                            />
                          </Button>
                          <span className="w-5 text-center text-sm font-semibold tabular-nums">
                            {qtyShares[member.id] ?? 0}
                          </span>
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="size-8 rounded-full"
                            aria-label={`More for ${member.name}`}
                            onClick={() =>
                              setQtyShares((prev) => ({
                                ...prev,
                                [member.id]: (prev[member.id] ?? 0) + 1,
                              }))
                            }
                          >
                            <HugeiconsIcon
                              icon={Add01Icon}
                              size={14}
                              strokeWidth={2}
                            />
                          </Button>
                        </div>
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
                              [member.id]: atmDigitsFromInput(
                                event.target.value
                              ),
                            }))
                          }
                          onFocus={(event) => event.target.select()}
                          placeholder={formatAtmAmount("", fractionDigits)}
                          className="h-9 w-28 text-right tabular-nums"
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
                      ? "text-xs font-medium text-primary"
                      : "text-xs font-medium text-destructive"
                  }
                >
                  {qtyLeft === 0
                    ? `All ${quantity} assigned`
                    : `${qtyLeft} of ${quantity} left`}
                </p>
              ) : null}
            </div>

            <div className="flex flex-col gap-2">
              {previousItem ? (
                <button
                  type="button"
                  className="text-left text-sm font-medium text-primary"
                  onClick={copyPrevious}
                >
                  Same people as last item
                </button>
              ) : null}
              <button
                type="button"
                className="text-left text-sm font-medium text-primary"
                onClick={() => {
                  onSplitLine(item)
                  onOpenChange(false)
                }}
              >
                Split line into two
              </button>
            </div>
          </div>

          <SheetFooter>
            <Button type="button" onClick={save}>
              Save item
            </Button>
          </SheetFooter>
        </div>
      </SheetContent>
    </Sheet>
  )
}
