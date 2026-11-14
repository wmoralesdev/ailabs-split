import { describe, expect, it } from "vitest"

import {
  normalizePayText,
  parsePayAccountType,
  payBankLine,
  payDetailsLine,
  resolvePayDetails,
} from "@/lib/pay-details"

const profiles = new Map([
  [
    "user_ana",
    {
      account: "CR05 0152 0200 1026 2840 66",
      label: "BAC",
      accountType: "SAVINGS",
    },
  ],
])

const seat = { payAccount: null, payLabel: null, payAccountType: null }

describe("resolvePayDetails", () => {
  it("reads the signed-in profile for a claimed seat", () => {
    expect(
      resolvePayDetails(
        { ...seat, userId: "user_ana", payAccount: "old" },
        profiles
      )
    ).toEqual({
      account: "CR05 0152 0200 1026 2840 66",
      label: "BAC",
      accountType: "SAVINGS",
    })
  })

  it("falls back to the seat when the user has no profile yet", () => {
    expect(
      resolvePayDetails(
        { ...seat, userId: "user_bo", payAccount: "123" },
        profiles
      )
    ).toEqual({ account: "123", label: null, accountType: null })
  })

  it("reads the seat for someone added by name", () => {
    expect(
      resolvePayDetails(
        {
          userId: null,
          payAccount: "9876",
          payLabel: "BCR",
          payAccountType: "CHECKING",
        },
        profiles
      )
    ).toEqual({ account: "9876", label: "BCR", accountType: "CHECKING" })
    expect(resolvePayDetails({ ...seat, userId: null }, profiles)).toBeNull()
  })

  it("drops an unknown account type", () => {
    expect(parsePayAccountType("CREDIT")).toBeNull()
    expect(parsePayAccountType("SAVINGS")).toBe("SAVINGS")
  })
})

describe("pay text", () => {
  it("collapses spaces", () => {
    expect(normalizePayText("  CR05  0152\t0200 ")).toBe("CR05 0152 0200")
  })

  it("joins bank, type and account", () => {
    expect(
      payDetailsLine({ account: "123", label: "BAC", accountType: "SAVINGS" })
    ).toBe("BAC · Savings · 123")
    expect(
      payDetailsLine({ account: "123", label: null, accountType: "CHECKING" })
    ).toBe("Checking · 123")
    expect(
      payDetailsLine({ account: "123", label: null, accountType: null })
    ).toBe("123")
    expect(
      payBankLine({ account: "123", label: null, accountType: null })
    ).toBeNull()
  })
})
