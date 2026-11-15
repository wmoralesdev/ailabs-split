export const CREATOR_NAME_MAX = 40

export type ClerkNameFields = {
  fullName?: string | null
  firstName?: string | null
  lastName?: string | null
  username?: string | null
}

function nonempty(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed ? trimmed : undefined
}

function firstGivenName(value: string | null | undefined): string | undefined {
  const trimmed = nonempty(value)
  if (!trimmed) return undefined
  return trimmed.split(/\s+/)[0]
}

/**
 * Clerk given name for "Your name": firstName, else first word of fullName,
 * else username. Last names stay out of the split nickname.
 */
export function clerkDisplayName(
  user: ClerkNameFields | null | undefined
): string {
  if (!user) return ""
  const name =
    nonempty(user.firstName) ??
    firstGivenName(user.fullName) ??
    nonempty(user.username) ??
    ""
  return name.slice(0, CREATOR_NAME_MAX)
}

/** Signed-in Clerk name wins over a remembered local name. Empty means leave the field. */
export function nextCreatorName(input: {
  clerkName: string
  lastName: string
}): string {
  return input.clerkName.trim() || input.lastName.trim()
}
