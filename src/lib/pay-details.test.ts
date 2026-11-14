import { describe, expect, it } from "vitest"

import {
  normalizePayText,
  payDetailsLine,
  resolvePayDetails,
} from "@/lib/pay-details"

const profiles = new Map([
  ["user_ana", { account: "CR05 0152 0200 1026 2840 66", label: "BAC" }],
])

describe("resolvePayDetails", () => {
  it("reads the signed-in profile for a claimed seat", () => {
    expect(
      resolvePayDetails(
        { userId: "user_ana", payAccount: "old", payLabel: null },
        profiles
      )
    ).toEqual({ account: "CR05 0152 0200 1026 2840 66", label: "BAC" })
  })

  it("falls back to the seat when the user has no profile yet", () => {
    expect(
      resolvePayDetails(
        { userId: "user_bo", payAccount: "123", payLabel: null },
        profiles
      )
    ).toEqual({ account: "123", label: null })
  })

  it("reads the seat for someone added by name", () => {
    expect(
      resolvePayDetails(
        { userId: null, payAccount: "9876", payLabel: "BCR" },
        profiles
      )
    ).toEqual({ account: "9876", label: "BCR" })
    expect(
      resolvePayDetails(
        { userId: null, payAccount: null, payLabel: null },
        profiles
      )
    ).toBeNull()
  })
})

describe("pay text", () => {
  it("collapses spaces", () => {
    expect(normalizePayText("  CR05  0152\t0200 ")).toBe("CR05 0152 0200")
  })

  it("joins label and account", () => {
    expect(payDetailsLine({ account: "123", label: "BAC" })).toBe("BAC · 123")
    expect(payDetailsLine({ account: "123", label: null })).toBe("123")
  })
})
