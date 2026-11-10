import { useEffect, useRef, useState } from "react"
import type { ChangeEvent } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Camera01Icon,
  Cancel01Icon,
  ImageAdd01Icon,
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
import { compressImageForProof } from "@/lib/compress-image"
import { formatMoney } from "@/lib/settle"
import type { Transfer } from "@/lib/settle"

const GALLERY_ACCEPT =
  "image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif"

type PaymentProofSheetProps = {
  transfer: Transfer | null
  currency: string
  memberId: string
  open: boolean
  saving: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: (proof?: { base64: string; mimeType: "image/jpeg" }) => void
}

export function PaymentProofSheet({
  transfer,
  currency,
  memberId,
  open,
  saving,
  onOpenChange,
  onConfirm,
}: PaymentProofSheetProps) {
  const cameraRef = useRef<HTMLInputElement>(null)
  const galleryRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [preparing, setPreparing] = useState(false)

  useEffect(() => {
    if (open) return
    setFile(null)
    setPreparing(false)
    setPreviewUrl((current) => {
      if (current) URL.revokeObjectURL(current)
      return null
    })
  }, [open])

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  function onPick(event: ChangeEvent<HTMLInputElement>) {
    const next = event.target.files?.[0] ?? null
    event.target.value = ""
    if (!next) return
    setPreviewUrl((current) => {
      if (current) URL.revokeObjectURL(current)
      return URL.createObjectURL(next)
    })
    setFile(next)
  }

  function clearPhoto() {
    setFile(null)
    setPreviewUrl((current) => {
      if (current) URL.revokeObjectURL(current)
      return null
    })
  }

  async function confirm() {
    if (!transfer || preparing || saving) return
    if (!file) {
      onConfirm()
      return
    }
    setPreparing(true)
    try {
      const compressed = await compressImageForProof(file)
      onConfirm({
        base64: compressed.base64,
        mimeType: compressed.mimeType,
      })
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not read that photo"
      )
      setPreparing(false)
    }
  }

  if (!transfer) {
    return <Sheet open={open} onOpenChange={onOpenChange} />
  }

  const iPay = transfer.fromId === memberId
  const iGet = transfer.toId === memberId
  const sentence = iPay
    ? `You pay ${transfer.toName}`
    : iGet
      ? `${transfer.fromName} pays you`
      : `${transfer.fromName} pays ${transfer.toName}`
  const busy = preparing || saving
  const confirmLabel = preparing
    ? "Preparing photo…"
    : saving
      ? "Saving…"
      : "Record payment"

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="flex max-h-[92dvh] flex-col gap-0 rounded-t-3xl bg-background p-0"
      >
        <div className="mx-auto flex min-h-0 w-full max-w-content flex-1 flex-col">
          <SheetHeader className="gap-0.5 px-4 pt-4 pb-3 text-left">
            <SheetTitle className="eyebrow">Record this payment</SheetTitle>
            <div className="flex items-baseline justify-between gap-3">
              <p className="min-w-0 truncate font-display text-xl font-bold tracking-tight">
                {sentence}
              </p>
              <p className="shrink-0 font-display text-xl font-bold tabular-nums">
                {formatMoney(transfer.amountCents, currency)}
              </p>
            </div>
            <SheetDescription className="text-[13px]">
              A photo of the transfer is optional.
            </SheetDescription>
          </SheetHeader>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
            {previewUrl ? (
              <div className="relative overflow-hidden rounded-2xl bg-muted">
                <img
                  src={previewUrl}
                  alt="Transfer photo"
                  data-testid="payment-proof-preview"
                  className="mx-auto max-h-48 w-full object-contain"
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="icon-sm"
                  className="absolute top-2 right-2 bg-card text-foreground"
                  onClick={clearPhoto}
                  disabled={busy}
                  aria-label="Remove photo"
                >
                  <HugeiconsIcon
                    icon={Cancel01Icon}
                    size={14}
                    strokeWidth={2}
                  />
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  className="split-cta-tinted"
                  disabled={busy}
                  onClick={() => cameraRef.current?.click()}
                >
                  <HugeiconsIcon
                    icon={Camera01Icon}
                    size={18}
                    strokeWidth={2}
                  />
                  Camera
                </button>
                <button
                  type="button"
                  className="split-cta-tinted"
                  disabled={busy}
                  onClick={() => galleryRef.current?.click()}
                >
                  <HugeiconsIcon
                    icon={ImageAdd01Icon}
                    size={18}
                    strokeWidth={2}
                  />
                  From photos
                </button>
              </div>
            )}
            <input
              ref={cameraRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="sr-only"
              tabIndex={-1}
              aria-hidden
              disabled={busy}
              data-testid="payment-proof-camera-input"
              onChange={onPick}
            />
            <input
              ref={galleryRef}
              type="file"
              accept={GALLERY_ACCEPT}
              className="sr-only"
              tabIndex={-1}
              aria-hidden
              disabled={busy}
              data-testid="payment-proof-gallery-input"
              onChange={onPick}
            />
          </div>

          <SheetFooter className="pb-safe border-t border-border px-4 pt-3">
            <Button
              type="button"
              className="cta-lg"
              onClick={() => void confirm()}
              disabled={busy}
            >
              {confirmLabel}
            </Button>
          </SheetFooter>
        </div>
      </SheetContent>
    </Sheet>
  )
}
