const FALLBACK_ORIGIN = "https://split.ailabs.sv"

function appOrigin(): string {
  return typeof window !== "undefined" ? window.location.origin : FALLBACK_ORIGIN
}

/** Public invite URL for a trip (no personal `?as=` reclaim). */
export function inviteLink(tripCode: string): string {
  return new URL(`/r/${tripCode.toUpperCase()}`, appOrigin()).toString()
}

export async function copyText(text: string): Promise<void> {
  await navigator.clipboard.writeText(text)
}

export type ShareInviteResult = "shared" | "copied" | "cancelled"

/**
 * Prefer the OS share sheet; fall back to copying the invite link.
 * AbortError (user dismissed the sheet) is returned as "cancelled".
 */
export async function shareOrCopyInvite(opts: {
  code: string
  name: string
}): Promise<ShareInviteResult> {
  const url = inviteLink(opts.code)
  const title = opts.name
  const text = `Join "${opts.name}" on Split — trip code ${opts.code}`

  if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
    try {
      await navigator.share({ title, text, url })
      return "shared"
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return "cancelled"
      }
      // Share failed (unsupported payload, permission, etc.) — copy instead.
    }
  }

  await copyText(url)
  return "copied"
}
