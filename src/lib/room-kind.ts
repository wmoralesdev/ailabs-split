export type RoomKind = "TRIP" | "DINNER" | "HOUSEHOLD"

export const HOUSE_SCREENS_MESSAGE = "Use the house screens for this"

/** Old rows without a kind are trips. HOUSEHOLD must never fall through to TRIP. */
export function parseRoomKind(raw: string): RoomKind {
  switch (raw) {
    case "DINNER":
      return "DINNER"
    case "HOUSEHOLD":
      return "HOUSEHOLD"
    case "TRIP":
      return "TRIP"
    default:
      return "TRIP"
  }
}

export function isRoomKind(value: unknown): value is RoomKind {
  return value === "TRIP" || value === "DINNER" || value === "HOUSEHOLD"
}

export function roomKindLabel(kind: RoomKind): "Trip" | "Bill" | "House" {
  switch (kind) {
    case "TRIP":
      return "Trip"
    case "DINNER":
      return "Bill"
    case "HOUSEHOLD":
      return "House"
    default: {
      const _never: never = kind
      return _never
    }
  }
}

export function roomKindNoun(kind: RoomKind): "trip" | "bill" | "house" {
  switch (kind) {
    case "TRIP":
      return "trip"
    case "DINNER":
      return "bill"
    case "HOUSEHOLD":
      return "house"
    default: {
      const _never: never = kind
      return _never
    }
  }
}

export function assertNotHousehold(kind: string): void {
  if (parseRoomKind(kind) === "HOUSEHOLD") {
    throw new Error(HOUSE_SCREENS_MESSAGE)
  }
}
