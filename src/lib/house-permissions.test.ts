import { describe, expect, it } from "vitest"

import type { HouseRole } from "@/lib/house-types"

import {
  canAddCharge,
  canConfirmDue,
  canCreateTemplate,
  canDeleteCharge,
  canDeleteHouse,
  canDeletePayment,
  canEditCharge,
  canEditTemplate,
  canHideHouse,
  canManagePeople,
  canRecordPayment,
  canRenameHouse,
  canSetMemberDates,
  canTransferHouse,
  canUndoSkip,
  guestsCantAddChargesMessage,
  hasChargesMoveOutMessage,
  onlyAuthorOrOwnerCanEditMessage,
  transferBeforeMoveOutMessage,
} from "./house-permissions"

const roles: HouseRole[] = [
  "OWNER",
  "HOUSEMATE",
  "MOVED_OUT",
  "GUEST",
  "VISITOR",
]

describe("house permissions", () => {
  it("lets owner and housemate add charges, templates, and Due", () => {
    for (const role of roles) {
      const allowed = role === "OWNER" || role === "HOUSEMATE"
      expect(canAddCharge(role)).toBe(allowed)
      expect(canCreateTemplate(role)).toBe(allowed)
      expect(canConfirmDue(role)).toBe(allowed)
      expect(canUndoSkip(role)).toBe(allowed)
      expect(canManagePeople(role)).toBe(allowed)
    }
  })

  it("lets the owner edit any charge and the author edit their own", () => {
    expect(canEditCharge("OWNER", false)).toBe(true)
    expect(canEditCharge("HOUSEMATE", true)).toBe(true)
    expect(canEditCharge("HOUSEMATE", false)).toBe(false)
    expect(canEditCharge("MOVED_OUT", true)).toBe(true)
    expect(canEditCharge("MOVED_OUT", false)).toBe(false)
    expect(canEditCharge("GUEST", true)).toBe(false)
    expect(canDeleteCharge("VISITOR", true)).toBe(false)
  })

  it("lets the owner edit any template and the author edit theirs", () => {
    expect(canEditTemplate("OWNER", false)).toBe(true)
    expect(canEditTemplate("HOUSEMATE", true)).toBe(true)
    expect(canEditTemplate("HOUSEMATE", false)).toBe(false)
    expect(canEditTemplate("MOVED_OUT", true)).toBe(false)
    expect(canEditTemplate("GUEST", true)).toBe(false)
  })

  it("lets from or to record a payment; guests only as from", () => {
    expect(canRecordPayment("OWNER", "w", "a", "w")).toBe(true)
    expect(canRecordPayment("HOUSEMATE", "a", "a", "w")).toBe(true)
    expect(canRecordPayment("MOVED_OUT", "a", "a", "w")).toBe(true)
    expect(canRecordPayment("HOUSEMATE", "x", "a", "w")).toBe(false)
    expect(canRecordPayment("GUEST", "g", "g", "w")).toBe(true)
    expect(canRecordPayment("GUEST", "g", "a", "g")).toBe(false)
    expect(canRecordPayment("VISITOR", "v", "v", "w")).toBe(false)
    expect(canRecordPayment("OWNER", null, "a", "w")).toBe(false)
  })

  it("lets the recorder or the recipient delete a payment", () => {
    expect(canDeletePayment("OWNER", "w", "a", "w")).toBe(true)
    expect(canDeletePayment("HOUSEMATE", "a", "a", "w")).toBe(true)
    expect(canDeletePayment("MOVED_OUT", "w", "a", "w")).toBe(true)
    expect(canDeletePayment("HOUSEMATE", "x", "a", "w")).toBe(false)
    expect(canDeletePayment("GUEST", "g", "g", "w")).toBe(true)
    expect(canDeletePayment("GUEST", "g", "a", "g")).toBe(false)
    expect(canDeletePayment("VISITOR", "v", "v", "w")).toBe(false)
  })

  it("lets the owner set anyone's dates and a housemate set their own", () => {
    expect(canSetMemberDates("OWNER", "w", "a")).toBe(true)
    expect(canSetMemberDates("HOUSEMATE", "a", "a")).toBe(true)
    expect(canSetMemberDates("HOUSEMATE", "a", "w")).toBe(false)
    expect(canSetMemberDates("MOVED_OUT", "a", "a")).toBe(true)
    expect(canSetMemberDates("GUEST", "g", "g")).toBe(false)
    expect(canSetMemberDates("VISITOR", null, "a")).toBe(false)
  })

  it("reserves transfer, rename, and delete for the owner", () => {
    for (const role of roles) {
      const owner = role === "OWNER"
      expect(canTransferHouse(role)).toBe(owner)
      expect(canRenameHouse(role)).toBe(owner)
      expect(canDeleteHouse(role)).toBe(owner)
    }
  })

  it("lets housemates and moved-out hide the house", () => {
    expect(canHideHouse("HOUSEMATE")).toBe(true)
    expect(canHideHouse("MOVED_OUT")).toBe(true)
    expect(canHideHouse("OWNER")).toBe(false)
    expect(canHideHouse("GUEST")).toBe(false)
  })

  it("keeps locked copy", () => {
    expect(guestsCantAddChargesMessage()).toBe("Guests can't add charges")
    expect(onlyAuthorOrOwnerCanEditMessage("Walter")).toBe(
      "Only Walter or the owner can edit this"
    )
    expect(transferBeforeMoveOutMessage()).toBe(
      "Transfer the house before you move out"
    )
    expect(hasChargesMoveOutMessage("Ana")).toBe(
      "Ana has charges. Mark them as moved out instead."
    )
  })
})
