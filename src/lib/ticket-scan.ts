import { compressImageForOcr } from "@/lib/compress-image"
import type { CompressedImage } from "@/lib/compress-image"
import type { OcrDraft } from "@/lib/receipt-ocr"
import { scanReceipt } from "@/server/ocr"

type PendingScan = {
  nameFromTicket: boolean
  result: Promise<OcrDraft>
}

const pendingScans = new Map<string, PendingScan>()

export function compressTicketNow(file: File): Promise<CompressedImage> {
  return compressImageForOcr(file)
}

/** Start OCR as soon as the compressed photo is ready; safe to call while navigating. */
export function startPendingDinnerScan(options: {
  code: string
  image: Promise<CompressedImage>
  nameFromTicket: boolean
}): Promise<OcrDraft> {
  const result = options.image.then((compressed) =>
    scanReceipt({
      data: {
        code: options.code,
        imageBase64: compressed.base64,
        mimeType: compressed.mimeType,
        mode: "dinner",
      },
    })
  )
  pendingScans.set(options.code.toUpperCase(), {
    nameFromTicket: options.nameFromTicket,
    result,
  })
  return result
}

export function hasPendingScan(code: string): boolean {
  return pendingScans.has(code.toUpperCase())
}

export function takePendingScan(code: string): PendingScan | null {
  const key = code.toUpperCase()
  const scan = pendingScans.get(key) ?? null
  pendingScans.delete(key)
  return scan
}
