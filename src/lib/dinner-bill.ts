/** A dinner is one bill. Older dinners may hold more than one check; the first one is the bill. */
export function dinnerBill<T extends { createdAt: string }>(
  checks: readonly T[]
): T | null {
  let first: T | null = null
  for (const check of checks) {
    if (!first || check.createdAt < first.createdAt) first = check
  }
  return first
}
