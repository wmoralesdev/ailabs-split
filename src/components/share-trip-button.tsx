import { useState } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { Share01Icon } from "@hugeicons/core-free-icons"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { shareOrCopyInvite } from "@/lib/invite-link"

/** Header control: share the trip invite link (OS share sheet or clipboard). */
export function ShareTripButton({
  code,
  name,
}: {
  code: string
  name: string
}) {
  const [busy, setBusy] = useState(false)

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
    <Button
      type="button"
      variant="ghost"
      size="icon-lg"
      onClick={() => void onShare()}
      disabled={busy}
      aria-label="Share trip"
    >
      <HugeiconsIcon icon={Share01Icon} size={18} strokeWidth={2} />
    </Button>
  )
}
