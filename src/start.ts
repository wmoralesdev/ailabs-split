import { clerkMiddleware } from "@clerk/tanstack-react-start/server"
import { createCsrfMiddleware, createStart } from "@tanstack/react-start"

const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === "serverFn",
})

const clerkEnabled = Boolean(
  process.env.CLERK_SECRET_KEY && process.env.CLERK_PUBLISHABLE_KEY
)

export const startInstance = createStart(() => ({
  requestMiddleware: [
    csrfMiddleware,
    ...(clerkEnabled
      ? [
          clerkMiddleware({
            authorizedParties: [
              "https://split.ailabs.sv",
              "https://ailabs.sv",
              "https://www.ailabs.sv",
              "http://localhost:3000",
            ],
            signInUrl: "/sign-in",
          }),
        ]
      : []),
  ],
}))
