export type CompressedImage = {
  base64: string
  mimeType: "image/jpeg"
  width: number
  height: number
  bytesApprox: number
}

/** Long edge for vision: enough for ticket type, small enough to upload fast. */
const MAX_EDGE = 1280
/** Keep well under the server OCR base64 cap (~1.4M chars ≈ 1MB binary). */
const TARGET_BYTES = 480_000
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

async function rasterize(file: File): Promise<ImageBitmap> {
  let source: ImageBitmap
  try {
    source = await createImageBitmap(file)
  } catch {
    const image = await loadImage(file)
    source = await createImageBitmap(image)
  }

  const scale = Math.min(1, MAX_EDGE / Math.max(source.width, source.height))
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

/**
 * Resize + JPEG-compress a phone photo in the browser before OCR upload.
 * Handles typical iPhone sizes (~8–12MB) without shipping a heavy library.
 */
export async function compressImageForOcr(
  file: File
): Promise<CompressedImage> {
  if (!file.type.startsWith("image/") && file.type !== "") {
    throw new Error("Pick an image file (JPEG, PNG, or WebP)")
  }
  if (file.size > MAX_SOURCE_BYTES) {
    throw new Error("Photo is too large (max 25MB). Take a closer shot.")
  }

  await yieldToPaint()

  const bitmap = await rasterize(file)
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

  let quality = 0.74
  let blob = await canvasToJpegBlob(canvas, quality)

  while (blob.size > TARGET_BYTES && quality > 0.45) {
    quality -= 0.1
    blob = await canvasToJpegBlob(canvas, quality)
  }

  if (blob.size > TARGET_BYTES) {
    const shrink = 0.75
    canvas.width = Math.max(1, Math.round(width * shrink))
    canvas.height = Math.max(1, Math.round(height * shrink))
    ctx.fillStyle = "#ffffff"
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    const image = await loadImage(file)
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
    quality = 0.68
    blob = await canvasToJpegBlob(canvas, quality)
    while (blob.size > TARGET_BYTES && quality > 0.4) {
      quality -= 0.1
      blob = await canvasToJpegBlob(canvas, quality)
    }
  }

  if (blob.size > TARGET_BYTES) {
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
