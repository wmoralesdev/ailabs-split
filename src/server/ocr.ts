import { Mistral } from "@mistralai/mistralai"
import { createServerFn } from "@tanstack/react-start"
import { getRequestHeader } from "@tanstack/react-start/server"

import { prisma } from "@/lib/prisma"
import { extractCheckDraft, extractDraft } from "@/lib/receipt-ocr"
import type { OcrCheckDraft, OcrDraft, OcrNamedAmount } from "@/lib/receipt-ocr"
import { assertRateLimit } from "@/lib/rate-limit"
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
const OCR_TIMEOUT_MS = 20_000

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

    const mode = body.mode === "dinner" ? "dinner" : "trip"

    return { code, imageBase64, mimeType, mode }
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
      label: "receipt scans for this trip",
    })

    // Prove the room exists before spending Mistral credits.
    const room = await prisma.room.findUnique({
      where: { code: data.code },
      select: { id: true },
    })
    if (!room) {
      throw new Error("Trip not found")
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

    const tripDraft = extractDraft(markdown)
    if (data.mode !== "dinner") {
      return tripDraft
    }

    let check = extractCheckDraft(markdown)
    if (check.items.length === 0) {
      const refined = await refineDinnerMarkdown(client, markdown)
      if (refined && refined.items.length > 0) {
        check = {
          ...refined,
          tip: check.tip ?? refined.tip,
          subtotalCents: check.subtotalCents ?? refined.subtotalCents,
          totalCents: check.totalCents ?? refined.totalCents,
          tax: check.tax ?? refined.tax,
          fees: check.fees.length > 0 ? check.fees : refined.fees,
          isPrecuenta: check.isPrecuenta || refined.isPrecuenta,
          guestCountPrinted: check.guestCountPrinted,
          rawText: markdown.slice(0, 20_000),
        }
      }
    }

    return { ...tripDraft, rawText: markdown.slice(0, 20_000), check }
  })

async function refineDinnerMarkdown(
  client: Mistral,
  markdown: string
): Promise<OcrCheckDraft | null> {
  try {
    const response = await withTimeout(
      client.chat.complete({
        model: "mistral-small-latest",
        temperature: 0,
        responseFormat: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "Extract a restaurant ticket as JSON. Keys: merchant, isPrecuenta, items[{name,quantity,unitPriceCents,amountCents,modifiers}], subtotalCents, tip{amountCents,percentHint}, fees[{name,amountCents}], tax[{name,amountCents}], discounts[{name,amountCents}], totalCents. Amounts are integer cents. Nested modifiers like ** 16 ONZ or RES/VAS are modifiers, not items. Do not invent tip, tax, IVA, or fees — only lines printed in the footer. PROPINA 0% / $0.00 means tip 0, never 10%. Gravado matching subtotal is not extra tax. Ignore Invitados, CLIENTES ATENDIDOS, MESA, MESERO, Order No.",
          },
          { role: "user", content: markdown.slice(0, 12_000) },
        ],
      }),
      12_000,
      "Dinner parse timed out"
    )
    const content = response.choices[0]?.message?.content
    const raw = typeof content === "string" ? content : null
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== "object") return null
    return coerceLlmCheck(parsed, markdown)
  } catch {
    return null
  }
}

function coerceLlmCheck(raw: unknown, markdown: string): OcrCheckDraft | null {
  if (!raw || typeof raw !== "object") return null
  const record = raw as Record<string, unknown>
  const itemsRaw = Array.isArray(record.items) ? record.items : []
  const items: OcrCheckDraft["items"] = []
  for (const row of itemsRaw) {
    if (!row || typeof row !== "object") continue
    const item = row as Record<string, unknown>
    const name = typeof item.name === "string" ? item.name.trim() : ""
    const amountCents =
      typeof item.amountCents === "number" ? Math.round(item.amountCents) : null
    if (!name || amountCents == null || amountCents < 0) continue
    const quantity =
      typeof item.quantity === "number" && item.quantity > 0
        ? item.quantity
        : 1
    const modifiers = Array.isArray(item.modifiers)
      ? item.modifiers.filter((mod): mod is string => typeof mod === "string")
      : []
    items.push({
      name,
      quantity,
      unitPriceCents:
        typeof item.unitPriceCents === "number"
          ? Math.round(item.unitPriceCents)
          : undefined,
      amountCents,
      modifiers,
      confidence: 0.7,
    })
  }
  if (items.length === 0) return null

  const tipRaw =
    record.tip && typeof record.tip === "object"
      ? (record.tip as Record<string, unknown>)
      : null
  const tipAmount =
    tipRaw && typeof tipRaw.amountCents === "number"
      ? Math.round(tipRaw.amountCents)
      : undefined

  return {
    merchant: typeof record.merchant === "string" ? record.merchant : undefined,
    isPrecuenta: record.isPrecuenta === true,
    items,
    subtotalCents:
      typeof record.subtotalCents === "number"
        ? Math.round(record.subtotalCents)
        : undefined,
    totalCents:
      typeof record.totalCents === "number"
        ? Math.round(record.totalCents)
        : undefined,
    tip:
      tipAmount == null
        ? undefined
        : {
            amountCents: Math.max(0, tipAmount),
            percentHint:
              tipRaw && typeof tipRaw.percentHint === "number"
                ? tipRaw.percentHint
                : undefined,
            confidence: 0.7,
          },
    fees: namedAmounts(record.fees),
    tax: namedAmounts(record.tax),
    discounts: namedAmounts(record.discounts).map((entry) => ({
      name: entry.name,
      amountCents: entry.amountCents,
    })),
    rawText: markdown.slice(0, 20_000),
  }
}

function namedAmounts(raw: unknown): OcrNamedAmount[] {
  if (!Array.isArray(raw)) return []
  const amounts: OcrNamedAmount[] = []
  for (const row of raw) {
    if (!row || typeof row !== "object") continue
    const record = row as Record<string, unknown>
    const name = typeof record.name === "string" ? record.name.trim() : ""
    const amountCents =
      typeof record.amountCents === "number"
        ? Math.round(record.amountCents)
        : null
    if (!name || amountCents == null || amountCents === 0) continue
    amounts.push({ name, amountCents, confidence: 0.7 })
  }
  return amounts
}
