import { useEffect, useState } from "react"
import {
  Link,
  Outlet,
  createFileRoute,
  useNavigate,
} from "@tanstack/react-router"
import { useQuery, useQueryClient } from "@tanstack/react-query"

import { AppHeader } from "@/components/app-header"
import { RoomTabBar } from "@/components/room-tab-bar"
import { ShareTripButton } from "@/components/share-trip-button"
import { SplitAtmosphere } from "@/components/split-atmosphere"
import { Skeleton } from "@/components/ui/skeleton"
import { WhoAreYouGate } from "@/components/who-are-you-gate"
import {
  forgetMember,
  rememberMember,
  resolveRememberedMember,
} from "@/lib/member-storage"
import { rememberRecentTrip } from "@/lib/recent-trips"
import { roomKeys, roomQueryOptions } from "@/lib/room-query"
import { RoomIdentityContext } from "@/lib/room-identity"
import { claimMemberById, joinRoom } from "@/server/rooms"

type RoomSearch = {
  as?: string
}

export const Route = createFileRoute("/r/$code")({
  validateSearch: (search: Record<string, unknown>): RoomSearch => ({
    as: typeof search.as === "string" && search.as.trim() ? search.as.trim() : undefined,
  }),
  loader: async ({ params, context }) => {
    const room = await context.queryClient.ensureQueryData(
      roomQueryOptions(params.code)
    )
    if (!room) {
      throw new Error("Trip not found")
    }
    return { room }
  },
  component: RoomLayout,
  errorComponent: ({ error }) => (
    <SplitAtmosphere as="main">
      <div className="page-gutter relative mx-auto flex min-h-dvh max-w-content flex-col justify-center">
        <h1 className="font-display text-3xl font-semibold">Trip not found</h1>
        <p className="text-muted-foreground mt-2">{error.message}</p>
        <Link to="/" className="text-primary mt-6 underline">
          Back to Split
        </Link>
      </div>
    </SplitAtmosphere>
  ),
})

function RoomLayout() {
  const { code } = Route.useParams()
  const { as: asName } = Route.useSearch()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { data: room } = useQuery(roomQueryOptions(code))

  const [memberId, setMemberId] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hydrated, setHydrated] = useState(false)

  const members = room?.members
  const invalidateRoom = () =>
    queryClient.invalidateQueries({ queryKey: roomKeys.detail(code) })

  useEffect(() => {
    if (!memberId || !room) return
    rememberRecentTrip({ code: room.code, name: room.name })
  }, [memberId, room?.code, room?.name])

  useEffect(() => {
    if (!members) return
    setHydrated(true)
    const memberIds = members.map((member) => member.id)
    const remembered = resolveRememberedMember(code, memberIds)
    if (remembered) {
      setMemberId(remembered)
      return
    }

    if (!asName) return

    const match = members.find(
      (member) => member.name.toLowerCase() === asName.toLowerCase()
    )
    if (match) {
      rememberMember(code, match.id)
      setMemberId(match.id)
      void navigate({ to: ".", search: {}, replace: true })
      return
    }

    // Name from link is new to the room — claim via join
    let cancelled = false
    setPending(true)
    void joinRoom({ data: { code, memberName: asName } })
      .then(async (result) => {
        if (cancelled) return
        rememberMember(result.room.code, result.memberId)
        setMemberId(result.memberId)
        await invalidateRoom()
        await navigate({ to: ".", search: {}, replace: true })
      })
      .catch((err) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : "Could not claim name")
      })
      .finally(() => {
        if (!cancelled) setPending(false)
      })

    return () => {
      cancelled = true
    }
  }, [asName, code, members])

  async function pickExisting(id: string) {
    setError(null)
    setPending(true)
    try {
      const claimed = await claimMemberById({
        data: { code, memberId: id },
      })
      rememberMember(code, claimed.memberId)
      setMemberId(claimed.memberId)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not claim member")
    } finally {
      setPending(false)
    }
  }

  async function claimName(name: string) {
    setError(null)
    setPending(true)
    try {
      const result = await joinRoom({
        data: { code, memberName: name },
      })
      rememberMember(result.room.code, result.memberId)
      setMemberId(result.memberId)
      await invalidateRoom()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not claim name")
    } finally {
      setPending(false)
    }
  }

  function switchIdentity() {
    forgetMember(code)
    setMemberId(null)
    setError(null)
  }

  if (!room || !hydrated) {
    return (
      <SplitAtmosphere className="flex flex-col" stippleClassName="opacity-30">
        <div className="relative flex min-h-dvh flex-col">
          <AppHeader />
          <main className="page-gutter mx-auto w-full max-w-content pt-6">
            <Skeleton className="h-8 w-40" />
            <Skeleton className="mt-3 h-6 w-28 rounded-full" />
            <Skeleton className="mt-6 h-20 w-full rounded-lg" />
            <Skeleton className="mt-8 h-5 w-24" />
            <div className="mt-3 space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
            <Skeleton className="mt-8 h-5 w-24" />
            <div className="mt-3 space-y-2">
              <Skeleton className="h-16 w-full rounded-lg" />
              <Skeleton className="h-16 w-full rounded-lg" />
            </div>
          </main>
        </div>
      </SplitAtmosphere>
    )
  }

  if (!memberId) {
    return (
      <WhoAreYouGate
        roomName={room.name}
        roomCode={room.code}
        members={room.members}
        suggestedName={asName}
        pending={pending}
        error={error}
        onPickExisting={(id) => void pickExisting(id)}
        onClaimName={(name) => void claimName(name)}
      />
    )
  }

  return (
    <RoomIdentityContext.Provider value={{ memberId, switchIdentity }}>
      <SplitAtmosphere className="flex flex-col" stippleClassName="opacity-30">
        <div className="relative flex min-h-dvh flex-col">
          <AppHeader
            right={<ShareTripButton code={room.code} name={room.name} />}
          />
          <div className="flex-1 pb-28">
            <Outlet />
          </div>
          <RoomTabBar code={code} />
        </div>
      </SplitAtmosphere>
    </RoomIdentityContext.Provider>
  )
}
