import { describe, expect, it } from "vitest"

import {
  buildTripSummary,
  computeFxAdjustmentBps,
  computeNets,
  computeNetsWithSettlements,
  convertToBase,
  equalSplitCents,
  formatTransferSentence,
  parseAmountToCents,
  simplifyTransfers,
} from "./settle"

describe("equalSplitCents", () => {
  it("splits evenly when divisible", () => {
    expect(equalSplitCents(3000, ["a", "b", "c"])).toEqual([
      { memberId: "a", amountCents: 1000 },
      { memberId: "b", amountCents: 1000 },
      { memberId: "c", amountCents: 1000 },
    ])
  })

  it("gives remainder cents to the first members", () => {
    expect(equalSplitCents(100, ["a", "b", "c"])).toEqual([
      { memberId: "a", amountCents: 34 },
      { memberId: "b", amountCents: 33 },
      { memberId: "c", amountCents: 33 },
    ])
  })
})

describe("computeNets + simplifyTransfers", () => {
  const members = [
    { id: "w", name: "Walter" },
    { id: "d", name: "Daniela" },
    { id: "m", name: "Mario" },
  ]

  it("settles a classic three-person trip", () => {
    const nets = computeNets(members, [
      {
        paidById: "w",
        shares: equalSplitCents(9000, ["w", "d", "m"]),
      },
      {
        paidById: "d",
        shares: equalSplitCents(3000, ["w", "d"]),
      },
    ])

    const transfers = simplifyTransfers(nets)
    const totalOut = transfers.reduce((sum, t) => sum + t.amountCents, 0)

    expect(nets.find((n) => n.memberId === "w")?.netCents).toBe(4500)
    expect(nets.find((n) => n.memberId === "d")?.netCents).toBe(-1500)
    expect(nets.find((n) => n.memberId === "m")?.netCents).toBe(-3000)
    expect(totalOut).toBe(4500)
    expect(transfers).toHaveLength(2)
  })

  it("returns no transfers when already settled", () => {
    const nets = computeNets(members, [
      {
        paidById: "w",
        shares: [
          { memberId: "w", amountCents: 500 },
          { memberId: "d", amountCents: 500 },
        ],
      },
      {
        paidById: "d",
        shares: [
          { memberId: "w", amountCents: 500 },
          { memberId: "d", amountCents: 500 },
        ],
      },
    ])

    expect(simplifyTransfers(nets)).toEqual([])
  })

  it("formats human-readable sentences", () => {
    expect(
      formatTransferSentence(
        {
          fromId: "d",
          fromName: "Daniela",
          toId: "w",
          toName: "Walter",
          amountCents: 10000,
        },
        "USD"
      )
    ).toBe("Daniela owes Walter $100.00")
  })

  it("applies recorded settlement payments to nets", () => {
    const nets = computeNetsWithSettlements(
      members,
      [
        {
          paidById: "w",
          shares: equalSplitCents(9000, ["w", "d", "m"]),
        },
      ],
      [{ fromMemberId: "m", toMemberId: "w", amountCents: 3000 }]
    )

    expect(nets.find((n) => n.memberId === "w")?.netCents).toBe(3000)
    expect(nets.find((n) => n.memberId === "m")?.netCents).toBe(0)
  })
})

describe("buildTripSummary", () => {
  it("includes expenses, payments, and remaining transfers", () => {
    const summary = buildTripSummary({
      name: "Beach",
      code: "ABC123",
      currency: "USD",
      expenses: [
        {
          title: "Dinner",
          category: "Food",
          amountCents: 4200,
          currency: "USD",
          paidByName: "Walter",
        },
      ],
      settlements: [
        {
          fromMemberName: "Daniela",
          toMemberName: "Walter",
          amountCents: 2100,
          currency: "USD",
        },
      ],
      transfers: [
        {
          fromId: "m",
          fromName: "Mario",
          toId: "w",
          toName: "Walter",
          amountCents: 2100,
        },
      ],
    })

    expect(summary).toContain("Dinner [Food]: $42.00 paid by Walter")
    expect(summary).toContain("Daniela paid Walter $21.00")
    expect(summary).toContain("Mario owes Walter $21.00")
  })
})

describe("parseAmountToCents", () => {
  it("parses dollars and cents", () => {
    expect(parseAmountToCents("12.34")).toBe(1234)
    expect(parseAmountToCents("12")).toBe(1200)
    expect(parseAmountToCents("$10.5")).toBe(1050)
  })

  it("parses thousands separators from receipt OCR", () => {
    expect(parseAmountToCents("5,900")).toBe(590000)
    expect(parseAmountToCents("4.000")).toBe(400000)
    expect(parseAmountToCents("1,234.56")).toBe(123456)
    expect(parseAmountToCents("1.234,56")).toBe(123456)
  })

  it("rejects invalid input", () => {
    expect(parseAmountToCents("")).toBeNull()
    expect(parseAmountToCents("abc")).toBeNull()
  })
})

describe("computeFxAdjustmentBps", () => {
  it("returns 0 for empty or invalid samples", () => {
    expect(computeFxAdjustmentBps([])).toBe(0)
    expect(computeFxAdjustmentBps([{ appCents: 0, bankCents: 100 }])).toBe(0)
    expect(
      computeFxAdjustmentBps([{ appCents: Number.NaN, bankCents: 100 }])
    ).toBe(0)
  })

  it("computes bps from a single sample", () => {
    // 1032 → 1041 ≈ +0.872% → 87 bps
    expect(
      computeFxAdjustmentBps([{ appCents: 1032, bankCents: 1041 }])
    ).toBe(87)
  })

  it("weights by app amount across samples", () => {
    // Small: 1000→1010 = 100 bps; large: 9000→9090 = 100 bps → 100
    expect(
      computeFxAdjustmentBps([
        { appCents: 1000, bankCents: 1010 },
        { appCents: 9000, bankCents: 9090 },
      ])
    ).toBe(100)

    // Unequal: 1000→1100 = 1000 bps; 3000→3030 = 100 bps
    // weighted = (1000*1000 + 3000*100) / 4000 = 325
    expect(
      computeFxAdjustmentBps([
        { appCents: 1000, bankCents: 1100 },
        { appCents: 3000, bankCents: 3030 },
      ])
    ).toBe(325)
  })
})

describe("convertToBase", () => {
  const rates = { CRC: 500 }

  it("returns base amounts unchanged", () => {
    expect(convertToBase(2500, "USD", "USD", rates)).toBe(2500)
    expect(convertToBase(2500, null, "USD", rates)).toBe(2500)
  })

  it("converts with mid-market rate", () => {
    // 500000 CRC / 500 = 1000 USD cents
    expect(convertToBase(500_000, "CRC", "USD", rates)).toBe(1000)
  })

  it("applies bank markup only to foreign amounts", () => {
    // 1000 mid-market * 1.0087 ≈ 1009
    expect(convertToBase(500_000, "CRC", "USD", rates, 87)).toBe(1009)
    expect(convertToBase(2500, "USD", "USD", rates, 87)).toBe(2500)
  })

  it("falls back to 1:1 when rate is missing", () => {
    expect(convertToBase(5000, "EUR", "USD", rates)).toBe(5000)
  })
})
