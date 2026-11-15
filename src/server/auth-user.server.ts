import { auth, clerkClient } from "@clerk/tanstack-react-start/server"
import { getRequestHeader } from "@tanstack/react-start/server"

import {
  E2E_NAME_COOKIE,
  E2E_USER_COOKIE,
  parseClerkUserId,
  parseDisplayName,
} from "@/lib/auth-session"
import { clerkDisplayName } from "@/lib/clerk-display-name"

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

/**
 * Dev-only: Clerk test and live instances mint different user ids for the same
 * person, so local sign-ins never own the rows created in prod. `DEV_USER_ID_MAP`
 * ("user_dev:user_prod,user_dev2:user_prod2") aliases a dev id to a prod id.
 * Ignored unless the secret key is a test key, so it can never apply in prod.
 */
function mapDevUserId(userId: string): string {
  const raw = process.env.DEV_USER_ID_MAP
  if (!raw || !process.env.CLERK_SECRET_KEY?.startsWith("sk_test_")) {
    return userId
  }
  for (const pair of raw.split(",")) {
    const [from, to] = pair.split(":").map((part) => part.trim())
    if (from === userId) return parseClerkUserId(to) ?? userId
  }
  return userId
}

export async function getAuthUserId(): Promise<string | null> {
  if (e2eAuthEnabled()) {
    const e2eUserId = parseClerkUserId(readCookie(E2E_USER_COOKIE))
    if (e2eUserId) return e2eUserId
  }
  if (!process.env.CLERK_SECRET_KEY) return null
  try {
    const { userId } = await auth()
    const id = parseClerkUserId(userId)
    return id ? mapDevUserId(id) : null
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

/** Landing-only: e2e cookie, else Clerk given name (firstName / fullName / username). */
export async function getSignedInDisplayName(): Promise<string> {
  if (e2eAuthEnabled()) {
    if (!parseClerkUserId(readCookie(E2E_USER_COOKIE))) return ""
    return parseDisplayName(readCookie(E2E_NAME_COOKIE))
  }
  if (!process.env.CLERK_SECRET_KEY) return ""
  try {
    const { userId } = await auth()
    const id = parseClerkUserId(userId)
    if (!id) return ""
    const user = await clerkClient().users.getUser(id)
    return clerkDisplayName(user)
  } catch {
    return ""
  }
}
