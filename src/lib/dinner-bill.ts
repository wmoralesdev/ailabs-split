/** A dinner is one bill. Older dinners may hold more than one check; the first one is the bill. */
export function dinnerBill<T extends { createdAt: string }>(
  checks: readonly T[]
): T | null {
  let first: T | null = null
  for (const check of checks) {
    if (!first || check.createdAt < first.createdAt) first = check
  }
  return first
}

/** Host-only once a signed-in creator exists. Unsigned dinners stay open. */
export function dinnerCanEdit(room: {
  kind: string
  canEdit?: boolean
}): boolean {
  if (room.kind !== "DINNER") return true
  return room.canEdit !== false
}

/** Server-side: block dinner bill edits when someone else created the room. */
export function assertHostDinnerEdit(
  room: { kind: string; ownerUserId: string | null },
  userId: string | null
): void {
  if (room.kind !== "DINNER") return
  if (!room.ownerUserId) return
  if (userId !== room.ownerUserId) {
    throw new Error("Only the person who started this can edit it")
  }
}
