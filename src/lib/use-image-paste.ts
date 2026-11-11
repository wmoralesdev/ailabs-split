import { useEffect, useRef } from "react"

import {
  clipboardHasText,
  imageFromTransfer,
  isTypingTarget,
} from "@/lib/image-from-transfer"

type UseImagePasteOptions = {
  enabled: boolean
  onImage: (file: File) => void
}

/**
 * While enabled (surface visible), Ctrl/Cmd+V with a clipboard image
 * calls onImage the same way a drop would. Text paste into fields is left alone.
 */
export function useImagePaste({ enabled, onImage }: UseImagePasteOptions) {
  const onImageRef = useRef(onImage)
  onImageRef.current = onImage

  useEffect(() => {
    if (!enabled) return

    function onPaste(event: ClipboardEvent) {
      if (event.defaultPrevented) return
      const file = imageFromTransfer(event.clipboardData)
      if (!file) return
      if (
        isTypingTarget(event.target) &&
        clipboardHasText(event.clipboardData)
      ) {
        return
      }
      event.preventDefault()
      onImageRef.current(file)
    }

    window.addEventListener("paste", onPaste)
    return () => window.removeEventListener("paste", onPaste)
  }, [enabled])
}
