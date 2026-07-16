import { useState } from "react"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { RoomMemberDto } from "@/server/rooms"

type MemberIdentityPickerProps = {
  members: RoomMemberDto[]
  suggestedName?: string
  pending?: boolean
  error?: string | null
  onPickExisting: (memberId: string) => void
  onClaimName: (name: string) => void
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("")
}

function MemberIdentityPicker({
  members,
  suggestedName = "",
  pending = false,
  error = null,
  onPickExisting,
  onClaimName,
}: MemberIdentityPickerProps) {
  const [newName, setNewName] = useState(suggestedName)
  const [mode, setMode] = useState<"pick" | "new">(
    members.length > 0 ? "pick" : "new"
  )

  return (
    <div className="flex flex-col gap-3">
      {mode === "pick" && members.length > 0 ? (
        <>
          <p className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
            I&rsquo;m already in this trip
          </p>
          <ul className="flex flex-col gap-2">
            {members.map((member) => (
              <li key={member.id}>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => onPickExisting(member.id)}
                  className="border-border bg-background/70 hover:bg-background shadow-soft flex min-h-14 w-full items-center gap-3 rounded-xl border px-3 text-left transition-colors disabled:opacity-50"
                >
                  <Avatar className="size-10">
                    <AvatarFallback className="bg-accent text-accent-foreground text-sm font-semibold">
                      {initials(member.name)}
                    </AvatarFallback>
                  </Avatar>
                  <span className="text-base font-medium">{member.name}</span>
                </button>
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
        </>
      ) : (
        <form
          className="flex flex-col gap-4"
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
            />
            <p className="text-muted-foreground text-xs">
              Matches an existing member (case-insensitive) or adds you.
            </p>
          </div>
          <Button type="submit" size="lg" disabled={pending || !newName.trim()}>
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
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}

export { MemberIdentityPicker }
export type { MemberIdentityPickerProps }
