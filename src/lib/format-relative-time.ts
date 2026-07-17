/** Short relative label for a timestamp (e.g. "Just now", "3h ago", "Jul 4"). */
export function formatRelativeTime(
  timestamp: string | number | Date,
  now = Date.now()
): string {
  const then = new Date(timestamp).getTime()
  const diffMs = Math.max(0, now - then)
  const mins = Math.floor(diffMs / 60_000)
  if (mins < 1) return "Just now"
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return new Date(then).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  })
}
