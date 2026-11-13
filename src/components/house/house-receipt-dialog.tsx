import { useQuery } from "@tanstack/react-query"
import { Spinner } from "@/components/ui/spinner"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { getHouseReceiptPhoto } from "@/server/houses"

export function HouseReceiptDialog({
  open,
  onOpenChange,
  code,
  expenseId,
  label,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  code: string
  expenseId: string | null
  label: string
}) {
  const { data, isPending, error } = useQuery({
    queryKey: ["house-receipt-photo", code, expenseId],
    queryFn: () =>
      getHouseReceiptPhoto({
        data: { code, expenseId: expenseId ?? "" },
      }),
    enabled: open && Boolean(expenseId),
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[80dvh] max-w-[calc(100%-2rem)] gap-3 overflow-y-auto p-3 sm:max-w-sm"
        showCloseButton
      >
        <DialogHeader>
          <DialogTitle className="font-display text-lg font-semibold">
            Receipt photo
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
              : "No photo on this charge."}
          </p>
        ) : (
          <img
            src={`data:${data.mimeType};base64,${data.base64}`}
            alt=""
            data-testid="house-receipt-full"
            className="max-h-56 w-full rounded-xl bg-muted object-contain"
          />
        )}
      </DialogContent>
    </Dialog>
  )
}
