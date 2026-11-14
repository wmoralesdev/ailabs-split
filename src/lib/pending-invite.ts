import { isRoomKind } from "@/lib/room-kind"
import type { RoomKind } from "@/lib/room-kind"

/**
 * The room this device was invited to (opened from a `/r/CODE` link before
 * the visitor had a member there). Landing on `/` sends them back to it, so a
 * guest who wanders off — to sign in, to the home screen — returns to the
 * bill, trip or house they were asked to join.
 */
export type PendingInvite = {
  code: string
  kind?: RoomKind
  at: number
}

const STORAGE_KEY = "split:invite"
/** Stale invites stop hijacking the home screen after a month. */
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000

export function getPendingInvite(now = Date.now()): PendingInvite | null {
  if (typeof window === "undefined") return null
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== "object" || parsed === null) return null
    const value = parsed as Record<string, unknown>
    if (typeof value.code !== "string" || !value.code) return null
    if (typeof value.at !== "number" || now - value.at > MAX_AGE_MS) {
      window.localStorage.removeItem(STORAGE_KEY)
      return null
    }
    return {
      code: value.code.toUpperCase(),
      kind: isRoomKind(value.kind) ? value.kind : undefined,
      at: value.at,
    }
  } catch {
    return null
  }
}

export function rememberInvite(input: { code: string; kind?: RoomKind }) {
  if (typeof window === "undefined") return
  try {
    const invite: PendingInvite = {
      code: input.code.toUpperCase(),
      kind: input.kind,
      at: Date.now(),
    }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(invite))
  } catch {
    // Private mode: the visitor just lands on the home screen instead.
  }
}

/** Clear the invite; with a code, only when it points at that room. */
export function forgetInvite(code?: string) {
  if (typeof window === "undefined") return
  try {
    if (code) {
      const current = getPendingInvite()
      if (current && current.code !== code.toUpperCase()) return
    }
    window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Nothing stored or storage blocked.
  }
}
