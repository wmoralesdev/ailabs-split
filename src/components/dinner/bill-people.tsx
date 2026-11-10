import { useRef, useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { HugeiconsIcon } from "@hugeicons/react"
import { Add01Icon } from "@hugeicons/core-free-icons"
import { toast } from "sonner"

import { BillPersonSheet } from "@/components/dinner/bill-person-sheet"
import { MemberPicker } from "@/components/member-picker"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  memberAssignedItems,
  replaceMemberInItems,
  unassignItemsForMember,
} from "@/lib/dinner-split"
import type { LineItem } from "@/lib/dinner-split"
import { mergeNames } from "@/lib/landing-prefs"
import { roomKeys } from "@/lib/room-query"
import {
  addRoomMembers,
  removeRoomMember,
  renameRoomMember,
} from "@/server/rooms"
import type { RoomDto } from "@/server/rooms"

function removeBlockReason({
  memberId,
  selfMemberId,
  paidById,
  room,
}: {
  memberId: string
  selfMemberId: string
  paidById: string
  room: RoomDto
}): string | null {
  if (memberId === selfMemberId) return "That's you on this device."
  if (room.members.length <= 1) return "Keep at least one person."
  if (memberId === paidById) {
    return "This person paid. Pick someone else first."
  }
  if (room.expenses.some((expense) => expense.paidById === memberId)) {
    return "This person paid. Pick someone else first."
  }
  if (
    room.expenses.some((expense) =>
      expense.shares.some((share) => share.memberId === memberId)
    )
  ) {
    return "Move the bill back to draft first."
  }
  if (
    room.settlements.some(
      (settlement) =>
        settlement.fromMemberId === memberId ||
        settlement.toMemberId === memberId
    )
  ) {
    return "Undo their payments first."
  }
  return null
}

/** Who is at the table and who paid, edited on the bill so items can be assigned right here. */
export function BillPeople({
  room,
  selfMemberId,
  paidById,
  onPaidByChange,
  items,
  onItemsChange,
}: {
  room: RoomDto
  selfMemberId: string
  paidById: string
  onPaidByChange: (memberId: string) => void
  items: LineItem[]
  onItemsChange: (items: LineItem[]) => void
}) {
  const queryClient = useQueryClient()
  const inputRef = useRef<HTMLInputElement>(null)
  const [draft, setDraft] = useState("")
  const [editingId, setEditingId] = useState<string | null>(null)
  const members = room.members
  const editing = members.find((member) => member.id === editingId) ?? null

  const addMutation = useMutation({
    mutationFn: (names: string[]) =>
      addRoomMembers({ data: { code: room.code, names } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: roomKeys.room(room.code),
      })
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Could not add people"
      )
    },
  })

  const renameMutation = useMutation({
    mutationFn: (name: string) => {
      if (!editingId) throw new Error("Person not found")
      return renameRoomMember({
        data: { code: room.code, memberId: editingId, name },
      })
    },
    onSuccess: async () => {
      setEditingId(null)
      await queryClient.invalidateQueries({
        queryKey: roomKeys.room(room.code),
      })
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Could not save the name"
      )
    },
  })

  const removeMutation = useMutation({
    mutationFn: async (snapshot: {
      memberId: string
      name: string
      items: LineItem[]
    }) => {
      onItemsChange(unassignItemsForMember(snapshot.items, snapshot.memberId))
      await removeRoomMember({
        data: { code: room.code, memberId: snapshot.memberId },
      })
      return snapshot
    },
    onMutate: () => {
      setEditingId(null)
    },
    onSuccess: async (snapshot) => {
      await queryClient.invalidateQueries({
        queryKey: roomKeys.room(room.code),
      })
      toast.success(`${snapshot.name} removed`, {
        duration: 5000,
        action: {
          label: "Undo",
          onClick: () => {
            void restorePerson(snapshot)
          },
        },
      })
    },
    onError: (error, snapshot) => {
      onItemsChange(snapshot.items)
      toast.error(
        error instanceof Error ? error.message : "Could not remove this person"
      )
    },
  })

  async function restorePerson(snapshot: {
    memberId: string
    name: string
    items: LineItem[]
  }) {
    try {
      const nextRoom = await addRoomMembers({
        data: { code: room.code, names: [snapshot.name] },
      })
      const created = nextRoom.members.find(
        (entry) => entry.name.toLowerCase() === snapshot.name.toLowerCase()
      )
      if (!created) throw new Error("Could not undo")
      queryClient.setQueriesData(
        { queryKey: roomKeys.room(room.code) },
        (current: RoomDto | null | undefined) => {
          if (!current) return nextRoom
          return { ...current, members: nextRoom.members }
        }
      )
      onItemsChange(
        replaceMemberInItems(snapshot.items, snapshot.memberId, created.id)
      )
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not undo")
    }
  }

  function submit() {
    const taken = new Set(members.map((member) => member.name.toLowerCase()))
    const names = mergeNames([], draft).filter(
      (name) => !taken.has(name.toLowerCase())
    )
    setDraft("")
    inputRef.current?.focus()
    if (names.length === 0) return
    addMutation.mutate(names)
  }

  const saving = renameMutation.isPending || removeMutation.isPending
  const assignedItems = editing ? memberAssignedItems(items, editing.id) : []
  const assignedAmountCents = assignedItems.reduce(
    (sum, item) => sum + item.amountCents,
    0
  )
  const blockReason = editing
    ? removeBlockReason({
        memberId: editing.id,
        selfMemberId,
        paidById,
        room,
      })
    : null

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
          <li key={member.id}>
            <button
              type="button"
              className="person-chip"
              aria-label={`Edit ${member.name}`}
              onClick={() => setEditingId(member.id)}
            >
              {member.name}
            </button>
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
          disabled={!draft.trim() || addMutation.isPending}
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
      <BillPersonSheet
        member={editing}
        open={editingId != null}
        saving={saving}
        assignedCount={assignedItems.length}
        assignedAmountCents={assignedAmountCents}
        currency={room.currency}
        blockReason={blockReason}
        onOpenChange={(open) => {
          if (!open && !saving) setEditingId(null)
        }}
        onRename={(name) => renameMutation.mutate(name)}
        onRemove={() => {
          if (!editing) return
          removeMutation.mutate({
            memberId: editing.id,
            name: editing.name,
            items,
          })
        }}
      />
    </section>
  )
}
