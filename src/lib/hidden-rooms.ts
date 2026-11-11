const STORAGE_KEY = "split:hidden-rooms"
const MAX_HIDDEN = 100

function normalize(code: string): string {
  return code.trim().toUpperCase()
}

function isCode(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0
}

function readCodes(): string[] {
  if (typeof window === "undefined") return []
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isCode).map(normalize)
  } catch {
    return []
  }
}

function writeCodes(codes: string[]): void {
  if (typeof window === "undefined") return
  const unique = Array.from(new Set(codes.map(normalize)))
  window.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(unique.slice(0, MAX_HIDDEN))
  )
}

/** Room codes this device has hidden from Recent. */
export function listHiddenRoomCodes(): string[] {
  return readCodes()
}

export function isRoomHidden(code: string): boolean {
  const normalized = normalize(code)
  if (!normalized) return false
  return readCodes().includes(normalized)
}

/** Guest identity: persist hide in localStorage, same as member/recent. */
export function hideRoomLocal(code: string): void {
  const normalized = normalize(code)
  if (!normalized) return
  writeCodes([normalized, ...readCodes()])
}

/** Merge signed-in server hides into this device's list. */
export function mergeHiddenRoomCodes(codes: string[]): void {
  const extra = codes.map(normalize).filter(Boolean)
  if (extra.length === 0) return
  writeCodes([...extra, ...readCodes()])
}
