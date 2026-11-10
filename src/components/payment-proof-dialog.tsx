import { useQuery } from "@tanstack/react-query"
import { HugeiconsIcon } from "@hugeicons/react"
import { Image01Icon } from "@hugeicons/core-free-icons"

import { Spinner } from "@/components/ui/spinner"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { getSettlementProof } from "@/server/rooms"

export function PaymentProofDialog({
  open,
  onOpenChange,
  code,
  settlementId,
  label,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  code: string
  settlementId: string | null
  label: string
}) {
  const { data, isPending, error } = useQuery({
    queryKey: ["settlement-proof", code, settlementId],
    queryFn: () =>
      getSettlementProof({
        data: { code, settlementId: settlementId ?? "" },
      }),
    enabled: open && Boolean(settlementId),
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[80dvh] max-w-[calc(100%-2rem)] gap-3 overflow-y-auto p-3 sm:max-w-sm"
        showCloseButton
      >
        <DialogHeader>
          <DialogTitle className="font-display text-lg font-semibold">
            Transfer photo
          </DialogTitle>
          <DialogDescription>{label}</DialogDescription>
        </DialogHeader>
        {isPending ? (
          <div className="flex h-48 items-center justify-center">
            <Spinner />
          </div>
        ) : error || !data ? (
          <p className="px-1 pb-2 text-[15px] text-muted-foreground">
            {error instanceof Error
              ? error.message
              : "No photo on this payment."}
          </p>
        ) : (
          <img
            src={`data:${data.mimeType};base64,${data.base64}`}
            alt=""
            data-testid="payment-proof-full"
            className="max-h-56 w-full rounded-xl bg-muted object-contain"
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

export function PaymentProofButton({
  onClick,
  fromName,
}: {
  onClick: () => void
  fromName: string
}) {
  return (
    <button
      type="button"
      className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted text-foreground transition-[transform,background-color] outline-none hover:bg-muted/80 focus-visible:ring-2 focus-visible:ring-ring motion-safe:hover:-translate-y-px motion-safe:active:translate-y-px"
      onClick={onClick}
      aria-label={`View transfer photo from ${fromName}`}
    >
      <HugeiconsIcon icon={Image01Icon} size={16} strokeWidth={2} />
    </button>
  )
}
