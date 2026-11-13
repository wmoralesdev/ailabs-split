import { useRef, useState } from "react"
import type { ChangeEvent, DragEvent } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { Camera01Icon, ImageAdd01Icon } from "@hugeicons/core-free-icons"

import { Spinner } from "@/components/ui/spinner"
import { imageFromTransfer, transferHasFiles } from "@/lib/image-from-transfer"
import { useImagePaste } from "@/lib/use-image-paste"
import { cn } from "@/lib/utils"

const GALLERY_ACCEPT =
  "image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif"

type TicketPhotoPickerProps = {
  pending: boolean
  onFile: (file: File | null) => void
  pendingLabel?: string
  actionLabel?: string
  dropHint?: string
  dropOverlay?: string
  /** Field label above one inline button row; omit for bare stacked buttons. */
  title?: string
  hint?: string
  /** Runs before a picker opens or a drop is accepted; return false to keep it closed. */
  beforePick?: () => boolean
  className?: string
}

export function TicketPhotoPicker({
  pending,
  onFile,
  pendingLabel = "Reading ticket…",
  actionLabel = "Scan ticket",
  dropHint = "Or drop or paste a ticket photo",
  dropOverlay = "Drop ticket photo",
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

  function accept(file: File | null) {
    if (!file) return
    if (pending) return
    if (beforePick && !beforePick()) return
    onFile(file)
  }

  useImagePaste({
    enabled: !pending,
    onImage: (file) => accept(file),
  })

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
    accept(imageFromTransfer(event.dataTransfer))
  }

  const inlineButton = "min-w-0 flex-1 gap-1.5 px-3 whitespace-nowrap"

  const buttons = (
    <div className={framed ? "flex gap-2" : "grid grid-cols-1 gap-2"}>
      <button
        type="button"
        className={cn("split-cta", framed && inlineButton)}
        disabled={pending}
        aria-busy={pending}
        onClick={() => open(cameraRef.current)}
      >
        {pending ? (
          <Spinner />
        ) : (
          <HugeiconsIcon
            icon={Camera01Icon}
            size={18}
            strokeWidth={2}
            className="shrink-0"
          />
        )}
        <span className="truncate">
          {pending && !framed ? pendingLabel : actionLabel}
        </span>
      </button>
      <button
        type="button"
        className={cn("split-cta-tinted", framed && inlineButton)}
        disabled={pending}
        onClick={() => open(galleryRef.current)}
      >
        <HugeiconsIcon
          icon={ImageAdd01Icon}
          size={18}
          strokeWidth={2}
          className="shrink-0"
        />
        <span className="truncate">From gallery</span>
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

  return (
    <div
      data-testid="ticket-drop-zone"
      data-dropping={dropping ? "true" : undefined}
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={cn(
        "relative rounded-2xl transition-[border-color,background-color,box-shadow] duration-200",
        framed
          ? "flex flex-col gap-2"
          : "[@media(hover:hover)_and_(pointer:fine)]:border [@media(hover:hover)_and_(pointer:fine)]:border-dashed [@media(hover:hover)_and_(pointer:fine)]:border-border [@media(hover:hover)_and_(pointer:fine)]:p-3",
        dropping &&
          "border border-dashed border-primary bg-accent/70 shadow-[inset_0_0_0_1px] shadow-primary/30",
        className
      )}
    >
      {framed ? (
        <p className="flex min-h-4 items-center gap-2 text-[13px] leading-none font-medium text-muted-foreground">
          {pending ? <Spinner className="size-3.5" /> : null}
          {pending ? pendingLabel : title}
        </p>
      ) : null}
      {buttons}
      {framed && hint ? (
        <p
          className={
            "text-[13px] text-muted-foreground [@media(hover:hover)_and_(pointer:fine)]:hidden"
          }
        >
          {hint}
        </p>
      ) : null}
      {dropping ? null : (
        <p
          className={cn(
            "hidden text-[13px] text-muted-foreground [@media(hover:hover)_and_(pointer:fine)]:block",
            !framed && "mt-2 text-center"
          )}
        >
          {dropHint}
        </p>
      )}
      {dropping ? (
        <div
          className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-2xl bg-card text-[15px] font-semibold text-foreground"
          aria-hidden
        >
          {dropOverlay}
        </div>
      ) : null}
    </div>
  )
}
