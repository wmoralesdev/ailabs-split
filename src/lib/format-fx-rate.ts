/** Format a Frankfurter rate for an editable input. */
export function formatFxRate(rate: number): string {
  if (!Number.isFinite(rate) || rate <= 0) return ""
  if (rate >= 100) return rate.toFixed(2)
  if (rate >= 10) return trimZeros(rate.toFixed(3))
  if (rate >= 1) return trimZeros(rate.toFixed(4))
  return trimZeros(rate.toFixed(6))
}

function trimZeros(value: string): string {
  return value.replace(/\.?0+$/, "")
}
