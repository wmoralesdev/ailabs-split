export type CompressedImage = {
  base64: string
  mimeType: "image/jpeg"
  width: number
  height: number
  bytesApprox: number
}

type CompressOptions = {
  maxEdge: number
  targetBytes: number
  quality: number
}

/** Long edge for vision: enough for ticket type, small enough to upload fast. */
const OCR_COMPRESS: CompressOptions = {
  maxEdge: 1280,
  targetBytes: 480_000,
  quality: 0.74,
}

/** Transfer screenshots: keep digits readable, still under the ~1MB payload cap. */
const PROOF_COMPRESS: CompressOptions = {
  maxEdge: 1600,
  targetBytes: 520_000,
  quality: 0.82,
}

const MAX_SOURCE_BYTES = 25 * 1024 * 1024

function yieldToPaint(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => resolve())
      return
    }
    setTimeout(resolve, 0)
  })
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      URL.revokeObjectURL(url)
      resolve(image)
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(
        new Error(
          "Could not read that photo. Try JPEG/PNG, or take a new picture."
        )
      )
    }
    image.src = url
  })
}

async function rasterize(file: File, maxEdge: number): Promise<ImageBitmap> {
  let source: ImageBitmap
  try {
    source = await createImageBitmap(file)
  } catch {
    const image = await loadImage(file)
    source = await createImageBitmap(image)
  }

  const scale = Math.min(1, maxEdge / Math.max(source.width, source.height))
  const width = Math.max(1, Math.round(source.width * scale))
  const height = Math.max(1, Math.round(source.height * scale))
  if (width === source.width && height === source.height) return source

  const resized = await createImageBitmap(source, {
    resizeWidth: width,
    resizeHeight: height,
    resizeQuality: "high",
  })
  source.close()
  return resized
}

function canvasToJpegBlob(
  canvas: HTMLCanvasElement,
  quality: number
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Could not compress image"))
          return
        }
        resolve(blob)
      },
      "image/jpeg",
      quality
    )
  })
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer()
  const bytes = new Uint8Array(buffer)
  let binary = ""
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

async function compressImage(
  file: File,
  options: CompressOptions
): Promise<CompressedImage> {
  if (!file.type.startsWith("image/") && file.type !== "") {
    throw new Error("Pick an image file (JPEG, PNG, or WebP)")
  }
  if (file.size > MAX_SOURCE_BYTES) {
    throw new Error("Photo is too large (max 25MB). Take a closer shot.")
  }

  await yieldToPaint()

  const bitmap = await rasterize(file, options.maxEdge)
  const width = bitmap.width
  const height = bitmap.height

  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext("2d")
  if (!ctx) {
    bitmap.close()
    throw new Error("Could not compress image")
  }

  ctx.fillStyle = "#ffffff"
  ctx.fillRect(0, 0, width, height)
  ctx.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()

  let quality = options.quality
  let blob = await canvasToJpegBlob(canvas, quality)
  const targetBytes = options.targetBytes

  while (blob.size > targetBytes && quality > 0.45) {
    quality -= 0.1
    blob = await canvasToJpegBlob(canvas, quality)
  }

  if (blob.size > targetBytes) {
    const shrink = 0.75
    canvas.width = Math.max(1, Math.round(width * shrink))
    canvas.height = Math.max(1, Math.round(height * shrink))
    ctx.fillStyle = "#ffffff"
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    const image = await loadImage(file)
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
    quality = Math.min(0.68, options.quality)
    blob = await canvasToJpegBlob(canvas, quality)
    while (blob.size > targetBytes && quality > 0.4) {
      quality -= 0.1
      blob = await canvasToJpegBlob(canvas, quality)
    }
  }

  if (blob.size > targetBytes) {
    throw new Error("Could not compress photo enough. Try a closer crop.")
  }

  const base64 = await blobToBase64(blob)
  return {
    base64,
    mimeType: "image/jpeg",
    width: canvas.width,
    height: canvas.height,
    bytesApprox: blob.size,
  }
}

/**
 * Resize + JPEG-compress a phone photo in the browser before OCR upload.
 * Handles typical iPhone sizes (~8–12MB) without shipping a heavy library.
 */
export function compressImageForOcr(file: File): Promise<CompressedImage> {
  return compressImage(file, OCR_COMPRESS)
}

/** Same pipeline as OCR, slightly sharper so transfer amounts stay readable. */
export function compressImageForProof(file: File): Promise<CompressedImage> {
  return compressImage(file, PROOF_COMPRESS)
}
