import type { HouseRole } from "@/lib/house-types"

export function canAddCharge(role: HouseRole): boolean {
  switch (role) {
    case "OWNER":
    case "HOUSEMATE":
      return true
    case "MOVED_OUT":
    case "GUEST":
    case "VISITOR":
      return false
    default: {
      const _never: never = role
      return _never
    }
  }
}

export function canEditCharge(role: HouseRole, isAuthor: boolean): boolean {
  switch (role) {
    case "OWNER":
      return true
    case "HOUSEMATE":
    case "MOVED_OUT":
      return isAuthor
    case "GUEST":
    case "VISITOR":
      return false
    default: {
      const _never: never = role
      return _never
    }
  }
}

export function canDeleteCharge(role: HouseRole, isAuthor: boolean): boolean {
  return canEditCharge(role, isAuthor)
}

export function canCreateTemplate(role: HouseRole): boolean {
  return canAddCharge(role)
}

export function canEditTemplate(role: HouseRole, isAuthor: boolean): boolean {
  switch (role) {
    case "OWNER":
      return true
    case "HOUSEMATE":
      return isAuthor
    case "MOVED_OUT":
    case "GUEST":
    case "VISITOR":
      return false
    default: {
      const _never: never = role
      return _never
    }
  }
}

export function canConfirmDue(role: HouseRole): boolean {
  return canAddCharge(role)
}

export function canUndoSkip(role: HouseRole): boolean {
  return canAddCharge(role)
}

export function canRecordPayment(
  role: HouseRole,
  actorId: string | null,
  fromId: string,
  toId: string
): boolean {
  if (!actorId) return false
  switch (role) {
    case "OWNER":
    case "HOUSEMATE":
    case "MOVED_OUT":
      return actorId === fromId || actorId === toId
    case "GUEST":
      return actorId === fromId
    case "VISITOR":
      return false
    default: {
      const _never: never = role
      return _never
    }
  }
}

export function canDeletePayment(
  role: HouseRole,
  actorId: string | null,
  createdByMemberId: string | null,
  toMemberId: string
): boolean {
  if (!actorId) return false
  switch (role) {
    case "OWNER":
    case "HOUSEMATE":
    case "MOVED_OUT":
      return actorId === createdByMemberId || actorId === toMemberId
    case "GUEST":
      return actorId === createdByMemberId
    case "VISITOR":
      return false
    default: {
      const _never: never = role
      return _never
    }
  }
}

export function canManagePeople(role: HouseRole): boolean {
  switch (role) {
    case "OWNER":
    case "HOUSEMATE":
      return true
    case "MOVED_OUT":
    case "GUEST":
    case "VISITOR":
      return false
    default: {
      const _never: never = role
      return _never
    }
  }
}

export function canSetMemberDates(
  role: HouseRole,
  actorId: string | null,
  targetId: string
): boolean {
  switch (role) {
    case "OWNER":
      return true
    case "HOUSEMATE":
    case "MOVED_OUT":
      return actorId === targetId
    case "GUEST":
    case "VISITOR":
      return false
    default: {
      const _never: never = role
      return _never
    }
  }
}

export function canTransferHouse(role: HouseRole): boolean {
  switch (role) {
    case "OWNER":
      return true
    case "HOUSEMATE":
    case "MOVED_OUT":
    case "GUEST":
    case "VISITOR":
      return false
    default: {
      const _never: never = role
      return _never
    }
  }
}

export function canRenameHouse(role: HouseRole): boolean {
  return canTransferHouse(role)
}

export function canDeleteHouse(role: HouseRole): boolean {
  return canTransferHouse(role)
}

export function canHideHouse(role: HouseRole): boolean {
  switch (role) {
    case "HOUSEMATE":
    case "MOVED_OUT":
      return true
    case "OWNER":
    case "GUEST":
    case "VISITOR":
      return false
    default: {
      const _never: never = role
      return _never
    }
  }
}

export function guestsCantAddChargesMessage(): string {
  return "Guests can't add charges"
}

export function onlyAuthorOrOwnerCanEditMessage(authorName: string): string {
  return `Only ${authorName} or the owner can edit this`
}

export function transferBeforeMoveOutMessage(): string {
  return "Transfer the house before you move out"
}

export function hasChargesMoveOutMessage(name: string): string {
  return `${name} has charges. Mark them as moved out instead.`
}
