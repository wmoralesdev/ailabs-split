import { useState } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { Copy01Icon, Share01Icon } from "@hugeicons/core-free-icons"
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
  onContinue: () => void
}

export function CreateTripSuccessSheet({
  open,
  code,
  name,
  onContinue,
}: CreateTripSuccessSheetProps) {
  const [copied, setCopied] = useState(false)
  const [busy, setBusy] = useState(false)

  async function onCopyCode() {
    await copyText(code)
    setCopied(true)
    toast.success("Trip code copied")
    window.setTimeout(() => setCopied(false), 1500)
  }

  async function onShare() {
    if (busy) return
    setBusy(true)
    try {
      const result = await shareOrCopyInvite({ code, name })
      if (result === "copied") {
        toast.success("Invite link copied")
      }
    } catch {
      toast.error("Could not share trip")
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
      <SheetContent side="bottom" className="gap-0 rounded-t-2xl px-5 pt-5 pb-safe">
        <SheetHeader className="gap-2 p-0 text-left">
          <SheetTitle className="font-display text-2xl font-semibold tracking-tight">
            Trip ready
          </SheetTitle>
          <SheetDescription className="text-base text-muted-foreground">
            Share this code so everyone can join — no accounts needed.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 flex flex-col items-center rounded-xl border border-border bg-muted/40 px-4 py-6">
          <p className="text-xs font-medium tracking-[0.14em] text-muted-foreground uppercase">
            Trip code
          </p>
          <p className="mt-2 font-display text-4xl font-semibold tracking-[0.22em] text-foreground">
            {code}
          </p>
          <p className="mt-2 truncate text-sm text-muted-foreground">{name}</p>
        </div>

        <SheetFooter className="mt-6 flex-col gap-2 p-0 sm:flex-col">
          <Button
            type="button"
            className="w-full"
            onClick={() => void onShare()}
            disabled={busy}
          >
            <HugeiconsIcon icon={Share01Icon} size={18} strokeWidth={2} />
            Share invite
          </Button>
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={() => void onCopyCode()}
          >
            <HugeiconsIcon icon={Copy01Icon} size={16} strokeWidth={2} />
            {copied ? "Copied" : "Copy code"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="w-full"
            onClick={onContinue}
          >
            Continue to trip
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
