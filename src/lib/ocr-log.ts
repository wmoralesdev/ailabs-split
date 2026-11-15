/** Structured OCR timing logs. Scan volume is low; keep these always on. */

const PREFIX = "[ocr]"

export function ocrNow(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now()
}

export function ocrMs(startedAt: number): number {
  return Math.round(ocrNow() - startedAt)
}

export function ocrLog(stage: string, data?: Record<string, unknown>): void {
  if (data && Object.keys(data).length > 0) {
    console.info(PREFIX, stage, data)
    return
  }
  console.info(PREFIX, stage)
}

export function ocrErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export async function withOcrTiming<T>(
  stage: string,
  data: Record<string, unknown>,
  run: () => Promise<T>
): Promise<T> {
  const startedAt = ocrNow()
  ocrLog(`${stage}:start`, data)
  try {
    const result = await run()
    ocrLog(`${stage}:done`, { ...data, ms: ocrMs(startedAt) })
    return result
  } catch (error) {
    ocrLog(`${stage}:error`, {
      ...data,
      ms: ocrMs(startedAt),
      message: ocrErrorMessage(error),
    })
    throw error
  }
}

type OcrImageMeta = {
  width: number
  height: number
  bytesApprox: number
}

/** Client: compress wait + server round-trip. `ms` on ticket:done is "read a ticket". */
export async function runClientTicketOcr<
  TImage extends OcrImageMeta,
  T,
>(options: {
  kind: string
  sourceBytes?: number
  image: Promise<TImage>
  scan: (image: TImage) => Promise<T>
}): Promise<T> {
  const startedAt = ocrNow()
  ocrLog("client:ticket:start", {
    kind: options.kind,
    sourceBytes: options.sourceBytes,
  })
  try {
    const image = await options.image
    const imageKb = Math.round(image.bytesApprox / 1024)
    const draft = await withOcrTiming(
      "client:scan",
      {
        kind: options.kind,
        imageKb,
        width: image.width,
        height: image.height,
      },
      () => options.scan(image)
    )
    ocrLog("client:ticket:done", {
      kind: options.kind,
      ms: ocrMs(startedAt),
      imageKb,
    })
    return draft
  } catch (error) {
    ocrLog("client:ticket:error", {
      kind: options.kind,
      ms: ocrMs(startedAt),
      message: ocrErrorMessage(error),
    })
    throw error
  }
}
