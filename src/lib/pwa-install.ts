const DISMISS_KEY = "split:pwa-install-dismissed"
const ELIGIBLE_KEY = "split:pwa-install-eligible"
const DISMISS_MS = 1000 * 60 * 60 * 24 * 14 // 14 days

export type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>
}

export function isStandaloneDisplay(): boolean {
  if (typeof window === "undefined") return true
  const media = window.matchMedia("(display-mode: standalone)").matches
  const iosStandalone =
    "standalone" in window.navigator &&
    Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone)
  return media || iosStandalone
}

export function isIosDevice(): boolean {
  if (typeof navigator === "undefined") return false
  const ua = navigator.userAgent
  const iOS = /iPad|iPhone|iPod/.test(ua)
  const iPadOs =
    navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1
  return iOS || iPadOs
}

export function isInstallDismissed(): boolean {
  if (typeof window === "undefined") return true
  const raw = window.localStorage.getItem(DISMISS_KEY)
  if (!raw) return false
  const until = Number.parseInt(raw, 10)
  if (!Number.isFinite(until)) return false
  return Date.now() < until
}

export function dismissInstallPrompt(): void {
  if (typeof window === "undefined") return
  window.localStorage.setItem(DISMISS_KEY, String(Date.now() + DISMISS_MS))
}

/** Call after first successful create or join so the install banner can appear. */
export function markInstallEligible(): void {
  if (typeof window === "undefined") return
  window.localStorage.setItem(ELIGIBLE_KEY, "1")
  window.dispatchEvent(new Event("split:pwa-install-eligible"))
}

export function isInstallEligible(): boolean {
  if (typeof window === "undefined") return false
  return window.localStorage.getItem(ELIGIBLE_KEY) === "1"
}
