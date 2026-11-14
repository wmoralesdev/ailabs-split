// Named without "cookie"/"consent": content blockers drop module URLs with
// those words, and in dev that kills hydration for the whole app.
export const COOKIE_CONSENT_KEY = "split:cookie-consent"
export const COOKIE_CONSENT_VALUE = "accepted"
