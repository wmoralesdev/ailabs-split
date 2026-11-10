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

/**
 * Clerk display name for "Your name": fullName, else firstName, else username.
 * Backend User has no fullName; first+last is Clerk's frontend fullName.
 */
export function clerkDisplayName(
  user: ClerkNameFields | null | undefined
): string {
  if (!user) return ""
  const joined = [user.firstName, user.lastName]
    .map((part) => nonempty(part))
    .filter((part): part is string => Boolean(part))
    .join(" ")
  const fullName = nonempty(user.fullName) ?? nonempty(joined)
  const name =
    fullName ?? nonempty(user.firstName) ?? nonempty(user.username) ?? ""
  return name.slice(0, CREATOR_NAME_MAX)
}

/** Signed-in Clerk name wins over a remembered local name. Empty means leave the field. */
export function nextCreatorName(input: {
  clerkName: string
  lastName: string
}): string {
  return input.clerkName.trim() || input.lastName.trim()
}
