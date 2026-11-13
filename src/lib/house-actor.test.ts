import { describe, expect, it } from "vitest"

import {
  alreadyInHouseMessage,
  resolveHouseViewer,
  toHouseMemberDto,
} from "./house-actor"
import type { HouseActorMember } from "./house-types"

const today = "2026-11-13"

function member(
  overrides: Partial<HouseActorMember> & Pick<HouseActorMember, "id" | "name">
): HouseActorMember {
  return {
    userId: null,
    isGuest: false,
    joinedOn: "2026-06-01",
    leftOn: null,
    ...overrides,
  }
}

const walter = member({
  id: "w1",
  name: "Walter",
  userId: "user_walter",
})
const ana = member({ id: "a1", name: "Ana" })
const luis = member({
  id: "l1",
  name: "Luis",
  userId: "user_luis",
  leftOn: "2026-10-31",
})
const guest = member({
  id: "g1",
  name: "Sofi",
  isGuest: true,
})

const members = [walter, ana, luis, guest]

describe("resolveHouseViewer", () => {
  it("uses the Clerk seat and ignores the client memberId", () => {
    expect(
      resolveHouseViewer({
        ownerUserId: "user_walter",
        members,
        authUserId: "user_walter",
        viewerMemberId: guest.id,
        today,
      })
    ).toEqual({ memberId: "w1", role: "OWNER" })
  })

  it("does not let a device impersonate a housemate", () => {
    expect(
      resolveHouseViewer({
        ownerUserId: "user_walter",
        members,
        authUserId: null,
        viewerMemberId: walter.id,
        today,
      })
    ).toEqual({ memberId: null, role: "VISITOR" })
  })

  it("lets an unclaimed guest through by device memberId", () => {
    expect(
      resolveHouseViewer({
        ownerUserId: "user_walter",
        members,
        authUserId: null,
        viewerMemberId: guest.id,
        today,
      })
    ).toEqual({ memberId: "g1", role: "GUEST" })
  })

  it("marks a past leftOn as moved out", () => {
    expect(
      resolveHouseViewer({
        ownerUserId: "user_walter",
        members,
        authUserId: "user_luis",
        today,
      })
    ).toEqual({ memberId: "l1", role: "MOVED_OUT" })
  })

  it("treats a signed-in user with no seat as a visitor", () => {
    expect(
      resolveHouseViewer({
        ownerUserId: "user_walter",
        members,
        authUserId: "user_new",
        today,
      })
    ).toEqual({ memberId: null, role: "VISITOR" })
  })
})

describe("toHouseMemberDto", () => {
  it("never sends userId, only claimed", () => {
    const dto = toHouseMemberDto(walter, "user_walter")
    expect(dto).toEqual({
      id: "w1",
      name: "Walter",
      isGuest: false,
      claimed: true,
      isOwner: true,
      joinedOn: "2026-06-01",
      leftOn: null,
    })
    expect(dto).not.toHaveProperty("userId")
  })
})

describe("alreadyInHouseMessage", () => {
  it("names the existing seat", () => {
    expect(alreadyInHouseMessage("Ana")).toBe(
      "You're already in this house as Ana"
    )
  })
})
