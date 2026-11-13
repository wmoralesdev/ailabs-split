import { describe, expect, it } from "vitest"

import {
  addMonths,
  formatDay,
  formatMonth,
  formatTypedDate,
  isActiveOn,
  isMovedOutOn,
  monthEnd,
  monthKey,
  monthStart,
  parseDueDay,
  parseTypedDate,
  parseTypedMonth,
  stayOverlapsMonth,
} from "./house-month"

describe("monthKey", () => {
  it("uses the local calendar month", () => {
    expect(monthKey(new Date(2026, 9, 4))).toBe("2026-10")
  })
})

describe("addMonths", () => {
  it("crosses year boundaries", () => {
    expect(addMonths("2026-11", 1)).toBe("2026-12")
    expect(addMonths("2026-11", 2)).toBe("2027-01")
    expect(addMonths("2026-01", -1)).toBe("2025-12")
  })
})

describe("month bounds", () => {
  it("handles 31-day and short months", () => {
    expect(monthStart("2026-10")).toBe("2026-10-01")
    expect(monthEnd("2026-10")).toBe("2026-10-31")
    expect(monthEnd("2026-02")).toBe("2026-02-28")
    expect(monthEnd("2024-02")).toBe("2024-02-29")
  })
})

describe("formatMonth", () => {
  it("prints a short month and year", () => {
    expect(formatMonth("2026-10")).toBe("Oct 2026")
  })
})

describe("formatDay", () => {
  it("prints a short month and day", () => {
    expect(formatDay("2026-11-04")).toBe("Nov 4")
  })
})

describe("typed dates", () => {
  it("formats and parses MM/DD/YYYY and ISO", () => {
    expect(formatTypedDate("2026-11-13")).toBe("11/13/2026")
    expect(parseTypedDate("11/13/2026")).toBe("2026-11-13")
    expect(parseTypedDate("2026-11-13")).toBe("2026-11-13")
    expect(parseTypedDate("Nov 13, 2026")).toBe("2026-11-13")
    expect(parseTypedDate("not a date")).toBeNull()
  })

  it("parses a typed month", () => {
    expect(parseTypedMonth("Nov 2026")).toBe("2026-11")
    expect(parseTypedMonth("11/2026")).toBe("2026-11")
    expect(parseTypedMonth("2026-11")).toBe("2026-11")
    expect(parseTypedMonth("13/2026")).toBeNull()
  })

  it("parses a due day from 1 to 28", () => {
    expect(parseDueDay("15")).toBe(15)
    expect(parseDueDay("1")).toBe(1)
    expect(parseDueDay("28")).toBe(28)
    expect(parseDueDay("29")).toBeNull()
    expect(parseDueDay("0")).toBeNull()
  })
})

describe("stayOverlapsMonth", () => {
  it("includes a mid-month move-in for that month", () => {
    expect(
      stayOverlapsMonth({ joinedOn: "2026-10-20", leftOn: null }, "2026-10")
    ).toBe(true)
  })

  it("excludes months before move-in", () => {
    expect(
      stayOverlapsMonth({ joinedOn: "2026-10-20", leftOn: null }, "2026-09")
    ).toBe(false)
  })

  it("includes the last month when someone moves out mid-month", () => {
    expect(
      stayOverlapsMonth(
        { joinedOn: "2026-01-01", leftOn: "2026-10-12" },
        "2026-10"
      )
    ).toBe(true)
    expect(
      stayOverlapsMonth(
        { joinedOn: "2026-01-01", leftOn: "2026-10-12" },
        "2026-11"
      )
    ).toBe(false)
  })

  it("treats a missing joinedOn as from the beginning", () => {
    expect(stayOverlapsMonth({ joinedOn: null, leftOn: null }, "2020-01")).toBe(
      true
    )
  })
})

describe("isActiveOn", () => {
  it("is inclusive of the move-out day", () => {
    const ana = { joinedOn: "2026-06-01", leftOn: "2026-10-31" }
    expect(isActiveOn(ana, "2026-10-31")).toBe(true)
    expect(isActiveOn(ana, "2026-11-01")).toBe(false)
    expect(isActiveOn(ana, "2026-05-31")).toBe(false)
  })
})

describe("isMovedOutOn", () => {
  it("is moved out only after the leftOn day", () => {
    expect(isMovedOutOn("2026-10-31", "2026-11-01")).toBe(true)
    expect(isMovedOutOn("2026-10-31", "2026-10-31")).toBe(false)
    expect(isMovedOutOn(null, "2026-10-31")).toBe(false)
  })
})
