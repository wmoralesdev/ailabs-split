export type PayDetailsDto = {
  account: string
  label: string | null
}

export const PAY_ACCOUNT_MAX = 40
export const PAY_LABEL_MAX = 24

export function normalizePayText(raw: string): string {
  return raw.trim().replace(/\s+/g, " ")
}

/** A seat claimed by a signed-in person reads their profile; others read the seat. */
export function resolvePayDetails(
  member: {
    userId: string | null
    payAccount: string | null
    payLabel: string | null
  },
  profiles: ReadonlyMap<string, { account: string; label: string | null }>
): PayDetailsDto | null {
  if (member.userId) {
    const profile = profiles.get(member.userId)
    if (profile) return { account: profile.account, label: profile.label }
  }
  if (!member.payAccount) return null
  return { account: member.payAccount, label: member.payLabel }
}

export function payDetailsLine(pay: PayDetailsDto): string {
  return pay.label ? `${pay.label} · ${pay.account}` : pay.account
}
