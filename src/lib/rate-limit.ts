type Bucket = {
  count: number
  resetAt: number
}

const buckets = new Map<string, Bucket>()

/**
 * Simple in-memory sliding window. Fine for a single serverless isolate —
 * not a global distributed limiter, but stops casual OCR/DB abuse spikes.
 */
export function assertRateLimit(
  key: string,
  opts: { limit: number; windowMs: number; label?: string }
): void {
  const now = Date.now()
  const existing = buckets.get(key)

  if (!existing || now >= existing.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + opts.windowMs })
    pruneBuckets(now)
    return
  }

  if (existing.count >= opts.limit) {
    const label = opts.label ?? "requests"
    throw new Error(`Too many ${label}. Try again in a minute.`)
  }

  existing.count += 1
}

function pruneBuckets(now: number) {
  if (buckets.size < 200) return
  for (const [key, bucket] of buckets) {
    if (now >= bucket.resetAt) buckets.delete(key)
  }
}
