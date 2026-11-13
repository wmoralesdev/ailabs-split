const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/
const MONTH_KEY = /^(\d{4})-(\d{2})$/

export type StayRange = {
  joinedOn: string | null
  leftOn: string | null
}

function pad2(value: number): string {
  return String(value).padStart(2, "0")
}

/** Local calendar date as YYYY-MM-DD. */
export function localIsoDate(now = new Date()): string {
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`
}

/** Local calendar month as YYYY-MM. */
export function monthKey(date = new Date()): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}`
}

export function parseMonthKey(key: string): { year: number; month: number } {
  const match = MONTH_KEY.exec(key)
  if (!match) {
    throw new Error("Pick a month")
  }
  const year = Number(match[1])
  const month = Number(match[2])
  if (month < 1 || month > 12) {
    throw new Error("Pick a month")
  }
  return { year, month }
}

export function parseIsoDate(iso: string): {
  year: number
  month: number
  day: number
} {
  const match = ISO_DATE.exec(iso)
  if (!match) {
    throw new Error("Pick a date")
  }
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const utc = new Date(Date.UTC(year, month - 1, day))
  if (
    utc.getUTCFullYear() !== year ||
    utc.getUTCMonth() !== month - 1 ||
    utc.getUTCDate() !== day
  ) {
    throw new Error("Pick a date")
  }
  return { year, month, day }
}

export function isMonthKey(value: string): boolean {
  try {
    parseMonthKey(value)
    return true
  } catch {
    return false
  }
}

export function isIsoDate(value: string): boolean {
  try {
    parseIsoDate(value)
    return true
  } catch {
    return false
  }
}

export function isoDateToUtc(iso: string): Date {
  const { year, month, day } = parseIsoDate(iso)
  return new Date(Date.UTC(year, month - 1, day))
}

export function isoDateFromUtc(date: Date): string {
  return date.toISOString().slice(0, 10)
}

export function addDaysIso(iso: string, days: number): string {
  const utc = isoDateToUtc(iso)
  utc.setUTCDate(utc.getUTCDate() + days)
  return isoDateFromUtc(utc)
}

export function addMonths(key: string, n: number): string {
  const { year, month } = parseMonthKey(key)
  const utc = new Date(Date.UTC(year, month - 1 + n, 1))
  return `${utc.getUTCFullYear()}-${pad2(utc.getUTCMonth() + 1)}`
}

export function monthStart(key: string): string {
  const { year, month } = parseMonthKey(key)
  return `${year}-${pad2(month)}-01`
}

export function monthEnd(key: string): string {
  const next = addMonths(key, 1)
  const { year, month, day } = parseIsoDate(monthStart(next))
  const last = new Date(Date.UTC(year, month - 1, day - 1))
  return isoDateFromUtc(last)
}

const MONTH_SHORT = [
  "jan",
  "feb",
  "mar",
  "apr",
  "may",
  "jun",
  "jul",
  "aug",
  "sep",
  "oct",
  "nov",
  "dec",
] as const

function monthNameToNumber(name: string): number | null {
  const key = name.slice(0, 3).toLowerCase()
  const index = MONTH_SHORT.indexOf(key as (typeof MONTH_SHORT)[number])
  return index === -1 ? null : index + 1
}

/** Local calendar Date from YYYY-MM-DD, no UTC shift. */
export function isoToLocalDate(iso: string): Date {
  const { year, month, day } = parseIsoDate(iso)
  return new Date(year, month - 1, day)
}

/** MM/DD/YYYY, matching the typed date field. */
export function formatTypedDate(iso: string): string {
  const { year, month, day } = parseIsoDate(iso)
  return `${pad2(month)}/${pad2(day)}/${year}`
}

/** Parse a typed date: ISO, MM/DD/YYYY, or "Nov 13, 2026". */
export function parseTypedDate(raw: string, now = new Date()): string | null {
  const text = raw.trim()
  if (!text) return null
  if (isIsoDate(text)) return text

  const slash = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text)
  if (slash) {
    const iso = `${slash[3]}-${pad2(Number(slash[1]))}-${pad2(Number(slash[2]))}`
    return isIsoDate(iso) ? iso : null
  }

  const named =
    /^(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s*(\d{4})?$/i.exec(
      text
    )
  if (named) {
    const month = monthNameToNumber(named[1])
    if (!month) return null
    const year = named[3] ? Number(named[3]) : now.getFullYear()
    const iso = `${year}-${pad2(month)}-${pad2(Number(named[2]))}`
    return isIsoDate(iso) ? iso : null
  }

  return null
}

/** Parse a typed month: YYYY-MM, MM/YYYY, or "Nov 2026". */
export function parseTypedMonth(raw: string): string | null {
  const text = raw.trim()
  if (!text) return null
  if (isMonthKey(text)) return text

  const slash = /^(\d{1,2})\/(\d{4})$/.exec(text)
  if (slash) {
    const key = `${slash[2]}-${pad2(Number(slash[1]))}`
    return isMonthKey(key) ? key : null
  }

  const named =
    /^(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{4})$/i.exec(
      text
    )
  if (named) {
    const month = monthNameToNumber(named[1])
    if (!month) return null
    const key = `${named[2]}-${pad2(month)}`
    return isMonthKey(key) ? key : null
  }

  return null
}

/** Due day is 1–28 so every month has that day. */
export function parseDueDay(raw: string): number | null {
  const text = raw.trim()
  if (!/^\d{1,2}$/.test(text)) return null
  const day = Number(text)
  if (!Number.isInteger(day) || day < 1 || day > 28) return null
  return day
}

/** Oct 2026 */
export function formatMonth(key: string): string {
  const { year, month } = parseMonthKey(key)
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  })
}

/** Nov 4 */
export function formatDay(iso: string): string {
  const { year, month, day } = parseIsoDate(iso)
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  })
}

function asIsoDate(value: string | Date | null | undefined): string | null {
  if (value == null) return null
  if (typeof value === "string") {
    parseIsoDate(value)
    return value
  }
  return isoDateFromUtc(value)
}

/** True when the stay touches any day of the month. Null joinedOn = from the start. */
export function stayOverlapsMonth(
  member: StayRange & {
    joinedOn: string | Date | null
    leftOn: string | Date | null
  },
  key: string
): boolean {
  const start = monthStart(key)
  const end = monthEnd(key)
  const joinedOn = asIsoDate(member.joinedOn)
  const leftOn = asIsoDate(member.leftOn)
  if (joinedOn && joinedOn > end) return false
  if (leftOn && leftOn < start) return false
  return true
}

/** Inclusive stay: active on leftOn, not after. Null joinedOn = always been there. */
export function isActiveOn(
  member: StayRange & {
    joinedOn: string | Date | null
    leftOn: string | Date | null
  },
  date: string | Date
): boolean {
  const day = typeof date === "string" ? date : isoDateFromUtc(date)
  parseIsoDate(day)
  const joinedOn = asIsoDate(member.joinedOn)
  const leftOn = asIsoDate(member.leftOn)
  if (joinedOn && joinedOn > day) return false
  if (leftOn && leftOn < day) return false
  return true
}

export function isMovedOutOn(
  leftOn: string | Date | null,
  today: string
): boolean {
  const iso = asIsoDate(leftOn)
  return iso != null && iso < today
}
