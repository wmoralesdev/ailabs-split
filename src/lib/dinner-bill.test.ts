import { describe, expect, it } from "vitest"

import { assertHostDinnerEdit, dinnerBill, dinnerCanEdit } from "./dinner-bill"

describe("dinnerBill", () => {
  it("is null before the bill exists", () => {
    expect(dinnerBill([])).toBeNull()
  })

  it("picks the first check when an older dinner holds several", () => {
    const checks = [
      { id: "late", createdAt: "2026-11-09T21:00:00.000Z" },
      { id: "first", createdAt: "2026-11-09T19:30:00.000Z" },
      { id: "mid", createdAt: "2026-11-09T20:15:00.000Z" },
    ]
    expect(dinnerBill(checks)?.id).toBe("first")
  })
})

describe("dinnerCanEdit", () => {
  it("lets the host edit, and guests of an owned dinner cannot", () => {
    expect(dinnerCanEdit({ kind: "DINNER", canEdit: true })).toBe(true)
    expect(dinnerCanEdit({ kind: "DINNER", canEdit: false })).toBe(false)
  })

  it("keeps unsigned dinners and trips editable", () => {
    expect(dinnerCanEdit({ kind: "DINNER" })).toBe(true)
    expect(dinnerCanEdit({ kind: "TRIP", canEdit: false })).toBe(true)
    expect(dinnerCanEdit({ kind: "HOUSEHOLD", canEdit: false })).toBe(true)
  })
})

describe("assertHostDinnerEdit", () => {
  it("blocks a guest on an owned dinner", () => {
    expect(() =>
      assertHostDinnerEdit({ kind: "DINNER", ownerUserId: "host" }, "guest")
    ).toThrow("Only the person who started this can edit it")
  })

  it("lets the host, unsigned dinners, and trips through", () => {
    expect(() =>
      assertHostDinnerEdit({ kind: "DINNER", ownerUserId: "host" }, "host")
    ).not.toThrow()
    expect(() =>
      assertHostDinnerEdit({ kind: "DINNER", ownerUserId: null }, "guest")
    ).not.toThrow()
    expect(() =>
      assertHostDinnerEdit({ kind: "TRIP", ownerUserId: "host" }, "guest")
    ).not.toThrow()
    expect(() =>
      assertHostDinnerEdit({ kind: "HOUSEHOLD", ownerUserId: "host" }, "guest")
    ).not.toThrow()
  })
})
