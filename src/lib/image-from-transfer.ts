const IMAGE_NAME = /\.(jpe?g|png|webp|gif|heic|heif)$/i

export function isImageFile(file: File): boolean {
  return file.type.startsWith("image/") || IMAGE_NAME.test(file.name)
}

export function transferHasFiles(dataTransfer: DataTransfer | null): boolean {
  if (!dataTransfer) return false
  return Array.from(dataTransfer.types).includes("Files")
}

function filesFromList(list: DataTransfer["files"] | null | undefined): File[] {
  if (!list) return []
  return Array.from(list)
}

function filesFromItems(
  items: DataTransfer["items"] | null | undefined
): File[] {
  if (!items) return []
  const files: File[] = []
  for (const item of Array.from(items)) {
    if (item.kind !== "file") continue
    const file = item.getAsFile()
    if (file) files.push(file)
  }
  return files
}

/** First image in a drop or clipboard DataTransfer. */
export function imageFromTransfer(
  dataTransfer: DataTransfer | null | undefined
): File | null {
  if (!dataTransfer) return null
  const files = [
    ...filesFromList(dataTransfer.files),
    ...filesFromItems(dataTransfer.items),
  ]
  return files.find(isImageFile) ?? null
}

export function clipboardHasText(
  dataTransfer: DataTransfer | null | undefined
): boolean {
  if (!dataTransfer) return false
  try {
    return dataTransfer.getData("text/plain").trim().length > 0
  } catch {
    return false
  }
}

const NON_TYPING_INPUT = new Set([
  "button",
  "checkbox",
  "color",
  "file",
  "hidden",
  "image",
  "radio",
  "range",
  "reset",
  "submit",
])

export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  const tag = target.tagName
  if (tag === "TEXTAREA" || tag === "SELECT") return true
  if (tag !== "INPUT") return false
  return !NON_TYPING_INPUT.has((target as HTMLInputElement).type)
}
