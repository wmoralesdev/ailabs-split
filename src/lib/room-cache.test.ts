import { afterEach, describe, expect, it, vi } from "vitest"

import { forgetRoomCache, readRoomCache, writeRoomCache } from "@/lib/room-cache"
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
    get length() {
      return store.size
    },
    key: (index: number) => [...store.keys()][index] ?? null,
  }
  vi.stubGlobal("window", { localStorage })
  vi.stubGlobal("localStorage", localStorage)
  return store
}

const sampleRoom: RoomDto = {
  id: "room-1",
  code: "ABC123",
  name: "Trip",
  kind: "TRIP",
  currency: "USD",
  currencies: ["USD"],
  fxRates: {},
  fxAdjustmentBps: 0,
  fxCalibrationSamples: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  owned: false,
  members: [{ id: "m1", name: "Ada" }],
  expenses: [],
  settlements: [],
  checks: [],
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

  it("forgets every viewer cache for a room", () => {
    stubLocalStorage()
    writeRoomCache("abc123", "m1", sampleRoom)
    writeRoomCache("abc123", null, sampleRoom)
    writeRoomCache("zzz999", "m1", sampleRoom)
    forgetRoomCache("abc123")
    expect(readRoomCache("ABC123", "m1")).toBeUndefined()
    expect(readRoomCache("ABC123", null)).toBeUndefined()
    expect(readRoomCache("zzz999", "m1")).toEqual(sampleRoom)
  })

  it("ignores corrupt JSON", () => {
    const store = stubLocalStorage()
    store.set("split:room-cache:ABC123:m1", "{not-json")
    expect(readRoomCache("ABC123", "m1")).toBeUndefined()
  })
})
