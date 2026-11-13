import { describe, expect, it } from "vitest"

import {
  defaultParticipants,
  dueThisMonth,
  houseBalanceCopy,
  houseNets,
  houseRowBalanceCopy,
  memberHasHouseLedger,
  monthBreakdown,
  movedOutSubtitle,
  overpayNote,
  viewerHeroCopy,
} from "./house-ledger"
import type {
  RecurringOccurrenceDto,
  RecurringTemplateDto,
} from "./house-types"

const walter = {
  id: "w1",
  name: "Walter",
  isGuest: false,
  joinedOn: "2026-01-01",
  leftOn: null,
}
const ana = {
  id: "a1",
  name: "Ana",
  isGuest: false,
  joinedOn: "2026-10-20",
  leftOn: null,
}
const luis = {
  id: "l1",
  name: "Luis",
  isGuest: false,
  joinedOn: "2026-01-01",
  leftOn: "2026-10-31",
}
const sofi = {
  id: "g1",
  name: "Sofi",
  isGuest: true,
  joinedOn: "2026-10-01",
  leftOn: null,
}

describe("defaultParticipants", () => {
  it("keeps housemates whose stay touches the month and drops guests", () => {
    const nov = defaultParticipants([walter, ana, luis, sofi], "2026-11")
    expect(nov.map((member) => member.id)).toEqual(["w1", "a1"])
    const oct = defaultParticipants([walter, ana, luis, sofi], "2026-10")
    expect(oct.map((member) => member.id)).toEqual(["w1", "a1", "l1"])
  })
})

describe("memberHasHouseLedger", () => {
  it("is true when the person paid, shared, settled, or is on a template", () => {
    expect(
      memberHasHouseLedger("a1", {
        expenses: [{ paidById: "w1", shares: [{ memberId: "a1" }] }],
        settlements: [],
      })
    ).toBe(true)
    expect(
      memberHasHouseLedger("a1", {
        expenses: [],
        settlements: [{ fromMemberId: "a1", toMemberId: "w1" }],
      })
    ).toBe(true)
    expect(
      memberHasHouseLedger("a1", {
        expenses: [],
        settlements: [],
        templates: [{ paidById: "w1", shares: [{ memberId: "a1" }] }],
      })
    ).toBe(true)
    expect(memberHasHouseLedger("a1", { expenses: [], settlements: [] })).toBe(
      false
    )
  })
})

describe("houseNets", () => {
  it("nets a charge and a partial payment", () => {
    const nets = houseNets(
      [walter, ana],
      [
        {
          paidById: "w1",
          periodMonth: "2026-10",
          shares: [
            { memberId: "w1", amountCents: 7100 },
            { memberId: "a1", amountCents: 7100 },
          ],
        },
      ],
      [
        {
          fromMemberId: "a1",
          toMemberId: "w1",
          amountCents: 10000,
          createdAt: "2026-11-04T12:00:00.000Z",
        },
      ]
    )
    const anaNet = nets.find((row) => row.memberId === "a1")?.netCents
    const walterNet = nets.find((row) => row.memberId === "w1")?.netCents
    expect(anaNet).toBe(-7100 + 10000)
    expect(walterNet).toBe(7100 - 10000)
  })
})

describe("overpayNote", () => {
  it("names who will owe after a larger payment", () => {
    expect(
      overpayNote({
        actorId: "a1",
        fromId: "a1",
        fromName: "Ana",
        toId: "w1",
        toName: "Walter",
        amountCents: 15000,
        suggestedCents: 14200,
        currency: "USD",
      })
    ).toBe("Walter will owe you $8.00 after this")
    expect(
      overpayNote({
        actorId: "w1",
        fromId: "a1",
        fromName: "Ana",
        toId: "w1",
        toName: "Walter",
        amountCents: 15000,
        suggestedCents: 14200,
        currency: "USD",
      })
    ).toBe("You will owe Ana $8.00 after this")
    expect(
      overpayNote({
        actorId: "a1",
        fromId: "a1",
        fromName: "Ana",
        toId: "w1",
        toName: "Walter",
        amountCents: 10000,
        suggestedCents: 14200,
        currency: "USD",
      })
    ).toBeNull()
  })
})

describe("houseBalanceCopy", () => {
  it("keeps the name on a moved-out balance", () => {
    expect(houseBalanceCopy("Ana", -4000, "USD")).toBe("Ana owes $40.00")
    expect(houseBalanceCopy("Walter", 14200, "USD")).toBe(
      "Walter gets back $142.00"
    )
    expect(houseBalanceCopy("Luis", 0, "USD")).toBe("Luis is square")
    expect(movedOutSubtitle("2026-10-31")).toBe("Moved out Oct 31")
  })

  it("prints the viewer hero", () => {
    expect(viewerHeroCopy(-14200, "USD")).toBe("You owe $142.00")
    expect(viewerHeroCopy(14200, "USD")).toBe("You get back $142.00")
    expect(viewerHeroCopy(0, "USD")).toBe("You're square")
    expect(viewerHeroCopy(0, "USD", { guestWithoutCharges: true })).toBe(
      "You're not on any charges"
    )
  })

  it("prints the home row balance", () => {
    expect(houseRowBalanceCopy(-14200, "USD")).toBe("You owe $142.00")
    expect(houseRowBalanceCopy(14200, "USD")).toBe("You get back $142.00")
    expect(houseRowBalanceCopy(0, "USD")).toBe("Square")
  })
})

describe("monthBreakdown", () => {
  it("running balance equals the house net", () => {
    const expenses = [
      {
        paidById: "w1",
        periodMonth: "2026-10",
        shares: [
          { memberId: "w1", amountCents: 10000 },
          { memberId: "a1", amountCents: 10000 },
        ],
      },
      {
        paidById: "a1",
        periodMonth: "2026-11",
        shares: [
          { memberId: "w1", amountCents: 2500 },
          { memberId: "a1", amountCents: 2500 },
        ],
      },
    ]
    const settlements = [
      {
        fromMemberId: "a1",
        toMemberId: "w1",
        amountCents: 4000,
        createdAt: "2026-11-04T00:00:00.000Z",
      },
    ]
    const rows = monthBreakdown("a1", expenses, settlements)
    expect(rows[0]?.periodMonth).toBe("2026-11")
    const lastRunning = rows[0]?.runningCents
    const nets = houseNets([walter, ana], expenses, settlements)
    expect(lastRunning).toBe(
      nets.find((row) => row.memberId === "a1")?.netCents
    )
  })
})

function template(
  overrides: Partial<RecurringTemplateDto> & Pick<RecurringTemplateDto, "id">
): RecurringTemplateDto {
  return {
    title: "Rent",
    category: "RENT",
    kind: "FIXED",
    amountCents: 90000,
    dueDay: 1,
    paidById: "w1",
    splitMode: "EQUAL",
    startMonth: "2026-09",
    archivedAt: null,
    createdByMemberId: "w1",
    shares: [{ memberId: "w1", weight: null, amountCents: null }],
    ...overrides,
  }
}

describe("dueThisMonth", () => {
  it("shows a 3-month window, skips handled months, and ignores archived", () => {
    const templates = [
      template({ id: "t1" }),
      template({
        id: "t2",
        title: "Internet",
        startMonth: "2026-11",
        dueDay: 5,
      }),
      template({
        id: "t3",
        title: "Old",
        archivedAt: "2026-01-01T00:00:00.000Z",
      }),
      template({ id: "t4", title: "Future", startMonth: "2026-12" }),
    ]
    const occurrences: RecurringOccurrenceDto[] = [
      {
        templateId: "t1",
        periodMonth: "2026-10",
        status: "SKIPPED",
        expenseId: null,
      },
    ]
    const due = dueThisMonth(templates, occurrences, "2026-11")
    expect(due.map((item) => `${item.title}:${item.periodMonth}`)).toEqual([
      "Rent:2026-09",
      "Rent:2026-11",
      "Internet:2026-11",
    ])
  })
})
