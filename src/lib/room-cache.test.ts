import { afterEach, describe, expect, it, vi } from "vitest"

import { readRoomCache, writeRoomCache } from "@/lib/room-cache"
import type { RoomDto } from "@/server/rooms"

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
  }
  vi.stubGlobal("window", { localStorage })
  vi.stubGlobal("localStorage", localStorage)
  return store
}

const sampleRoom: RoomDto = {
  id: "room-1",
  code: "ABC123",
  name: "Trip",
  currency: "USD",
  currencies: ["USD"],
  fxRates: {},
  createdAt: "2026-01-01T00:00:00.000Z",
  members: [{ id: "m1", name: "Ada" }],
  expenses: [],
  settlements: [],
}

describe("room-cache", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("round-trips a room payload for a viewer", () => {
    stubLocalStorage()
    writeRoomCache("abc123", "m1", sampleRoom)
    expect(readRoomCache("ABC123", "m1")).toEqual(sampleRoom)
  })

  it("scopes cache by viewer member id", () => {
    stubLocalStorage()
    writeRoomCache("abc123", "m1", sampleRoom)
    expect(readRoomCache("abc123", "m2")).toBeUndefined()
    expect(readRoomCache("abc123", null)).toBeUndefined()
  })

  it("ignores corrupt JSON", () => {
    const store = stubLocalStorage()
    store.set("split:room-cache:ABC123:m1", "{not-json")
    expect(readRoomCache("ABC123", "m1")).toBeUndefined()
  })
})
