import { Mistral } from "@mistralai/mistralai"
import { createServerFn } from "@tanstack/react-start"

import { parseAmountToCents } from "@/lib/settle"

export type OcrDraft = {
  title?: string
  amountCents?: number
  date?: string
  rawText?: string
}

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

export const scanReceipt = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    if (typeof data !== "object" || data === null) {
      throw new Error("Invalid payload")
    }
    const body = data as Record<string, unknown>
    const imageBase64 = body.imageBase64
    const mimeType =
      typeof body.mimeType === "string" && body.mimeType.trim()
        ? body.mimeType.trim()
        : "image/jpeg"

    if (typeof imageBase64 !== "string" || imageBase64.length < 32) {
      throw new Error("Image data is required")
    }
    if (imageBase64.length > 8_000_000) {
      throw new Error("Image is too large")
    }

    return { imageBase64, mimeType }
  })
  .handler(async ({ data }): Promise<OcrDraft> => {
    const apiKey = process.env.MISTRAL_API_KEY
    if (!apiKey) {
      throw new Error("MISTRAL_API_KEY is not configured")
    }

    const client = new Mistral({ apiKey })
    const result = await client.ocr.process({
      model: "mistral-ocr-latest",
      document: {
        type: "image_url",
        imageUrl: `data:${data.mimeType};base64,${data.imageBase64}`,
      },
    })

    const markdown = result.pages
      .map((page) => page.markdown)
      .join("\n")
      .trim()

    if (!markdown) {
      return { rawText: "" }
    }

    return extractDraft(markdown)
  })
