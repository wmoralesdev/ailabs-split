import { useEffect, useState } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { Copy01Icon, Tick02Icon } from "@hugeicons/core-free-icons"
import { toast } from "sonner"

import { copyText } from "@/lib/invite-link"
import { payBankLine, payDetailsLine } from "@/lib/pay-details"
import type { PayDetailsDto } from "@/lib/pay-details"
import { cn } from "@/lib/utils"

function useCopyAccount(pay: PayDetailsDto, ownerLabel: string) {
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return
    const timer = window.setTimeout(() => setCopied(false), 2000)
    return () => window.clearTimeout(timer)
  }, [copied])

  async function copy() {
    try {
      await copyText(pay.account)
      setCopied(true)
      toast.success(`${ownerLabel} account number copied`)
    } catch {
      toast.error("Could not copy the number")
    }
  }

  return { copied, copy }
}

/** Where to send the money, one tap to copy. */
export function PayAccountButton({
  pay,
  ownerLabel,
  variant = "block",
  className,
}: {
  pay: PayDetailsDto
  /** "Ana's" or "Your". */
  ownerLabel: string
  variant?: "block" | "inline"
  className?: string
}) {
  const { copied, copy } = useCopyAccount(pay, ownerLabel)
  const icon = copied ? Tick02Icon : Copy01Icon
  const owner = ownerLabel === "Your" ? "your" : ownerLabel
  const ariaLabel = `Copy ${owner} account number ${pay.account}`

  if (variant === "inline") {
    return (
      <button
        type="button"
        onClick={() => void copy()}
        aria-label={ariaLabel}
        className={cn(
          "-ml-1 inline-flex min-h-10 max-w-full items-center gap-1.5 rounded-md px-1 text-[13px] text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
          className
        )}
      >
        <span className="text-left [overflow-wrap:anywhere] tabular-nums">
          {payDetailsLine(pay)}
        </span>
        <HugeiconsIcon
          icon={icon}
          size={13}
          strokeWidth={2}
          className="shrink-0 text-primary"
        />
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={() => void copy()}
      aria-label={ariaLabel}
      className={cn(
        "flex min-h-13 w-full items-center gap-3 rounded-xl bg-muted px-3.5 py-2 text-left transition-colors outline-none hover:bg-muted/70 focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.99]",
        className
      )}
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] text-muted-foreground">
          {payBankLine(pay) ?? `${ownerLabel} account`}
        </span>
        <span className="block text-[15px] font-semibold [overflow-wrap:anywhere] tabular-nums">
          {pay.account}
        </span>
      </span>
      <span className="inline-flex shrink-0 items-center gap-1 text-[15px] font-semibold text-primary">
        <HugeiconsIcon icon={icon} size={16} strokeWidth={2} />
        {copied ? "Copied" : "Copy"}
      </span>
    </button>
  )
}
