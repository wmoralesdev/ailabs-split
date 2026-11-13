import { dinnerCanEdit } from "@/lib/dinner-bill"
import { parseRoomKind } from "@/lib/room-kind"
import type { RoomDto } from "@/server/rooms"

const STORAGE_PREFIX = "split:room-cache:"

function cacheKey(code: string, viewerMemberId?: string | null): string {
  return `${STORAGE_PREFIX}${code.toUpperCase()}:${viewerMemberId ?? "anon"}`
}

function isRoomDto(value: unknown): value is RoomDto {
  if (typeof value !== "object" || value === null) return false
  const room = value as Record<string, unknown>
  return (
    typeof room.id === "string" &&
    typeof room.code === "string" &&
    typeof room.name === "string" &&
    typeof room.currency === "string" &&
    Array.isArray(room.members) &&
    Array.isArray(room.expenses) &&
    Array.isArray(room.settlements)
  )
}

function normalizeRoomDto(room: RoomDto): RoomDto {
  const kind = parseRoomKind(room.kind)
  return {
    ...room,
    kind,
    owned: room.owned === true,
    canEdit: dinnerCanEdit({ kind, canEdit: room.canEdit }),
    fxAdjustmentBps: Number.isFinite(room.fxAdjustmentBps)
      ? room.fxAdjustmentBps
      : 0,
    fxCalibrationSamples: Array.isArray(room.fxCalibrationSamples)
      ? room.fxCalibrationSamples
      : [],
    expenses: room.expenses.map((expense) => ({
      ...expense,
      redacted: expense.redacted === true,
      periodMonth: expense.periodMonth ?? null,
      paidOn: expense.paidOn ?? null,
      createdByMemberId: expense.createdByMemberId ?? null,
    })),
    settlements: room.settlements.map((settlement) => ({
      ...settlement,
      hasProof: settlement.hasProof === true,
      createdByMemberId: settlement.createdByMemberId ?? null,
    })),
    checks: Array.isArray(room.checks) ? room.checks : [],
    ...(room.house ? { house: room.house } : {}),
  }
}

/** Last successful room payload for this trip + viewer, if any. */
export function readRoomCache(
  code: string,
  viewerMemberId?: string | null
): RoomDto | undefined {
  if (typeof window === "undefined") return undefined
  try {
    const raw = window.localStorage.getItem(cacheKey(code, viewerMemberId))
    if (!raw) return undefined
    const parsed: unknown = JSON.parse(raw)
    return isRoomDto(parsed) ? normalizeRoomDto(parsed) : undefined
  } catch {
    return undefined
  }
}

/** Drop every viewer variant of a room so a deleted bill cannot revive from cache. */
export function forgetRoomCache(code: string): void {
  if (typeof window === "undefined") return
  try {
    const prefix = `${STORAGE_PREFIX}${code.toUpperCase()}:`
    const toRemove: string[] = []
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i)
      if (key && key.startsWith(prefix)) toRemove.push(key)
    }
    for (const key of toRemove) window.localStorage.removeItem(key)
  } catch {
    // Quota / private mode — ignore
  }
}

/** Persist room payload so Home can paint before the next network fetch. */
export function writeRoomCache(
  code: string,
  viewerMemberId: string | null | undefined,
  room: RoomDto
): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(
      cacheKey(code, viewerMemberId),
      JSON.stringify(room)
    )
  } catch {
    // Quota / private mode — ignore
  }
}
