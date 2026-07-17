const MAX_ATM_DIGITS = 12

/** Minor-unit decimal places for a currency (e.g. USD→2, JPY→0). */
export function currencyFractionDigits(currency: string): number {
  try {
    const digits = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
    }).resolvedOptions().maximumFractionDigits
    return typeof digits === "number" ? digits : 2
  } catch {
    return 2
  }
}

/** Keep only digits and strip leading zeros (empty = nothing entered). */
export function normalizeAtmDigits(raw: string): string {
  return raw.replace(/\D/g, "").replace(/^0+/, "").slice(0, MAX_ATM_DIGITS)
}

export function appendAtmDigit(digits: string, digit: string): string {
  if (!/^\d$/.test(digit)) return normalizeAtmDigits(digits)
  return normalizeAtmDigits(`${normalizeAtmDigits(digits)}${digit}`)
}

export function backspaceAtmDigit(digits: string): string {
  const cleaned = normalizeAtmDigits(digits)
  return cleaned.slice(0, -1)
}

/**
 * Format a digit buffer as a fractional amount string.
 * Digits enter right-to-left into the minor units (ATM style).
 * e.g. "1289" + 2 decimals → "12.89"; "1289" + 0 decimals → "1289".
 */
export function formatAtmAmount(digits: string, fractionDigits: number): string {
  const cleaned = normalizeAtmDigits(digits)
  const fd = Math.max(0, fractionDigits)

  if (fd === 0) {
    return cleaned || "0"
  }

  const padded = cleaned.padStart(fd + 1, "0")
  const whole = padded.slice(0, -fd).replace(/^0+(?=\d)/, "") || "0"
  const frac = padded.slice(-fd)
  return `${whole}.${frac}`
}

/**
 * Controlled-input display: empty buffer → "" so a "0.00" placeholder can show.
 * Use formatAtmAmount for placeholders / non-input display of zero.
 */
export function formatAtmAmountInput(
  digits: string,
  fractionDigits: number
): string {
  if (!normalizeAtmDigits(digits)) return ""
  return formatAtmAmount(digits, fractionDigits)
}

/**
 * Convert ATM digit buffer to app cents (hundredths of the major unit).
 * Matches the rest of Split’s integer-cent storage.
 */
export function atmDigitsToCents(digits: string, fractionDigits: number): number {
  const cleaned = normalizeAtmDigits(digits)
  if (!cleaned) return 0
  const fd = Math.max(0, fractionDigits)
  const scale = 10 ** fd
  return Math.round((Number.parseInt(cleaned, 10) * 100) / scale)
}

/** Inverse of atmDigitsToCents for OCR / prefills. */
export function centsToAtmDigits(cents: number, fractionDigits: number): string {
  if (!Number.isFinite(cents) || cents <= 0) return ""
  const fd = Math.max(0, fractionDigits)
  const scale = 10 ** fd
  const minor = Math.round((cents * scale) / 100)
  return normalizeAtmDigits(String(minor))
}

/** Apply a raw input value (typed/pasted) to the digit buffer. */
export function atmDigitsFromInput(inputValue: string): string {
  return normalizeAtmDigits(inputValue)
}

/**
 * ATM-style beforeinput handler: digits always append to the buffer;
 * delete removes the last digit. Call with preventDefault from the event.
 */
export function applyAtmBeforeInput(
  currentDigits: string,
  inputType: string,
  data: string | null
): string | null {
  if (inputType === "insertText" || inputType === "insertCompositionText") {
    if (!data || !/^\d+$/.test(data)) return currentDigits
    let next = currentDigits
    for (const digit of data) {
      next = appendAtmDigit(next, digit)
    }
    return next
  }

  if (inputType === "insertFromPaste") {
    return atmDigitsFromInput(data ?? "")
  }

  if (
    inputType === "deleteContentBackward" ||
    inputType === "deleteContentForward" ||
    inputType === "deleteByCut" ||
    inputType === "deleteContent" ||
    inputType === "deleteWordBackward" ||
    inputType === "deleteWordForward"
  ) {
    return backspaceAtmDigit(currentDigits)
  }

  // Unknown input type — ignore (keep current)
  return currentDigits
}
