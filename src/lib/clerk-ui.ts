/** Clerk widgets need a publishable key and must not load during Playwright. */
export function clerkUiEnabled(): boolean {
  return (
    import.meta.env.VITE_E2E !== "1" &&
    Boolean(import.meta.env.CLERK_PUBLISHABLE_KEY)
  )
}

export function isE2eClient(): boolean {
  return import.meta.env.VITE_E2E === "1"
}
