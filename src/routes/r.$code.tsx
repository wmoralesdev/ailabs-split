import { useEffect, useState } from "react"
import {
  Link,
  Outlet,
  createFileRoute,
  useNavigate,
  useRouter,
} from "@tanstack/react-router"

import { WhoAreYouGate } from "@/components/who-are-you-gate"
import {
  forgetMember,
  rememberMember,
  resolveRememberedMember,
} from "@/lib/member-storage"
import { RoomIdentityContext } from "@/lib/room-identity"
import { claimMemberById, getRoomByCode, joinRoom } from "@/server/rooms"

type RoomSearch = {
  as?: string
}

export const Route = createFileRoute("/r/$code")({
  validateSearch: (search: Record<string, unknown>): RoomSearch => ({
    as: typeof search.as === "string" && search.as.trim() ? search.as.trim() : undefined,
  }),
  loader: async ({ params }) => {
    const room = await getRoomByCode({ data: { code: params.code } })
    if (!room) {
      throw new Error("Room not found")
    }
    return { room }
  },
  component: RoomLayout,
  errorComponent: ({ error }) => (
    <main className="page-gutter mx-auto flex min-h-dvh max-w-content flex-col justify-center">
      <h1 className="font-display text-3xl font-semibold">Room not found</h1>
      <p className="text-muted-foreground mt-2">{error.message}</p>
      <Link to="/" className="text-primary mt-6 underline">
        Back to Split
      </Link>
    </main>
  ),
})

function RoomLayout() {
  const { room } = Route.useLoaderData()
  const { as: asName } = Route.useSearch()
  const navigate = useNavigate()
  const router = useRouter()

  const [memberId, setMemberId] = useState<string | null>(() =>
    resolveRememberedMember(
      room.code,
      room.members.map((member) => member.id)
    )
  )
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    setHydrated(true)
    const remembered = resolveRememberedMember(
      room.code,
      room.members.map((member) => member.id)
    )
    if (remembered) {
      setMemberId(remembered)
      return
    }

    if (!asName) return

    const match = room.members.find(
      (member) => member.name.toLowerCase() === asName.toLowerCase()
    )
    if (match) {
      rememberMember(room.code, match.id)
      setMemberId(match.id)
      void navigate({
        to: ".",
        search: {},
        replace: true,
      })
      return
    }

    // Name from link is new to the room — claim via join
    let cancelled = false
    setPending(true)
    void joinRoom({ data: { code: room.code, memberName: asName } })
      .then(async (result) => {
        if (cancelled) return
        rememberMember(result.room.code, result.memberId)
        setMemberId(result.memberId)
        await router.invalidate()
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
  }, [asName, navigate, room.code, room.members, router])

  async function pickExisting(id: string) {
    setError(null)
    setPending(true)
    try {
      const claimed = await claimMemberById({
        data: { code: room.code, memberId: id },
      })
      rememberMember(room.code, claimed.memberId)
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
        data: { code: room.code, memberName: name },
      })
      rememberMember(result.room.code, result.memberId)
      setMemberId(result.memberId)
      await router.invalidate()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not claim name")
    } finally {
      setPending(false)
    }
  }

  function switchIdentity() {
    forgetMember(room.code)
    setMemberId(null)
    setError(null)
  }

  if (!hydrated) {
    return (
      <main className="page-gutter mx-auto flex min-h-dvh max-w-content items-center justify-center">
        <p className="text-muted-foreground text-sm">Loading…</p>
      </main>
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
      <Outlet />
    </RoomIdentityContext.Provider>
  )
}
