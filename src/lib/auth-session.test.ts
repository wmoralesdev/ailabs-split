import { describe, expect, it } from "vitest"

import {
  parseClerkUserId,
  parseDisplayName,
  safeRedirectPath,
} from "./auth-session"

describe("parseClerkUserId", () => {
  it("accepts Clerk-shaped ids", () => {
    expect(parseClerkUserId("user_2abcDEFGhi")).toBe("user_2abcDEFGhi")
    expect(parseClerkUserId("user_e2e_abcdefgh")).toBe("user_e2e_abcdefgh")
  })

  it("rejects junk", () => {
    expect(parseClerkUserId("")).toBeNull()
    expect(parseClerkUserId("user_short")).toBeNull()
    expect(parseClerkUserId("admin")).toBeNull()
    expect(parseClerkUserId(" user_2abcDEFGhi ")).toBe("user_2abcDEFGhi")
  })
})

describe("parseDisplayName", () => {
  it("trims and caps at 40", () => {
    expect(parseDisplayName("  Walter Morales  ")).toBe("Walter Morales")
    expect(parseDisplayName("A".repeat(50))).toHaveLength(40)
  })

  it("rejects non-strings", () => {
    expect(parseDisplayName(null)).toBe("")
    expect(parseDisplayName(12)).toBe("")
  })
})

describe("safeRedirectPath", () => {
  it("keeps in-app paths", () => {
    expect(safeRedirectPath("/")).toBe("/")
    expect(safeRedirectPath("/r/ABC1234?stay=true")).toBe(
      "/r/ABC1234?stay=true"
    )
  })

  it("drops open redirects", () => {
    expect(safeRedirectPath("https://evil.test")).toBeUndefined()
    expect(safeRedirectPath("//evil.test")).toBeUndefined()
    expect(safeRedirectPath("sign-in")).toBeUndefined()
  })
})
