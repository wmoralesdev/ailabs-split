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
import { assertHostDinnerEdit } from "@/lib/dinner-bill"
import { resolveHouseViewer } from "@/lib/house-actor"
import {
  canAddCharge,
  guestsCantAddChargesMessage,
} from "@/lib/house-permissions"
import {
  HOUSE_RECEIPT_VISION_INSTRUCTIONS,
  draftFromHouseExtract,
  fixtureHouseExtract,
  houseReceiptExtractSchema,
  parseHouseReceiptExtract,
} from "@/lib/house-receipt-ocr"
import type { HouseScanDraft } from "@/lib/house-receipt-ocr"
import { ocrLog, ocrMs, ocrNow } from "@/lib/ocr-log"
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
import { assertNotHousehold, parseRoomKind } from "@/lib/room-kind"

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
/**
 * Vision took ~21 s on `low`; `minimal` cuts hidden reasoning. `OCR_REASONING_EFFORT`
 * overrides it so `minimal` vs `low` can be compared on the same ticket.
 */
const OCR_REASONING_EFFORT: "minimal" | "low" =
  process.env.OCR_REASONING_EFFORT === "low" ? "low" : "minimal"

async function claimRoomOwnerIfOpen(code: string, userId: string) {
  await prisma.room.updateMany({
    where: { code, ownerUserId: null },
    data: { ownerUserId: userId },
  })
}

async function assertCanScanRoom(code: string, userId: string) {
  const room = await prisma.room.findUnique({
    where: { code },
    select: { id: true, kind: true, ownerUserId: true },
  })
  if (!room) {
    throw new Error("Trip not found")
  }
  assertNotHousehold(room.kind)
  assertHostDinnerEdit(room, userId)
  return room
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

function imageKb(imageBase64: string): number {
  return Math.round((imageBase64.length * 3) / 4 / 1024)
}

function visionUsage(response: {
  usage?: {
    input_tokens?: number
    output_tokens?: number
    output_tokens_details?: { reasoning_tokens?: number }
    total_tokens?: number
  }
  status?: string
}): Record<string, unknown> {
  const usage = response.usage
  return {
    status: response.status,
    inputTokens: usage?.input_tokens,
    outputTokens: usage?.output_tokens,
    reasoningTokens: usage?.output_tokens_details?.reasoning_tokens,
    totalTokens: usage?.total_tokens,
  }
}

function ocrErrorMessage(
  error: unknown,
  fallback = "Could not read ticket"
): string {
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
  return fallback
}

function parseOcrImagePayload(
  data: unknown,
  codeRequired: string
): { code: string; imageBase64: string; mimeType: string } {
  if (typeof data !== "object" || data === null) {
    throw new Error("Invalid payload")
  }
  const body = data as Record<string, unknown>
  const code = normalizeRoomCode(typeof body.code === "string" ? body.code : "")
  if (code.length < 6 || code.length > 8) {
    throw new Error(codeRequired)
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
  if (!/^[A-Za-z0-9+/=\s]+$/.test(imageBase64.slice(0, 200))) {
    throw new Error("Invalid image encoding")
  }

  return { code, imageBase64, mimeType }
}

async function assertCanScanHouse(code: string, userId: string) {
  const room = await prisma.room.findUnique({
    where: { code },
    select: {
      kind: true,
      ownerUserId: true,
      members: {
        select: {
          id: true,
          name: true,
          userId: true,
          isGuest: true,
          joinedOn: true,
          leftOn: true,
        },
      },
    },
  })
  if (!room || parseRoomKind(room.kind) !== "HOUSEHOLD") {
    throw new Error("House not found")
  }
  const viewer = resolveHouseViewer({
    ownerUserId: room.ownerUserId,
    members: room.members,
    authUserId: userId,
  })
  if (!canAddCharge(viewer.role)) {
    throw new Error(guestsCantAddChargesMessage())
  }
}

function houseFixtureKind(): "utility" | "grocery" {
  const requested = getRequestHeader("x-ocr-fixture")?.trim().toLowerCase()
  return requested === "grocery" ? "grocery" : "utility"
}

export const scanReceipt = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    const parsed = parseOcrImagePayload(data, "Trip code is required for OCR")
    const body = data as Record<string, unknown>
    const mode: OcrScanMode = body.mode === "dinner" ? "dinner" : "trip"
    return { ...parsed, mode }
  })
  .handler(async ({ data }): Promise<OcrDraft> => {
    const startedAt = ocrNow()
    const kind = data.mode
    const meta = {
      kind,
      mime: data.mimeType,
      imageKb: imageKb(data.imageBase64),
    }
    ocrLog("scan:start", {
      ...meta,
      fixture: process.env.OCR_FIXTURE === "1",
      model: OCR_VISION_MODEL,
    })
    try {
      const userId = await requireSignedInUserId()
      assertRateLimit(`ocr:user:${userId}`, {
        limit: 8,
        windowMs: 60_000,
        label: "receipt scans",
      })

      if (process.env.OCR_FIXTURE === "1") {
        await assertCanScanRoom(data.code, userId)
        await claimRoomOwnerIfOpen(data.code, userId)
        const draft = fixtureDraft(data.mode)
        ocrLog("scan:done", {
          ...meta,
          fixture: true,
          totalMs: ocrMs(startedAt),
        })
        return draft
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
      await assertCanScanRoom(data.code, userId)
      await claimRoomOwnerIfOpen(data.code, userId)

      const client = new OpenAI({ apiKey, timeout: OCR_TIMEOUT_MS })
      const visionStartedAt = ocrNow()
      ocrLog("scan:vision:start", {
        ...meta,
        model: OCR_VISION_MODEL,
        effort: OCR_REASONING_EFFORT,
        setupMs: ocrMs(startedAt),
        timeoutMs: OCR_TIMEOUT_MS,
      })
      const response = await withTimeout(
        client.responses.parse({
          model: OCR_VISION_MODEL,
          reasoning: { effort: OCR_REASONING_EFFORT },
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
      const visionMs = ocrMs(visionStartedAt)

      const extracted =
        response.output_parsed ?? parseReceiptExtract(response.output_text)
      if (!extracted) {
        ocrLog("scan:done", {
          ...meta,
          totalMs: ocrMs(startedAt),
          visionMs,
          empty: true,
          parsed: Boolean(response.output_parsed),
          ...visionUsage(response),
        })
        return { rawText: "" }
      }
      const draft = draftFromExtract(extracted, data.mode)
      ocrLog("scan:done", {
        ...meta,
        totalMs: ocrMs(startedAt),
        visionMs,
        parsed: Boolean(response.output_parsed),
        items: extracted.items.length,
        merchant: extracted.merchant,
        totalCents: extracted.totalCents,
        rawTextChars: extracted.rawText.length,
        ...visionUsage(response),
      })
      return draft
    } catch (error) {
      ocrLog("scan:error", {
        ...meta,
        totalMs: ocrMs(startedAt),
        message: error instanceof Error ? error.message : String(error),
      })
      throw new Error(ocrErrorMessage(error))
    }
  })

export const scanHouseReceipt = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    parseOcrImagePayload(data, "House code is required for OCR")
  )
  .handler(async ({ data }): Promise<HouseScanDraft> => {
    const startedAt = ocrNow()
    const kind = "house"
    const meta = {
      kind,
      mime: data.mimeType,
      imageKb: imageKb(data.imageBase64),
    }
    ocrLog("scan:start", {
      ...meta,
      fixture: process.env.OCR_FIXTURE === "1",
      model: OCR_VISION_MODEL,
    })
    try {
      const userId = await requireSignedInUserId()
      assertRateLimit(`ocr:user:${userId}`, {
        limit: 8,
        windowMs: 60_000,
        label: "receipt scans",
      })

      if (process.env.OCR_FIXTURE === "1") {
        await assertCanScanHouse(data.code, userId)
        const draft = draftFromHouseExtract(
          fixtureHouseExtract(houseFixtureKind())
        )
        ocrLog("scan:done", {
          ...meta,
          fixture: true,
          totalMs: ocrMs(startedAt),
        })
        return draft
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
      assertRateLimit(`ocr:house:${data.code}`, {
        limit: 20,
        windowMs: 60_000,
        label: "receipt scans for this house",
      })

      await assertCanScanHouse(data.code, userId)

      const client = new OpenAI({ apiKey, timeout: OCR_TIMEOUT_MS })
      const visionStartedAt = ocrNow()
      ocrLog("scan:vision:start", {
        ...meta,
        model: OCR_VISION_MODEL,
        effort: OCR_REASONING_EFFORT,
        setupMs: ocrMs(startedAt),
        timeoutMs: OCR_TIMEOUT_MS,
      })
      const response = await withTimeout(
        client.responses.parse({
          model: OCR_VISION_MODEL,
          reasoning: { effort: OCR_REASONING_EFFORT },
          max_output_tokens: OCR_MAX_OUTPUT_TOKENS,
          instructions: HOUSE_RECEIPT_VISION_INSTRUCTIONS,
          input: [
            {
              role: "user",
              content: [
                {
                  type: "input_text",
                  text: "Extract this household utility bill or grocery ticket.",
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
            format: zodTextFormat(
              houseReceiptExtractSchema,
              "house_receipt_extract"
            ),
          },
        }),
        OCR_TIMEOUT_MS,
        "Receipt scan timed out. Try again with a smaller image."
      )
      const visionMs = ocrMs(visionStartedAt)

      const extracted =
        response.output_parsed ?? parseHouseReceiptExtract(response.output_text)
      if (!extracted) {
        throw new Error("Could not read that photo. Try a clearer crop.")
      }
      const draft = draftFromHouseExtract(extracted)
      ocrLog("scan:done", {
        ...meta,
        totalMs: ocrMs(startedAt),
        visionMs,
        parsed: Boolean(response.output_parsed),
        documentKind: extracted.documentKind,
        provider: extracted.provider,
        totalCents: extracted.totalCents,
        ...visionUsage(response),
      })
      return draft
    } catch (error) {
      ocrLog("scan:error", {
        ...meta,
        totalMs: ocrMs(startedAt),
        message: error instanceof Error ? error.message : String(error),
      })
      throw new Error(ocrErrorMessage(error, "Could not read receipt"))
    }
  })
