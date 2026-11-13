export type HouseRole =
  "OWNER" | "HOUSEMATE" | "MOVED_OUT" | "GUEST" | "VISITOR"

export type HouseViewerDto = {
  memberId: string | null
  role: HouseRole
}

export type HouseMemberDto = {
  id: string
  name: string
  isGuest: boolean
  claimed: boolean
  isOwner: boolean
  joinedOn: string | null
  leftOn: string | null
}

export type RecurringShareDto = {
  memberId: string
  weight: number | null
  amountCents: number | null
}

export type RecurringTemplateDto = {
  id: string
  title: string
  category: string
  kind: "FIXED" | "VARIABLE"
  amountCents: number | null
  dueDay: number
  paidById: string
  splitMode: string
  startMonth: string
  archivedAt: string | null
  createdByMemberId: string | null
  shares: RecurringShareDto[]
}

export type RecurringOccurrenceDto = {
  templateId: string
  periodMonth: string
  status: "CONFIRMED" | "SKIPPED"
  expenseId: string | null
}

export type HouseStateDto = {
  viewer: HouseViewerDto
  members: HouseMemberDto[]
  templates: RecurringTemplateDto[]
  occurrences: RecurringOccurrenceDto[]
}

export type HouseActorMember = {
  id: string
  name: string
  userId: string | null
  isGuest: boolean
  joinedOn: string | Date | null
  leftOn: string | Date | null
}
