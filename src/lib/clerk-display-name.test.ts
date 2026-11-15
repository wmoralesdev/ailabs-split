import { describe, expect, it } from "vitest"

import { clerkDisplayName, nextCreatorName } from "./clerk-display-name"

describe("clerkDisplayName", () => {
  it("uses firstName even when fullName is set", () => {
    expect(
      clerkDisplayName({
        fullName: "Walter Morales",
        firstName: "Walter",
        lastName: "Morales",
        username: "wmorales",
      })
    ).toBe("Walter")
  })

  it("uses firstName when fullName is empty", () => {
    expect(
      clerkDisplayName({
        fullName: "  ",
        firstName: "Walter",
        username: "wmorales",
      })
    ).toBe("Walter")
  })

  it("ignores lastName when firstName is set", () => {
    expect(
      clerkDisplayName({
        firstName: "Walter",
        lastName: "Morales",
        username: "wmorales",
      })
    ).toBe("Walter")
  })

  it("takes the first word of fullName when firstName is missing", () => {
    expect(
      clerkDisplayName({
        fullName: "Walter Morales",
        username: "wmorales",
      })
    ).toBe("Walter")
  })

  it("keeps a compound firstName", () => {
    expect(
      clerkDisplayName({
        firstName: "Maria Jose",
        lastName: "Garcia",
        fullName: "Maria Jose Garcia",
      })
    ).toBe("Maria Jose")
  })

  it("uses username last", () => {
    expect(
      clerkDisplayName({
        fullName: null,
        firstName: null,
        username: "wmorales",
      })
    ).toBe("wmorales")
  })

  it("returns empty when nothing is set", () => {
    expect(clerkDisplayName(null)).toBe("")
    expect(clerkDisplayName({})).toBe("")
  })

  it("caps at 40 characters", () => {
    expect(clerkDisplayName({ fullName: "A".repeat(50) })).toHaveLength(40)
  })
})

describe("nextCreatorName", () => {
  it("prefers the Clerk name over a remembered name", () => {
    expect(nextCreatorName({ clerkName: "Walter", lastName: "Ana" })).toBe(
      "Walter"
    )
  })

  it("falls back to the remembered name", () => {
    expect(nextCreatorName({ clerkName: "", lastName: "Ana" })).toBe("Ana")
  })

  it("returns empty when neither is set", () => {
    expect(nextCreatorName({ clerkName: "  ", lastName: "" })).toBe("")
  })
})
