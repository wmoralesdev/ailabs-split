import { MemberPicker } from "@/components/member-picker"
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
import {
  atmDigitsFromInput,
  atmDigitsToCents,
  formatAtmAmount,
  formatAtmAmountInput,
} from "@/lib/atm-amount"
import { overpayNote } from "@/lib/house-ledger"
import { formatMoney } from "@/lib/settle"

export function PartialPaymentSheet({
  open,
  onOpenChange,
  members,
  fromId,
  toId,
  onFromChange,
  onToChange,
  lockPair,
  amountDigits,
  onAmountDigits,
  fractionDigits,
  currency,
  suggestedCents,
  actorId,
  onContinue,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  members: Array<{ id: string; name: string }>
  fromId: string
  toId: string
  onFromChange: (id: string) => void
  onToChange: (id: string) => void
  lockPair: boolean
  amountDigits: string
  onAmountDigits: (digits: string) => void
  fractionDigits: number
  currency: string
  suggestedCents: number
  actorId: string | null
  onContinue: () => void
}) {
  const fromName = members.find((member) => member.id === fromId)?.name ?? ""
  const toName = members.find((member) => member.id === toId)?.name ?? ""
  const amountCents = atmDigitsToCents(amountDigits, fractionDigits)
  const note = overpayNote({
    actorId,
    fromId,
    fromName,
    toId,
    toName,
    amountCents,
    suggestedCents,
    currency,
  })
  const canContinue =
    amountCents > 0 && fromId !== toId && Boolean(fromId && toId)

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="max-h-[85dvh] overflow-y-auto rounded-t-2xl"
      >
        <div className="mx-auto flex w-full max-w-content flex-col">
          <SheetHeader>
            <SheetTitle>Record a payment</SheetTitle>
            <SheetDescription>
              {lockPair
                ? `${fromName} pays ${toName}`
                : "Any housemate you paid or who paid you."}
            </SheetDescription>
          </SheetHeader>

          <div className="flex flex-col gap-4 px-4 pb-2">
            {lockPair ? null : (
              <>
                <div className="grid gap-2">
                  <Label>From</Label>
                  <MemberPicker
                    members={members}
                    value={fromId}
                    onChange={onFromChange}
                    label="From"
                  />
                </div>
                <div className="grid gap-2">
                  <Label>To</Label>
                  <MemberPicker
                    members={members}
                    value={toId}
                    onChange={onToChange}
                    label="To"
                  />
                </div>
              </>
            )}
            <div className="grid gap-2">
              <Label htmlFor="house-payment-amount">How much?</Label>
              <Input
                id="house-payment-amount"
                inputMode="numeric"
                autoComplete="off"
                value={formatAtmAmountInput(amountDigits, fractionDigits)}
                onChange={(event) =>
                  onAmountDigits(atmDigitsFromInput(event.target.value))
                }
                onFocus={(event) => event.target.select()}
                placeholder={formatAtmAmount("", fractionDigits)}
                className="text-right font-display text-xl tracking-tight tabular-nums"
              />
              {suggestedCents > 0 ? (
                <p className="text-[13px] text-muted-foreground">
                  Suggested {formatMoney(suggestedCents, currency)}
                </p>
              ) : null}
              {note ? (
                <p className="text-[13px] text-muted-foreground">{note}</p>
              ) : null}
            </div>
          </div>

          <SheetFooter>
            <Button
              type="button"
              className="cta-lg"
              disabled={!canContinue}
              onClick={onContinue}
            >
              Continue
            </Button>
          </SheetFooter>
        </div>
      </SheetContent>
    </Sheet>
  )
}
