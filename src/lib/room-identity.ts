import { createContext, useContext } from "react"

type RoomIdentity = {
  memberId: string
  switchIdentity: () => void
}

const RoomIdentityContext = createContext<RoomIdentity | null>(null)

function useRoomIdentity(): RoomIdentity {
  const value = useContext(RoomIdentityContext)
  if (!value) {
    throw new Error("useRoomIdentity must be used inside a claimed room")
  }
  return value
}

export { RoomIdentityContext, useRoomIdentity }
export type { RoomIdentity }
