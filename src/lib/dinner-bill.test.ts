import { describe, expect, it } from "vitest"

import { dinnerBill } from "./dinner-bill"

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
