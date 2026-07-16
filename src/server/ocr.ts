import { Mistral } from "@mistralai/mistralai"
import { createServerFn } from "@tanstack/react-start"
import { getRequestHeader } from "@tanstack/react-start/server"

import { prisma } from "@/lib/prisma"
import { assertRateLimit } from "@/lib/rate-limit"
import { normalizeRoomCode } from "@/lib/room-code"
import { parseAmountToCents } from "@/lib/settle"

export type OcrDraft = {
  title?: string
  amountCents?: number
  date?: string
  rawText?: string
}

const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
])

/** ~1MB binary ≈ 1.37MB base64 — keep OCR payloads small and cheap. */
const MAX_BASE64_CHARS = 1_400_000
const OCR_TIMEOUT_MS = 20_000

function extractDraft(markdown: string): OcrDraft {
  const lines = markdown
    .split(/\r?\n/)
    .map((line) => line.replace(/^[#>*\-\s]+/, "").trim())
    .filter(Boolean)

  let amountCents: number | undefined
  const amountPatterns = [
    /(?:total|amount|sum|importe|total\s*a\s*pagar)[^\d]{0,20}(\d+[.,]\d{2})/i,
    /\$\s*(\d+[.,]\d{2})/,
    /(\d+[.,]\d{2})\s*(?:USD|EUR|SVC)?/,
  ]

  for (const pattern of amountPatterns) {
    const match = markdown.match(pattern)
    if (match?.[1]) {
      const parsed = parseAmountToCents(match[1])
      if (parsed !== null && parsed > 0) {
        amountCents = parsed
        break
      }
    }
  }

  const dateMatch = markdown.match(
    /(\d{4}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}[-/]\d{1,2}[-/]\d{2,4})/
  )

  const title =
    lines.find(
      (line) =>
        line.length >= 3 &&
        line.length <= 48 &&
        !/\d+[.,]\d{2}/.test(line) &&
        !/total|subtotal|tax|iva/i.test(line)
    ) ?? lines[0]

  return {
    title,
    amountCents,
    date: dateMatch?.[1],
    rawText: markdown.slice(0, 2000),
  }
}

function clientKey(): string {
  const forwarded = getRequestHeader("x-forwarded-for")
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim()
    if (first) return first
  }
  const realIp = getRequestHeader("x-real-ip")
  if (realIp) return realIp
  return "unknown"
}

async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  message: string
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), ms)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

export const scanReceipt = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    if (typeof data !== "object" || data === null) {
      throw new Error("Invalid payload")
    }
    const body = data as Record<string, unknown>
    const code = normalizeRoomCode(
      typeof body.code === "string" ? body.code : ""
    )
    if (code.length < 6 || code.length > 8) {
      throw new Error("Room code is required for OCR")
    }

    const imageBase64 = body.imageBase64
    const mimeTypeRaw =
      typeof body.mimeType === "string" && body.mimeType.trim()
        ? body.mimeType.trim().toLowerCase()
        : "image/jpeg"
    const mimeType = mimeTypeRaw === "image/jpg" ? "image/jpeg" : mimeTypeRaw

    if (!ALLOWED_MIME.has(mimeType)) {
      throw new Error("Unsupported image type. Use JPEG, PNG, or WebP.")
    }
    if (typeof imageBase64 !== "string" || imageBase64.length < 32) {
      throw new Error("Image data is required")
    }
    if (imageBase64.length > MAX_BASE64_CHARS) {
      throw new Error("Image is too large (max ~1MB). Try a clearer crop.")
    }
    // Reject obvious non-base64 payloads early.
    if (!/^[A-Za-z0-9+/=\s]+$/.test(imageBase64.slice(0, 200))) {
      throw new Error("Invalid image encoding")
    }

    return { code, imageBase64, mimeType }
  })
  .handler(async ({ data }): Promise<OcrDraft> => {
    const apiKey = process.env.MISTRAL_API_KEY
    if (!apiKey) {
      throw new Error("MISTRAL_API_KEY is not configured")
    }

    const ip = clientKey()
    assertRateLimit(`ocr:ip:${ip}`, {
      limit: 8,
      windowMs: 60_000,
      label: "receipt scans",
    })
    assertRateLimit(`ocr:room:${data.code}`, {
      limit: 20,
      windowMs: 60_000,
      label: "receipt scans for this room",
    })

    // Prove the room exists before spending Mistral credits.
    const room = await prisma.room.findUnique({
      where: { code: data.code },
      select: { id: true },
    })
    if (!room) {
      throw new Error("Room not found")
    }

    const client = new Mistral({ apiKey })
    const result = await withTimeout(
      client.ocr.process({
        model: "mistral-ocr-latest",
        document: {
          type: "image_url",
          imageUrl: `data:${data.mimeType};base64,${data.imageBase64}`,
        },
      }),
      OCR_TIMEOUT_MS,
      "Receipt scan timed out. Try again with a smaller image."
    )

    const markdown = result.pages
      .map((page) => page.markdown)
      .join("\n")
      .trim()

    if (!markdown) {
      return { rawText: "" }
    }

    return extractDraft(markdown)
  })
