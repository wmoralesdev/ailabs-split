import { useState } from "react"
import { useNavigate } from "@tanstack/react-router"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { HugeiconsIcon } from "@hugeicons/react"
import { ArrowLeft01Icon } from "@hugeicons/core-free-icons"
import { toast } from "sonner"

import { HousePersonSheet } from "@/components/house/house-person-sheet"
import { NameListInput } from "@/components/name-list-input"
import { Button } from "@/components/ui/button"
import {
  houseBalanceCopy,
  houseNets,
  memberHasHouseLedger,
} from "@/lib/house-ledger"
import { formatDay, isMovedOutOn, localIsoDate } from "@/lib/house-month"
import {
  canManagePeople,
  canSetMemberDates,
  canTransferHouse,
  transferBeforeMoveOutMessage,
} from "@/lib/house-permissions"
import type { HouseMemberDto } from "@/lib/house-types"
import { roomKeys } from "@/lib/room-query"
import { cn } from "@/lib/utils"
import {
  addHousePeople,
  removeHouseMember,
  renameHouseMember,
  setHouseMemberKind,
  setHouseMemberStay,
  transferHouse,
} from "@/server/houses"
import type { RoomDto } from "@/server/rooms"

function viewerPayload(room: RoomDto) {
  return {
    code: room.code,
    viewerMemberId: room.house?.viewer.memberId ?? undefined,
  }
}

function memberSubtitle(member: HouseMemberDto, today: string): string {
  const bits: string[] = []
  if (member.joinedOn) bits.push(`Moved in ${formatDay(member.joinedOn)}`)
  if (member.isOwner) bits.push("Owner")
  else if (!member.claimed && !member.isGuest) bits.push("Not claimed yet")
  if (member.leftOn && isMovedOutOn(member.leftOn, today)) {
    bits.push(`Moved out ${formatDay(member.leftOn)}`)
  }
  return bits.join(" · ")
}

export function HousePeople({ room }: { room: RoomDto }) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const today = localIsoDate()
  const house = room.house
  const role = house?.viewer.role ?? "VISITOR"
  const actorId = house?.viewer.memberId ?? null
  const members = house?.members ?? []
  const nets = houseNets(room.members, room.expenses, room.settlements)
  const netById = new Map(nets.map((row) => [row.memberId, row.netCents]))
  const [draft, setDraft] = useState("")
  const [names, setNames] = useState<string[]>([])
  const [asGuest, setAsGuest] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [transferOpen, setTransferOpen] = useState(false)

  const editing = members.find((member) => member.id === editingId) ?? null
  const manage = canManagePeople(role)

  const housemates = members.filter(
    (member) => !member.isGuest && !isMovedOutOn(member.leftOn, today)
  )
  const movedOut = members.filter(
    (member) => !member.isGuest && isMovedOutOn(member.leftOn, today)
  )
  const guests = members.filter((member) => member.isGuest)
  const transferTargets = housemates.filter(
    (member) => member.claimed && !member.isOwner
  )

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: roomKeys.room(room.code) })
  }

  const addMutation = useMutation({
    mutationFn: () =>
      addHousePeople({
        data: { ...viewerPayload(room), names, isGuest: asGuest },
      }),
    onSuccess: async () => {
      setNames([])
      setDraft("")
      await invalidate()
      toast.success(asGuest ? "Guests added" : "Housemates added")
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
      return renameHouseMember({
        data: { ...viewerPayload(room), memberId: editingId, name },
      })
    },
    onSuccess: async () => {
      setEditingId(null)
      await invalidate()
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Could not save the name"
      )
    },
  })

  const stayMutation = useMutation({
    mutationFn: (input: {
      memberId: string
      joinedOn?: string | null
      leftOn?: string | null
    }) =>
      setHouseMemberStay({
        data: { ...viewerPayload(room), ...input },
      }),
    onSuccess: async () => {
      await invalidate()
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Could not save dates"
      )
    },
  })

  const kindMutation = useMutation({
    mutationFn: (isGuest: boolean) => {
      if (!editingId) throw new Error("Person not found")
      return setHouseMemberKind({
        data: { ...viewerPayload(room), memberId: editingId, isGuest },
      })
    },
    onSuccess: async () => {
      await invalidate()
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Could not change this person"
      )
    },
  })

  const removeMutation = useMutation({
    mutationFn: () => {
      if (!editingId) throw new Error("Person not found")
      return removeHouseMember({
        data: { ...viewerPayload(room), memberId: editingId },
      })
    },
    onSuccess: async () => {
      setEditingId(null)
      await invalidate()
      toast.success("Removed")
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Could not remove")
    },
  })

  const transferMutation = useMutation({
    mutationFn: (toMemberId: string) =>
      transferHouse({
        data: { ...viewerPayload(room), toMemberId },
      }),
    onSuccess: async () => {
      setTransferOpen(false)
      await invalidate()
      toast.success("House transferred")
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Could not transfer the house"
      )
    },
  })

  const saving =
    renameMutation.isPending ||
    stayMutation.isPending ||
    kindMutation.isPending ||
    removeMutation.isPending

  function onLedger(memberId: string) {
    return memberHasHouseLedger(memberId, {
      expenses: room.expenses,
      settlements: room.settlements,
      templates: house?.templates ?? [],
    })
  }

  function PersonList({
    title,
    rows,
  }: {
    title: string
    rows: HouseMemberDto[]
  }) {
    if (rows.length === 0) return null
    return (
      <section className="mt-6">
        <h2 className="group-label">{title}</h2>
        <ul className="group-list mt-1">
          {rows.map((member) => {
            const net = netById.get(member.id) ?? 0
            const balance = houseBalanceCopy(member.name, net, room.currency)
            return (
              <li key={member.id}>
                <button
                  type="button"
                  className="group-row-hit w-full text-left"
                  onClick={() => setEditingId(member.id)}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-foreground">
                      {member.name}
                    </span>
                    <span className="mt-0.5 block truncate text-[13px] text-muted-foreground">
                      {memberSubtitle(member, today)}
                    </span>
                  </span>
                  <span className="shrink-0 text-[13px] text-muted-foreground tabular-nums">
                    {balance}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      </section>
    )
  }

  const canEditEditing = Boolean(
    editing &&
    (canSetMemberDates(role, actorId, editing.id) ||
      (manage && !editing.claimed))
  )
  const canRemoveEditing = Boolean(
    editing &&
    manage &&
    !editing.isOwner &&
    editing.id !== actorId &&
    !editing.claimed &&
    !onLedger(editing.id)
  )
  const canConvertEditing = Boolean(
    editing &&
    manage &&
    !editing.isOwner &&
    !(editing.claimed && !editing.isGuest)
  )
  const canMoveOutEditing = Boolean(
    editing && canSetMemberDates(role, actorId, editing.id)
  )
  const moveOutBlocked = editing?.isOwner
    ? transferBeforeMoveOutMessage()
    : null

  return (
    <main className="page-gutter mx-auto w-full max-w-content pt-2 pb-8">
      <div className="flex items-center gap-1">
        <button
          type="button"
          className="icon-hit -ml-3 size-11"
          onClick={() =>
            void navigate({ to: "/r/$code", params: { code: room.code } })
          }
          aria-label="Back to house"
        >
          <HugeiconsIcon icon={ArrowLeft01Icon} size={20} strokeWidth={2} />
        </button>
        <h1 className="font-display text-[22px] font-bold tracking-tight">
          People
        </h1>
      </div>

      <PersonList title="Housemates" rows={housemates} />
      <PersonList title="Moved out" rows={movedOut} />
      <PersonList title="Guests" rows={guests} />

      {manage ? (
        <section className="mt-8">
          <h2 className="group-label">Add people</h2>
          <div className="mt-2 flex flex-col gap-3">
            <div
              className="flex flex-wrap gap-1.5"
              role="group"
              aria-label="Person type"
            >
              <button
                type="button"
                aria-pressed={!asGuest}
                onClick={() => setAsGuest(false)}
                className={cn(
                  "h-9 rounded-full px-3 text-[13px] font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  !asGuest
                    ? "bg-foreground text-background"
                    : "bg-card text-foreground hover:bg-muted"
                )}
              >
                Housemate
              </button>
              <button
                type="button"
                aria-pressed={asGuest}
                onClick={() => setAsGuest(true)}
                className={cn(
                  "h-9 rounded-full px-3 text-[13px] font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  asGuest
                    ? "bg-foreground text-background"
                    : "bg-card text-foreground hover:bg-muted"
                )}
              >
                Guest
              </button>
            </div>
            <NameListInput
              id="house-add-people"
              label={asGuest ? "Guests" : "Housemates"}
              names={names}
              draft={draft}
              onNamesChange={setNames}
              onDraftChange={setDraft}
              placeholder="Luis"
            />
            <Button
              type="button"
              className="cta-lg"
              disabled={addMutation.isPending || names.length === 0}
              onClick={() => addMutation.mutate()}
            >
              {addMutation.isPending ? "Adding…" : "Add people"}
            </Button>
          </div>
        </section>
      ) : null}

      {canTransferHouse(role) ? (
        <section className="mt-8">
          <h2 className="group-label">House</h2>
          {transferOpen ? (
            <ul className="group-list mt-1">
              {transferTargets.length === 0 ? (
                <li className="group-row text-[15px] text-muted-foreground">
                  A housemate needs to claim their spot first.
                </li>
              ) : (
                transferTargets.map((member) => (
                  <li key={member.id}>
                    <button
                      type="button"
                      className="group-row-hit w-full text-left"
                      disabled={transferMutation.isPending}
                      onClick={() => transferMutation.mutate(member.id)}
                    >
                      Transfer to {member.name}
                    </button>
                  </li>
                ))
              )}
              <li>
                <button
                  type="button"
                  className="group-row-hit w-full text-left text-muted-foreground"
                  onClick={() => setTransferOpen(false)}
                >
                  Cancel
                </button>
              </li>
            </ul>
          ) : (
            <ul className="group-list mt-1">
              <li>
                <button
                  type="button"
                  className="group-row-hit w-full text-left"
                  onClick={() => setTransferOpen(true)}
                >
                  Transfer house
                </button>
              </li>
            </ul>
          )}
        </section>
      ) : null}

      <HousePersonSheet
        member={editing}
        open={editing != null}
        saving={saving}
        canEdit={canEditEditing}
        canRemove={canRemoveEditing}
        canConvert={canConvertEditing}
        canMoveOut={canMoveOutEditing}
        moveOutBlocked={moveOutBlocked}
        balanceLine={
          editing
            ? houseBalanceCopy(
                editing.name,
                netById.get(editing.id) ?? 0,
                room.currency
              )
            : null
        }
        onOpenChange={(open) => {
          if (!open) setEditingId(null)
        }}
        onRename={(name) => renameMutation.mutate(name)}
        onStay={(input) => {
          if (!editingId) return
          stayMutation.mutate({ memberId: editingId, ...input })
        }}
        onKind={(isGuest) => kindMutation.mutate(isGuest)}
        onRemove={() => removeMutation.mutate()}
      />

      <p className="mt-8 text-[13px] text-muted-foreground">
        Share the house from the header so housemates can claim their names.
      </p>
    </main>
  )
}
