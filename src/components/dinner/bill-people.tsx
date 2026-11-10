import { useRef, useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { HugeiconsIcon } from "@hugeicons/react"
import { Add01Icon } from "@hugeicons/core-free-icons"
import { toast } from "sonner"

import { MemberPicker } from "@/components/member-picker"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { mergeNames } from "@/lib/landing-prefs"
import { roomKeys } from "@/lib/room-query"
import { addRoomMembers } from "@/server/rooms"
import type { RoomMemberDto } from "@/server/rooms"

/** Who is at the table and who paid, edited on the bill so items can be assigned right here. */
export function BillPeople({
  code,
  members,
  paidById,
  onPaidByChange,
}: {
  code: string
  members: RoomMemberDto[]
  paidById: string
  onPaidByChange: (memberId: string) => void
}) {
  const queryClient = useQueryClient()
  const inputRef = useRef<HTMLInputElement>(null)
  const [draft, setDraft] = useState("")

  const mutation = useMutation({
    mutationFn: (names: string[]) => addRoomMembers({ data: { code, names } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: roomKeys.room(code) })
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Could not add people"
      )
    },
  })

  function submit() {
    const taken = new Set(members.map((member) => member.name.toLowerCase()))
    const names = mergeNames([], draft).filter(
      (name) => !taken.has(name.toLowerCase())
    )
    setDraft("")
    inputRef.current?.focus()
    if (names.length === 0) return
    mutation.mutate(names)
  }

  return (
    <section aria-labelledby="bill-people-heading">
      <div className="flex items-baseline justify-between gap-3">
        <h2
          id="bill-people-heading"
          className="font-display text-lg font-semibold"
        >
          People
        </h2>
        <p className="text-[13px] text-muted-foreground">
          {members.length} {members.length === 1 ? "person" : "people"}
        </p>
      </div>
      <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="At the table">
        {members.map((member) => (
          <li key={member.id} className="person-chip">
            {member.name}
          </li>
        ))}
      </ul>
      <form
        className="mt-2.5 flex gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          submit()
        }}
      >
        <Label htmlFor="bill-add-person" className="sr-only">
          Add people
        </Label>
        <Input
          ref={inputRef}
          id="bill-add-person"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Add a guest's name"
          autoComplete="off"
          enterKeyHint="done"
          className="flex-1"
        />
        <Button
          type="submit"
          className="shrink-0 px-4"
          disabled={!draft.trim() || mutation.isPending}
        >
          <HugeiconsIcon icon={Add01Icon} size={16} strokeWidth={2} />
          Add
        </Button>
      </form>
      {members.length > 1 ? (
        <div className="mt-4 grid gap-2">
          <Label>Paid by</Label>
          <MemberPicker
            members={members}
            value={paidById}
            onChange={onPaidByChange}
          />
        </div>
      ) : null}
    </section>
  )
}
