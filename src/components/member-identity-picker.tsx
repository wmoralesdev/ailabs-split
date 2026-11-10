import { useState } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { ArrowRight01Icon } from "@hugeicons/core-free-icons"

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
    <div className="flex flex-col gap-2">
      {mode === "pick" && members.length > 0 ? (
        <>
          <p className="group-label">I&rsquo;m already in this trip</p>
          <ul className="group-list">
            {members.map((member) => (
              <li key={member.id}>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => onPickExisting(member.id)}
                  className="group-row-hit w-full text-left disabled:opacity-50"
                >
                  <Avatar className="size-8">
                    <AvatarFallback className="bg-accent text-xs font-semibold text-accent-foreground">
                      {initials(member.name)}
                    </AvatarFallback>
                  </Avatar>
                  <span className="flex-1 text-[15px] font-medium">
                    {member.name}
                  </span>
                  <HugeiconsIcon
                    icon={ArrowRight01Icon}
                    size={16}
                    strokeWidth={2}
                    className="text-muted-foreground/60"
                  />
                </button>
              </li>
            ))}
          </ul>
          <button
            type="button"
            className="text-action mt-1 text-[15px]"
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
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="claim-name">Your name</Label>
            <Input
              id="claim-name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Walter"
              required
              autoFocus
            />
            <p className="text-[13px] leading-snug text-muted-foreground">
              Matches an existing member (case-insensitive) or adds you.
            </p>
          </div>
          <Button type="submit" disabled={pending || !newName.trim()}>
            {pending ? "Continuing…" : "Continue"}
          </Button>
          {members.length > 0 ? (
            <button
              type="button"
              className="text-action text-[15px]"
              onClick={() => setMode("pick")}
            >
              Pick from the list instead
            </button>
          ) : null}
        </form>
      )}

      {error ? (
        <p className="text-[13px] text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}

export { MemberIdentityPicker }
export type { MemberIdentityPickerProps }
