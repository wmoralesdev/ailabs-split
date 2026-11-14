import { useRef, useState } from "react"
import { useNavigate } from "@tanstack/react-router"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { HugeiconsIcon } from "@hugeicons/react"
import { Add01Icon, ArrowLeft01Icon } from "@hugeicons/core-free-icons"
import { toast } from "sonner"

import { HousePersonSheet } from "@/components/house/house-person-sheet"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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
import { mergeNames } from "@/lib/landing-prefs"
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
  const inputRef = useRef<HTMLInputElement>(null)
  const [draft, setDraft] = useState("")
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
    mutationFn: (names: string[]) =>
      addHousePeople({
        data: { ...viewerPayload(room), names, isGuest: asGuest },
      }),
    onSuccess: async () => {
      await invalidate()
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

  function submitNames() {
    const taken = new Set(members.map((member) => member.name.toLowerCase()))
    const names = mergeNames([], draft).filter(
      (name) => !taken.has(name.toLowerCase())
    )
    setDraft("")
    inputRef.current?.focus()
    if (names.length === 0) return
    addMutation.mutate(names)
  }

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
                  <span
                    className={cn(
                      "max-w-[9.75rem] shrink-0 text-right text-[13px] leading-snug tabular-nums",
                      net === 0
                        ? "text-muted-foreground"
                        : "font-medium text-foreground"
                    )}
                  >
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
      {housemates.some((member) => !member.claimed) ? (
        <p className="group-footer">
          Share the house from the header so they can claim their names.
        </p>
      ) : null}
      <PersonList title="Moved out" rows={movedOut} />
      <PersonList title="Guests" rows={guests} />

      {manage ? (
        <section className="mt-5">
          <form
            className="flex gap-2"
            onSubmit={(event) => {
              event.preventDefault()
              submitNames()
            }}
          >
            <Label htmlFor="house-add-person" className="sr-only">
              {asGuest ? "Add a guest" : "Add a housemate"}
            </Label>
            <Input
              ref={inputRef}
              id="house-add-person"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder={asGuest ? "Add a guest's name" : "Add a housemate"}
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
          <p className="group-footer">
            {asGuest
              ? "Guests only join the charges you add them to. "
              : "Housemates join new charges by default. "}
            <button
              type="button"
              className="text-action text-[13px]"
              onClick={() => setAsGuest((value) => !value)}
            >
              {asGuest ? "Add a housemate" : "Add a guest instead"}
            </button>
          </p>
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
    </main>
  )
}
