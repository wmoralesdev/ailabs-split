import { createServerFn } from "@tanstack/react-start"
import { getRequestHeader } from "@tanstack/react-start/server"
import {
  APIConnectionTimeoutError,
  APIError,
  AuthenticationError,
  OpenAI,
  RateLimitError,
} from "openai"
import { zodTextFormat } from "openai/helpers/zod"

import { requireSignedInUserId } from "@/server/auth-user.server"
import {
  RECEIPT_VISION_INSTRUCTIONS,
  draftFromExtract,
  parseReceiptExtract,
  receiptExtractSchema,
} from "@/lib/ocr-schema"
import type { OcrScanMode } from "@/lib/ocr-schema"
import { prisma } from "@/lib/prisma"
import { assertRateLimit } from "@/lib/rate-limit"
import { extractCheckDraft } from "@/lib/receipt-ocr"
import type { OcrDraft } from "@/lib/receipt-ocr"
import {
  CELESTE_IMPERIO_MD,
  PASTARIA_MESA_M11_MD,
} from "@/lib/receipt-ocr-fixtures"
import { normalizeRoomCode } from "@/lib/room-code"

const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
])

/** ~1MB binary ≈ 1.37MB base64 — keep OCR payloads small and cheap. */
const MAX_BASE64_CHARS = 1_400_000
const OCR_TIMEOUT_MS = 45_000
const OCR_VISION_MODEL = "gpt-5-mini"
const OCR_MAX_OUTPUT_TOKENS = 16_384

async function claimRoomOwnerIfOpen(code: string, userId: string) {
  await prisma.room.updateMany({
    where: { code, ownerUserId: null },
    data: { ownerUserId: userId },
  })
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

/** Local and e2e stand-in for the vision call; reachable when OCR_FIXTURE=1. */
function fixtureMarkdown(): string {
  const requested = getRequestHeader("x-ocr-fixture")?.trim().toLowerCase()
  if (requested === "pastaria" || process.env.OCR_FIXTURE === "pastaria") {
    return PASTARIA_MESA_M11_MD
  }
  return CELESTE_IMPERIO_MD
}

function fixtureDraft(mode: OcrScanMode): OcrDraft {
  const check = extractCheckDraft(fixtureMarkdown())
  switch (mode) {
    case "trip":
      return {
        title: check.merchant,
        amountCents: check.totalCents,
        rawText: check.rawText,
      }
    case "dinner":
      return { title: check.merchant, rawText: check.rawText, check }
    default: {
      const _exhaustive: never = mode
      return _exhaustive
    }
  }
}

function ocrErrorMessage(error: unknown): string {
  if (error instanceof AuthenticationError) {
    return "OPENAI_API_KEY is invalid"
  }
  if (error instanceof RateLimitError) {
    return "Too many receipt scans. Try again in a minute."
  }
  if (error instanceof APIConnectionTimeoutError) {
    return "Receipt scan timed out. Try again with a smaller image."
  }
  if (error instanceof APIError && error.status === 400) {
    return "Could not read that photo. Try a clearer crop."
  }
  if (error instanceof Error && error.message) {
    return error.message
  }
  return "Could not read ticket"
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
      throw new Error("Trip code is required for OCR")
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

    const mode: OcrScanMode = body.mode === "dinner" ? "dinner" : "trip"

    return { code, imageBase64, mimeType, mode }
  })
  .handler(async ({ data }): Promise<OcrDraft> => {
    const userId = await requireSignedInUserId()
    assertRateLimit(`ocr:user:${userId}`, {
      limit: 8,
      windowMs: 60_000,
      label: "receipt scans",
    })

    if (process.env.OCR_FIXTURE === "1") {
      await claimRoomOwnerIfOpen(data.code, userId)
      return fixtureDraft(data.mode)
    }

    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY is not configured")
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
      label: "receipt scans for this trip",
    })

    // Prove the room exists before spending OpenAI credits.
    const room = await prisma.room.findUnique({
      where: { code: data.code },
      select: { id: true },
    })
    if (!room) {
      throw new Error("Trip not found")
    }
    await claimRoomOwnerIfOpen(data.code, userId)

    const client = new OpenAI({ apiKey, timeout: OCR_TIMEOUT_MS })
    try {
      const response = await withTimeout(
        client.responses.parse({
          model: OCR_VISION_MODEL,
          reasoning: { effort: "low" },
          max_output_tokens: OCR_MAX_OUTPUT_TOKENS,
          instructions: RECEIPT_VISION_INSTRUCTIONS,
          input: [
            {
              role: "user",
              content: [
                {
                  type: "input_text",
                  text:
                    data.mode === "dinner"
                      ? "Extract this restaurant ticket. Include every item through the last row above Subtotal, including $0.00 AYCE and small extras such as pan."
                      : "Extract merchant, date, and payable total from this receipt.",
                },
                {
                  type: "input_image",
                  detail: "high",
                  image_url: `data:${data.mimeType};base64,${data.imageBase64}`,
                },
              ],
            },
          ],
          text: {
            format: zodTextFormat(receiptExtractSchema, "receipt_extract"),
          },
        }),
        OCR_TIMEOUT_MS,
        "Receipt scan timed out. Try again with a smaller image."
      )

      const extracted =
        response.output_parsed ?? parseReceiptExtract(response.output_text)
      if (!extracted) {
        return { rawText: "" }
      }
      return draftFromExtract(extracted, data.mode)
    } catch (error) {
      throw new Error(ocrErrorMessage(error))
    }
  })
