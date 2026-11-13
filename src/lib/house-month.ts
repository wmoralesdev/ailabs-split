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
