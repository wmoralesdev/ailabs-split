import { useUser } from "@clerk/tanstack-react-start"
import type { ReactNode } from "react"

import { clerkDisplayName } from "@/lib/clerk-display-name"
import { clerkUiEnabled } from "@/lib/clerk-ui"

/** Clerk JS name when widgets are on; otherwise the server/e2e name. */
export function WithDisplayName({
  serverName,
  children,
}: {
  serverName: string
  children: (displayName: string) => ReactNode
}) {
  if (!clerkUiEnabled()) return children(serverName)
  return (
    <ClerkLiveDisplayName serverName={serverName}>
      {children}
    </ClerkLiveDisplayName>
  )
}

function ClerkLiveDisplayName({
  serverName,
  children,
}: {
  serverName: string
  children: (displayName: string) => ReactNode
}) {
  const { user } = useUser()
  return children(clerkDisplayName(user) || serverName)
}
