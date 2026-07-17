import { onlineManager } from "@tanstack/react-query"
import { useSyncExternalStore } from "react"

/** Subscribe to TanStack Query's onlineManager (same signal that pauses mutations). */
export function useOnlineStatus(): boolean {
  return useSyncExternalStore(
    (onStoreChange) => onlineManager.subscribe(onStoreChange),
    () => onlineManager.isOnline(),
    () => true
  )
}
