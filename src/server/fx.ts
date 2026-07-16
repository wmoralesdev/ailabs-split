import { createServerFn } from "@tanstack/react-start"
import { getRequestHeader } from "@tanstack/react-start/server"
import { z } from "zod"

import { assertRateLimit } from "@/lib/rate-limit"
import { currencyCodeSchema } from "@/lib/schemas"

const FRANKFURTER_URL = "https://api.frankfurter.dev/v2/rates"
const FETCH_TIMEOUT_MS = 8_000

const fetchFxRatesSchema = z.object({
  base: currencyCodeSchema,
  quotes: z
    .array(currencyCodeSchema)
    .min(1, "Pick at least one currency")
    .max(20, "Too many currencies"),
})

export type FxRatesResult = {
  base: string
  /** Units of each quote currency per 1 unit of base. */
  rates: Record<string, number>
  /** ISO date of the newest rate in the response. */
  date: string | null
}

type FrankfurterRateRow = {
  date?: string
  base?: string
  quote?: string
  rate?: number
}

function clientIp(): string {
  const forwarded = getRequestHeader("x-forwarded-for")
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim()
    if (first) return first
  }
  const realIp = getRequestHeader("x-real-ip")
  if (realIp) return realIp
  return "unknown"
}

function parseOrThrow<T>(schema: z.ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data)
  if (!result.success) {
    throw new Error(result.error.issues[0]?.message ?? "Invalid input")
  }
  return result.data
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

/**
 * Fetch latest FX rates from Frankfurter (free, no API key).
 * Rates are units of quote per 1 unit of base — matches room.fxRates.
 */
export const fetchFxRates = createServerFn({ method: "GET" })
  .validator((data: unknown) => parseOrThrow(fetchFxRatesSchema, data))
  .handler(async ({ data }): Promise<FxRatesResult> => {
    assertRateLimit(`fx:${clientIp()}`, {
      limit: 30,
      windowMs: 60_000,
      label: "rate lookups",
    })

    const quotes = Array.from(
      new Set(data.quotes.filter((code) => code !== data.base))
    )
    if (quotes.length === 0) {
      return { base: data.base, rates: {}, date: null }
    }

    const url = new URL(FRANKFURTER_URL)
    url.searchParams.set("base", data.base)
    url.searchParams.set("quotes", quotes.join(","))

    let response: Response
    try {
      response = await withTimeout(
        fetch(url, {
          headers: { Accept: "application/json" },
        }),
        FETCH_TIMEOUT_MS,
        "Exchange rates timed out"
      )
    } catch {
      throw new Error("Could not reach exchange rate service")
    }

    if (!response.ok) {
      throw new Error("Could not load exchange rates")
    }

    const body: unknown = await response.json()
    if (!Array.isArray(body)) {
      throw new Error("Unexpected exchange rate response")
    }

    const rates: Record<string, number> = {}
    let newestDate: string | null = null

    for (const row of body as FrankfurterRateRow[]) {
      if (
        typeof row.quote !== "string" ||
        typeof row.rate !== "number" ||
        !Number.isFinite(row.rate) ||
        row.rate <= 0
      ) {
        continue
      }
      rates[row.quote.toUpperCase()] = row.rate
      if (
        typeof row.date === "string" &&
        (!newestDate || row.date > newestDate)
      ) {
        newestDate = row.date
      }
    }

    return { base: data.base, rates, date: newestDate }
  })
