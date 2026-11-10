export const E2E_USER_COOKIE = "split-e2e-user"

const CLERK_USER_ID = /^user_[A-Za-z0-9_-]{8,}$/

/** Clerk user ids look like `user_…`; e2e uses the same shape. */
export function parseClerkUserId(value: unknown): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return CLERK_USER_ID.test(trimmed) ? trimmed : null
}

/** Same-origin path only — never an open redirect. */
export function safeRedirectPath(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined
  const path = value.trim()
  if (!path.startsWith("/")) return undefined
  if (path.startsWith("//")) return undefined
  if (path.includes("://")) return undefined
  return path
}
