import { afterEach, describe, expect, it, vi } from "vitest"

import { emptyCheckPayload } from "@/lib/dinner-split"
import {
  buildSettleAllCard,
  candidateDinnerCodes,
  dinnerSettleLine,
  formatPayAllSummary,
  formatSettleDetail,
  formatSettleHeadlines,
  joinPersonNames,
  outgoingSettleItems,
  readHiddenDinnerCodes,
} from "@/lib/dinner-settle-all"
import type { CheckDto, ExpenseDto, RoomDto } from "@/server/rooms"

function stubLocalStorage() {
  const store = new Map<string, string>()
  const localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value)
    },
    removeItem: (key: string) => {
      store.delete(key)
    },
    clear: () => store.clear(),
  }
  vi.stubGlobal("window", { localStorage })
  vi.stubGlobal("localStorage", localStorage)
  return store
}

function check(input: {
  id: string
  status: "DRAFT" | "CONFIRMED"
  paidById: string
  createdAt?: string
}): CheckDto {
  return {
    id: input.id,
    merchant: "Place",
    currency: "USD",
    paidById: input.paidById,
    paidByName: "Walter",
    status: input.status,
    isPrecuenta: false,
    expenseId: input.status === "CONFIRMED" ? "e1" : null,
    payload: emptyCheckPayload(),
    createdAt: input.createdAt ?? "2026-01-01T00:00:00.000Z",
    updatedAt: input.createdAt ?? "2026-01-01T00:00:00.000Z",
  }
}

function expense(input: {
  id: string
  paidById: string
  shares: Array<{ memberId: string; amountCents: number }>
  currency?: string
}): ExpenseDto {
  return {
    id: input.id,
    title: "Dinner",
    amountCents: input.shares.reduce(
      (sum, share) => sum + share.amountCents,
      0
    ),
    category: null,
    currency: input.currency ?? "USD",
    splitMode: "EQUAL",
    isPersonal: false,
    redacted: false,
    paidById: input.paidById,
    paidByName: "Walter",
    createdAt: "2026-01-01T00:00:00.000Z",
    shares: input.shares.map((share) => ({
      memberId: share.memberId,
      memberName: share.memberId === "ana" ? "Ana" : "Walter",
      amountCents: share.amountCents,
      weight: null,
    })),
  }
}

function dinner(input: {
  code: string
  name: string
  currency?: string
  status?: "DRAFT" | "CONFIRMED"
  oweAnaCents: number
}): RoomDto {
  const currency = input.currency ?? "USD"
  const status = input.status ?? "CONFIRMED"
  const anaShare = input.oweAnaCents
  const walterShare = anaShare
  return {
    id: input.code,
    code: input.code,
    name: input.name,
    kind: "DINNER",
    owned: false,
    canEdit: true,
    currency,
    currencies: [currency],
    fxRates: {},
    fxAdjustmentBps: 0,
    fxCalibrationSamples: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    members: [
      { id: "ana", name: "Ana" },
      { id: "walter", name: "Walter" },
    ],
    expenses:
      status === "CONFIRMED"
        ? [
            expense({
              id: `${input.code}-e`,
              paidById: "walter",
              currency,
              shares: [
                { memberId: "ana", amountCents: anaShare },
                { memberId: "walter", amountCents: walterShare },
              ],
            }),
          ]
        : [],
    settlements: [],
    checks: [
      check({
        id: `${input.code}-c`,
        status,
        paidById: "walter",
      }),
    ],
  }
}

describe("joinPersonNames", () => {
  it("joins two names with and", () => {
    expect(joinPersonNames(["Walter", "Ana"])).toBe("Walter and Ana")
  })
})

describe("candidateDinnerCodes", () => {
  it("keeps dinners, drops trips and hidden codes", () => {
    expect(
      candidateDinnerCodes({
        recent: [
          { code: "aaa111", kind: "DINNER" },
          { code: "trip99", kind: "TRIP" },
          { code: "hideme", kind: "DINNER" },
        ],
        yours: [
          { code: "bbb222", kind: "DINNER" },
          { code: "aaa111", kind: "DINNER" },
        ],
        hidden: ["hideme"],
      })
    ).toEqual(["AAA111", "BBB222"])
  })
})

describe("readHiddenDinnerCodes", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("merges extra codes with split:hidden-rooms", () => {
    const store = stubLocalStorage()
    store.set("split:hidden-rooms", JSON.stringify(["abc123"]))
    expect(readHiddenDinnerCodes(["def456"])).toEqual(["DEF456", "ABC123"])
  })
})

describe("dinnerSettleLine + card", () => {
  const biblioteca = dinner({
    code: "LIB1234",
    name: "Biblioteca",
    oweAnaCents: 1200,
  })
  const celeste = dinner({
    code: "CEL5678",
    name: "Celeste",
    oweAnaCents: 800,
  })

  it("returns Ana's remaining owe on a confirmed dinner", () => {
    const line = dinnerSettleLine(biblioteca, "ana")
    expect(line?.oweCents).toBe(1200)
    expect(line?.payees).toEqual(["Walter"])
    expect(line?.outgoing).toHaveLength(1)
  })

  it("skips drafts, trips, square dinners, and unknown members", () => {
    const draft = dinner({
      code: "DRAFT01",
      name: "Draft",
      status: "DRAFT",
      oweAnaCents: 1200,
    })
    const trip: RoomDto = { ...biblioteca, kind: "TRIP" }
    const square = dinnerSettleLine(biblioteca, "ana")
    expect(square).not.toBeNull()
    expect(dinnerSettleLine(draft, "ana")).toBeNull()
    expect(dinnerSettleLine(trip, "ana")).toBeNull()
    expect(dinnerSettleLine(biblioteca, "nobody")).toBeNull()
  })

  it("hides the card for one dinner and shows a sum for two", () => {
    const one = dinnerSettleLine(biblioteca, "ana")
    const two = dinnerSettleLine(celeste, "ana")
    expect(one).not.toBeNull()
    expect(two).not.toBeNull()
    expect(buildSettleAllCard([one!])).toBeNull()

    const card = buildSettleAllCard([one!, two!])
    expect(card?.dinnerCount).toBe(2)
    expect(formatSettleHeadlines(card!)).toEqual(["You owe $20.00"])
    expect(formatSettleDetail(card!)).toBe("2 dinners · Pay Walter")
    expect(outgoingSettleItems(card!.lines)).toHaveLength(2)
  })

  it("does not merge different currencies into one number", () => {
    const crc = dinner({
      code: "CRC9999",
      name: "Soda",
      currency: "CRC",
      oweAnaCents: 800,
    })
    const card = buildSettleAllCard([
      dinnerSettleLine(biblioteca, "ana")!,
      dinnerSettleLine(crc, "ana")!,
    ])
    expect(card).not.toBeNull()
    const headlines = formatSettleHeadlines(card!)
    expect(headlines).toHaveLength(2)
    expect(headlines[0]).toContain("USD")
    expect(headlines[1]).toContain("CRC")
    expect(headlines.join(" ")).not.toMatch(/You owe \$20/)
  })

  it("does not net owe against get-back", () => {
    const anaCovered: RoomDto = {
      ...dinner({
        code: "PAY1111",
        name: "I paid",
        oweAnaCents: 500,
      }),
      expenses: [
        expense({
          id: "pay-e",
          paidById: "ana",
          shares: [
            { memberId: "ana", amountCents: 500 },
            { memberId: "walter", amountCents: 500 },
          ],
        }),
      ],
      checks: [check({ id: "pay-c", status: "CONFIRMED", paidById: "ana" })],
    }
    const asAnaOwed = dinnerSettleLine(anaCovered, "ana")
    const asAnaOwes = dinnerSettleLine(biblioteca, "ana")
    expect(asAnaOwed?.owedCents).toBe(500)
    expect(asAnaOwes?.oweCents).toBe(1200)
    const card = buildSettleAllCard([asAnaOwes!, asAnaOwed!])
    const headlines = formatSettleHeadlines(card!)
    expect(headlines).toEqual(["You owe $12.00", "You get back $5.00"])
  })

  it("drops a paid dinner so the card disappears", () => {
    const paid: RoomDto = {
      ...celeste,
      settlements: [
        {
          id: "s1",
          fromMemberId: "ana",
          fromMemberName: "Ana",
          toMemberId: "walter",
          toMemberName: "Walter",
          amountCents: 800,
          currency: "USD",
          createdAt: "2026-01-02T00:00:00.000Z",
          hasProof: false,
        },
      ],
    }
    const remaining = [
      dinnerSettleLine(biblioteca, "ana"),
      dinnerSettleLine(paid, "ana"),
    ].filter((line): line is NonNullable<typeof line> => line !== null)
    expect(remaining).toHaveLength(1)
    expect(buildSettleAllCard(remaining)).toBeNull()
  })

  it("builds an I paid all of it summary from outgoing transfers", () => {
    const card = buildSettleAllCard([
      dinnerSettleLine(biblioteca, "ana")!,
      dinnerSettleLine(celeste, "ana")!,
    ])
    expect(formatPayAllSummary(card!)).toEqual({
      sentence: "You pay Walter",
      amountLabel: "$20.00",
    })
  })
})
