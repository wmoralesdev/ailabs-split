import { HugeiconsIcon } from "@hugeicons/react"
import { Loading03Icon } from "@hugeicons/core-free-icons"

import { cn } from "@/lib/utils"

function Spinner({ className }: { className?: string }) {
  return (
    <HugeiconsIcon
      icon={Loading03Icon}
      size={16}
      strokeWidth={2}
      data-slot="spinner"
      aria-hidden
      className={cn("size-4 animate-spin", className)}
    />
  )
}

export { Spinner }
