import { describe, expect, it } from "vitest"

import { householdRooms, pickPreferredHouse } from "./preferred-house"

describe("householdRooms", () => {
  it("keeps houses and drops bills and trips", () => {
    const rooms = [
      { code: "AAA111", kind: "DINNER" },
      { code: "BBB222", kind: "HOUSEHOLD" },
      { code: "CCC333", kind: "TRIP" },
      { code: "DDD444", kind: "HOUSEHOLD" },
    ]
    expect(householdRooms(rooms).map((room) => room.code)).toEqual([
      "BBB222",
      "DDD444",
    ])
  })
})

describe("pickPreferredHouse", () => {
  const houses = [
    { code: "NEWEST", name: "New" },
    { code: "OLDER", name: "Old" },
  ]

  it("returns undefined when there are none", () => {
    expect(pickPreferredHouse([], ["NEWEST"])).toBeUndefined()
  })

  it("falls back to the first house", () => {
    expect(pickPreferredHouse(houses, [])).toEqual(houses[0])
    expect(pickPreferredHouse(houses, ["TRIP99"])).toEqual(houses[0])
  })

  it("prefers the first recent code that is a house", () => {
    expect(pickPreferredHouse(houses, ["TRIP99", "older", "NEWEST"])).toEqual(
      houses[1]
    )
  })
})
