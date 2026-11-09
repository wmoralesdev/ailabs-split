import { useState } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { Share01Icon } from "@hugeicons/core-free-icons"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { shareOrCopyInvite } from "@/lib/invite-link"
import { mealNoun, type RoomKind } from "@/lib/room-kind"

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

  async function onShare() {
    if (busy) return
    setBusy(true)
    try {
      const result = await shareOrCopyInvite({ code, name, kind })
      if (result === "copied") {
        toast.success("Invite link copied")
      }
    } catch {
      toast.error(`Could not share ${mealNoun(kind)}`)
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
      aria-label={`Share ${mealNoun(kind)}`}
    >
      <HugeiconsIcon icon={Share01Icon} size={18} strokeWidth={2} />
    </Button>
  )
}
