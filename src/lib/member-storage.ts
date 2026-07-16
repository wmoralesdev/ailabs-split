import { inviteLink } from "@/lib/invite-link"

const STORAGE_PREFIX = "split:member:"

export function memberStorageKey(roomCode: string): string {
  return `${STORAGE_PREFIX}${roomCode.toUpperCase()}`
}

export function rememberMember(roomCode: string, memberId: string): void {
  if (typeof window === "undefined") return
  window.localStorage.setItem(memberStorageKey(roomCode), memberId)
}

export function recallMember(roomCode: string): string | null {
  if (typeof window === "undefined") return null
  return window.localStorage.getItem(memberStorageKey(roomCode))
}

export function forgetMember(roomCode: string): void {
  if (typeof window === "undefined") return
  window.localStorage.removeItem(memberStorageKey(roomCode))
}

export function resolveRememberedMember(
  roomCode: string,
  memberIds: string[]
): string | null {
  const remembered = recallMember(roomCode)
  if (!remembered) return null
  return memberIds.includes(remembered) ? remembered : null
}

export function memberLink(roomCode: string, memberName: string): string {
  const url = new URL(inviteLink(roomCode))
  url.searchParams.set("as", memberName)
  return url.toString()
}
