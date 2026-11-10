import { useState } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Copy01Icon,
  ReceiptDollarIcon,
  Share01Icon,
} from "@hugeicons/core-free-icons"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { copyText, shareOrCopyInvite } from "@/lib/invite-link"

type CreateTripSuccessSheetProps = {
  open: boolean
  code: string
  name: string
  kind?: "TRIP" | "DINNER"
  onContinue: () => void
  onAddBill?: () => void
}

export function CreateTripSuccessSheet({
  open,
  code,
  name,
  kind = "TRIP",
  onContinue,
  onAddBill,
}: CreateTripSuccessSheetProps) {
  const isDinner = kind === "DINNER"
  const [copied, setCopied] = useState(false)
  const [busy, setBusy] = useState(false)

  async function onCopyCode() {
    await copyText(code)
    setCopied(true)
    toast.success(isDinner ? "Dinner code copied" : "Trip code copied")
    window.setTimeout(() => setCopied(false), 1500)
  }

  async function onShare() {
    if (busy) return
    setBusy(true)
    try {
      const result = await shareOrCopyInvite({ code, name, kind })
      if (result === "copied") {
        toast.success("Invite link copied")
      }
    } catch {
      toast.error(isDinner ? "Could not share dinner" : "Could not share trip")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) onContinue()
      }}
    >
      <SheetContent
        side="bottom"
        className="pb-safe gap-0 rounded-t-3xl px-4 pt-5"
      >
        <SheetHeader className="gap-1 p-0 text-left">
          <SheetTitle className="font-display text-[22px] font-bold tracking-tight">
            {isDinner ? "Dinner ready" : "Trip ready"}
          </SheetTitle>
          <SheetDescription className="text-[15px] leading-snug text-muted-foreground">
            {isDinner
              ? "Add the bill now. Send the code whenever, people join from the link."
              : "Send the code so everyone can join."}
          </SheetDescription>
        </SheetHeader>

        <button
          type="button"
          onClick={() => void onCopyCode()}
          className="mt-4 flex w-full items-center justify-between gap-3 rounded-2xl bg-muted px-4 py-3 text-left outline-none transition-colors hover:bg-muted/80 focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={`Copy code ${code}`}
        >
          <span className="min-w-0">
            <span className="eyebrow block truncate">{name}</span>
            <span
              data-room-code
              className="mt-0.5 block font-display text-[28px] leading-tight font-bold tracking-[0.18em] text-foreground"
            >
              {code}
            </span>
          </span>
          <span className="inline-flex shrink-0 items-center gap-1.5 text-[13px] font-semibold text-primary">
            <HugeiconsIcon icon={Copy01Icon} size={14} strokeWidth={2} />
            {copied ? "Copied" : "Copy"}
          </span>
        </button>

        <SheetFooter className="mt-4 flex-col gap-2 p-0 sm:flex-col">
          {isDinner && onAddBill ? (
            <Button type="button" className="cta-lg" onClick={onAddBill}>
              <HugeiconsIcon
                icon={ReceiptDollarIcon}
                size={18}
                strokeWidth={2}
              />
              Add the bill
            </Button>
          ) : null}
          <Button
            type="button"
            variant={isDinner ? "secondary" : "default"}
            className={
              isDinner ? "w-full bg-muted font-semibold text-primary" : "cta-lg"
            }
            onClick={() => void onShare()}
            disabled={busy}
          >
            <HugeiconsIcon icon={Share01Icon} size={16} strokeWidth={2} />
            Share invite
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="w-full"
            onClick={onContinue}
          >
            {isDinner ? "Continue to dinner" : "Continue to trip"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
