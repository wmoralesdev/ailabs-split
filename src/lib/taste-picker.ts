/** Marks Taste picker popups so sheets do not dismiss when they are clicked. */
export const TASTE_PICKER_ATTR = "data-taste-picker"

export function isTastePickerTarget(target: EventTarget | null): boolean {
  return (
    target instanceof Element && Boolean(target.closest("[data-taste-picker]"))
  )
}

type TasteOpenChangeDetails = {
  reason: string
  event: Event
  cancel: () => void
}

/** Keep the popup open while typing; close on Escape or a real outside press. */
export function handleTastePickerOpenChange(
  next: boolean,
  details: TasteOpenChangeDetails,
  input: HTMLElement | null,
  setOpen: (open: boolean) => void,
  onClose?: () => void
) {
  if (!next) {
    if (details.reason === "focus-out") {
      details.cancel()
      return
    }
    const target = details.event.target
    if (
      details.reason === "outside-press" &&
      target instanceof Node &&
      (input?.contains(target) || isTastePickerTarget(target))
    ) {
      details.cancel()
      return
    }
  }
  setOpen(next)
  if (!next) onClose?.()
}
