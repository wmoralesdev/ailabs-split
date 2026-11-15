import { useState } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Copy01Icon,
  Share01Icon,
  UserAdd01Icon,
} from "@hugeicons/core-free-icons"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { copyText, shareOrCopyInvite } from "@/lib/invite-link"
import { memberLink } from "@/lib/member-storage"
import { parseRoomKind, roomKindNoun } from "@/lib/room-kind"
import type { RoomKind } from "@/lib/room-kind"

function joinHint(kind: RoomKind): string {
  switch (kind) {
    case "DINNER":
    case "TRIP":
      return "They open the link or type the code, then pick their name."
    case "HOUSEHOLD":
      return "They open the link, sign in, and join as a housemate or guest."
    default: {
      const _never: never = kind
      throw new Error(`Unknown room kind: ${String(_never)}`)
    }
  }
}

/**
 * The one sharing entry in a room: the invite link and code for the group,
 * and, apart, the viewer's own link to reopen their seat on another device.
 */
export function InviteButton({
  code,
  name,
  kind,
  meName,
}: {
  code: string
  name: string
  kind: RoomKind
  /** The viewer's seat name; adds "Copy my link" for trips and bills. */
  meName?: string | null
}) {
  const parsed = parseRoomKind(kind)
  const noun = roomKindNoun(parsed)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState<"code" | "link" | null>(null)

  function flash(which: "code" | "link") {
    setCopied(which)
    window.setTimeout(() => setCopied(null), 1500)
  }

  async function onShare() {
    if (busy) return
    setBusy(true)
    try {
      const result = await shareOrCopyInvite({ code, name, kind: parsed })
      if (result === "copied") toast.success("Invite link copied")
    } catch {
      toast.error(`Could not share the ${noun}`)
    } finally {
      setBusy(false)
    }
  }

  async function onCopyCode() {
    await copyText(code)
    flash("code")
  }

  async function onCopyMyLink() {
    if (!meName) return
    await copyText(memberLink(code, meName))
    flash("link")
    toast.success("Your link is copied")
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className="btn-tint inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <HugeiconsIcon icon={UserAdd01Icon} size={16} strokeWidth={2} />
        Invite
      </button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="bottom"
          className="pb-safe gap-0 rounded-t-3xl px-4 pt-5"
        >
          <SheetHeader className="gap-1 p-0 text-left">
            <SheetTitle className="font-display text-[22px] font-bold tracking-tight">
              Invite to {name}
            </SheetTitle>
            <SheetDescription className="text-[15px] leading-snug text-muted-foreground">
              {joinHint(parsed)}
            </SheetDescription>
          </SheetHeader>

          <button
            type="button"
            onClick={() => void onCopyCode()}
            className="surface mt-5 flex flex-col items-center gap-1 py-5 outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={`Copy ${noun} code ${code}`}
          >
            <span className="font-display text-[34px] leading-none font-bold tracking-[0.2em] tabular-nums">
              {code}
            </span>
            <span className="text-[13px] font-medium text-muted-foreground">
              {copied === "code"
                ? "Code copied"
                : `${noun.charAt(0).toUpperCase()}${noun.slice(1)} code`}
            </span>
          </button>

          <div className="mt-4 flex flex-col gap-2">
            <Button
              type="button"
              className="cta-lg"
              disabled={busy}
              onClick={() => void onShare()}
            >
              <HugeiconsIcon icon={Share01Icon} size={18} strokeWidth={2} />
              Share link
            </Button>
            <Button
              type="button"
              variant="secondary"
              className="cta-lg"
              onClick={() => void onCopyCode()}
            >
              <HugeiconsIcon icon={Copy01Icon} size={18} strokeWidth={2} />
              {copied === "code" ? "Copied" : "Copy code"}
            </Button>
          </div>

          {meName ? (
            <div className="mt-5 border-t border-border pt-4">
              <p className="text-[15px] font-medium">On another device</p>
              <p className="mt-0.5 text-[13px] leading-snug text-muted-foreground">
                Your own link opens this {noun} as {meName}. Keep it to
                yourself.
              </p>
              <button
                type="button"
                className="text-action text-[15px]"
                onClick={() => void onCopyMyLink()}
              >
                {copied === "link" ? "Copied" : "Copy my link"}
              </button>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    </>
  )
}
