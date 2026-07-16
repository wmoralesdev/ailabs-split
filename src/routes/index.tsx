import { useState } from "react"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { HugeiconsIcon } from "@hugeicons/react"
import { Add01Icon, Login01Icon } from "@hugeicons/core-free-icons"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { rememberMember } from "@/lib/member-storage"
import { CURRENCY_OPTIONS, normalizeRoomCode } from "@/lib/room-code"
import { createRoom, joinRoom } from "@/server/rooms"

export const Route = createFileRoute("/")({
  component: LandingPage,
})

function LandingPage() {
  const navigate = useNavigate()
  const [mode, setMode] = useState<"create" | "join">("create")
  const [roomName, setRoomName] = useState("")
  const [currency, setCurrency] = useState("USD")
  const [membersRaw, setMembersRaw] = useState("")
  const [joinCode, setJoinCode] = useState("")
  const [joinName, setJoinName] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    setPending(true)
    try {
      const memberNames = membersRaw
        .split(/[\n,]/)
        .map((name) => name.trim())
        .filter(Boolean)
      const room = await createRoom({
        data: { name: roomName, currency, memberNames },
      })
      await navigate({ to: "/r/$code", params: { code: room.code } })
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create room")
    } finally {
      setPending(false)
    }
  }

  async function handleJoin(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    setPending(true)
    try {
      const code = normalizeRoomCode(joinCode)
      const result = await joinRoom({
        data: {
          code,
          memberName: joinName.trim(),
        },
      })
      rememberMember(result.room.code, result.memberId)
      await navigate({ to: "/r/$code", params: { code: result.room.code } })
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not join room")
    } finally {
      setPending(false)
    }
  }

  return (
    <main className="split-hero-wash relative min-h-dvh overflow-hidden">
      <div
        aria-hidden
        className="split-stipple pointer-events-none absolute inset-0 opacity-40"
      />
      <div className="page-gutter relative mx-auto flex min-h-dvh max-w-content flex-col justify-center py-12">
        <div className="animate-rise">
          <p className="font-display text-split text-6xl font-semibold tracking-tight sm:text-7xl md:text-8xl">
            Split
          </p>
          <p className="text-muted-foreground animate-rise-delay mt-4 max-w-md text-lg sm:text-xl">
            Split trip costs. No accounts.
          </p>
        </div>

        <div className="animate-rise-delay-2 mt-10 flex gap-3">
          <Button
            type="button"
            size="lg"
            variant={mode === "create" ? "default" : "outline"}
            onClick={() => setMode("create")}
            className="h-11 px-4"
          >
            <HugeiconsIcon icon={Add01Icon} strokeWidth={2} />
            Create
          </Button>
          <Button
            type="button"
            size="lg"
            variant={mode === "join" ? "default" : "outline"}
            onClick={() => setMode("join")}
            className="h-11 px-4"
          >
            <HugeiconsIcon icon={Login01Icon} strokeWidth={2} />
            Join
          </Button>
        </div>

        {mode === "create" ? (
          <form
            onSubmit={handleCreate}
            className="mt-8 flex flex-col gap-5"
          >
            <div className="flex flex-col gap-2">
              <Label htmlFor="room-name">Trip name</Label>
              <Input
                id="room-name"
                value={roomName}
                onChange={(e) => setRoomName(e.target.value)}
                placeholder="Beach weekend"
                required
                className="h-11"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="currency">Currency</Label>
              <Select
                value={currency}
                onValueChange={(value) => {
                  if (value) setCurrency(value)
                }}
              >
                <SelectTrigger id="currency" className="h-11 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CURRENCY_OPTIONS.map((option) => (
                    <SelectItem key={option.code} value={option.code}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="members">Members</Label>
              <textarea
                id="members"
                value={membersRaw}
                onChange={(e) => setMembersRaw(e.target.value)}
                placeholder={"Walter\nDaniela\nMario"}
                required
                rows={4}
                className="border-input bg-background placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 w-full rounded-md border px-3 py-2 text-sm outline-none focus-visible:ring-2"
              />
              <p className="text-muted-foreground text-xs">
                One name per line (or commas). At least two.
              </p>
            </div>
            <Button
              type="submit"
              size="lg"
              disabled={pending}
              className="h-12 text-base"
            >
              {pending ? "Creating…" : "Create room"}
            </Button>
          </form>
        ) : (
          <form onSubmit={handleJoin} className="mt-8 flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <Label htmlFor="join-code">Room code</Label>
              <Input
                id="join-code"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                placeholder="7-character code"
                required
                minLength={6}
                maxLength={8}
                className="font-display h-14 text-center text-2xl tracking-[0.2em] uppercase"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="join-name">Your name</Label>
              <Input
                id="join-name"
                value={joinName}
                onChange={(e) => setJoinName(e.target.value)}
                placeholder="Matches or adds you in the room"
                required
                className="h-11"
              />
              <p className="text-muted-foreground text-xs">
                Same name as on another device? Enter it to reclaim yourself.
              </p>
            </div>
            <Button
              type="submit"
              size="lg"
              disabled={pending}
              className="h-12 text-base"
            >
              {pending ? "Joining…" : "Join room"}
            </Button>
          </form>
        )}

        {error ? (
          <p className="text-destructive mt-4 text-sm" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </main>
  )
}
