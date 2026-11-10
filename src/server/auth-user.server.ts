import { auth } from "@clerk/tanstack-react-start/server"
import { getRequestHeader } from "@tanstack/react-start/server"

import { E2E_USER_COOKIE, parseClerkUserId } from "@/lib/auth-session"

function e2eAuthEnabled(): boolean {
  return process.env.E2E === "1" || process.env.VITE_E2E === "1"
}

function readCookie(name: string): string | null {
  const header = getRequestHeader("cookie")
  if (!header) return null
  for (const part of header.split(";")) {
    const [rawKey, ...rest] = part.trim().split("=")
    if (rawKey !== name) continue
    try {
      return decodeURIComponent(rest.join("="))
    } catch {
      return rest.join("=")
    }
  }
  return null
}

export async function getAuthUserId(): Promise<string | null> {
  if (e2eAuthEnabled()) {
    const e2eUserId = parseClerkUserId(readCookie(E2E_USER_COOKIE))
    if (e2eUserId) return e2eUserId
  }
  if (!process.env.CLERK_SECRET_KEY) return null
  try {
    const { userId } = await auth()
    return parseClerkUserId(userId)
  } catch {
    return null
  }
}

export async function requireSignedInUserId(): Promise<string> {
  const userId = await getAuthUserId()
  if (!userId) {
    throw new Error("Sign in to scan a ticket")
  }
  return userId
}
