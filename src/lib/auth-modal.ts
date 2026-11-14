import { useSyncExternalStore } from "react"

import { safeRedirectPath } from "@/lib/auth-session"

/**
 * Sign-in lives in a modal over the current screen, not on its own route.
 * Anything that needs an account calls `openAuthModal({ redirect })`; Clerk
 * navigates to `redirect` once the session exists, so the server loads the
 * authenticated route.
 */
export type AuthModalState = {
  open: boolean
  redirect: string
}

/** Survives the OAuth round trip (Google, GitHub) in this tab. */
const REDIRECT_KEY = "split:auth-redirect"

let state: AuthModalState = { open: false, redirect: "/" }
const listeners = new Set<() => void>()

function emit(next: AuthModalState) {
  state = next
  for (const listener of listeners) listener()
}

function currentPath(): string {
  if (typeof window === "undefined") return "/"
  return `${window.location.pathname}${window.location.search}`
}

function storeRedirect(redirect: string) {
  try {
    window.sessionStorage.setItem(REDIRECT_KEY, redirect)
  } catch {
    // Storage blocked: Clerk still carries the redirect through OAuth.
  }
}

/** Redirect saved before an OAuth hop, if this tab has one. */
export function storedAuthRedirect(): string | undefined {
  if (typeof window === "undefined") return undefined
  try {
    return safeRedirectPath(window.sessionStorage.getItem(REDIRECT_KEY))
  } catch {
    return undefined
  }
}

export function openAuthModal(options: { redirect?: string } = {}) {
  const redirect =
    safeRedirectPath(options.redirect) ?? safeRedirectPath(currentPath()) ?? "/"
  storeRedirect(redirect)
  emit({ open: true, redirect })
}

export function closeAuthModal() {
  emit({ ...state, open: false })
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

const serverState: AuthModalState = { open: false, redirect: "/" }

export function useAuthModal(): AuthModalState {
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => serverState
  )
}
