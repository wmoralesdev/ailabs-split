export const PAY_ACCOUNT_TYPES = ["SAVINGS", "CHECKING"] as const
export type PayAccountType = (typeof PAY_ACCOUNT_TYPES)[number]

export type PayDetailsDto = {
  account: string
  label: string | null
  accountType: PayAccountType | null
}

export const PAY_ACCOUNT_MAX = 40
export const PAY_LABEL_MAX = 24

export function normalizePayText(raw: string): string {
  return raw.trim().replace(/\s+/g, " ")
}

export function parsePayAccountType(
  value: string | null | undefined
): PayAccountType | null {
  return PAY_ACCOUNT_TYPES.find((type) => type === value) ?? null
}

export function payAccountTypeLabel(type: PayAccountType): string {
  switch (type) {
    case "SAVINGS":
      return "Savings"
    case "CHECKING":
      return "Checking"
    default: {
      const _never: never = type
      return String(_never)
    }
  }
}

/** A seat claimed by a signed-in person reads their profile; others read the seat. */
export function resolvePayDetails(
  member: {
    userId: string | null
    payAccount: string | null
    payLabel: string | null
    payAccountType: string | null
  },
  profiles: ReadonlyMap<
    string,
    { account: string; label: string | null; accountType: string | null }
  >
): PayDetailsDto | null {
  if (member.userId) {
    const profile = profiles.get(member.userId)
    if (profile) {
      return {
        account: profile.account,
        label: profile.label,
        accountType: parsePayAccountType(profile.accountType),
      }
    }
  }
  if (!member.payAccount) return null
  return {
    account: member.payAccount,
    label: member.payLabel,
    accountType: parsePayAccountType(member.payAccountType),
  }
}

/** "BAC · Savings", or null when neither is set. */
export function payBankLine(pay: PayDetailsDto): string | null {
  const parts = [
    pay.label,
    pay.accountType ? payAccountTypeLabel(pay.accountType) : null,
  ].filter(Boolean)
  return parts.length > 0 ? parts.join(" · ") : null
}

export function payDetailsLine(pay: PayDetailsDto): string {
  const bank = payBankLine(pay)
  return bank ? `${bank} · ${pay.account}` : pay.account
}
