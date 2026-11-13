import { isoDateFromUtc, isMovedOutOn, localIsoDate } from "@/lib/house-month"
import type {
  HouseActorMember,
  HouseMemberDto,
  HouseRole,
  HouseStateDto,
  HouseViewerDto,
  RecurringOccurrenceDto,
  RecurringTemplateDto,
} from "@/lib/house-types"

function asIso(value: string | Date | null | undefined): string | null {
  if (value == null) return null
  if (typeof value === "string") return value.slice(0, 10)
  return isoDateFromUtc(value)
}

export function houseRoleForMember(
  member: HouseActorMember,
  ownerUserId: string | null,
  today: string
): HouseRole {
  if (member.isGuest) return "GUEST"
  if (isMovedOutOn(asIso(member.leftOn), today)) return "MOVED_OUT"
  if (ownerUserId && member.userId && member.userId === ownerUserId) {
    return "OWNER"
  }
  return "HOUSEMATE"
}

/** Clerk seat wins. A device memberId can only act as an unclaimed guest. */
export function resolveHouseViewer(input: {
  ownerUserId: string | null
  members: HouseActorMember[]
  authUserId: string | null
  viewerMemberId?: string | null
  today?: string
}): HouseViewerDto {
  const today = input.today ?? localIsoDate()

  if (input.authUserId) {
    const claimed = input.members.find(
      (member) => member.userId === input.authUserId
    )
    if (claimed) {
      return {
        memberId: claimed.id,
        role: houseRoleForMember(claimed, input.ownerUserId, today),
      }
    }
  }

  const guestId = input.viewerMemberId
  if (guestId) {
    const guest = input.members.find((member) => member.id === guestId)
    if (guest?.isGuest && !guest.userId) {
      return { memberId: guest.id, role: "GUEST" }
    }
  }

  return { memberId: null, role: "VISITOR" }
}

export function toHouseMemberDto(
  member: HouseActorMember,
  ownerUserId: string | null
): HouseMemberDto {
  return {
    id: member.id,
    name: member.name,
    isGuest: member.isGuest,
    claimed: Boolean(member.userId),
    isOwner: Boolean(
      ownerUserId && member.userId && member.userId === ownerUserId
    ),
    joinedOn: asIso(member.joinedOn),
    leftOn: asIso(member.leftOn),
  }
}

export function buildHouseState(input: {
  ownerUserId: string | null
  members: HouseActorMember[]
  templates?: RecurringTemplateDto[]
  occurrences?: RecurringOccurrenceDto[]
  authUserId: string | null
  viewerMemberId?: string | null
  today?: string
}): HouseStateDto {
  return {
    viewer: resolveHouseViewer(input),
    members: input.members.map((member) =>
      toHouseMemberDto(member, input.ownerUserId)
    ),
    templates: input.templates ?? [],
    occurrences: input.occurrences ?? [],
  }
}

export function mapRecurringTemplate(template: {
  id: string
  title: string
  category: string
  kind: string
  amountCents: number | null
  dueDay: number
  paidById: string
  splitMode: string
  startMonth: string
  archivedAt: Date | null
  createdByMemberId: string | null
  shares: Array<{
    memberId: string
    weight: number | null
    amountCents: number | null
  }>
  occurrences?: Array<{
    templateId: string
    periodMonth: string
    status: string
    expenseId: string | null
  }>
}): RecurringTemplateDto {
  const kind = template.kind === "VARIABLE" ? "VARIABLE" : "FIXED"
  return {
    id: template.id,
    title: template.title,
    category: template.category,
    kind,
    amountCents: template.amountCents,
    dueDay: template.dueDay,
    paidById: template.paidById,
    splitMode: template.splitMode,
    startMonth: template.startMonth,
    archivedAt: template.archivedAt?.toISOString() ?? null,
    createdByMemberId: template.createdByMemberId,
    shares: template.shares.map((share) => ({
      memberId: share.memberId,
      weight: share.weight,
      amountCents: share.amountCents,
    })),
  }
}

export function mapRecurringOccurrence(row: {
  templateId: string
  periodMonth: string
  status: string
  expenseId: string | null
}): RecurringOccurrenceDto {
  return {
    templateId: row.templateId,
    periodMonth: row.periodMonth,
    status: row.status === "SKIPPED" ? "SKIPPED" : "CONFIRMED",
    expenseId: row.expenseId,
  }
}

export function alreadyInHouseMessage(name: string): string {
  return `You're already in this house as ${name}`
}

export function housemateNameTakenMessage(): string {
  return "That name belongs to a housemate. Sign in to claim it."
}

export function spotClaimedMessage(): string {
  return "Someone already claimed this spot."
}
