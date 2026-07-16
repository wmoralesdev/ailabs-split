const STORAGE_PREFIX = "split:last-currency:"

export function lastCurrencyStorageKey(roomCode: string): string {
  return `${STORAGE_PREFIX}${roomCode.toUpperCase()}`
}

export function rememberLastCurrency(roomCode: string, currency: string): void {
  if (typeof window === "undefined") return
  window.localStorage.setItem(lastCurrencyStorageKey(roomCode), currency)
}

export function recallLastCurrency(roomCode: string): string | null {
  if (typeof window === "undefined") return null
  return window.localStorage.getItem(lastCurrencyStorageKey(roomCode))
}

/** Last picked currency for this trip if still allowed; otherwise base. */
export function resolveLastCurrency(
  roomCode: string,
  allowedCurrencies: string[],
  baseCurrency: string
): string {
  const last = recallLastCurrency(roomCode)
  if (last && allowedCurrencies.includes(last)) return last
  return baseCurrency
}
