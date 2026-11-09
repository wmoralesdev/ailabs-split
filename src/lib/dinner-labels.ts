import type { ItemSplit, LineItem } from "@/lib/dinner-split"
import { itemSplitMemberIds } from "@/lib/dinner-split"

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("")
}

const LOWER_WORDS = new Set(["de", "del", "la", "las", "el", "los", "y", "e", "of", "the", "and"])

/** Tickets print the place in capitals; a room title reads better in title case. */
export function tidyPlaceName(raw: string): string {
  const name = raw.replace(/\s+/g, " ").trim()
  const letters = name.replace(/[^\p{L}]/gu, "")
  if (!letters || letters !== letters.toUpperCase()) return name
  return name
    .toLowerCase()
    .split(" ")
    .map((word, index) =>
      index > 0 && LOWER_WORDS.has(word)
        ? word
        : word.charAt(0).toUpperCase() + word.slice(1)
    )
    .join(" ")
}

export function itemSplitSummary(
  item: LineItem,
  nameById: Map<string, string>
): string {
  return splitSummary(item.split, nameById)
}

export function splitSummary(
  split: ItemSplit,
  nameById: Map<string, string>
): string {
  switch (split.mode) {
    case "UNASSIGNED":
      return "Unassigned"
    case "EQUAL": {
      const names = split.memberIds
        .map((id) => nameById.get(id) ?? "Unknown")
        .join(" ")
      return names ? `${names} · equal` : "Equal"
    }
    case "PARTS": {
      const parts = split.parts
        .filter((part) => part.weight > 0)
        .map((part) => `${nameById.get(part.memberId) ?? "Unknown"} ${part.weight}`)
      return parts.length > 0 ? `${parts.join(" · ")} · parts` : "Parts"
    }
    case "QUANTITY": {
      const parts = split.shares
        .filter((share) => share.quantity > 0)
        .map(
          (share) =>
            `${nameById.get(share.memberId) ?? "Unknown"} ${share.quantity}`
        )
      return parts.length > 0 ? parts.join(" · ") : "Quantity"
    }
    case "AMOUNT": {
      const names = split.shares
        .map((share) => nameById.get(share.memberId) ?? "Unknown")
        .join(" ")
      return names ? `${names} · amounts` : "Amounts"
    }
    default: {
      const _never: never = split
      return _never
    }
  }
}

export function assignedMemberIds(item: LineItem): string[] {
  return itemSplitMemberIds(item.split)
}
