export type RecentTrip = {
  code: string
  name: string
  updatedAt: number
}

const STORAGE_KEY = "split:recent-trips"
const MAX_RECENT = 10

function isRecentTrip(value: unknown): value is RecentTrip {
  if (typeof value !== "object" || value === null) return false
  const trip = value as Record<string, unknown>
  return (
    typeof trip.code === "string" &&
    trip.code.length > 0 &&
    typeof trip.name === "string" &&
    typeof trip.updatedAt === "number" &&
    Number.isFinite(trip.updatedAt)
  )
}

function readTrips(): RecentTrip[] {
  if (typeof window === "undefined") return []
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isRecentTrip)
  } catch {
    return []
  }
}

function writeTrips(trips: RecentTrip[]): void {
  if (typeof window === "undefined") return
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(trips))
}

/** Most-recent-first list of trips this device has opened. */
export function listRecentTrips(): RecentTrip[] {
  return readTrips()
    .slice()
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, MAX_RECENT)
}

/** Upsert by code (case-insensitive), bump to front, cap list size. */
export function rememberRecentTrip(input: {
  code: string
  name: string
}): void {
  if (typeof window === "undefined") return
  const code = input.code.trim().toUpperCase()
  const name = input.name.trim()
  if (!code || !name) return

  const next: RecentTrip = {
    code,
    name,
    updatedAt: Date.now(),
  }
  const without = readTrips().filter(
    (trip) => trip.code.toUpperCase() !== code
  )
  writeTrips([next, ...without].slice(0, MAX_RECENT))
}

export function forgetRecentTrip(code: string): void {
  if (typeof window === "undefined") return
  const normalized = code.trim().toUpperCase()
  writeTrips(
    readTrips().filter((trip) => trip.code.toUpperCase() !== normalized)
  )
}

/** Short relative label for last opened (e.g. "Just now", "3d ago"). */
export function formatRecentTripOpened(updatedAt: number, now = Date.now()): string {
  const diffMs = Math.max(0, now - updatedAt)
  const mins = Math.floor(diffMs / 60_000)
  if (mins < 1) return "Just now"
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  return new Date(updatedAt).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  })
}
