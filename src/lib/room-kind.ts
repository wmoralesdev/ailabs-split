export const ROOM_KINDS = ["TRIP", "DINNER", "LUNCH", "OUTING"] as const
export type RoomKind = (typeof ROOM_KINDS)[number]

export const MEAL_KINDS = ["DINNER", "LUNCH", "OUTING"] as const
export type MealKind = (typeof MEAL_KINDS)[number]

export function isMealKind(kind: string | null | undefined): kind is MealKind {
  return kind === "DINNER" || kind === "LUNCH" || kind === "OUTING"
}

export function asRoomKind(kind: string | null | undefined): RoomKind {
  if (
    kind === "TRIP" ||
    kind === "DINNER" ||
    kind === "LUNCH" ||
    kind === "OUTING"
  ) {
    return kind
  }
  return "TRIP"
}

export function mealLabel(kind: string | null | undefined): string {
  if (kind === "LUNCH") return "Lunch"
  if (kind === "OUTING") return "Outing"
  if (kind === "DINNER") return "Dinner"
  return "Trip"
}

/** Lowercase noun for sentences: dinner, lunch, outing, trip. */
export function mealNoun(kind: string | null | undefined): string {
  if (kind === "LUNCH") return "lunch"
  if (kind === "OUTING") return "outing"
  if (kind === "DINNER") return "dinner"
  return "trip"
}

export function defaultMealName(kind: MealKind, now = new Date()): string {
  const day = now.toLocaleDateString("en-US", { weekday: "long" })
  if (kind === "LUNCH") return `${day} lunch`
  if (kind === "OUTING") return `${day} outing`
  return `${day} dinner`
}
