import { describe, expect, it } from "vitest"

import {
  HOUSE_SCREENS_MESSAGE,
  assertNotHousehold,
  parseRoomKind,
  roomKindLabel,
  roomKindNoun,
} from "./room-kind"

describe("parseRoomKind", () => {
  it("keeps known kinds", () => {
    expect(parseRoomKind("TRIP")).toBe("TRIP")
    expect(parseRoomKind("DINNER")).toBe("DINNER")
    expect(parseRoomKind("HOUSEHOLD")).toBe("HOUSEHOLD")
  })

  it("treats old rows without a kind as trips", () => {
    expect(parseRoomKind("")).toBe("TRIP")
    expect(parseRoomKind("trip")).toBe("TRIP")
    expect(parseRoomKind("UNKNOWN")).toBe("TRIP")
  })

  it("does not coerce a house to a trip", () => {
    expect(parseRoomKind("HOUSEHOLD")).not.toBe("TRIP")
    expect(parseRoomKind("HOUSEHOLD")).not.toBe("DINNER")
  })
})

describe("roomKindLabel", () => {
  it("names each kind for lists", () => {
    expect(roomKindLabel("TRIP")).toBe("Trip")
    expect(roomKindLabel("DINNER")).toBe("Bill")
    expect(roomKindLabel("HOUSEHOLD")).toBe("House")
  })
})

describe("roomKindNoun", () => {
  it("uses the visible noun", () => {
    expect(roomKindNoun("TRIP")).toBe("trip")
    expect(roomKindNoun("DINNER")).toBe("bill")
    expect(roomKindNoun("HOUSEHOLD")).toBe("house")
  })
})

describe("assertNotHousehold", () => {
  it("lets trips and bills through", () => {
    expect(() => assertNotHousehold("TRIP")).not.toThrow()
    expect(() => assertNotHousehold("DINNER")).not.toThrow()
  })

  it("refuses houses", () => {
    expect(() => assertNotHousehold("HOUSEHOLD")).toThrow(HOUSE_SCREENS_MESSAGE)
  })
})
