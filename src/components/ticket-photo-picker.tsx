import { useRef, useState } from "react"
import type { ChangeEvent, DragEvent } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { Camera01Icon, ImageAdd01Icon } from "@hugeicons/core-free-icons"

import { Spinner } from "@/components/ui/spinner"
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
  /** Runs before a picker opens or a drop is accepted; return false to keep it closed. */
  beforePick?: () => boolean
  className?: string
}

function transferHasFiles(dataTransfer: DataTransfer | null): boolean {
  if (!dataTransfer) return false
  return Array.from(dataTransfer.types).includes("Files")
}

function imageFromTransfer(dataTransfer: DataTransfer | null): File | null {
  if (!dataTransfer) return null
  const files = Array.from(dataTransfer.files)
  return (
    files.find(
      (file) =>
        file.type.startsWith("image/") ||
        /\.(jpe?g|png|webp|gif|heic|heif)$/i.test(file.name)
    ) ?? null
  )
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
  const dragCount = useRef(0)
  const [dropping, setDropping] = useState(false)
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

  function onDragEnter(event: DragEvent<HTMLDivElement>) {
    if (!transferHasFiles(event.dataTransfer) || pending) return
    event.preventDefault()
    dragCount.current += 1
    setDropping(true)
  }

  function onDragOver(event: DragEvent<HTMLDivElement>) {
    if (!transferHasFiles(event.dataTransfer)) return
    event.preventDefault()
    event.dataTransfer.dropEffect = pending ? "none" : "copy"
  }

  function onDragLeave(event: DragEvent<HTMLDivElement>) {
    if (!transferHasFiles(event.dataTransfer)) return
    dragCount.current = Math.max(0, dragCount.current - 1)
    if (dragCount.current === 0) setDropping(false)
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    dragCount.current = 0
    setDropping(false)
    if (pending) return
    if (beforePick && !beforePick()) return
    const file = imageFromTransfer(event.dataTransfer)
    if (file) onFile(file)
  }

  const buttons = (
    <div
      className={cn("grid gap-2", framed ? "mt-3 grid-cols-2" : "grid-cols-1")}
    >
      <button
        type="button"
        className="split-cta"
        disabled={pending}
        aria-busy={pending}
        onClick={() => open(cameraRef.current)}
      >
        {pending ? (
          <Spinner />
        ) : (
          <HugeiconsIcon icon={Camera01Icon} size={18} strokeWidth={2} />
        )}
        {pending && !framed ? pendingLabel : "Scan ticket"}
      </button>
      <button
        type="button"
        className="split-cta-tinted"
        disabled={pending}
        onClick={() => open(galleryRef.current)}
      >
        {pending && framed ? (
          <Spinner />
        ) : (
          <HugeiconsIcon icon={ImageAdd01Icon} size={18} strokeWidth={2} />
        )}
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

  const zone = (
    <div
      data-testid="ticket-drop-zone"
      data-dropping={dropping ? "true" : undefined}
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={cn(
        "relative rounded-2xl transition-[border-color,background-color,box-shadow] duration-200",
        "[@media(hover:hover)_and_(pointer:fine)]:border [@media(hover:hover)_and_(pointer:fine)]:border-dashed [@media(hover:hover)_and_(pointer:fine)]:border-border [@media(hover:hover)_and_(pointer:fine)]:p-3",
        dropping &&
          "border border-dashed border-primary bg-accent/70 shadow-[inset_0_0_0_1px] shadow-primary/30",
        !framed && className
      )}
    >
      {framed ? (
        <>
          <p className="flex items-center gap-2 text-[15px] font-semibold">
            {pending ? <Spinner /> : null}
            {pending ? pendingLabel : title}
          </p>
          {hint ? (
            <p className="mt-0.5 text-[13px] text-muted-foreground">{hint}</p>
          ) : null}
        </>
      ) : null}
      {buttons}
      {dropping ? null : (
        <p className="mt-2 hidden text-center text-[13px] text-muted-foreground [@media(hover:hover)_and_(pointer:fine)]:block">
          Or drop a ticket photo
        </p>
      )}
      {dropping ? (
        <div
          className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-2xl bg-card text-[15px] font-semibold text-foreground"
          aria-hidden
        >
          Drop ticket photo
        </div>
      ) : null}
    </div>
  )

  if (!framed) return zone

  return <div className={cn("surface p-3.5", className)}>{zone}</div>
}
