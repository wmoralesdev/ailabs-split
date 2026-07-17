const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"

export function generateRoomCode(length = 7): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length))
  let code = ""
  for (const byte of bytes) {
    code += CODE_ALPHABET[byte % CODE_ALPHABET.length]
  }
  return code
}

export function normalizeRoomCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, "")
}

export const CURRENCY_OPTIONS = [
  { code: "USD", label: "USD — US Dollar" },
  { code: "EUR", label: "EUR — Euro" },
  { code: "SVC", label: "SVC — Salvadoran Colón" },
  { code: "MXN", label: "MXN — Mexican Peso" },
  { code: "GTQ", label: "GTQ — Guatemalan Quetzal" },
  { code: "HNL", label: "HNL — Honduran Lempira" },
  { code: "NIO", label: "NIO — Nicaraguan Córdoba" },
  { code: "CRC", label: "CRC — Costa Rican Colón" },
  { code: "PAB", label: "PAB — Panamanian Balboa" },
  { code: "GBP", label: "GBP — British Pound" },
] as const

/** Quick picks on create — regional + global defaults. */
export const COMMON_BASE_CURRENCY_CODES = [
  "USD",
  "CRC",
  "EUR",
  "MXN",
] as const

export type CommonBaseCurrencyCode =
  (typeof COMMON_BASE_CURRENCY_CODES)[number]

export function isCommonBaseCurrency(
  code: string
): code is CommonBaseCurrencyCode {
  return (COMMON_BASE_CURRENCY_CODES as readonly string[]).includes(code)
}

/** Closed/list label: "USD · US Dollar" */
export function currencyShortLabel(code: string): string {
  const option = CURRENCY_OPTIONS.find((entry) => entry.code === code)
  if (!option) return code
  return option.label.replace(" — ", " · ")
}
