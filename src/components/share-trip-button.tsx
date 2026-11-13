import { useState } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { Share01Icon } from "@hugeicons/core-free-icons"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { shareOrCopyInvite } from "@/lib/invite-link"
import { parseRoomKind, roomKindNoun } from "@/lib/room-kind"
import type { RoomKind } from "@/lib/room-kind"

/** Header control: share the trip invite link (OS share sheet or clipboard). */
export function ShareTripButton({
  code,
  name,
  kind = "TRIP",
}: {
  code: string
  name: string
  kind?: RoomKind
}) {
  const [busy, setBusy] = useState(false)
  const parsed = parseRoomKind(kind)
  const noun = roomKindNoun(parsed)

  async function onShare() {
    if (busy) return
    setBusy(true)
    try {
      const result = await shareOrCopyInvite({ code, name, kind: parsed })
      if (result === "copied") {
        toast.success("Invite link copied")
      }
    } catch {
      toast.error(`Could not share ${noun}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-lg"
      onClick={() => void onShare()}
      disabled={busy}
      aria-label={`Share ${noun}`}
    >
      <HugeiconsIcon icon={Share01Icon} size={18} strokeWidth={2} />
    </Button>
  )
}
