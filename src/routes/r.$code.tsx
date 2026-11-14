import { useEffect, useRef, useState } from "react"
import {
  Link,
  Outlet,
  createFileRoute,
  useNavigate,
} from "@tanstack/react-router"
import { useQuery, useQueryClient } from "@tanstack/react-query"

import { CreateTripSuccessSheet } from "@/components/create-trip-success-sheet"
import { OnboardingSplash } from "@/components/onboarding-splash"
import { PageShell } from "@/components/page-shell"
import { RoomShell } from "@/components/room-shell"
import { RoomTabBar } from "@/components/room-tab-bar"
import { ShareTripButton } from "@/components/share-trip-button"
import { SyncStatus } from "@/components/sync-status"
import { Skeleton } from "@/components/ui/skeleton"
import { HouseRoomLayout } from "@/components/house/house-room-layout"
import { WhoAreYouGate } from "@/components/who-are-you-gate"
import { parseRoomKind } from "@/lib/room-kind"
import {
  forgetMember,
  rememberMember,
  resolveRememberedMember,
} from "@/lib/member-storage"
import { forgetInvite, rememberInvite } from "@/lib/pending-invite"
import { markInstallEligible } from "@/lib/pwa-install"
import { useSignedInUserId } from "@/lib/use-auth-user"
import { rememberRecentTrip } from "@/lib/recent-trips"
import { roomKeys, roomQueryOptions } from "@/lib/room-query"
import { RoomIdentityContext } from "@/lib/room-identity"
import { claimMemberById, joinRoom } from "@/server/rooms"

type RoomSearch = {
  as?: string
  created?: boolean
  claim?: string
}

export const Route = createFileRoute("/r/$code")({
  validateSearch: (search: Record<string, unknown>): RoomSearch => ({
    as:
      typeof search.as === "string" && search.as.trim()
        ? search.as.trim()
        : undefined,
    created:
      search.created === "1" ||
      search.created === true ||
      search.created === "true",
    claim:
      typeof search.claim === "string" && search.claim.trim()
        ? search.claim.trim()
        : undefined,
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
  errorComponent: ({ error }) => {
    const offline =
      typeof navigator !== "undefined" && navigator.onLine === false
    return (
      <PageShell innerClassName="flex min-h-dvh flex-col justify-center">
        <h1 className="font-display text-3xl font-semibold">
          {offline ? "Unavailable offline" : "Trip not found"}
        </h1>
        <p className="mt-2 text-muted-foreground">
          {offline
            ? "Open this trip once while online so it can be cached on this device."
            : error instanceof Error
              ? error.message
              : "Could not load this trip"}
        </p>
        <Link
          to="/"
          search={{ stay: true }}
          className="mt-6 text-primary underline"
        >
          Back to Split
        </Link>
      </PageShell>
    )
  },
})

function RoomLoadingShell() {
  return (
    <RoomShell>
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
    </RoomShell>
  )
}

function RoomLayout() {
  const { code } = Route.useParams()
  const { as: asName, created, claim } = Route.useSearch()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const userId = useSignedInUserId()
  const [memberId, setMemberId] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hydrated, setHydrated] = useState(false)
  const [inviteSplash, setInviteSplash] = useState(false)
  const inviteCheckedFor = useRef<string | null>(null)
  const [showCreatedSheet, setShowCreatedSheet] = useState(Boolean(created))

  const { data: room, isFetched } = useQuery(roomQueryOptions(code, memberId))

  const members = room?.members
  const invalidateRoom = () =>
    queryClient.invalidateQueries({ queryKey: roomKeys.room(code) })

  function dismissCreatedSheet() {
    setShowCreatedSheet(false)
    void navigate({
      to: "/r/$code",
      params: { code },
      search: (prev) => ({ ...prev, created: undefined }),
      replace: true,
    })
  }

  const createdSheet =
    room && showCreatedSheet ? (
      <CreateTripSuccessSheet
        open={showCreatedSheet}
        code={room.code}
        name={room.name}
        kind={room.kind}
        onContinue={dismissCreatedSheet}
        onAddBill={() => {
          setShowCreatedSheet(false)
          void navigate({ to: "/r/$code/check", params: { code } })
        }}
      />
    ) : null

  useEffect(() => {
    if (!room) return
    rememberRecentTrip({
      code: room.code,
      name: room.name,
      kind: room.kind,
    })
  }, [room?.code, room?.name, room?.kind])

  useEffect(() => {
    if (!members) return
    setHydrated(true)
    const memberIds = members.map((member) => member.id)
    const remembered = resolveRememberedMember(code, memberIds)
    if (inviteCheckedFor.current === code) {
      // Decided once per room; a refetch must not reopen a dismissed splash.
    } else if (created) {
      forgetInvite()
    } else if (userId) {
      // Signed in and here: the invite has done its job.
      forgetInvite(room.code)
    } else if (!remembered) {
      // A signed-out newcomer from a link: show the splash, and keep the
      // room so signing in (however the flow ends) lands back here.
      rememberInvite({ code: room.code, kind: room.kind })
      setInviteSplash(true)
    }
    inviteCheckedFor.current = code
    if (parseRoomKind(room.kind) === "HOUSEHOLD") return
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
  }, [asName, code, members, created, userId])

  async function pickExisting(id: string) {
    setError(null)
    setPending(true)
    try {
      const claimed = await claimMemberById({
        data: { code, memberId: id },
      })
      rememberMember(code, claimed.memberId)
      markInstallEligible()
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
      markInstallEligible()
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

  if (!room) {
    if (isFetched) {
      return (
        <PageShell innerClassName="flex min-h-dvh flex-col justify-center">
          <h1 className="font-display text-3xl font-semibold">
            Trip not found
          </h1>
          <p className="mt-2 text-muted-foreground">Could not load this trip</p>
          <Link
            to="/"
            search={{ stay: true }}
            className="mt-6 text-primary underline"
          >
            Back to Split
          </Link>
        </PageShell>
      )
    }
    return (
      <>
        <RoomLoadingShell />
        {createdSheet}
      </>
    )
  }

  if (!hydrated) {
    return (
      <>
        <RoomLoadingShell />
        {createdSheet}
      </>
    )
  }

  if (inviteSplash) {
    return (
      <OnboardingSplash
        invite={{ code: room.code, name: room.name, kind: room.kind }}
      />
    )
  }

  if (parseRoomKind(room.kind) === "HOUSEHOLD") {
    return (
      <HouseRoomLayout
        code={code}
        claimMemberId={claim}
        suggestedName={asName}
        createdSheet={createdSheet}
      />
    )
  }

  if (!memberId) {
    return (
      <>
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
        {createdSheet}
      </>
    )
  }

  return (
    <RoomIdentityContext.Provider value={{ memberId, switchIdentity }}>
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
