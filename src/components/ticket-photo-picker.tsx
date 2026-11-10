import { useRef } from "react"
import type { ChangeEvent } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { Camera01Icon, ImageAdd01Icon } from "@hugeicons/core-free-icons"

import { cn } from "@/lib/utils"

const GALLERY_ACCEPT =
  "image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif"

type TicketPhotoPickerProps = {
  pending: boolean
  onFile: (file: File | null) => void
  pendingLabel?: string
  /** Card with a title and hint; omit both for bare stacked buttons. */
  title?: string
  hint?: string
  /** Runs before a picker opens; return false to keep it closed. */
  beforePick?: () => boolean
  className?: string
}

export function TicketPhotoPicker({
  pending,
  onFile,
  pendingLabel = "Reading ticket…",
  title,
  hint,
  beforePick,
  className,
}: TicketPhotoPickerProps) {
  const cameraRef = useRef<HTMLInputElement>(null)
  const galleryRef = useRef<HTMLInputElement>(null)
  const framed = title != null

  function onPick(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null
    event.target.value = ""
    onFile(file)
  }

  function open(input: HTMLInputElement | null) {
    if (beforePick && !beforePick()) return
    input?.click()
  }

  const buttons = (
    <div
      className={cn(
        "grid gap-2",
        framed ? "mt-3 grid-cols-2" : "grid-cols-1",
        !framed && className
      )}
    >
      <button
        type="button"
        className="split-cta"
        disabled={pending}
        aria-busy={pending}
        onClick={() => open(cameraRef.current)}
      >
        <HugeiconsIcon icon={Camera01Icon} size={18} strokeWidth={2} />
        {pending && !framed ? pendingLabel : "Scan ticket"}
      </button>
      <button
        type="button"
        className="split-cta-tinted"
        disabled={pending}
        onClick={() => open(galleryRef.current)}
      >
        <HugeiconsIcon icon={ImageAdd01Icon} size={18} strokeWidth={2} />
        From gallery
      </button>
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        disabled={pending}
        data-testid="ticket-camera-input"
        onChange={onPick}
      />
      <input
        ref={galleryRef}
        type="file"
        accept={GALLERY_ACCEPT}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        disabled={pending}
        data-testid="ticket-gallery-input"
        onChange={onPick}
      />
    </div>
  )

  if (!framed) return buttons

  return (
    <div className={cn("surface p-3.5", className)}>
      <p className="text-[15px] font-semibold">
        {pending ? pendingLabel : title}
      </p>
      {hint ? (
        <p className="mt-0.5 text-[13px] text-muted-foreground">{hint}</p>
      ) : null}
      {buttons}
    </div>
  )
}
