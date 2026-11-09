import { useRef, type ChangeEvent } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { Camera01Icon, ImageAdd01Icon } from "@hugeicons/core-free-icons"

const GALLERY_ACCEPT =
  "image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif"

type TicketPhotoPickerProps = {
  pending: boolean
  onFile: (file: File | null) => void
  pendingLabel?: string
  title?: string
  hint?: string
}

export function TicketPhotoPicker({
  pending,
  onFile,
  pendingLabel = "Reading ticket…",
  title = "Add the ticket",
  hint = "Take a photo or pick one from your gallery. Or type the items in below.",
}: TicketPhotoPickerProps) {
  const cameraRef = useRef<HTMLInputElement>(null)
  const galleryRef = useRef<HTMLInputElement>(null)

  function onPick(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null
    event.target.value = ""
    onFile(file)
  }

  return (
    <div className="surface p-3.5">
      <p className="text-[15px] font-semibold">
        {pending ? pendingLabel : title}
      </p>
      <p className="mt-0.5 text-[13px] text-muted-foreground">{hint}</p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          type="button"
          className="split-cta"
          disabled={pending}
          onClick={() => cameraRef.current?.click()}
        >
          <HugeiconsIcon icon={Camera01Icon} size={16} strokeWidth={2} />
          Take photo
        </button>
        <button
          type="button"
          className="split-cta-tinted"
          disabled={pending}
          onClick={() => galleryRef.current?.click()}
        >
          <HugeiconsIcon icon={ImageAdd01Icon} size={16} strokeWidth={2} />
          From gallery
        </button>
      </div>
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        disabled={pending}
        data-testid="ticket-camera-input"
        onChange={onPick}
      />
      <input
        ref={galleryRef}
        type="file"
        accept={GALLERY_ACCEPT}
        className="sr-only"
        disabled={pending}
        data-testid="ticket-gallery-input"
        onChange={onPick}
      />
    </div>
  )
}
