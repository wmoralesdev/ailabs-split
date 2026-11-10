import { createServerFn } from "@tanstack/react-start"

export const fetchAuthState = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ userId: string | null }> => {
    // Server-only cookie/Clerk reads stay out of the client graph.
    const { getAuthUserId } = await import("./auth-user.server")
    return { userId: await getAuthUserId() }
  }
)
