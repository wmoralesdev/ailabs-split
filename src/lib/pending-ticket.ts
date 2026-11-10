/**
 * A ticket photo picked on one screen and scanned on the check editor.
 * Kept in memory only: a File cannot survive a reload, and the photo is never stored.
 */
type PendingTicket = {
  file: File
  /** The room still has its fallback name; the ticket's place should replace it. */
  nameFromTicket: boolean
}

const pending = new Map<string, PendingTicket>()

export function setPendingTicket(code: string, ticket: PendingTicket) {
  pending.set(code.toUpperCase(), ticket)
}

export function hasPendingTicket(code: string): boolean {
  return pending.has(code.toUpperCase())
}

export function takePendingTicket(code: string): PendingTicket | null {
  const key = code.toUpperCase()
  const ticket = pending.get(key) ?? null
  pending.delete(key)
  return ticket
}
