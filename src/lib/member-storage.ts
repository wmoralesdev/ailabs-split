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
