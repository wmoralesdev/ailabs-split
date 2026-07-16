import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { RoomMemberDto } from "@/server/rooms"

type WhoAreYouGateProps = {
  roomName: string
  roomCode: string
  members: RoomMemberDto[]
  suggestedName?: string
  pending?: boolean
  error?: string | null
  onPickExisting: (memberId: string) => void
  onClaimName: (name: string) => void
}

function WhoAreYouGate({
  roomName,
  roomCode,
  members,
  suggestedName = "",
  pending = false,
  error = null,
  onPickExisting,
  onClaimName,
}: WhoAreYouGateProps) {
  const [newName, setNewName] = useState(suggestedName)
  const [mode, setMode] = useState<"pick" | "new">(
    members.length > 0 ? "pick" : "new"
  )

  return (
    <main className="split-hero-wash page-gutter relative mx-auto flex min-h-dvh max-w-content flex-col justify-center py-12">
      <p className="font-display text-split text-sm font-semibold tracking-wide">
        Split
      </p>
      <h1 className="font-display mt-3 text-4xl font-semibold tracking-tight">
        Who are you?
      </h1>
      <p className="text-muted-foreground mt-3 max-w-md text-base">
        You&rsquo;re in <span className="text-foreground font-medium">{roomName}</span>
        {" "}
        (<span className="font-display tracking-widest">{roomCode}</span>). Pick your
        name to continue on this device — no account needed.
      </p>

      {mode === "pick" && members.length > 0 ? (
        <div className="mt-8 flex flex-col gap-3">
          <p className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
            I&rsquo;m already in this room
          </p>
          <ul className="flex flex-col gap-2">
            {members.map((member) => (
              <li key={member.id}>
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  disabled={pending}
                  className="h-12 w-full justify-start px-4 text-base"
                  onClick={() => onPickExisting(member.id)}
                >
                  {member.name}
                </Button>
              </li>
            ))}
          </ul>
          <button
            type="button"
            className="text-primary mt-2 text-left text-sm font-medium"
            onClick={() => setMode("new")}
          >
            I&rsquo;m new — add my name
          </button>
        </div>
      ) : (
        <form
          className="mt-8 flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault()
            const trimmed = newName.trim()
            if (!trimmed) return
            onClaimName(trimmed)
          }}
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor="claim-name">Your name</Label>
            <Input
              id="claim-name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Walter"
              required
              autoFocus
              className="h-11"
            />
            <p className="text-muted-foreground text-xs">
              Matches an existing member (case-insensitive) or adds you.
            </p>
          </div>
          <Button
            type="submit"
            size="lg"
            disabled={pending || !newName.trim()}
            className="h-12 text-base"
          >
            {pending ? "Continuing…" : "Continue"}
          </Button>
          {members.length > 0 ? (
            <button
              type="button"
              className="text-primary text-left text-sm font-medium"
              onClick={() => setMode("pick")}
            >
              Pick from the list instead
            </button>
          ) : null}
        </form>
      )}

      {error ? (
        <p className="text-destructive mt-4 text-sm" role="alert">
          {error}
        </p>
      ) : null}
    </main>
  )
}

export { WhoAreYouGate }
export type { WhoAreYouGateProps }
