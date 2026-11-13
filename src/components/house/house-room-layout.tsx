import { useEffect, useState } from "react"
import { Outlet, useNavigate } from "@tanstack/react-router"
import type { ReactNode } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"

import { HouseGate } from "@/components/house/house-gate"
import { RoomShell } from "@/components/room-shell"
import { RoomTabBar } from "@/components/room-tab-bar"
import { ShareTripButton } from "@/components/share-trip-button"
import { SyncStatus } from "@/components/sync-status"
import {
  forgetMember,
  recallMember,
  rememberMember,
} from "@/lib/member-storage"
import { markInstallEligible } from "@/lib/pwa-install"
import { RoomIdentityContext } from "@/lib/room-identity"
import { roomKeys, roomQueryOptions } from "@/lib/room-query"
import {
  claimHouseGuest,
  claimHousemate,
  joinHouseAsGuest,
  joinHouseAsHousemate,
} from "@/server/houses"

export function HouseRoomLayout({
  code,
  claimMemberId,
  suggestedName,
  createdSheet,
}: {
  code: string
  claimMemberId?: string
  suggestedName?: string
  createdSheet: ReactNode
}) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [memberId, setMemberId] = useState<string | null>(() =>
    recallMember(code)
  )
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [claimAttempted, setClaimAttempted] = useState(false)

  const { data: room } = useQuery(roomQueryOptions(code, memberId))

  const invalidateRoom = () =>
    queryClient.invalidateQueries({ queryKey: roomKeys.room(code) })

  useEffect(() => {
    const viewerId = room?.house?.viewer.memberId
    if (!viewerId) return
    rememberMember(code, viewerId)
    setMemberId(viewerId)
  }, [code, room?.house?.viewer.memberId])

  useEffect(() => {
    if (!room || !claimMemberId || claimAttempted) return
    if (room.house?.viewer.memberId) return
    setClaimAttempted(true)
    setPending(true)
    setError(null)
    void claimHousemate({ data: { code, memberId: claimMemberId } })
      .then(async (result) => {
        rememberMember(code, result.memberId)
        markInstallEligible()
        setMemberId(result.memberId)
        await invalidateRoom()
        await navigate({
          to: "/r/$code",
          params: { code },
          search: {},
          replace: true,
        })
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Could not claim")
      })
      .finally(() => setPending(false))
  }, [room, claimMemberId, claimAttempted, code, navigate])

  async function onClaimHousemate(id: string) {
    setError(null)
    setPending(true)
    try {
      const result = await claimHousemate({ data: { code, memberId: id } })
      rememberMember(code, result.memberId)
      markInstallEligible()
      setMemberId(result.memberId)
      await invalidateRoom()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not claim")
    } finally {
      setPending(false)
    }
  }

  async function onJoinHousemate(name: string) {
    setError(null)
    setPending(true)
    try {
      const result = await joinHouseAsHousemate({ data: { code, name } })
      rememberMember(code, result.memberId)
      markInstallEligible()
      setMemberId(result.memberId)
      await invalidateRoom()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not join")
    } finally {
      setPending(false)
    }
  }

  async function onJoinGuest(name: string) {
    setError(null)
    setPending(true)
    try {
      const result = await joinHouseAsGuest({ data: { code, name } })
      rememberMember(code, result.memberId)
      markInstallEligible()
      setMemberId(result.memberId)
      await invalidateRoom()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not join")
    } finally {
      setPending(false)
    }
  }

  async function onClaimGuest(id: string) {
    setError(null)
    setPending(true)
    try {
      const result = await claimHouseGuest({ data: { code, memberId: id } })
      rememberMember(code, result.memberId)
      markInstallEligible()
      setMemberId(result.memberId)
      await invalidateRoom()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not join")
    } finally {
      setPending(false)
    }
  }

  function switchIdentity() {
    forgetMember(code)
    setMemberId(null)
    setError(null)
  }

  if (!room) return <>{createdSheet}</>

  const viewerId = room.house?.viewer.memberId ?? memberId
  if (!viewerId) {
    return (
      <>
        <HouseGate
          room={room}
          suggestedName={suggestedName}
          pending={pending}
          error={error}
          onClaimHousemate={(id) => void onClaimHousemate(id)}
          onJoinHousemate={(name) => void onJoinHousemate(name)}
          onJoinGuest={(name) => void onJoinGuest(name)}
          onClaimGuest={(id) => void onClaimGuest(id)}
        />
        {createdSheet}
      </>
    )
  }

  return (
    <RoomIdentityContext.Provider
      value={{ memberId: viewerId, switchIdentity }}
    >
      <RoomShell
        headerRight={
          <>
            <SyncStatus />
            <ShareTripButton
              code={room.code}
              name={room.name}
              kind={room.kind}
            />
          </>
        }
        footer={<RoomTabBar code={code} kind={room.kind} />}
      >
        <Outlet />
      </RoomShell>
      {createdSheet}
    </RoomIdentityContext.Provider>
  )
}
