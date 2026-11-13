import type { RoomKind } from "@/lib/room-kind"

export type { RoomKind }
export type LandingKind = RoomKind

const KIND_KEY = "split:last-kind"
const NAME_KEY = "split:last-name"
const CURRENCY_KEY = "split:last-currency"

function read(key: string): string | null {
  if (typeof window === "undefined") return null
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key: string, value: string) {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(key, value)
  } catch {
    // Private mode or full storage: defaults just won't stick.
  }
}

export function getLastKind(): LandingKind | null {
  const raw = read(KIND_KEY)
  if (raw === "TRIP" || raw === "DINNER" || raw === "HOUSEHOLD") return raw
  return null
}

export function rememberKind(kind: LandingKind) {
  write(KIND_KEY, kind)
}

export function getLastName(): string {
  return read(NAME_KEY) ?? ""
}

export function rememberName(name: string) {
  const trimmed = name.trim()
  if (trimmed) write(NAME_KEY, trimmed)
}

export function getLastCurrency(): string | null {
  return read(CURRENCY_KEY)
}

export function rememberCurrency(currency: string) {
  write(CURRENCY_KEY, currency)
}

const DEFAULT_DINNER_NAME =
  /^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday) (breakfast|lunch|dinner)$/

export function defaultDinnerName(now = new Date()): string {
  const day = now.toLocaleDateString("en-US", { weekday: "long" })
  const hour = now.getHours()
  const meal = hour < 11 ? "breakfast" : hour < 16 ? "lunch" : "dinner"
  return `${day} ${meal}`
}

/** Fallback meal-of-day titles; OCR merchant can replace these as the bill name. */
export function isDefaultDinnerName(name: string): boolean {
  return DEFAULT_DINNER_NAME.test(name.trim())
}

/** Split typed text on commas/newlines and merge into `existing`, case-insensitively. */
export function mergeNames(existing: string[], raw: string): string[] {
  const next = [...existing]
  for (const part of raw.split(/[\n,]/)) {
    const name = part.trim()
    if (!name) continue
    if (next.some((entry) => entry.toLowerCase() === name.toLowerCase())) {
      continue
    }
    next.push(name)
  }
  return next
}
