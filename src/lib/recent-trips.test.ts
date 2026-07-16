import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  forgetRecentTrip,
  formatRecentTripOpened,
  listRecentTrips,
  rememberRecentTrip,
} from "./recent-trips"

const STORAGE_KEY = "split:recent-trips"

function installMemoryLocalStorage() {
  const store = new Map<string, string>()
  const localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value)
    },
    removeItem: (key: string) => {
      store.delete(key)
    },
    clear: () => {
      store.clear()
    },
  }
  vi.stubGlobal("window", { localStorage })
  vi.stubGlobal("localStorage", localStorage)
}

describe("recent-trips", () => {
  beforeEach(() => {
    installMemoryLocalStorage()
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-07-15T12:00:00.000Z"))
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it("upserts by code and keeps most-recent-first", () => {
    rememberRecentTrip({ code: "aaaaaa", name: "Alpha" })
    vi.setSystemTime(new Date("2026-07-15T12:01:00.000Z"))
    rememberRecentTrip({ code: "bbbbbb", name: "Beta" })
    vi.setSystemTime(new Date("2026-07-15T12:02:00.000Z"))
    rememberRecentTrip({ code: "AAAAAA", name: "Alpha Renamed" })

    const trips = listRecentTrips()
    expect(trips.map((t) => t.code)).toEqual(["AAAAAA", "BBBBBB"])
    expect(trips[0]?.name).toBe("Alpha Renamed")
  })

  it("caps at 10 trips", () => {
    for (let i = 0; i < 12; i++) {
      vi.setSystemTime(new Date(Date.UTC(2026, 6, 15, 12, i)))
      rememberRecentTrip({
        code: `CODE${i.toString().padStart(2, "0")}`,
        name: `Trip ${i}`,
      })
    }
    const trips = listRecentTrips()
    expect(trips).toHaveLength(10)
    expect(trips[0]?.code).toBe("CODE11")
    expect(trips.at(-1)?.code).toBe("CODE02")
  })

  it("forgets a trip by code", () => {
    rememberRecentTrip({ code: "abc123", name: "One" })
    rememberRecentTrip({ code: "def456", name: "Two" })
    forgetRecentTrip("abc123")
    expect(listRecentTrips().map((t) => t.code)).toEqual(["DEF456"])
  })

  it("ignores corrupt storage", () => {
    window.localStorage.setItem(STORAGE_KEY, "{not-json")
    expect(listRecentTrips()).toEqual([])
  })
})

describe("formatRecentTripOpened", () => {
  it("formats relative ages", () => {
    const now = Date.parse("2026-07-15T12:00:00.000Z")
    expect(formatRecentTripOpened(now, now)).toBe("Just now")
    expect(formatRecentTripOpened(now - 5 * 60_000, now)).toBe("5m ago")
    expect(formatRecentTripOpened(now - 3 * 3_600_000, now)).toBe("3h ago")
    expect(formatRecentTripOpened(now - 2 * 86_400_000, now)).toBe("2d ago")
  })
})
